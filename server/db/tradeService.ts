/**
 * logTrade — the trade cascade.
 * =============================
 *
 * "I made $1,493 on 0047."  One statement updates:
 *   - the trades row
 *   - the account balance and high-water mark
 *   - the rule-calendar entry for that account/date
 *   - drawdown state, and a stop-out verdict
 *
 * WHY THIS IS ITS OWN FILE
 * ------------------------
 * The stop-out rules are per-firm and were previously hardcoded to EOD futures
 * semantics. That produced a wrong call on account 9058: reported as
 * "daily DD hit, account survives" when it was actually blown, because MFF
 * Rapid uses INTRADAY TRAILING drawdown, where a breach kills the account.
 *
 * The distinction that matters:
 *
 *   EOD / session drawdown (MFF Builder, most Lucid plans)
 *     Hitting the daily loss limit locks you out for the session. The account
 *     SURVIVES; you trade it again next session.
 *
 *   INTRADAY TRAILING drawdown (MFF Rapid, Alpha Zero)
 *     The floor trails your equity intraday. Touching it is terminal — the
 *     account is LOST, not locked.
 *
 * Getting this wrong in either direction is expensive: a false "survives" makes
 * Daniel keep trading a dead account; a false "lost" makes him abandon a live one.
 */

import { randomUUID } from 'crypto';
import { withTransaction, type TxClient } from './txConnection';
import { computeDrawdown, settleAccount } from './drawdownModel';
import { todayET, CascadeError } from './cascadeService';

// ─────────────────────────────────────────────────────────────────────────────
// Per-plan drawdown semantics
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Drawdown style is a PER-ACCOUNT FACT, not something to infer from a name.
 *
 * This started as a lookup keyed on eval_type. That was wrong in principle and
 * wrong in practice:
 *   - Alpha Zero is EOD; the table said intraday.
 *   - MFF is "mostly trailing" but sells EOD variants too, and just added an
 *     EOD Rapid with a consistency rule.
 *   - Firms change plan rules frequently, so any table encoded here is stale
 *     the moment a firm ships a variant.
 *
 * So the style is stored on the account, captured once when the account is
 * created, and read back verbatim afterwards. The helper below only ever
 * SUGGESTS a default for a brand-new plan — it never overrides a stored value.
 *
 * When the style is unknown, the system says so loudly and asks. It does not
 * quietly pick one, because the wrong guess in the safe-looking direction
 * ("account survives") is how 9058 got called wrong.
 */
export type DrawdownStyle = 'eod' | 'intraday_trailing';

/**
 * A weak hint used ONLY to prefill the prompt when a plan has never been seen
 * before. Deliberately conservative and deliberately not authoritative.
 *
 * Returns null when there is no confident default — the caller must then ask
 * rather than assume.
 */
export function suggestDrawdownStyle(evalType?: string | null, firmName?: string | null): DrawdownStyle | null {
  const plan = String(evalType || '').trim().toLowerCase();
  const firm = String(firmName || '').trim().toLowerCase();
  if (!plan && !firm) return null;

  // MFF is predominantly trailing, but sells EOD variants — suggest only, and
  // only when the plan name itself gives no signal.
  if (plan.includes('rapid') && plan.includes('eod')) return 'eod';
  if (plan.includes('rapid')) return 'intraday_trailing';
  if (plan.includes('builder')) return 'eod';
  if (plan.includes('zero')) return 'eod';            // Alpha Zero is EOD
  if (plan.includes('lucid')) return 'eod';
  if (plan.includes('select flex')) return 'eod';
  if (firm.includes('my funded futures')) return 'intraday_trailing';
  return null;
}

/**
 * The authoritative read: what style does THIS account actually use?
 *
 * `stored` is trading_accounts.drawdown_style, set when the account was created.
 * Falls back to the suggestion only when nothing was ever recorded, and the
 * caller is told (via isStyleKnown) that it is operating on a guess.
 */
export function resolveDrawdownStyle(
  stored?: string | null, evalType?: string | null, firmName?: string | null,
): DrawdownStyle {
  const s = String(stored || '').trim().toLowerCase();
  if (s === 'eod' || s === 'intraday_trailing') return s;
  return suggestDrawdownStyle(evalType, firmName) ?? 'eod';
}

