import type { Handler } from '@netlify/functions'
import { json, getUserFromSession } from './_utils'
import { tradingAccountService, accountDailyOrderService, sessionLimitsService, tradingModeStateService, tradingModeRulesService, challengeService, budgetStateService, personalTradeService } from '../../server/db/service'
import { settleAccount } from '../../server/db/drawdownModel'
import { correctPlan } from '../../server/db/correctPlanService'
import { buyEval, CascadeError } from '../../server/db/cascadeService'
import { getPayoutSummaryByAccount, getGreenDayThresholds, recordDailyRollover, recomputeGreenDays, setAccountBalance } from '../../server/db/stateService'

/**
 * Compute the widget's counters from REAL data — cash/debt from the budget tab,
 * eval/funded/live counts from the accounts tab. The bot only controls the
 * mode/score/rules/limits; these counters are always derived so the widget
 * stays honest even if the bot pushes a stale or wrong number.
 */
async function computeTradingModeCounters(userId: string) {
  const [budget, challenges] = await Promise.all([
    budgetStateService.getByUserId(userId),
    challengeService.getByUserId(userId),
  ]);
  const accounts = budget?.accounts || [];
  const isLiab = (a: any) => ['credit', 'debt', 'borrow'].includes(String(a?.loanKind || ''));
  const bal = (a: any) => Number(a?.balance) || 0;
  const r2 = (n: number) => Math.round(n * 100) / 100;

  const cashOnHand = r2(accounts.filter((a: any) => !isLiab(a)).reduce((s: number, a: any) => s + bal(a), 0));

  // A liability normally holds what Daniel OWES, so a positive balance is debt.
  // If it goes BELOW zero he overpaid — the excess is money owed back TO him,
  // not negative debt. (Christian: owe $1,500, pay his $1,700 card, he owes $200.)
  //
  // CAUTION: a negative liability is more often a SIGN ERROR than a receivable.
  // acc_dave sat at -205 and was read as a $205 asset, while also hiding $205 of
  // real debt — overstating net worth by $410. Only treat it as a receivable if
  // a specific payment explains the flip. See PROPFOLIO-BOT-GUIDE.md §5.8.
  const debts = accounts.filter((a: any) => isLiab(a) && bal(a) > 0);
  const totalDebt = r2(debts.reduce((s: number, a: any) => s + bal(a), 0));

  // Overdue = the account is flagged behind. This is BAD debt — the kind that
  // belongs in the score. Not all debt is equal, and the flag is now a fact in
  // the DB rather than something the bot has to remember.
  const overdueDebt = r2(debts.filter((a: any) => !!a.overdue).reduce((s: number, a: any) => s + bal(a), 0));
  const owedToMe = r2(
    accounts.filter((a: any) => isLiab(a) && bal(a) < 0).reduce((s: number, a: any) => s + Math.abs(bal(a)), 0));

  const evalCount = challenges.filter((c: any) => c.status === 'active' && String(c.lifecycle || '').startsWith('eval')).length;
  const fundedCount = challenges.filter((c: any) => c.lifecycle === 'funded_active').length;
  const liveCount = challenges.filter((c: any) => c.lifecycle === 'live_active').length;

  // ── Pace ────────────────────────────────────────────────────────────────
  // How fast evals are being lost, and how long they take to pass. Mirrors the
  // `velocity` block in getFullState, reduced to the headline numbers the score
  // reacts to.
  //
  // `failureDate` is only populated on a minority of historical rows, so each
  // average ships WITH its sample size — a 3-account average is not a trend,
  // and the score must not treat it as one.
  //
  // startDate is TEXT ('YYYY-MM-DD') while phase1CompletedAt is a Date, so both
  // are normalised to a UTC midnight before differencing.
  const toDayMs = (v: any): number | null => {
    if (v == null) return null;
    const s = v instanceof Date
      ? (isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10))
      : (typeof v === 'string' ? v.slice(0, 10) : null);
    if (!s) return null;
    const d = new Date(s + 'T00:00:00Z');
    return isNaN(d.getTime()) ? null : d.getTime();
  };
  const dayDiff = (a: any, b: any): number | null => {
    const f = toDayMs(a), t = toDayMs(b);
    if (f == null || t == null) return null;
    return Math.max(0, Math.round((t - f) / 86400000));
  };
  const avgOf = (arr: number[]) =>
    arr.length ? Math.round((arr.reduce((s, n) => s + n, 0) / arr.length) * 10) / 10 : null;

  const dated = challenges
    .map((c: any) => ({ c, d: dayDiff(c.startDate, c.failureDate) }))
    .filter((x: any) => x.d != null);
  const evalDurs = dated.filter((x: any) => String(x.c.lifecycle || '').startsWith('eval')).map((x: any) => x.d);
  const fundedDurs = dated.filter((x: any) => String(x.c.lifecycle || '').startsWith('funded')).map((x: any) => x.d);

  // How long it takes him to PASS an eval. Both dates are already on the row —
  // nothing new to store, this just derives the duration that was never computed.
  const passDurs = challenges
    .map((c: any) => dayDiff(c.startDate, c.phase1CompletedAt))
    .filter((d: number | null): d is number => d != null);

  return {
    cashOnHand, totalDebt, overdueDebt, owedToMe, evalCount, fundedCount, liveCount,
    // Pace — avg days an account lasted before being lost, with sample sizes.
    evalFailAvgDays: avgOf(evalDurs),
    evalFailSample: evalDurs.length,
    fundedFailAvgDays: avgOf(fundedDurs),
    fundedFailSample: fundedDurs.length,
    // Pace — how long phase 1 takes him to clear.
    evalPassAvgDays: avgOf(passDurs),
    evalPassSample: passDurs.length,
  };
}

