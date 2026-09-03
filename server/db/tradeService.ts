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

export type DrawdownStyle = 'eod' | 'intraday_trailing';

/**
 * Which eval plans trail intraday. Keyed by eval_type (the product variant),
 * because the same firm sells both kinds — MFF sells Builder (EOD) AND Rapid
 * (intraday). Firm name alone is not enough to decide.
 */
const INTRADAY_TRAILING_PLANS = new Set([
  'rapid',   // My Funded Futures Rapid
  'zero',    // Alpha Futures Zero
]);

export function drawdownStyleFor(evalType?: string | null): DrawdownStyle {
  const key = String(evalType || '').trim().toLowerCase();
  return INTRADAY_TRAILING_PLANS.has(key) ? 'intraday_trailing' : 'eod';
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

    const style = drawdownStyleFor(acct.eval_type || acct.ch_eval_type);

    let consequence: TradeVerdict['consequence'] = 'none';
    let message = `Balance $${balanceAfter.toLocaleString()}. Room to stop-out: $${dd.room.toFixed(2)}.`;

    if (dd.breached) {
      // A max-DD breach is always terminal, on every plan.
      if (dd.binding === 'max' || style === 'intraday_trailing') {
        consequence = 'account_lost';
        message = style === 'intraday_trailing'
          ? `ACCOUNT LOST. ${acct.display_label} is an intraday-trailing plan (${acct.eval_type}) — ` +
            `touching the floor at $${dd.stopOutLevel.toLocaleString()} kills it. Not a lockout.`
          : `ACCOUNT LOST. Max drawdown breached at $${dd.stopOutLevel.toLocaleString()}.`;
      } else {
        consequence = 'session_lockout';
        message = `SESSION LOCKOUT. Daily loss limit hit at $${dd.stopOutLevel.toLocaleString()}. ` +
          `${acct.display_label} is an EOD plan — the account survives; you're done for today.`;
      }
    }

    // Auto-fail the account when the breach is terminal, so no surface lags.
    if (consequence === 'account_lost') {
      const was = String(acct.lifecycle || 'eval_active');
      const lifecycle = was === 'live_active' ? 'live_failed'
        : was === 'funded_active' ? 'funded_failed' : 'eval_failed';
      const outcome = lifecycle === 'eval_failed' ? 'failed_pre_phase' : 'failed_after_funded';

      await tx.query(
        `UPDATE trading_accounts SET status='lost', updated_at=NOW() WHERE id=$1`, [acct.id]);
      if (acct.challenge_id) {
        await tx.query(`
          UPDATE challenges
             SET status='failed', lifecycle=$2, outcome_type=$3,
                 failure_reason=$4, failure_date=$5, updated_at=NOW()
           WHERE id=$1`,
          [acct.challenge_id, lifecycle, outcome,
           dd.binding === 'max' ? 'max_drawdown' : 'daily_loss', tradeDate]);
        await tx.query(
          `UPDATE calendar_accounts SET is_active=false WHERE challenge_id=$1`, [acct.challenge_id]);
      }
      warnings.push(`${acct.display_label} has been marked LOST across all surfaces.`);
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
