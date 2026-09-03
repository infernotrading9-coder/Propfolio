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
        // Restore the balance and either delete the row or un-net the amount.
        await tx.query(
          `UPDATE trading_accounts SET balance=$2, high_water_mark=$3, updated_at=NOW() WHERE id=$1`,
          [d.accountId, String(d.balanceBefore), String(d.hwmBefore)]);
        if (d.netted) {
          await tx.query(`UPDATE trades SET amount=$2, result=$3 WHERE id=$1`,
            [d.tradeId, String(d.priorAmount), Number(d.priorAmount) >= 0 ? 'win' : 'loss']);
        } else {
          await tx.query(`DELETE FROM trades WHERE id=$1`, [d.tradeId]);
        }
        if (d.calendarEntryCreated && d.calendarEntryId) {
          await tx.query(`DELETE FROM calendar_entries WHERE id=$1`, [d.calendarEntryId]);
        }
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
  /** Plan facts, from the catalogue. Null when the plan is not yet known. */
  consistencyPct: number | null;
  profitSplitPct: number | null;
  payoutMin: number | null;
  /** Consistency maths Daniel currently does by hand. */
  bestDay: number | null;
  trueProfitTarget: number | null;
  consistencyOk: boolean | null;
  totalProfit: number;
  winningDays: number;
}

export interface FullState {
  accounts: AccountState[];
  budget: {
    cashOnHand: number;
    totalOwed: number;
    net: number;
    accounts: Array<{ id: string; name: string; balance: number; isLiability: boolean }>;
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
    const { rows: accts } = await tx.query(`
      SELECT ta.*, ch.lifecycle, ch.payout_count, ch.id AS challenge_id,
             pr.consistency_pct, pr.profit_split_pct, pr.payout_min,
             pr.daily_loss_limit AS plan_dll, pr.has_daily_loss
        FROM trading_accounts ta
        LEFT JOIN challenges ch ON ch.account_id = ta.id
        LEFT JOIN plan_rules pr
               ON pr.user_id = ta.user_id
              AND lower(pr.firm_name) = lower(ta.firm)
              AND lower(pr.eval_type) = lower(COALESCE(ta.eval_type,''))
              AND (pr.account_size IS NULL OR pr.account_size = ta.account_size)
       WHERE ta.user_id = $1 AND ta.status = 'active'
       ORDER BY ta.display_label`, [userId]);

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
      const winningDays = days.filter((r: any) => Number(r.pnl) > 0).length;

      const consistency = a.consistency_pct == null ? null : Number(a.consistency_pct);
      // The real bar: no single day may exceed consistencyPct of total profit.
      const trueTarget = consistency && bestDay
        ? round2(bestDay / (consistency / 100)) : null;
      const consistencyOk = consistency && bestDay && totalProfit > 0
        ? (bestDay / totalProfit) * 100 <= consistency : null;

      accounts.push({
        label: String(a.display_label ?? a.account_number_last4 ?? ''),
        last4: a.account_number_last4, firm: String(a.firm),
        plan: a.eval_type, stage: String(a.lifecycle || 'eval_active'),
        accountSize: Number(a.account_size), balance: Number(a.balance),
        dayPnL: round2(dd.dayPnL), stopOutLevel: round2(dd.stopOutLevel),
        roomToStopOut: round2(dd.room), bindingRule: dd.binding,
        dailyLossLimit: Number(a.daily_drawdown) > 0 ? Number(a.daily_drawdown) : null,
        maxDrawdown: Number(a.max_drawdown),
        rules: Array.isArray(a.rules) ? a.rules : [],
        payoutCount: Number(a.payout_count ?? 0),
        consistencyPct: consistency,
        profitSplitPct: a.profit_split_pct == null ? null : Number(a.profit_split_pct),
        payoutMin: a.payout_min == null ? null : Number(a.payout_min),
        bestDay, trueProfitTarget: trueTarget, consistencyOk,
        totalProfit, winningDays,
      });
    }

    // Budget
    const { rows: bs } = await tx.query(
      `SELECT state FROM budget_state WHERE user_id=$1`, [userId]);
    const state = bs.length
      ? (typeof bs[0].state === 'string' ? JSON.parse(bs[0].state) : bs[0].state) : { accounts: [] };
    const budgetAccounts = (state.accounts || []).map((a: any) => ({
      id: String(a.id), name: String(a.name), balance: round2(a.balance),
      isLiability: ['credit', 'debt', 'borrow'].includes(String(a.loanKind || '')),
    }));
    const cashOnHand = round2(budgetAccounts.filter((a: any) => !a.isLiability)
      .reduce((s: number, a: any) => s + a.balance, 0));
    const totalOwed = round2(budgetAccounts.filter((a: any) => a.isLiability)
      .reduce((s: number, a: any) => s + a.balance, 0));

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
      budget: { cashOnHand, totalOwed, net: round2(cashOnHand - totalOwed), accounts: budgetAccounts },
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