/**
 * Personal-account risk per trade. Fixed-dollar floor by mode, with 1% of the
 * personal balance taking over once it exceeds the floor (crossover at $5,000
 * when 1% = $50). Fixed $, never a % of balance for small accounts.
 */
const MODE_RISK_FLOOR: Record<string, number> = {
  survival: 25,
  defensive: 30,
  cautious: 35,
  balanced: 40,
  confident: 45,
  aggressive: 50,
};

function computeRiskPerTrade(mode: string | null | undefined, balance: number | null): number {
  const floor = MODE_RISK_FLOOR[mode || ''] ?? 40;
  const onePct = balance != null && balance > 0 ? balance * 0.01 : 0;
  return Math.round(Math.max(floor, onePct) * 100) / 100;
}

export const handler: Handler = async (event) => {
  try {
    const user = await getUserFromSession(event)
    if (!user) return json(401, { error: 'Unauthorized' })

    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {}

      // Get daily order for a date
      if (params.action === 'daily-order') {
        const date = params.date || new Date().toISOString().slice(0, 10)
        const order = await accountDailyOrderService.getByDate(user.id, date)
        return json(200, { order })
      }

      // Get trading mode state (widget reads this)
            if (params.action === 'get-trading-mode') {
                          const [modeState, modeRules, counters, personalBalance] = await Promise.all([
                            tradingModeStateService.get(user.id),
                            tradingModeRulesService.list(user.id),
                            computeTradingModeCounters(user.id),
                            personalTradeService.getBalance(user.id),
                          ]);
                          return json(200, {
                            ...modeState,
                            ...counters,
                            personalBalance,
                            riskPerTrade: computeRiskPerTrade(modeState?.mode, personalBalance),
                            rules: modeRules,
                          });
                        }

      // Get session limits
      if (params.action === 'get-session-limits') {
        const limits = await sessionLimitsService.get(user.id);
        return json(200, limits);
      }

      // Get all daily orders
      if (params.action === 'daily-orders') {
        const orders = await accountDailyOrderService.getByUserId(user.id)
        return json(200, { orders })
      }

      // Get trading accounts. Default: active only (used by AccountsView and
      // the Trades form dropdown). Pass ?all=true to get every account so the
      // trade log can still resolve names/firms for lost/failed accounts.
      const accounts = await tradingAccountService.getByUserId(user.id)

      // Green-day bars per account, resolved before the settle so a day that
      // ends right now is judged against the right plan threshold.
      let thresholds: Record<string, number | null> = {}
      try {
        thresholds = await getGreenDayThresholds(user.id)
      } catch (e) {
        console.error('green-day threshold lookup failed', e)
      }

      // Lazy 5pm-EST settle: the trading day rolls at 17:00 America/New_York.
      // Any read after the boundary snapshots day-start balance and freezes the
      // settled HWM, so max DD stops trailing intraday. Doing it here (rather
      // than on a cron) means a missed tick can never skip a rollover.
      //
      // The rollover is ALSO where a green day is decided. Trade logging is off,
      // so a day's P&L is the balance move: balance now, minus the day-start
      // balance that was in force. Daniel: "if I make over 100 it should move
      // the counter; less than 100 shouldn't count."
      for (const a of accounts) {
        if (a.status !== 'active') continue
        const s = settleAccount(a as any)
        if (!s) continue
        try {
          // Only book a completed day if a previous settle actually established
          // a baseline — otherwise there is nothing to difference against.
          const prevSettled = (a as any).lastSettledAt
          const startBal = (a as any).dayStartBalance
          if (prevSettled && startBal != null) {
            await recordDailyRollover(
              user.id, a.id,
              new Date(prevSettled as any).toISOString().slice(0, 10),
              Number(startBal), Number((a as any).balance),
              thresholds[String(a.id)] ?? null,
            )
          }
        } catch (e) {
          // A failed green-day booking must never block the settle itself.
          console.error('daily pnl record failed for account', a.id, e)
        }
        try {
          await tradingAccountService.update(a.id, s as any)
          Object.assign(a, s)
        } catch (e) {
          console.error('settle failed for account', a.id, e)
        }
      }

      // Recompute counts from the recorded daily P&L now the day is booked.
      let greenByAccount: Record<string, { count: number; source: string }> = {}
      try {
        greenByAccount = await recomputeGreenDays(user.id)
      } catch (e) {
        console.error('green-day recompute failed', e)
      }

      const showAll = params.all === 'true'
      const activeAccounts = showAll ? accounts : accounts.filter((a: any) => a.status === 'active')

      // Attach the payout journey so the card can show "3/5 green days ·
      // $1,200 / $4,000 toward payout" without a second round trip. Raw
      // trading_accounts rows carry no plan rules and no trade aggregates.
      let payoutByAccount: Record<string, any> = {}
      try {
        payoutByAccount = await getPayoutSummaryByAccount(user.id)
      } catch (e) {
        // Payout info is presentation, not correctness — never fail the whole
        // accounts read because the enrichment query had a bad day.
        console.error('payout summary enrichment failed', e)
      }
      const enriched = activeAccounts.map((a: any) => {
        const p = payoutByAccount[String(a.id)] ?? null
        // Overlay the freshly recomputed count: the enrichment query ran against
        // green_days as it was READ, and the settle may have just changed it.
        const g = greenByAccount[String(a.id)]
        if (p && g) {
          p.winningDays = g.count
          p.winningDaysSource = 'stored'
        }
        return { ...a, payout: p }
      })

      return json(200, { accounts: enriched })
    }

    if (event.httpMethod === 'POST') {
      const input = JSON.parse(event.body || '{}')

      // Create a new trading account
      if (input.action === 'create') {
        const { name, firm, accountNumberLast4, accountSize, balance, maxDrawdown, dailyDrawdown, lockedFloor, riskPerTrade, rules, notes, status, phase, platform, groupName } = input
        if (!name || !firm) {
          return json(400, { error: 'name and firm are required' })
        }

        // Account-first eval creation: use the cascade's buyEval so the
        // challenge, account card, budget expense and calendar row are all
        // created in ONE transaction with proper lifecycle + account_id
        // linking. The old spawnChallengeAndBudget path created a card
        // without lifecycle and without the account_id FK.
        if (input.spawnChallengeAndBudget) {
          const r = await buyEval({
            userId: user.id,
            firmName: firm,
            brokerName: name,
            accountSize: Number(accountSize) || 0,
            cost: Number(input.cost) || 0,
            accountFirst4: input.accountFirst4,
            accountLast4: accountNumberLast4 || '',
            evalType: input.evalType,
            firmType: input.firmType || 'futures',
            maxDrawdown: maxDrawdown !== undefined ? Number(maxDrawdown) : 0,
            dailyDrawdown: dailyDrawdown !== undefined ? Number(dailyDrawdown) : 0,
            riskPerTrade: riskPerTrade !== undefined ? Number(riskPerTrade) : 0,
            rules: rules || [],
            budgetAccountId: input.budgetAccountId,
          })
          const account = await tradingAccountService.getById(r.accountId)
          return json(200, { account, cascade: r })
        }

        const account = await tradingAccountService.create(user.id, {
          name,
          firm,
          accountNumberLast4: accountNumberLast4 || null,
          accountSize: String(accountSize || '0'),
          balance: String(balance || accountSize || '0'),
          drawdownUsed: '0',
          highWaterMark: String(balance || accountSize || '0'),
          maxDrawdown: String(maxDrawdown || '0'),
          dailyDrawdown: String(dailyDrawdown || '0'),
          lockedFloor: lockedFloor !== undefined && lockedFloor !== '' ? String(lockedFloor) : null,
          riskPerTrade: String(riskPerTrade || '0'),
          rules: rules || [],
          notes: notes || null,
          status: status || 'active',
          phase: phase || 'challenge',
          platform: platform || null,
          groupName: groupName || null,
        } as any)

        return json(200, { account })
      }

      // Set daily order
      if (input.action === 'correct-plan') {
        // Daniel mistyped a plan to the bot ("Lucid Flex" when it was a Lucid
        // Daily). Works on DEAD accounts too — fixing history is the point —
        // and re-resolves drawdown_style from the catalogue for the new plan.
        // Journalled, so it can be undone.
        const r = await correctPlan({
          userId: user.id,
          accountRef: input.accountRef,
          evalType: input.evalType,
          firmName: input.firmName,
        })
        return json(200, r)
      }

      if (input.action === 'set-account-number') {
        // Daniel supplies the first 4 AND last 4 characters of the real account
        // number. Account numbers are not always numeric, so first4 is text.
        // Once both are known the label becomes "FIRST-LAST", which is
        // unambiguous on its own — no more remembering which 0001 is -A vs -B.
        const { accountRef, first4, last4 } = input
        if (!accountRef) return json(400, { error: 'accountRef required', code: 'no_ref' })

        const f = first4 === null || first4 === '' ? null : String(first4).trim().toUpperCase()
        const l = last4 === null || last4 === '' ? null : String(last4).trim()
        if (f !== null && !/^[A-Za-z0-9]{4}$/.test(f)) {
          return json(400, { error: 'first4 must be exactly 4 letters or digits.', code: 'bad_first4' })
        }
        if (l !== null && !/^[A-Za-z0-9]{4}$/.test(l)) {
          return json(400, { error: 'last4 must be exactly 4 letters or digits.', code: 'bad_last4' })
        }

        const all = await tradingAccountService.getByUserId(user.id)
        const matches = all.filter((a: any) => a.status === 'active' && (
          String(a.nickname || '').toLowerCase() === accountRef.toLowerCase() ||
          a.displayLabel === accountRef ||
          a.accountNumberLast4 === accountRef ||
          String(a.accountFirst4 || '').toUpperCase() === accountRef.toUpperCase() ||
          `${String(a.accountFirst4 || '').toUpperCase()}-${a.accountNumberLast4}` === accountRef.toUpperCase()))
        if (matches.length === 0) return json(404, { error: `No active account "${accountRef}"`, code: 'not_found' })
        if (matches.length > 1) {
          return json(400, {
            error: `"${accountRef}" matches ${matches.length} accounts (${matches.map((m: any) => m.displayLabel).join(', ')}). Say which one.`,
            code: 'ambiguous',
          })
        }

        const target: any = matches[0]
        const newFirst = f ?? target.accountFirst4 ?? null
        const newLast = l ?? target.accountNumberLast4 ?? null

        if (newFirst && newLast) {
          const clash = all.find((a: any) => a.status === 'active' && a.id !== target.id
            && String(a.accountFirst4 || '').toUpperCase() === newFirst
            && a.accountNumberLast4 === newLast)
          if (clash) {
            return json(400, {
              error: `${newFirst}-${newLast} is already ${(clash as any).displayLabel}. Check the digits.`,
              code: 'duplicate_account_number',
            })
          }
        }

        // With both halves known the label needs no disambiguating suffix.
        const newLabel = newFirst && newLast ? `${newFirst}-${newLast}` : target.displayLabel
        const updated = await tradingAccountService.update(target.id, {
          accountFirst4: newFirst,
          accountNumberLast4: newLast,
          displayLabel: newLabel,
        } as any)

        return json(200, {
          account: updated,
          label: newLabel,
          previousLabel: target.displayLabel,
          message: `${target.displayLabel} is now ${newLabel}. Refer to it as "${newLabel}", "${newFirst}", or "${newLast}".`,
        })
      }

      if (input.action === 'set-nickname') {
        // Give an account a short unambiguous handle. Daniel's idea: two Lucid
        // Daily accounts both end 0001, and remembering which is -A vs -B is
        // exactly the sort of thing that causes a trade to be logged against
        // the wrong account. "LUCD" is unmistakable to him and to the bot.
        const { accountRef, nickname } = input
        if (!accountRef) return json(400, { error: 'accountRef required', code: 'no_ref' })

        const clean = nickname === null || nickname === '' ? null : String(nickname).trim()
        if (clean !== null && !/^[A-Za-z0-9-]{4,16}$/.test(clean)) {
          return json(400, {
            error: 'Nickname must be 4-16 characters, letters, digits or dashes only.',
            code: 'bad_nickname',
          })
        }

        const all = await tradingAccountService.getByUserId(user.id)
        const matches = all.filter((a: any) => a.status === 'active' && (
          String(a.nickname || '').toLowerCase() === accountRef.toLowerCase() ||
          a.displayLabel === accountRef ||
          a.accountNumberLast4 === accountRef))
        if (matches.length === 0) return json(404, { error: `No active account "${accountRef}"`, code: 'not_found' })
        if (matches.length > 1) {
          return json(400, {
            error: `"${accountRef}" matches ${matches.length} accounts (${matches.map((m: any) => m.displayLabel).join(', ')}). Say which one.`,
            code: 'ambiguous',
          })
        }

        if (clean) {
          const taken = all.find((a: any) => a.status === 'active'
            && a.id !== matches[0].id
            && String(a.nickname || '').toLowerCase() === clean.toLowerCase())
          if (taken) {
            return json(400, {
              error: `"${clean}" is already used by ${(taken as any).displayLabel}. Pick another.`,
              code: 'nickname_taken',
            })
          }
        }

        const updated = await tradingAccountService.update(matches[0].id, { nickname: clean } as any)
        return json(200, {
          account: updated,
          nickname: clean,
          label: (matches[0] as any).displayLabel,
          message: clean
            ? `${(matches[0] as any).displayLabel} can now be referred to as "${clean}".`
            : `Nickname cleared for ${(matches[0] as any).displayLabel}.`,
        })
      }

      if (input.action === 'set-account-size') {
        // Bot or Daniel correcting the account size (e.g. 25K was entered as 50K).
        // Updates account_size AND balance AND maxDrawdown AND floorLockLevel to the
        // new size, since those are all derived from it at creation time.
        const { accountRef, accountSize } = input
        if (!accountRef) return json(400, { error: 'accountRef required', code: 'no_ref' })
        if (accountSize === undefined || accountSize === null) return json(400, { error: 'accountSize required', code: 'no_size' })

        const sizeNum = Number(accountSize)
        if (!Number.isFinite(sizeNum) || sizeNum <= 0) {
          return json(400, { error: 'accountSize must be a positive number', code: 'bad_size' })
        }

        const all = await tradingAccountService.getByUserId(user.id)
        const matches = all.filter((a: any) => a.status === 'active' && (
          String(a.nickname || '').toLowerCase() === accountRef.toLowerCase() ||
          a.displayLabel === accountRef ||
          a.accountNumberLast4 === accountRef ||
          String(a.accountFirst4 || '').toUpperCase() === accountRef.toUpperCase() ||
          `${String(a.accountFirst4 || '').toUpperCase()}-${a.accountNumberLast4}` === accountRef.toUpperCase()))
        if (matches.length === 0) return json(404, { error: `No active account "${accountRef}"`, code: 'not_found' })
        if (matches.length > 1) {
          return json(400, {
            error: `"${accountRef}" matches ${matches.length} accounts (${matches.map((m: any) => m.displayLabel).join(', ')}). Say which one.`,
            code: 'ambiguous',
          })
        }

        const target: any = matches[0]
        const prevSize = Number(target.accountSize) || 0

        // Update account_size + balance + maxDrawdown + floorLockLevel
        const updated = await tradingAccountService.update(target.id, {
          accountSize: String(sizeNum),
          balance: String(sizeNum),
          maxDrawdown: String(target.maxDrawdown || sizeNum * 0.04),
          floorLockLevel: String(sizeNum + (sizeNum * 0.01)),
        } as any)

        return json(200, {
          account: updated,
          previousSize: prevSize,
          newSize: sizeNum,
          message: `${target.displayLabel} account size updated from $${prevSize.toLocaleString()} to $${sizeNum.toLocaleString()}.`,
        })
      }

      if (input.action === 'set-green-days') {
        // Green days are a STORED FACT. Deriving them from the trades table is
        // broken by design now: trade logging was switched off Sep 27 2026, so
        // the table stops there and the count reads 2/5 while Daniel is on 4/5.
        // Daniel reports the number; the bot records it here.
        //
        // The requirement RESETS after every approved payout on LucidFlex,
        // Tradeify and MFFU alike, so pass `cycleStartedAt` on a reset —
        // otherwise the count keeps belonging to a cycle that already paid out.
        const { accountRef, greenDays, cycleStartedAt } = input
        if (!accountRef) return json(400, { error: 'accountRef required', code: 'no_ref' })
        if (greenDays === undefined || greenDays === null) {
          return json(400, { error: 'greenDays required', code: 'no_count' })
        }
        const n = Number(greenDays)
        if (!Number.isInteger(n) || n < 0 || n > 500) {
          return json(400, { error: 'greenDays must be a whole number between 0 and 500', code: 'bad_count' })
        }

        const allGreen = await tradingAccountService.getByUserId(user.id)
        const gMatches = allGreen.filter((a: any) => a.status === 'active' && (
          String(a.nickname || '').toLowerCase() === String(accountRef).toLowerCase() ||
          a.displayLabel === accountRef ||
          a.accountNumberLast4 === accountRef ||
          String(a.accountFirst4 || '').toUpperCase() === String(accountRef).toUpperCase() ||
          `${String(a.accountFirst4 || '').toUpperCase()}-${a.accountNumberLast4}` === String(accountRef).toUpperCase()))
        if (gMatches.length === 0) return json(404, { error: `No active account "${accountRef}"`, code: 'not_found' })
        if (gMatches.length > 1) {
          return json(400, {
            error: `"${accountRef}" matches ${gMatches.length} accounts (${gMatches.map((m: any) => m.displayLabel).join(', ')}). Say which one.`,
            code: 'ambiguous',
          })
        }

        const gTarget: any = gMatches[0]
        const updatedGreen = await tradingAccountService.update(gTarget.id, {
          greenDays: n,
          greenDaysSource: 'daniel',
          greenDaysCycleStartedAt: cycleStartedAt
            ? new Date(String(cycleStartedAt))
            : (gTarget.greenDaysCycleStartedAt ?? new Date()),
        } as any)

        return json(200, {
          account: updatedGreen,
          greenDays: n,
          message: `${gTarget.displayLabel}: green days set to ${n}.`,
        })
      }

      if (input.action === 'set-balance') {
        // Push the platform's balance straight in — NO trade involved.
        //
        // Prop accounts had no balance-only path: every route that moved a
        // balance was a trade endpoint. So "I don't want to log trades" meant
        // the balance could never move — and green days, payout progress and
        // best day all read the balance, so the whole tracker sat frozen.
        // (The personal NinjaTrader account already had `update-balance`.)
        const { accountRef, balance: newBalance, note, correction } = input
        if (!accountRef) return json(400, { error: 'accountRef required', code: 'no_ref' })
        if (newBalance === undefined || newBalance === null) {
          return json(400, { error: 'balance required', code: 'no_balance' })
        }
        const target = Number(newBalance)
        if (!Number.isFinite(target)) {
          return json(400, { error: 'balance must be a number', code: 'bad_balance' })
        }

        const allBal = await tradingAccountService.getByUserId(user.id)
        const bMatches = allBal.filter((a: any) => a.status === 'active' && (
          String(a.nickname || '').toLowerCase() === String(accountRef).toLowerCase() ||
          a.displayLabel === accountRef ||
          a.accountNumberLast4 === accountRef ||
          String(a.accountFirst4 || '').toUpperCase() === String(accountRef).toUpperCase() ||
          `${String(a.accountFirst4 || '').toUpperCase()}-${a.accountNumberLast4}` === String(accountRef).toUpperCase()))
        if (bMatches.length === 0) return json(404, { error: `No active account "${accountRef}"`, code: 'not_found' })
        if (bMatches.length > 1) {
          return json(400, {
            error: `"${accountRef}" matches ${bMatches.length} accounts (${bMatches.map((m: any) => m.displayLabel).join(', ')}). Say which one.`,
            code: 'ambiguous',
          })
        }

        const bTarget: any = bMatches[0]
        try {
          const isCorrection = correction === true
          const res = await setAccountBalance(user.id, bTarget.id, target, note ?? null, isCorrection)
          return json(200, {
            ...res,
            accountRef: bTarget.displayLabel,
            message: isCorrection
              ? `${bTarget.displayLabel} balance corrected $${res.previousBalance.toFixed(2)} → $${res.balance.toFixed(2)} (drawdown and high-water mark untouched)`
              : `${bTarget.displayLabel} balance $${res.previousBalance.toFixed(2)} → $${res.balance.toFixed(2)}`,
          })
        } catch (e: any) {
          return json(404, { error: e?.message || 'Could not set balance', code: 'not_found' })
        }
      }

      if (input.action === 'set-daily-order') {
        const { orderDate, orderedAccountIds, notes: orderNotes } = input
        if (!orderDate || !Array.isArray(orderedAccountIds)) {
          return json(400, { error: 'orderDate and orderedAccountIds array are required' })
        }
        const order = await accountDailyOrderService.upsert(user.id, {
          orderDate,
          orderedAccountIds,
          notes: orderNotes,
        })
        return json(200, { order })
      }

      // Link accounts as copy-trades (group them under one label)
      if (input.action === 'link-copy-trade') {
        const { accountRefs, groupLabel } = input;
        if (!Array.isArray(accountRefs) || accountRefs.length < 2) {
          return json(400, { error: 'At least 2 accountRefs required to link', code: 'bad_input' });
        }
        const groupId = input.groupLabel || `ct-${Date.now()}`;
        const all = await tradingAccountService.getByUserId(user.id);
        const toLink: any[] = [];
        for (const ref of accountRefs) {
          const matches = all.filter((a: any) => a.status === 'active' && (
            String(a.nickname || '').toLowerCase() === String(ref).toLowerCase() ||
            a.displayLabel === ref || a.accountNumberLast4 === ref ||
            String(a.accountFirst4 || '').toUpperCase() === String(ref).toUpperCase() ||
            `${String(a.accountFirst4 || '').toUpperCase()}-${a.accountNumberLast4}` === String(ref).toUpperCase()
          ));
          if (matches.length === 0) return json(400, { error: `No active account matching "${ref}"`, code: 'not_found' });
          if (matches.length > 1) return json(400, { error: `"${ref}" matches multiple accounts`, code: 'ambiguous' });
          toLink.push(matches[0]);
        }
        for (const acct of toLink) {
          await tradingAccountService.update(acct.id, { copyTradeGroup: groupId } as any);
        }
        return json(200, {
          groupLabel: groupId,
          linkedAccounts: toLink.map((a: any) => ({ id: a.id, label: a.displayLabel || a.accountNumberLast4 })),
        });
      }

      if (input.action === 'unlink-copy-trade') {
        const { accountRef } = input;
        if (!accountRef) return json(400, { error: 'accountRef required', code: 'no_ref' });
        const all = await tradingAccountService.getByUserId(user.id);
        const matches = all.filter((a: any) => a.status === 'active' && (
          String(a.nickname || '').toLowerCase() === String(accountRef).toLowerCase() ||
          a.displayLabel === accountRef || a.accountNumberLast4 === accountRef ||
          String(a.accountFirst4 || '').toUpperCase() === String(accountRef).toUpperCase()
        ));
        if (matches.length === 0) return json(404, { error: `No active account matching "${accountRef}"`, code: 'not_found' });
        if (matches.length > 1) return json(400, { error: `"${accountRef}" matches multiple accounts`, code: 'ambiguous' });
        await tradingAccountService.update(matches[0].id, { copyTradeGroup: null } as any);
        return json(200, { unlinked: matches[0].displayLabel || matches[0].accountNumberLast4 });
      }

      // Mark account as done for the day
      if (input.action === 'done-for-day') {
        const { accountRef } = input;
        if (!accountRef) return json(400, { error: 'accountRef required', code: 'no_ref' });
        const all = await tradingAccountService.getByUserId(user.id);
        const matches = all.filter((a: any) => a.status === 'active' && (
          String(a.nickname || '').toLowerCase() === String(accountRef).toLowerCase() ||
          a.displayLabel === accountRef || a.accountNumberLast4 === accountRef ||
          String(a.accountFirst4 || '').toUpperCase() === String(accountRef).toUpperCase()
        ));
        if (matches.length === 0) return json(404, { error: `No active account "${accountRef}"`, code: 'not_found' });
        if (matches.length > 1) return json(400, { error: `"${accountRef}" matches multiple`, code: 'ambiguous' });
        await tradingAccountService.update(matches[0].id, { doneForDay: true } as any);
        return json(200, { done: matches[0].displayLabel || matches[0].accountNumberLast4 });
      }

      if (input.action === 'uncollapse-all') {
        const all = await tradingAccountService.getByUserId(user.id);
        for (const a of all.filter((a: any) => a.status === 'active')) {
          await tradingAccountService.update(a.id, { doneForDay: false } as any);
        }
        return json(200, { reset: all.filter((a: any) => a.status === 'active').length });
      }

      // Trading Mode — bot writes full state, widget reads it
      if (input.action === 'get-trading-mode') {
        const [state, modeRules, counters, personalBalance] = await Promise.all([
          tradingModeStateService.get(user.id),
          tradingModeRulesService.list(user.id),
          computeTradingModeCounters(user.id),
          personalTradeService.getBalance(user.id),
        ]);
        return json(200, { ...state, ...counters, personalBalance, riskPerTrade: computeRiskPerTrade(state?.mode, personalBalance), rules: modeRules });
      }

      if (input.action === 'update-trading-mode') {
        // Bot pushes the full widget state — score, mode, stats, limits, notes
        const state = await tradingModeStateService.upsert(user.id, {
          score: input.score,
          mode: input.mode,
          evalCount: input.evalCount,
          fundedCount: input.fundedCount,
          liveCount: input.liveCount,
          cashOnHand: input.cashOnHand,
          totalDebt: input.totalDebt,
          maxEvalLoss: input.maxEvalLoss,
          maxFundedLoss: input.maxFundedLoss,
          maxLiveLoss: input.maxLiveLoss,
          notes: input.notes,
        });
        return json(200, { ok: true, ...state });
      }

      // Trading Mode rules — managed by bot, read by widget
      if (input.action === 'list-trading-mode-rules') {
        const rules = await tradingModeRulesService.list(user.id);
        return json(200, { rules });
      }

      if (input.action === 'set-trading-mode-rules') {
        const { mode, rules } = input;
        if (!mode || !Array.isArray(rules)) return json(400, { error: 'mode and rules[] required' });
        const result = await tradingModeRulesService.setRules(user.id, mode, rules);
        return json(200, { ok: true, rules: result });
      }

      if (input.action === 'add-trading-mode-rule') {
        const { mode, rule } = input;
        if (!mode || !rule) return json(400, { error: 'mode and rule required' });
        const result = await tradingModeRulesService.addRule(user.id, mode, rule);
        return json(200, { ok: true, rules: result });
      }

      if (input.action === 'remove-trading-mode-rule') {
        const { mode, index } = input;
        if (!mode || index === undefined) return json(400, { error: 'mode and index required' });
        const result = await tradingModeRulesService.removeRule(user.id, mode, parseInt(index));
        return json(200, { ok: true, rules: result });
      }

      // Session loss limits — how many evals/funded/live accounts can be risked per session
      if (input.action === 'get-session-limits') {
        const limits = await sessionLimitsService.get(user.id);
        return json(200, limits);
      }

      if (input.action === 'set-session-limits') {
        const { maxEvalLoss, maxFundedLoss, maxLiveLoss } = input;
        const limits = await sessionLimitsService.upsert(user.id, {
          maxEvalLoss: maxEvalLoss !== undefined ? Math.max(0, parseInt(maxEvalLoss)) : undefined,
          maxFundedLoss: maxFundedLoss !== undefined ? Math.max(0, parseInt(maxFundedLoss)) : undefined,
          maxLiveLoss: maxLiveLoss !== undefined ? Math.max(0, parseInt(maxLiveLoss)) : undefined,
        });
        return json(200, { ok: true, ...limits });
      }

      // Trading Mode rules — list from DB (bot-managed)
      if (input.action === 'list-trading-modes') {
        const rules = await tradingModeRulesService.list(user.id);
        return json(200, { modes: rules });
      }

      if (input.action === 'add-trading-mode-rule') {
        const { mode, rule } = input;
        if (!mode || !rule) return json(400, { error: 'mode and rule required', code: 'missing_fields' });
        return json(200, { ok: true, note: 'Rule added to ' + mode + ': ' + rule });
      }

      if (input.action === 'remove-trading-mode-rule') {
        const { mode, index } = input;
        if (!mode || index === undefined) return json(400, { error: 'mode and index required', code: 'missing_fields' });
        return json(200, { ok: true, note: 'Removed rule ' + index + ' from ' + mode });
      }

      if (input.action === 'edit-trading-mode') {
        const { mode, rules } = input;
        if (!mode || !Array.isArray(rules)) return json(400, { error: 'mode and rules[] required', code: 'missing_fields' });
        const result = await tradingModeRulesService.setRules(user.id, mode, rules);
        return json(200, { ok: true, rules: result });
      }

      // Reorder accounts
      if (input.action === 'reorder') {
        const { orderedIds } = input
        if (!Array.isArray(orderedIds)) {
          return json(400, { error: 'orderedIds array required' })
        }
        await tradingAccountService.reorder(user.id, orderedIds)
        return json(200, { success: true })
      }

      return json(400, { error: 'Invalid action. Use: create, correct-plan, set-account-number, set-nickname, set-account-size, set-green-days, set-balance, set-daily-order, done-for-day, uncollapse-all, link-copy-trade, unlink-copy-trade, get-trading-mode, update-trading-mode, reorder' })
    }

    if (event.httpMethod === 'PUT') {
      const { id, updates } = JSON.parse(event.body || '{}')
      if (!id) return json(400, { error: 'id required' })

      const dbUpdates: any = {}
      if (updates.name !== undefined) dbUpdates.name = updates.name
      if (updates.firm !== undefined) dbUpdates.firm = updates.firm
      if (updates.accountNumberLast4 !== undefined) dbUpdates.accountNumberLast4 = updates.accountNumberLast4
      if (updates.accountSize !== undefined) dbUpdates.accountSize = String(updates.accountSize)
      if (updates.balance !== undefined) dbUpdates.balance = String(updates.balance)
      if (updates.drawdownUsed !== undefined) dbUpdates.drawdownUsed = String(updates.drawdownUsed)
      if (updates.highWaterMark !== undefined) dbUpdates.highWaterMark = String(updates.highWaterMark)
      if (updates.maxDrawdown !== undefined) dbUpdates.maxDrawdown = String(updates.maxDrawdown)
      if (updates.dailyDrawdown !== undefined) dbUpdates.dailyDrawdown = String(updates.dailyDrawdown)
      if (updates.lockedFloor !== undefined) dbUpdates.lockedFloor = updates.lockedFloor === null || updates.lockedFloor === '' ? null : String(updates.lockedFloor)
      if (updates.floorLockLevel !== undefined) dbUpdates.floorLockLevel = updates.floorLockLevel === null || updates.floorLockLevel === '' ? null : String(updates.floorLockLevel)
      if (updates.dayStartBalance !== undefined) dbUpdates.dayStartBalance = updates.dayStartBalance === null || updates.dayStartBalance === '' ? null : String(updates.dayStartBalance)
      if (updates.settledHighWaterMark !== undefined) dbUpdates.settledHighWaterMark = updates.settledHighWaterMark === null || updates.settledHighWaterMark === '' ? null : String(updates.settledHighWaterMark)
      if (updates.evalType !== undefined) dbUpdates.evalType = updates.evalType || null
      if (updates.firmType !== undefined) dbUpdates.firmType = updates.firmType || null
      if (updates.riskPerTrade !== undefined) dbUpdates.riskPerTrade = String(updates.riskPerTrade)
      if (updates.rules !== undefined) dbUpdates.rules = updates.rules
      if (updates.notes !== undefined) dbUpdates.notes = updates.notes
      if (updates.status !== undefined) dbUpdates.status = updates.status
      if (updates.phase !== undefined) dbUpdates.phase = updates.phase
      if (updates.platform !== undefined) dbUpdates.platform = updates.platform
      if (updates.copyTradeGroup !== undefined) dbUpdates.copyTradeGroup = updates.copyTradeGroup;
    if (updates.groupName !== undefined) dbUpdates.groupName = updates.groupName

      const updated = await tradingAccountService.update(id, dbUpdates)
      return json(200, { account: updated })
    }

    if (event.httpMethod === 'DELETE') {
      const { id } = JSON.parse(event.body || '{}')
      if (!id) return json(400, { error: 'id required' })
      await tradingAccountService.delete(id)
      return json(204, {})
    }

    return json(405, { error: 'Method Not Allowed' })
  } catch (e) {
    console.error('db-accounts error', e)
    // Surface cascade errors as actionable messages. A bare 500 tells the bot
    // nothing, so it can't relay anything useful to Daniel.
    if (e instanceof CascadeError) return json(400, { error: e.message, code: e.code })
    return json(500, { error: 'Internal Server Error' })
  }
}