/** False when we are guessing rather than reading a recorded fact. */
export function isStyleKnown(stored?: string | null): boolean {
  const s = String(stored || '').trim().toLowerCase();
  return s === 'eod' || s === 'intraday_trailing';
}

/** @deprecated Kept for the old call sites; prefer resolveDrawdownStyle. */
export function drawdownStyleFor(evalType?: string | null): DrawdownStyle {
  return suggestDrawdownStyle(evalType) ?? 'eod';
}

export interface TradeVerdict {
  /** Did the trade breach a drawdown level? */
  breached: boolean;
  /** Which rule was binding. */
  binding: 'max' | 'daily';
  /** What the breach MEANS for this plan. */
  consequence: 'none' | 'session_lockout' | 'account_lost';
  style: DrawdownStyle;
  balance: number;
  stopOutLevel: number;
  room: number;
  dayPnL: number;
  message: string;
}

export interface LogTradeInput {
  userId: string;
  /** "0857" or "0001-B". Ambiguous bare last4 is rejected, never guessed. */
  accountRef: string;
  /** Signed P&L: positive win, negative loss. */
  amount: number;
  instrument?: string;
  direction?: 'long' | 'short';
  rulesFollowed?: boolean;
  rulesBroken?: string[];
  behaviors?: string[];
  notes?: string;
  /** Local ET calendar date. Defaults to today ET. */
  tradeDate?: string;
  /**
   * Net this into the existing trade for the same account+date instead of
   * creating a new row. Daniel's standing rule: small scratch trades pollute
   * the stats and should fold into the session's main trade.
   */
  netIntoSession?: boolean;
}

export interface LogTradeResult {
  tradeId: string;
  accountId: string;
  label: string;
  balanceBefore: number;
  balanceAfter: number;
  verdict: TradeVerdict;
  calendarEntryId: string | null;
  netted: boolean;
  warnings: string[];
}

async function resolveAccountForTrade(tx: TxClient, userId: string, ref: string) {
  const key = String(ref || '').trim();
  if (!key) throw new CascadeError('No account reference given', 'no_ref');

  const { rows } = await tx.query(
    `SELECT ta.*, ch.id AS challenge_id, ch.lifecycle, ch.eval_type AS ch_eval_type
       FROM trading_accounts ta
       LEFT JOIN challenges ch ON ch.account_id = ta.id
      WHERE ta.user_id = $1
        AND (ta.display_label = $2 OR ta.account_number_last4 = $2)
        AND ta.status = 'active'
      FOR UPDATE OF ta`,
    [userId, key]);

  if (rows.length === 0) throw new CascadeError(`No active account matching "${key}"`, 'not_found');
  if (rows.length > 1) {
    throw new CascadeError(
      `"${key}" matches ${rows.length} active accounts (${rows.map(r => r.display_label).join(', ')}). Say which one.`,
      'ambiguous');
  }
  return rows[0];
}

/**
 * Log a trade and cascade every consequence.
 */
