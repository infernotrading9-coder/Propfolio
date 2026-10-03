/**
 * Reliability layer: idempotency, undo, and a single state read.
 * ==============================================================
 *
 * These exist because the bot is a network client talking to a serverless
 * backend over Telegram, not a careful human clicking a form.
 *
 *   IDEMPOTENCY — a Netlify function can time out after the write committed.
 *   The bot retries in good faith and Daniel ends up with the same trade logged
 *   twice, silently corrupting his P&L. A key per statement makes a retry
 *   return the original result instead.
 *
 *   UNDO — "scratch that, wrong account" currently needs manual SQL. Every
 *   cascade now records how to reverse itself.
 *
 *   ONE STATE READ — the bot was assembling context from several calls, which
 *   is slow and lets it act on a half-stale picture.
 */

import { randomUUID } from 'crypto';
import { withTransaction, type TxClient } from './txConnection';
import { CascadeError } from './cascadeService';
import { computeDrawdown } from './drawdownModel';

const round2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;

// ─────────────────────────────────────────────────────────────────────────────
// Idempotency
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run `fn` at most once for a given key.
 *
 * The key is claimed in its own committed transaction BEFORE the work runs, so
 * two concurrent retries cannot both pass the check. The loser gets the
 * winner's stored response.
 *
 * No key supplied → runs normally. Idempotency is opt-in per statement.
 */
export async function withIdempotency<T>(
  userId: string, key: string | undefined, action: string, fn: () => Promise<T>,
): Promise<T & { idempotentReplay?: boolean }> {
  if (!key) return fn() as any;

  const existing = await withTransaction(async (tx) => {
    const { rows } = await tx.query(
      `SELECT response FROM idempotency_keys WHERE key = $1 AND user_id = $2`, [key, userId]);
    return rows[0]?.response ?? null;
  });
  if (existing) {
    return { ...(typeof existing === 'string' ? JSON.parse(existing) : existing),
             idempotentReplay: true };
  }

  const result = await fn();

  await withTransaction(async (tx) => {
    await tx.query(`
      INSERT INTO idempotency_keys (key, user_id, action, response, created_at)
      VALUES ($1,$2,$3,$4::jsonb,NOW())
      ON CONFLICT (key) DO NOTHING`,
      [key, userId, action, JSON.stringify(result)]);
  });

  return result as any;
}

// ─────────────────────────────────────────────────────────────────────────────
// Undo
// ─────────────────────────────────────────────────────────────────────────────

export interface UndoableAction {
  id: string;
  action: string;
  summary: string;
  createdAt: string;
  undone: boolean;
}

/** Record how to reverse what just happened. Re-exported from actionLog so the
 *  writers (cascadeService, tradeService) can import it without an import cycle. */
export { logAction } from './actionLog';

/** The most recent reversible actions, newest first. */
export async function listRecentActions(userId: string, limit = 5): Promise<UndoableAction[]> {
  return withTransaction(async (tx) => {
    const { rows } = await tx.query(`
      SELECT id, action, summary, created_at, undone_at
        FROM action_log WHERE user_id = $1
       ORDER BY created_at DESC LIMIT $2`, [userId, limit]);
    return rows.map((r: any) => ({
      id: r.id, action: r.action, summary: r.summary,
      createdAt: new Date(r.created_at).toISOString(),
      undone: !!r.undone_at,
    }));
  });
}


function signedTradeAmount(row: { amount: unknown; result?: unknown }): number {
  const amount = Number(row.amount) || 0;
  if (amount < 0) return round2(amount);
  return String(row.result || '').toLowerCase() === 'loss' ? -Math.abs(round2(amount)) : Math.abs(round2(amount));
}

function resultForAmount(amount: number): 'win' | 'loss' {
  return amount < 0 ? 'loss' : 'win';
}

function toPgTextArray(values?: string[] | null): string {
  const list = Array.isArray(values) ? values.filter(v => v != null) : [];
  if (list.length === 0) return '{}';
  return `{${list.map((v) => JSON.stringify(String(v))).join(',')}}`;
}

async function recomputeAccountFromTrades(tx: TxClient, userId: string, accountId: string) {
  const { rows: acctRows } = await tx.query(
    `SELECT id, account_size FROM trading_accounts WHERE id=$1 AND user_id=$2 FOR UPDATE`,
    [accountId, userId]);
  if (!acctRows.length) return;

  const startingBalance = round2(acctRows[0].account_size);
  let balance = startingBalance;
  let highWaterMark = startingBalance;

  const { rows: tradeRows } = await tx.query(
    `SELECT amount, result FROM trades
      WHERE user_id=$1 AND account_id=$2
      ORDER BY trade_date, created_at, id`,
    [userId, accountId]);
  for (const trade of tradeRows) {
    balance = round2(balance + signedTradeAmount(trade));
    highWaterMark = Math.max(highWaterMark, balance);
  }

  await tx.query(
    `UPDATE trading_accounts SET balance=$2, high_water_mark=$3, updated_at=NOW() WHERE id=$1`,
    [accountId, String(balance), String(highWaterMark)]);
}