export async function logTrade(input: LogTradeInput): Promise<LogTradeResult> {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount)) throw new CascadeError('amount must be a number', 'bad_amount');

  return withTransaction(async (tx) => {
    const warnings: string[] = [];
    const acct = await resolveAccountForTrade(tx, input.userId, input.accountRef);
    const tradeDate = input.tradeDate || todayET();

    // ── 1. Roll the session if we've crossed 5pm ET since the last settle ───
    const settle = settleAccount({
      balance: acct.balance, accountSize: acct.account_size,
      highWaterMark: acct.high_water_mark,
      settledHighWaterMark: acct.settled_high_water_mark,
      lastSettledAt: acct.last_settled_at,
    });
    if (settle) {
      await tx.query(`
        UPDATE trading_accounts
           SET day_start_balance=$2, settled_high_water_mark=$3, last_settled_at=$4, updated_at=NOW()
         WHERE id=$1`,
        [acct.id, settle.dayStartBalance, settle.settledHighWaterMark, settle.lastSettledAt]);
      acct.day_start_balance = settle.dayStartBalance;
      acct.settled_high_water_mark = settle.settledHighWaterMark;
    }

    const balanceBefore = Number(acct.balance);
    const balanceAfter = Math.round((balanceBefore + amount) * 100) / 100;

    // ── 2. Write (or net into) the trade row ────────────────────────────────
    let tradeId: string;
    let netted = false;

    if (input.netIntoSession) {
      const { rows: existing } = await tx.query(`
        SELECT id, amount FROM trades
         WHERE user_id=$1 AND account_id=$2 AND trade_date::date = $3::date
         ORDER BY abs(amount) DESC LIMIT 1`,
        [input.userId, acct.id, tradeDate]);

      if (existing.length) {
        const merged = Math.round((Number(existing[0].amount) + amount) * 100) / 100;
        await tx.query(
          `UPDATE trades SET amount=$2, result=$3 WHERE id=$1`,
          [existing[0].id, String(merged), merged >= 0 ? 'win' : 'loss']);
        tradeId = String(existing[0].id);
        netted = true;
      } else {
        tradeId = randomUUID();
        await tx.query(`
          INSERT INTO trades (id,user_id,account_id,direction,instrument,amount,result,
                              rules_followed,notes,behaviors,rules_broken,trade_date,created_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::text[],$11::text[],$12,NOW())`,
          [tradeId, input.userId, acct.id, input.direction || 'long',
           input.instrument || 'Unknown', String(amount), amount >= 0 ? 'win' : 'loss',
           input.rulesFollowed !== false, input.notes || null,
           `{${(input.behaviors || []).join(',')}}`, `{${(input.rulesBroken || []).join(',')}}`,
           tradeDate]);
      }
    } else {
      tradeId = randomUUID();
      await tx.query(`
        INSERT INTO trades (id,user_id,account_id,direction,instrument,amount,result,
                            rules_followed,notes,behaviors,rules_broken,trade_date,created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::text[],$11::text[],$12,NOW())`,
        [tradeId, input.userId, acct.id, input.direction || 'long',
         input.instrument || 'Unknown', String(amount), amount >= 0 ? 'win' : 'loss',
         input.rulesFollowed !== false, input.notes || null,
         `{${(input.behaviors || []).join(',')}}`, `{${(input.rulesBroken || []).join(',')}}`,
         tradeDate]);
    }

    // ── 3. Balance + high-water mark ────────────────────────────────────────
    const hwm = Math.max(Number(acct.high_water_mark) || 0, balanceAfter);
    await tx.query(`
      UPDATE trading_accounts SET balance=$2, high_water_mark=$3, updated_at=NOW()
       WHERE id=$1`, [acct.id, String(balanceAfter), String(hwm)]);

    // ── 4. Drawdown verdict, using THIS plan's semantics ────────────────────
    const dd = computeDrawdown({
      balance: balanceAfter,
      accountSize: Number(acct.account_size),
      maxDrawdown: Number(acct.max_drawdown),
      dailyDrawdown: Number(acct.daily_drawdown),
      dayStartBalance: acct.day_start_balance != null ? Number(acct.day_start_balance) : null,
      settledHighWaterMark: acct.settled_high_water_mark != null ? Number(acct.settled_high_water_mark) : null,
      lockedFloor: acct.locked_floor != null ? Number(acct.locked_floor) : null,
      floorLockLevel: acct.floor_lock_level != null ? Number(acct.floor_lock_level) : null,
    });

    // Read the RECORDED style for this account. Never re-infer it from the plan
    // name: that was wrong on Alpha Zero, and firms ship new variants (MFF now
    // sells an EOD Rapid) faster than any hardcoded table can track.
    const style = resolveDrawdownStyle(
      acct.drawdown_style, acct.eval_type || acct.ch_eval_type, acct.firm);

    // If we've never been told this plan's style, say so instead of quietly
    // assuming. The default is EOD ("account survives"), which is the dangerous
    // direction to guess wrong in — that is how 9058 got called wrong.
    if (!isStyleKnown(acct.drawdown_style)) {
      warnings.push(
        `Drawdown style not recorded for ${acct.display_label} (${acct.eval_type || 'unknown plan'}) — ` +
        `assuming ${style === 'eod' ? 'EOD: a daily breach is a lockout and the account survives' :
                    'INTRADAY TRAILING: a breach kills the account'}. ` +
        `Tell me which it is and I'll remember it for every ${acct.firm} ${acct.eval_type || ''} account.`);
    }

    let consequence: TradeVerdict['consequence'] = 'none';
    let message = `Balance $${balanceAfter.toLocaleString()}. Room to stop-out: $${dd.room.toFixed(2)}.`;

    if (dd.breached) {
      // A max-DD breach is always terminal, on every plan.
      if (dd.binding === 'max' || style === 'intraday_trailing') {
        consequence = 'account_lost';
        message = style === 'intraday_trailing'
          ? `Heads up: by Propfolio's numbers ${acct.display_label} has touched its floor at ` +
            `$${dd.stopOutLevel.toLocaleString()}, and this plan trails intraday, so that would kill it. ` +
            `Check the platform — if it's blown, tell me and I'll mark it failed.`
          : `Heads up: by Propfolio's numbers ${acct.display_label} has breached max drawdown at ` +
            `$${dd.stopOutLevel.toLocaleString()}. Check the platform — if it's blown, tell me and I'll mark it failed.`;
      } else {
        consequence = 'session_lockout';
        message = `Heads up: daily loss limit reached at $${dd.stopOutLevel.toLocaleString()} by Propfolio's ` +
          `numbers. ${acct.display_label} is an EOD plan, so this is a session lockout, not a kill.`;
      }
    }

    // DELIBERATELY NOT AUTO-FAILING THE ACCOUNT.
    //
    // Propfolio's balance is the sum of the trades Daniel has logged — it is
    // NOT the broker's balance. Unlogged trades, trades logged late, netted
    // scratches and fees all make the two drift. Killing an account off a
    // number the app merely inferred means a live account can be marked dead
    // and vanish from the dashboard while he is still trading it.
    //
    // The breach calculation stays, because a warning is useful. But the state
    // change is Daniel's call: he can see the real platform, the app cannot.
    // "I failed 9056" -> failAccount(). That is the only path to `lost`.
    if (consequence === 'account_lost') {
      warnings.push(
        `${acct.display_label} looks blown by Propfolio's numbers, but this app doesn't see your ` +
        `real broker balance — only the trades you've logged. Nothing has been changed. ` +
        `Say "failed ${acct.display_label}" if the platform confirms it.`);
    }

    // ── 5. Rule-calendar entry for the day ──────────────────────────────────
    let calendarEntryId: string | null = null;
    if (acct.challenge_id) {
      const { rows: cal } = await tx.query(
        `SELECT id FROM calendar_accounts WHERE user_id=$1 AND challenge_id=$2 LIMIT 1`,
        [input.userId, acct.challenge_id]);

      if (cal.length) {
        const followed = input.rulesFollowed !== false && !(input.rulesBroken?.length);
        const compliance = followed ? 'followed' : 'broken';
        const { rows: entry } = await tx.query(
          `SELECT id FROM calendar_entries WHERE calendar_account_id=$1 AND date=$2 LIMIT 1`,
          [cal[0].id, tradeDate]);

        if (entry.length) {
          // A single broken rule makes the whole day broken — never upgrade back.
          await tx.query(`
            UPDATE calendar_entries
               SET followed_rules = followed_rules AND $2,
                   rule_compliance = CASE WHEN rule_compliance='broken' THEN 'broken' ELSE $3 END,
                   updated_at=NOW()
             WHERE id=$1`, [entry[0].id, followed, compliance]);
          calendarEntryId = String(entry[0].id);
        } else {
          calendarEntryId = randomUUID();
          await tx.query(`
            INSERT INTO calendar_entries (id,calendar_account_id,date,followed_rules,
                                          rule_compliance,notes,created_at,updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())`,
            [calendarEntryId, cal[0].id, tradeDate, followed, compliance, input.notes || null]);
        }
      }
    }

    if (!Array.isArray(acct.rules) || acct.rules.length === 0) {
      warnings.push(`${acct.display_label} has no rules set — nothing for the calendar to check.`);
    }

    return {
      tradeId, accountId: String(acct.id), label: String(acct.display_label),
      balanceBefore, balanceAfter, netted, calendarEntryId, warnings,
      verdict: {
        breached: dd.breached, binding: dd.binding, consequence, style,
        balance: balanceAfter, stopOutLevel: dd.stopOutLevel,
        room: dd.room, dayPnL: dd.dayPnL, message,
      },
    };
  });
}