/**
 * Reverse an action.
 *
 * Only trades and payouts are reversible. Buying and passing an eval spawn
 * accounts that may since have been traded on, so unwinding them safely is not
 * something to do automatically — those say so and ask Daniel to be explicit.
 */
export async function undoAction(
  userId: string, actionId?: string,
): Promise<{ undone: string; summary: string }> {
  return withTransaction(async (tx) => {
    const { rows } = actionId
      ? await tx.query(
          `SELECT * FROM action_log WHERE id = $1 AND user_id = $2 FOR UPDATE`, [actionId, userId])
      : await tx.query(
          `SELECT * FROM action_log WHERE user_id = $1 AND undone_at IS NULL
            ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [userId]);

    if (!rows.length) throw new CascadeError('Nothing to undo', 'nothing_to_undo');
    const entry = rows[0];
    if (entry.undone_at) throw new CascadeError('That action was already undone', 'already_undone');

    const d = typeof entry.undo_data === 'string' ? JSON.parse(entry.undo_data) : entry.undo_data;

    switch (entry.action) {
      case 'log-trade': {
        // Reverse the trade, then recompute the account from the remaining trade
        // ledger. The old code restored a snapshot from before this action; if
        // Daniel undid a middle trade, that wiped every later trade's P&L.
        if (d.netted) {
          await tx.query(`UPDATE trades SET amount=$2, result=$3 WHERE id=$1`,
            [d.tradeId, String(d.priorAmount), resultForAmount(Number(d.priorAmount) || 0)]);
        } else {
          await tx.query(`DELETE FROM trades WHERE id=$1`, [d.tradeId]);
        }
        await recomputeAccountFromTrades(tx, userId, d.accountId);
        if (d.calendarEntryCreated && d.calendarEntryId) {
          await tx.query(`DELETE FROM calendar_entries WHERE id=$1`, [d.calendarEntryId]);
        }
        break;
      }

      case 'correct-trade': {
        const p = d.prior || {};
        await tx.query(`
          UPDATE trades
             SET direction=$2, instrument=$3, entry_price=$4, exit_price=$5,
                 amount=$6, result=$7, risk_reward=$8, rules_followed=$9,
                 notes=$10, behaviors=$11::text[], rules_broken=$12::text[], trade_date=$13
           WHERE id=$1`, [
          d.tradeId,
          p.direction ?? null,
          p.instrument ?? null,
          p.entryPrice ?? null,
          p.exitPrice ?? null,
          String(p.amount ?? 0),
          p.result ?? resultForAmount(Number(p.amount) || 0),
          p.riskReward ?? null,
          p.rulesFollowed ?? true,
          p.notes ?? null,
          toPgTextArray(p.behaviors || []),
          toPgTextArray(p.rulesBroken || []),
          p.tradeDate ?? new Date(),
        ]);
        await recomputeAccountFromTrades(tx, userId, d.accountId);
        break;
      }

      case 'record-payout': {
        // Reverse every budget slice, then drop the payout and recount.
        const { rows: br } = await tx.query(
          `SELECT state FROM budget_state WHERE user_id=$1 FOR UPDATE`, [userId]);
        if (br.length) {
          const state = typeof br[0].state === 'string' ? JSON.parse(br[0].state) : br[0].state;
          for (const a of (d.allocations || [])) {
            const acct = (state.accounts || []).find((x: any) => x?.id === a.accountId);
            if (!acct) continue;
            const isLiab = ['credit', 'debt', 'borrow'].includes(String(acct.loanKind || ''));
            // Exact inverse of applyIncome.
            acct.balance = round2(Number(acct.balance) + (isLiab ? Number(a.amount) : -Number(a.amount)));
          }
          const label = String(d.label || '');
          state.transactions = (state.transactions || []).filter(
            (t: any) => !(t.type === 'income' && String(t.name || '').startsWith(`Payout ${label} →`)));
          await tx.query(`UPDATE budget_state SET state=$2::jsonb, updated_at=NOW() WHERE user_id=$1`,
            [userId, JSON.stringify(state)]);
        }
        await tx.query(`DELETE FROM payout_allocations WHERE payout_id=$1`, [d.payoutId]);
        await tx.query(`DELETE FROM payouts WHERE id=$1`, [d.payoutId]);
        const { rows: pc } = await tx.query(
          `SELECT count(*)::int n FROM payouts WHERE challenge_id=$1`, [d.challengeId]);
        await tx.query(`UPDATE challenges SET payout_count=$2, updated_at=NOW() WHERE id=$1`,
          [d.challengeId, pc[0]?.n ?? 0]);
        break;
      }

      case 'fail-account': {
        await tx.query(`UPDATE trading_accounts SET status=$2, updated_at=NOW() WHERE id=$1`,
          [d.accountId, d.priorCardStatus || 'active']);
        await tx.query(`
          UPDATE challenges SET status=$2, lifecycle=$3, outcome_type=$4,
                 failure_reason=NULL, failure_date=NULL, updated_at=NOW()
           WHERE id=$1`,
          [d.challengeId, d.priorStatus, d.priorLifecycle, d.priorOutcome]);
        await tx.query(`UPDATE calendar_accounts SET is_active=true WHERE challenge_id=$1`,
          [d.challengeId]);
        break;
      }

      case 'log-expense':
      case 'transfer': {
        const { rows: br } = await tx.query(
          `SELECT state FROM budget_state WHERE user_id=$1 FOR UPDATE`, [userId]);
        if (!br.length) break;
        const state = typeof br[0].state === 'string' ? JSON.parse(br[0].state) : br[0].state;
        const isLiab = (a: any) => ['credit', 'debt', 'borrow'].includes(String(a.loanKind || ''));
        for (const mv of (d.moves || [])) {
          const acct = (state.accounts || []).find((x: any) => x?.id === mv.accountId);
          if (!acct) continue;
          acct.balance = round2(Number(acct.balance) - Number(mv.delta));
        }
        state.transactions = (state.transactions || []).filter((t: any) => t.id !== d.txnId);
        await tx.query(`UPDATE budget_state SET state=$2::jsonb, updated_at=NOW() WHERE user_id=$1`,
          [userId, JSON.stringify(state)]);
        break;
      }

      case 'reconcile-balances': {
        // Put every balance back and drop the adjustment transactions.
        const { rows: br } = await tx.query(
          `SELECT state FROM budget_state WHERE user_id=$1 FOR UPDATE`, [userId]);
        if (!br.length) break;
        const state = typeof br[0].state === 'string' ? JSON.parse(br[0].state) : br[0].state;
        const txnIds = new Set((d.balances || []).map((b: any) => b.txnId).filter(Boolean));
        for (const b of (d.balances || [])) {
          const acct = (state.accounts || []).find((x: any) => x?.id === b.id);
          if (acct) acct.balance = round2(Number(b.balance));
        }
        state.transactions = (state.transactions || []).filter((t: any) => !txnIds.has(t.id));
        await tx.query(`UPDATE budget_state SET state=$2::jsonb, updated_at=NOW() WHERE user_id=$1`,
          [userId, JSON.stringify(state)]);
        break;
      }

      case 'correct-plan': {
        // Undo a plan-label correction: put the old plan back on both rows.
        await tx.query(
          `UPDATE trading_accounts SET eval_type=$2, firm=$3, updated_at=NOW() WHERE id=$1`,
          [d.accountId, d.priorEvalType, d.priorFirm]);
        if (d.challengeId) {
          await tx.query(
            `UPDATE challenges SET eval_type=$2, updated_at=NOW() WHERE id=$1`,
            [d.challengeId, d.priorChEvalType]);
        }
        break;
      }

      default:
        throw new CascadeError(
          `"${entry.action}" cannot be undone automatically — it created accounts that may have been traded since. Tell me exactly what to reverse.`,
          'not_undoable');
    }

    await tx.query(`UPDATE action_log SET undone_at=NOW() WHERE id=$1`, [entry.id]);
    return { undone: entry.action, summary: entry.summary };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// One state read
// ─────────────────────────────────────────────────────────────────────────────

export interface AccountState {
  label: string;
  /** Daniel's short handle, if set. Prefer this when talking to him. */
  nickname: string | null;
  /** First 4 chars of the account number, when he has supplied them. */
  first4: string | null;
  last4: string | null;
  firm: string;
  plan: string | null;
  stage: string;
  accountSize: number;
  balance: number;
  dayPnL: number;
  stopOutLevel: number;
  roomToStopOut: number;
  bindingRule: 'max' | 'daily';
  dailyLossLimit: number | null;
  maxDrawdown: number;
  rules: string[];
  payoutCount: number;
  /**
   * Which rule stage governs this account — 'eval' or 'funded'. Consistency
   * rules differ between the two, so the numbers below are stage-resolved.
   */
  ruleStage: 'eval' | 'funded';
  /** Plan facts, from the catalogue. Null when the plan is not yet known. */
  consistencyPct: number | null;
  /**
   * True when nobody has told Propfolio this plan's consistency rule AT THIS
   * STAGE. The bot should ask rather than assume there is no rule — a plan can
   * have 50% on the eval and something different (or nothing) once funded.
   */
  consistencyUnknown: boolean;
  profitSplitPct: number | null;
  payoutMin: number | null;
  /** Consistency maths Daniel currently does by hand. */
  bestDay: number | null;
  trueProfitTarget: number | null;
  consistencyOk: boolean | null;
  totalProfit: number;
  winningDays: number;
  /**
   * Payout journey, from the plan_rule matched to this account's
   * firm / plan / size / stage. Null = nobody has told us yet.
   */
  winningDaysReq: number | null;
  winningDayMin: number | null;
  payoutTarget: number | null;
  payoutInterval: 'daily' | 'green_days' | 'consistency' | null;
  payoutBuffer: number | null;
  /**
   * How long this account lasted. For a dead account it is its whole life
   * (failure_date − start_date); for a live one it is how long it has survived
   * so far. Null when the account has no start_date on record.
   *
   * This is the "how fast am I losing evals" number — a 2-day eval is a much
   * louder signal than a 15-day one, even at the same dollar loss.
   */
  lifespanDays: number | null;
  /** Days since it opened, regardless of whether it has since died. */
  daysAlive: number | null;
  /** start_date, as stored (TEXT, YYYY-MM-DD). */
  openedAt: string | null;
}

export interface FullState {
  accounts: AccountState[];
  /**
   * Pace metrics — how fast accounts are being lost and earned. Every average
   * carries its sample size because `failure_date` is only populated on a
   * minority of historical rows; never quote one without checking `n`.
   */
  velocity: {
    evalFailures: { n: number; avgDays: number | null; medianDays: number | null; fastestDays: number | null };
    fundedFailures: { n: number; avgDays: number | null };
    evalPasses: { n: number; avgDays: number | null; fastestDays: number | null };
    oldestOpenDays: number | null;
    newestOpenDays: number | null;
  };
  budget: {
    cashOnHand: number;
    totalOwed: number;
    /** Money owed back to Daniel — overpaid liabilities. Adds to net worth. */
    owedToMe: number;
    /** The slice of debt flagged behind — BAD debt. What the score reacts to. */
    overdueDebt: number;
    /** Monthly total of ACTIVE recurring charges only. */
    monthlyRecurring: number;
    net: number;
    accounts: Array<{
      id: string; name: string; balance: number; isLiability: boolean;
      overdue: boolean; overdueSince: string | null; owedToMe: number;
    }>;
    recurring: Array<{
      id: string; name: string; amount: number; dayOfMonth: number | null;
      accountId: string | null; categoryId: string | null;
      frequency: string; active: boolean; notes: string | null;
    }>;
  };
  totals: {
    activeEvals: number;
    fundedAccounts: number;
    liveAccounts: number;
    spentThisMonth: number;
    payoutsThisMonth: number;
  };
  lastActions: UndoableAction[];
}

/** Whole days between two dates. Null when either is missing or unparseable. */
function daysBetween(from?: any, to?: any): number | null {
  if (!from || !to) return null;
  const f = new Date(String(from).slice(0, 10));
  const t = new Date(String(to).slice(0, 10));
  if (isNaN(f.getTime()) || isNaN(t.getTime())) return null;
  return Math.max(0, Math.round((t.getTime() - f.getTime()) / 86400000));
}

/**
 * Everything the bot needs, in one call.
 *
 * Includes the consistency maths that has nearly cost Daniel an eval: the real
 * pass threshold is not the nominal target but `bestDay / consistencyPct`,
 * because a single outsized day can breach the rule even at target. He came
 * within $1 of failing at exactly $3,000 once, because a $1,500.50 best day
 * pushed the true bar to $3,001.
 */
export async function getFullState(userId: string): Promise<FullState> {
  return withTransaction(async (tx) => {
    const TODAY = new Date().toISOString().slice(0, 10);
    // Resolve plan facts for the stage each account is ACTUALLY in.
    //
    // Consistency rules commonly differ between eval and funded — some plans
    // drop the rule once funded, others change the percentage. A join that
    // ignored stage would hand a funded account its eval consistency number,
    // which is how Lucid Flex's 50% would have been applied to a funded card.
    //
    // Precedence: 'any' first, then the stage-specific row, taking the LAST
    // non-null via a window so a stage row overrides field by field without
    // erasing what only the 'any' row knows.
    const { rows: accts } = await tx.query(`
      WITH acct AS (
        SELECT ta.*, ch.lifecycle, ch.payout_count, ch.id AS challenge_id,
               ch.start_date, ch.failure_date, ch.phase1_completed_at, ch.went_live_at,
               CASE WHEN ch.lifecycle LIKE 'funded%' OR ch.lifecycle LIKE 'live%'
                    THEN 'funded' ELSE 'eval' END AS rule_stage
          FROM trading_accounts ta
          LEFT JOIN challenges ch ON ch.account_id = ta.id
         WHERE ta.user_id = $1 AND ta.status = 'active'
      )
      SELECT a.*,
             r.consistency_pct, r.profit_split_pct, r.payout_min,
             r.daily_loss_limit AS plan_dll, r.has_daily_loss,
             r.winning_day_min, r.winning_days_req,
             r.payout_target, r.payout_interval, r.payout_buffer
        FROM acct a
        LEFT JOIN LATERAL (
          SELECT
            (array_agg(pr.consistency_pct  ORDER BY ord DESC) FILTER (WHERE pr.consistency_pct  IS NOT NULL))[1] AS consistency_pct,
            (array_agg(pr.profit_split_pct ORDER BY ord DESC) FILTER (WHERE pr.profit_split_pct IS NOT NULL))[1] AS profit_split_pct,
            (array_agg(pr.payout_min       ORDER BY ord DESC) FILTER (WHERE pr.payout_min       IS NOT NULL))[1] AS payout_min,
            (array_agg(pr.daily_loss_limit ORDER BY ord DESC) FILTER (WHERE pr.daily_loss_limit IS NOT NULL))[1] AS daily_loss_limit,
            (array_agg(pr.has_daily_loss   ORDER BY ord DESC) FILTER (WHERE pr.has_daily_loss   IS NOT NULL))[1] AS has_daily_loss,
            (array_agg(pr.winning_day_min  ORDER BY ord DESC) FILTER (WHERE pr.winning_day_min  IS NOT NULL))[1] AS winning_day_min,
            (array_agg(pr.winning_days_req ORDER BY ord DESC) FILTER (WHERE pr.winning_days_req IS NOT NULL))[1] AS winning_days_req,
            (array_agg(pr.payout_target    ORDER BY ord DESC) FILTER (WHERE pr.payout_target    IS NOT NULL))[1] AS payout_target,
            (array_agg(pr.payout_interval  ORDER BY ord DESC) FILTER (WHERE pr.payout_interval  IS NOT NULL))[1] AS payout_interval,
            (array_agg(pr.payout_buffer    ORDER BY ord DESC) FILTER (WHERE pr.payout_buffer    IS NOT NULL))[1] AS payout_buffer
          FROM (
            SELECT p.*,
                   -- Higher = more specific. Stage-specific beats size-specific
                   -- beats generic, and array_agg ORDER BY ord DESC below puts
                   -- the most specific non-null value first.
                   (CASE WHEN p.stage <> 'any' THEN 2 ELSE 0 END
                  + CASE WHEN p.account_size IS NOT NULL THEN 1 ELSE 0 END) AS ord
              FROM plan_rules p
             WHERE p.user_id = a.user_id
               AND lower(p.firm_name) = lower(a.firm)
               AND lower(p.eval_type) = lower(COALESCE(a.eval_type,''))
               AND (p.account_size IS NULL OR p.account_size = a.account_size)
               AND p.stage IN ('any', a.rule_stage)
          ) pr
        ) r ON TRUE
       ORDER BY a.display_label`, [userId]);

    const accounts: AccountState[] = [];
    for (const a of accts) {
      const dd = computeDrawdown({
        balance: Number(a.balance), accountSize: Number(a.account_size),
        maxDrawdown: Number(a.max_drawdown), dailyDrawdown: Number(a.daily_drawdown),
        dayStartBalance: a.day_start_balance != null ? Number(a.day_start_balance) : null,
        settledHighWaterMark: a.settled_high_water_mark != null ? Number(a.settled_high_water_mark) : null,
        lockedFloor: a.locked_floor != null ? Number(a.locked_floor) : null,
        floorLockLevel: a.floor_lock_level != null ? Number(a.floor_lock_level) : null,
      });

      // Per-day P&L, for best-day and winning-day counts.
      const { rows: days } = await tx.query(`
        SELECT trade_date::date AS d, SUM(amount)::numeric AS pnl
          FROM trades WHERE user_id=$1 AND account_id=$2
         GROUP BY 1 ORDER BY 2 DESC`, [userId, a.id]);

      const bestDay = days.length ? round2(days[0].pnl) : null;
      const totalProfit = round2(days.reduce((s: number, r: any) => s + Number(r.pnl), 0));
      // A green day must CLEAR the plan's minimum, not merely be positive —
      // a $29 day does not count against Lucid Flex's $100 bar. Falls back to
      // "any positive day" only when no threshold is known.
      const dayMin = a.winning_day_min == null ? 0 : Number(a.winning_day_min);
      const winningDays = days.filter((r: any) => Number(r.pnl) > dayMin).length;

      const consistency = a.consistency_pct == null ? null : Number(a.consistency_pct);
      // A stored 0 means "confirmed: no consistency rule at this stage" and must
      // not be treated as a rule. null means nobody has told us — the bot asks.
      const hasRule = consistency !== null && consistency > 0;
      // The real bar: no single day may exceed consistencyPct of total profit,
      // so the true target is bestDay / consistencyPct, not the nominal target.
      const trueTarget = hasRule && bestDay
        ? round2(bestDay / (consistency! / 100)) : null;
      const consistencyOk = hasRule && bestDay && totalProfit > 0
        ? (bestDay / totalProfit) * 100 <= consistency! : null;

      accounts.push({
        label: String(a.display_label ?? a.account_number_last4 ?? ''),
        nickname: a.nickname ?? null,
        first4: a.account_first4 ?? null,
        last4: a.account_number_last4, firm: String(a.firm),
        plan: a.eval_type, stage: String(a.lifecycle || 'eval_active'),
        accountSize: Number(a.account_size), balance: Number(a.balance),
        dayPnL: round2(dd.dayPnL), stopOutLevel: round2(dd.stopOutLevel),
        roomToStopOut: round2(dd.room), bindingRule: dd.binding,
        dailyLossLimit: Number(a.daily_drawdown) > 0 ? Number(a.daily_drawdown) : null,
        maxDrawdown: Number(a.max_drawdown),
        rules: Array.isArray(a.rules) ? a.rules : [],
        payoutCount: Number(a.payout_count ?? 0),
        ruleStage: a.rule_stage === 'funded' ? 'funded' : 'eval',
        consistencyPct: consistency,
        consistencyUnknown: consistency === null,
        profitSplitPct: a.profit_split_pct == null ? null : Number(a.profit_split_pct),
        payoutMin: a.payout_min == null ? null : Number(a.payout_min),
        bestDay, trueProfitTarget: trueTarget, consistencyOk,
        totalProfit, winningDays,
        winningDaysReq: a.winning_days_req == null ? null : Number(a.winning_days_req),
        winningDayMin: a.winning_day_min == null ? null : Number(a.winning_day_min),
        payoutTarget: a.payout_target == null ? null : Number(a.payout_target),
        payoutInterval: (a.payout_interval ?? null) as AccountState['payoutInterval'],
        payoutBuffer: a.payout_buffer == null ? null : Number(a.payout_buffer),
        // How long this account has lasted. A FAILED account is measured to its
        // failure date; one still running is measured to today.
        //
        // phase1_completed_at must NOT be used as an end-of-life date for a
        // running account: it marks the eval phase closing, not the account
        // dying. A funded account that passed its eval the same day it opened
        // would otherwise report a lifespan of 0 days.
        lifespanDays: a.start_date
          ? (String(a.lifecycle || '').endsWith('_failed')
              ? (daysBetween(a.start_date, a.failure_date || a.phase1_completed_at)
                 ?? daysBetween(a.start_date, TODAY))
              : daysBetween(a.start_date, TODAY))
          : null,
        daysAlive: a.start_date ? daysBetween(a.start_date, TODAY) : null,
        openedAt: a.start_date || null,
      });
    }

    // ── Velocity: how fast evals are being lost and earned ────────────────────
    // A 2-day eval and a 15-day eval can cost the same money but mean opposite
    // things. These are the durations, kept server-side so the bot can reason
    // about pace rather than just balance.
    //
    // CAUTION: `failure_date` is only populated on a minority of historical
    // rows, so every average here carries its own sample size. Never present one
    // as a trend without checking `n` — that is why they ship together.
    const { rows: velRows } = await tx.query(`
      WITH fail AS (
        SELECT lifecycle, (failure_date::date - start_date::date) AS days
          FROM challenges
         WHERE user_id = $1
           AND start_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
           AND failure_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
      ),
      pass AS (
        SELECT (phase1_completed_at::date - start_date::date) AS days
          FROM challenges
         WHERE user_id = $1
           AND start_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
           AND phase1_completed_at IS NOT NULL
      )
      SELECT
        (SELECT count(*)::int FROM fail WHERE lifecycle LIKE 'eval%')            AS eval_fail_n,
        (SELECT round(avg(days), 1) FROM fail WHERE lifecycle LIKE 'eval%')      AS eval_fail_avg_days,
        (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY days)::numeric, 1)
           FROM fail WHERE lifecycle LIKE 'eval%')                               AS eval_fail_median_days,
        (SELECT min(days) FROM fail WHERE lifecycle LIKE 'eval%')                AS eval_fail_fastest,
        (SELECT count(*)::int FROM fail WHERE lifecycle LIKE 'funded%')          AS funded_fail_n,
        (SELECT round(avg(days), 1) FROM fail WHERE lifecycle LIKE 'funded%')    AS funded_fail_avg_days,
        (SELECT count(*)::int FROM pass)                                         AS pass_n,
        (SELECT round(avg(days), 1) FROM pass)                                   AS pass_avg_days,
        (SELECT min(days) FROM pass)                                             AS pass_fastest_days`,
      [userId]);
    const v = velRows[0] ?? {};
    const num = (x: any) => (x == null ? null : Number(x));

    // How long the currently-open accounts have survived so far.
    const liveDurations = accounts
      .map((a) => a.daysAlive)
      .filter((d): d is number => d != null);
    const oldestOpenDays = liveDurations.length ? Math.max(...liveDurations) : null;
    const newestOpenDays = liveDurations.length ? Math.min(...liveDurations) : null;

    // Budget
    const { rows: bs } = await tx.query(
      `SELECT state FROM budget_state WHERE user_id=$1`, [userId]);
    const state = bs.length
      ? (typeof bs[0].state === 'string' ? JSON.parse(bs[0].state) : bs[0].state) : { accounts: [] };
    const budgetAccounts = (state.accounts || []).map((a: any) => {
      const balance = round2(a.balance);
      const isLiability = ['credit', 'debt', 'borrow'].includes(String(a.loanKind || ''));
      return {
        id: String(a.id), name: String(a.name), balance, isLiability,
        // Behind on payments = BAD debt. A fact on the account now, not a
        // judgement the bot has to carry.
        overdue: isLiability && balance > 0 && !!a.overdue,
        overdueSince: a.overdueSince ? String(a.overdueSince) : null,
        // Overpaid liability -> the excess is owed back to Daniel.
        owedToMe: isLiability && balance < 0 ? round2(Math.abs(balance)) : 0,
      };
    });
    const cashOnHand = round2(budgetAccounts.filter((a: any) => !a.isLiability)
      .reduce((s: number, a: any) => s + a.balance, 0));
    // Only a liability still holding debt counts as owed — a negative balance is
    // a receivable, counted separately, not negative debt.
    const totalOwed = round2(budgetAccounts.filter((a: any) => a.isLiability && a.balance > 0)
      .reduce((s: number, a: any) => s + a.balance, 0));
    const owedToMe = round2(budgetAccounts.reduce((s: number, a: any) => s + a.owedToMe, 0));
    const overdueDebt = round2(budgetAccounts.filter((a: any) => a.overdue)
      .reduce((s: number, a: any) => s + a.balance, 0));

    // Recurring charges live in their own list — a definition, not a transaction.
    const recurring = (Array.isArray(state.recurring) ? state.recurring : [])
      .filter((r: any) => r && typeof r === 'object')
      .map((r: any) => ({
        id: String(r.id), name: String(r.name), amount: round2(r.amount),
        dayOfMonth: r.dayOfMonth == null ? null : Number(r.dayOfMonth),
        accountId: r.accountId ? String(r.accountId) : null,
        categoryId: r.categoryId ? String(r.categoryId) : null,
        frequency: r.frequency ? String(r.frequency) : 'monthly',
        // Missing flag = active: never silently drop a charge he still pays.
        active: r.active === undefined ? true : !!r.active,
        notes: r.notes ? String(r.notes) : null,
      }));
    const monthlyRecurring = round2(recurring.filter((r: any) => r.active)
      .reduce((s: number, r: any) => s + r.amount, 0));

    // Month-to-date
    const { rows: mtd } = await tx.query(`
      SELECT
        (SELECT COALESCE(SUM(cost),0) FROM challenges
          WHERE user_id=$1 AND start_date >= to_char(date_trunc('month', NOW()), 'YYYY-MM-DD')) spent,
        (SELECT COALESCE(SUM(amount),0) FROM payouts
          WHERE user_id=$1 AND date >= to_char(date_trunc('month', NOW()), 'YYYY-MM-DD')) paid`,
      [userId]);

    const { rows: la } = await tx.query(`
      SELECT id, action, summary, created_at, undone_at FROM action_log
       WHERE user_id=$1 ORDER BY created_at DESC LIMIT 3`, [userId]);

    return {
      accounts,
      // Pace, not just balance. Every average ships with its own sample size —
      // see the CAUTION above.
      velocity: {
        evalFailures: {
          n: Number(v.eval_fail_n ?? 0),
          avgDays: num(v.eval_fail_avg_days),
          medianDays: num(v.eval_fail_median_days),
          fastestDays: num(v.eval_fail_fastest),
        },
        fundedFailures: {
          n: Number(v.funded_fail_n ?? 0),
          avgDays: num(v.funded_fail_avg_days),
        },
        evalPasses: {
          n: Number(v.pass_n ?? 0),
          avgDays: num(v.pass_avg_days),
          fastestDays: num(v.pass_fastest_days),
        },
        /** Oldest / newest currently-open account, in days survived so far. */
        oldestOpenDays,
        newestOpenDays,
      },
      budget: {
        cashOnHand, totalOwed, owedToMe, overdueDebt, monthlyRecurring,
        // A receivable ADDS to net worth; it is not negative debt.
        net: round2(cashOnHand + owedToMe - totalOwed),
        accounts: budgetAccounts, recurring,
      },
      totals: {
        activeEvals: accounts.filter(a => a.stage === 'eval_active').length,
        fundedAccounts: accounts.filter(a => a.stage === 'funded_active').length,
        liveAccounts: accounts.filter(a => a.stage === 'live_active').length,
        spentThisMonth: round2(mtd[0]?.spent), payoutsThisMonth: round2(mtd[0]?.paid),
      },
      lastActions: la.map((r: any) => ({
        id: r.id, action: r.action, summary: r.summary,
        createdAt: new Date(r.created_at).toISOString(), undone: !!r.undone_at,
      })),
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-account payout summary (Accounts tab cards)
// ─────────────────────────────────────────────────────────────────────────────

export interface AccountPayoutSummary {
  payoutTarget: number | null;
  payoutInterval: 'daily' | 'green_days' | 'consistency' | null;
  payoutBuffer: number | null;
  payoutMin: number | null;
  profitSplitPct: number | null;
  consistencyPct: number | null;
  winningDaysReq: number | null;
  winningDayMin: number | null;
  /** Trade-derived progress toward the payout. */
  totalProfit: number;
  winningDays: number;
  bestDay: number | null;
}

/**
 * Resolve the payout journey for every active account, in ONE query.
 *
 * The Accounts tab cards are fed by `GET db-accounts` (raw trading_accounts
 * rows), which carries no plan rules and no trade aggregates. This gives them
 * what they need to render "3/5 green days · $1,200 / $4,000 toward payout"
 * without pulling the whole of getFullState on every page load.
 *
 * Rule matching mirrors getFullState exactly: the most specific row wins —
 * stage-specific beats size-specific beats generic — resolved field by field,
 * never erasing a field a more general row alone knows.
 */
export async function getPayoutSummaryByAccount(
  userId: string,
): Promise<Record<string, AccountPayoutSummary>> {
  return withTransaction(async (tx) => {
    const { rows } = await tx.query(`
      WITH acct AS (
        SELECT ta.id, ta.user_id, ta.firm, ta.eval_type, ta.account_size,
               CASE WHEN lower(COALESCE(ta.phase,'')) = 'funded'
                    THEN 'funded' ELSE 'eval' END AS rule_stage
          FROM trading_accounts ta
         WHERE ta.user_id = $1 AND ta.status = 'active'
      )
      SELECT a.id,
             r.payout_target, r.payout_interval, r.payout_buffer,
             r.winning_days_req, r.winning_day_min,
             r.payout_min, r.profit_split_pct, r.consistency_pct,
             COALESCE(t.total_profit, 0) AS total_profit,
             COALESCE(t.winning_days, 0) AS winning_days,
             t.best_day
        FROM acct a
        LEFT JOIN LATERAL (
          SELECT
            (array_agg(pr.payout_target    ORDER BY ord DESC) FILTER (WHERE pr.payout_target    IS NOT NULL))[1] AS payout_target,
            (array_agg(pr.payout_interval  ORDER BY ord DESC) FILTER (WHERE pr.payout_interval  IS NOT NULL))[1] AS payout_interval,
            (array_agg(pr.payout_buffer    ORDER BY ord DESC) FILTER (WHERE pr.payout_buffer    IS NOT NULL))[1] AS payout_buffer,
            (array_agg(pr.winning_days_req ORDER BY ord DESC) FILTER (WHERE pr.winning_days_req IS NOT NULL))[1] AS winning_days_req,
            (array_agg(pr.winning_day_min  ORDER BY ord DESC) FILTER (WHERE pr.winning_day_min  IS NOT NULL))[1] AS winning_day_min,
            (array_agg(pr.payout_min       ORDER BY ord DESC) FILTER (WHERE pr.payout_min       IS NOT NULL))[1] AS payout_min,
            (array_agg(pr.profit_split_pct ORDER BY ord DESC) FILTER (WHERE pr.profit_split_pct IS NOT NULL))[1] AS profit_split_pct,
            (array_agg(pr.consistency_pct  ORDER BY ord DESC) FILTER (WHERE pr.consistency_pct  IS NOT NULL))[1] AS consistency_pct
          FROM (
            SELECT p.*,
                   (CASE WHEN p.stage <> 'any' THEN 2 ELSE 0 END
                  + CASE WHEN p.account_size IS NOT NULL THEN 1 ELSE 0 END) AS ord
              FROM plan_rules p
             WHERE p.user_id = a.user_id
               AND lower(p.firm_name) = lower(a.firm)
               AND lower(p.eval_type) = lower(COALESCE(a.eval_type,''))
               AND (p.account_size IS NULL OR p.account_size = a.account_size)
               AND p.stage IN ('any', a.rule_stage)
          ) pr
        ) r ON TRUE
        LEFT JOIN LATERAL (
          SELECT SUM(d.pnl) AS total_profit,
                 COUNT(*) FILTER (WHERE d.pnl > 0)::int AS positive_days,
                 -- A "green day" is only green if it CLEARS the plan's minimum.
                 -- Counting pnl > 0 would credit a $29 day against Lucid Flex's
                 -- $100 bar and overstate how close Daniel is to a payout.
                 -- `r` precedes this lateral, so the threshold is in scope;
                 -- when the plan hasn't told us one, fall back to > 0.
                 COUNT(*) FILTER (WHERE d.pnl > COALESCE(r.winning_day_min, 0))::int AS winning_days,
                 MAX(d.pnl) AS best_day
            FROM (
              SELECT trade_date::date AS dt, SUM(amount)::numeric AS pnl
                FROM trades WHERE user_id = $1 AND account_id = a.id
               GROUP BY 1
            ) d
        ) t ON TRUE`, [userId]);

    const num = (v: any) => (v == null ? null : Number(v));
    const out: Record<string, AccountPayoutSummary> = {};
    for (const r of rows) {
      out[String(r.id)] = {
        payoutTarget: num(r.payout_target),
        payoutInterval: (r.payout_interval ?? null) as AccountPayoutSummary['payoutInterval'],
        payoutBuffer: num(r.payout_buffer),
        payoutMin: num(r.payout_min),
        profitSplitPct: num(r.profit_split_pct),
        consistencyPct: num(r.consistency_pct),
        winningDaysReq: num(r.winning_days_req),
        winningDayMin: num(r.winning_day_min),
        totalProfit: round2(r.total_profit ?? 0),
        winningDays: Number(r.winning_days ?? 0),
        bestDay: num(r.best_day),
      };
    }
    return out;
  });
}