/**
 * Record a payout against a funded/live account.
 * Keeps `payout_count` in step, which is what gates the live promotion.
 */
export async function recordPayout(input: {
  userId: string; accountRef: string; amount: number; date?: string; description?: string;
}): Promise<{ payoutId: string; label: string; payoutCount: number; eligibleForLive: boolean }> {
  const amount = Math.round((Number(input.amount) || 0) * 100) / 100;
  if (amount <= 0) throw new CascadeError('Payout amount must be positive', 'bad_amount');

  return withTransaction(async (tx) => {
    const acct = await resolveAccountForTrade(tx, input.userId, input.accountRef);
    if (!acct.challenge_id) throw new CascadeError('No challenge row', 'no_challenge');

    const lc = String(acct.lifecycle || '');
    if (!lc.startsWith('funded') && !lc.startsWith('live')) {
      throw new CascadeError(
        `${acct.display_label} is "${lc}" — only funded or live accounts take payouts.`,
        'bad_lifecycle');
    }

    const payoutId = randomUUID();
    await tx.query(`
      INSERT INTO payouts (id,user_id,challenge_id,amount,date,description,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
      [payoutId, input.userId, acct.challenge_id, String(amount),
       input.date || todayET(), input.description || null]);

    const { rows } = await tx.query(
      `SELECT count(*)::int AS n FROM payouts WHERE challenge_id=$1`, [acct.challenge_id]);
    const payoutCount = rows[0]?.n ?? 0;

    await tx.query(
      `UPDATE challenges SET payout_count=$2, updated_at=NOW() WHERE id=$1`,
      [acct.challenge_id, payoutCount]);

    return {
      payoutId, label: String(acct.display_label), payoutCount,
      eligibleForLive: payoutCount >= 5 && lc === 'funded_active',
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan rules — the system learns instead of hardcoding
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Prop firms change plan rules constantly and sell several variants under one
 * name (MFF sells Rapid as trailing AND, newly, an EOD Rapid with a consistency
 * rule). Encoding that in code guarantees it is wrong within months — and it
 * already was: Alpha Zero is EOD, but an inferred table called it trailing.
 *
 * So Propfolio LEARNS. The first time a (firm, plan) pair is seen, it asks. The
 * answer is stored in `plan_rules` and applied automatically ever after. When
 * a firm changes the rules, one correction updates the catalogue and every
 * future account of that plan.
 */

export interface PlanRule {
  firmName: string;
  evalType: string;
  drawdownStyle: DrawdownStyle;
  consistencyPct?: number | null;
  profitSplitPct?: number | null;
  payoutMin?: number | null;
  winningDayMin?: number | null;
  winningDaysReq?: number | null;
  notes?: string | null;
}

/** What Propfolio already knows about a (firm, plan). Null = never been told. */
export async function getPlanRule(
  userId: string, firmName: string, evalType: string,
): Promise<PlanRule | null> {
  return withTransaction(async (tx) => {
    const { rows } = await tx.query(`
      SELECT firm_name, eval_type, drawdown_style, consistency_pct, profit_split_pct,
             payout_min, winning_day_min, winning_days_req, notes
        FROM plan_rules
       WHERE user_id = $1 AND lower(firm_name) = lower($2) AND lower(eval_type) = lower($3)
       LIMIT 1`, [userId, firmName, evalType]);
    if (!rows.length) return null;
    const r = rows[0];
    return {
      firmName: r.firm_name, evalType: r.eval_type,
      drawdownStyle: r.drawdown_style as DrawdownStyle,
      consistencyPct: r.consistency_pct == null ? null : Number(r.consistency_pct),
      profitSplitPct: r.profit_split_pct == null ? null : Number(r.profit_split_pct),
      payoutMin: r.payout_min == null ? null : Number(r.payout_min),
      winningDayMin: r.winning_day_min == null ? null : Number(r.winning_day_min),
      winningDaysReq: r.winning_days_req == null ? null : Number(r.winning_days_req),
      notes: r.notes,
    };
  });
}

/** Everything Propfolio has learned, for the bot to consult before asking. */
export async function listPlanRules(userId: string): Promise<PlanRule[]> {
  return withTransaction(async (tx) => {
    const { rows } = await tx.query(`
      SELECT firm_name, eval_type, drawdown_style, consistency_pct, profit_split_pct,
             payout_min, winning_day_min, winning_days_req, notes
        FROM plan_rules WHERE user_id = $1
       ORDER BY firm_name, eval_type`, [userId]);
    return rows.map((r: any) => ({
      firmName: r.firm_name, evalType: r.eval_type,
      drawdownStyle: r.drawdown_style as DrawdownStyle,
      consistencyPct: r.consistency_pct == null ? null : Number(r.consistency_pct),
      profitSplitPct: r.profit_split_pct == null ? null : Number(r.profit_split_pct),
      payoutMin: r.payout_min == null ? null : Number(r.payout_min),
      winningDayMin: r.winning_day_min == null ? null : Number(r.winning_day_min),
      winningDaysReq: r.winning_days_req == null ? null : Number(r.winning_days_req),
      notes: r.notes,
    }));
  });
}

/**
 * Teach Propfolio a plan's rules — or correct them when a firm changes them.
 *
 * `applyToActive` also updates the live accounts already on that plan, which is
 * what you want when a firm changes the rules mid-flight or when an earlier
 * answer turns out to be wrong (as Alpha Zero was).
 */
export async function upsertPlanRule(
  userId: string, rule: PlanRule & { applyToActive?: boolean },
): Promise<{ rule: PlanRule; accountsUpdated: number }> {
  if (!rule.firmName || !rule.evalType) {
    throw new CascadeError('firmName and evalType are required', 'missing_plan');
  }
  if (rule.drawdownStyle !== 'eod' && rule.drawdownStyle !== 'intraday_trailing') {
    throw new CascadeError(
      `drawdownStyle must be "eod" or "intraday_trailing", got "${rule.drawdownStyle}"`,
      'bad_style');
  }

  return withTransaction(async (tx) => {
    await tx.query(`
      INSERT INTO plan_rules (user_id, firm_name, eval_type, drawdown_style,
                              consistency_pct, profit_split_pct, payout_min,
                              winning_day_min, winning_days_req, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (user_id, lower(firm_name), lower(eval_type))
      DO UPDATE SET drawdown_style   = EXCLUDED.drawdown_style,
                    consistency_pct  = COALESCE(EXCLUDED.consistency_pct,  plan_rules.consistency_pct),
                    profit_split_pct = COALESCE(EXCLUDED.profit_split_pct, plan_rules.profit_split_pct),
                    payout_min       = COALESCE(EXCLUDED.payout_min,       plan_rules.payout_min),
                    winning_day_min  = COALESCE(EXCLUDED.winning_day_min,  plan_rules.winning_day_min),
                    winning_days_req = COALESCE(EXCLUDED.winning_days_req, plan_rules.winning_days_req),
                    notes            = COALESCE(EXCLUDED.notes,            plan_rules.notes),
                    updated_at = NOW()`,
      [userId, rule.firmName, rule.evalType, rule.drawdownStyle,
       rule.consistencyPct ?? null, rule.profitSplitPct ?? null, rule.payoutMin ?? null,
       rule.winningDayMin ?? null, rule.winningDaysReq ?? null, rule.notes ?? null]);

    let accountsUpdated = 0;
    if (rule.applyToActive !== false) {
      const { rowCount } = await tx.query(`
        UPDATE trading_accounts
           SET drawdown_style   = $4,
               consistency_pct  = COALESCE($5, consistency_pct),
               profit_split_pct = COALESCE($6, profit_split_pct),
               updated_at = NOW()
         WHERE user_id = $1 AND lower(firm) = lower($2) AND lower(COALESCE(eval_type,'')) = lower($3)
           AND status = 'active'`,
        [userId, rule.firmName, rule.evalType, rule.drawdownStyle,
         rule.consistencyPct ?? null, rule.profitSplitPct ?? null]);
      accountsUpdated = rowCount;
    }

    return { rule, accountsUpdated };
  });
}
