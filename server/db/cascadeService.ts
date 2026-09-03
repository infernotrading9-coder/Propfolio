/**
 * cascadeService — the ONE place any prop-firm life event is recorded.
 * ====================================================================
 *
 * Daniel says one thing; every linked surface updates atomically. Before this
 * module, "pass an eval" meant hand-writing rows into `challenges`,
 * `trading_accounts`, `calendar_accounts` and `budget_state` from ad-hoc
 * scripts, in whatever order the author remembered. That is why the Dashboard
 * and the Accounts tab disagreed, and why funded accounts had no challenge row.
 *
 * THE MODEL
 * ---------
 *   trading_accounts  one card per real account (eval, funded, or live)
 *   challenges        the lifecycle record for that card, linked 1:1 via account_id
 *
 * They are joined by a real FK with a UNIQUE index, so the two can no longer
 * drift apart. Every surface reads the same joined row.
 *
 * THE THREE STAGES (do not conflate — this was a real bug)
 * -------------------------------------------------------
 *   eval    bought a challenge, trying to pass it
 *   funded  passed the eval. A pass ALWAYS lands here.
 *   live    firm moved you to real capital. Requires >= MIN_PAYOUTS_FOR_LIVE
 *           payouts AND an explicit decision — never automatic.
 *
 * Postgres CHECK constraints enforce the live rule, so no bug in this file (or
 * any CLI script) can promote an account that has not earned it.
 *
 * ATOMICITY
 * ---------
 * Every exported cascade runs inside ONE transaction via withTransaction().
 * A failure part-way rolls back everything — no half-updated surfaces.
 */

import { randomUUID } from 'crypto';
import { withTransaction, type TxClient } from './txConnection';
import { sessionStart } from './drawdownModel';
import { logAction } from './actionLog';

// ─────────────────────────────────────────────────────────────────────────────
// Constants & small helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Payouts required on a funded account before it may be promoted to live. */
export const MIN_PAYOUTS_FOR_LIVE = 5;

export type Lifecycle =
  | 'eval_active' | 'eval_passed' | 'eval_failed'
  | 'funded_active' | 'funded_failed'
  | 'live_active' | 'live_failed';

const round2 = (n: unknown): number => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Today's date as a local `YYYY-MM-DD` in America/New_York.
 * NEVER use `new Date().toISOString().slice(0,10)` — it rolls to tomorrow after
 * ~7pm ET and silently files trades on the wrong calendar day.
 */
export function todayET(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

/** Render a JS array as a Postgres text[] literal. `rules` is text[], not JSONB. */
function toPgTextArray(values?: string[] | null): string {
  const list = Array.isArray(values) ? values.filter(v => v != null) : [];
  if (list.length === 0) return '{}';
  return `{${list.map(v => `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')}}`;
}

export class CascadeError extends Error {
  constructor(message: string, readonly code: string = 'cascade_error') {
    super(message);
    this.name = 'CascadeError';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal primitives (all take an open transaction)
// ─────────────────────────────────────────────────────────────────────────────

async function findOrCreateFirm(
  tx: TxClient, userId: string, name: string, firmType = 'futures',
): Promise<{ id: string; name: string }> {
  const found = await tx.query(
    `SELECT id, name FROM firms WHERE user_id = $1 AND lower(name) = lower($2) LIMIT 1`,
    [userId, name]);
  if (found.rows.length) return { id: String(found.rows[0].id), name: String(found.rows[0].name) };

  const id = randomUUID();
  await tx.query(
    `INSERT INTO firms (id, user_id, name, firm_type, created_at) VALUES ($1,$2,$3,$4,NOW())`,
    [id, userId, name, firmType]);
  return { id, name };
}

/**
 * Allocate a unique display_label for an account.
 *
 * Daniel legitimately holds several accounts sharing a last4 (two Lucid Daily
 * "0001"s with different daily-loss rules). A bare last4 lookup used to pick
 * the OLDEST silently, logging trades against the wrong account. Duplicates now
 * get an -A / -B suffix, unique among ACTIVE accounts, and the bot must name
 * the suffix when ambiguous.
 */
async function allocateLabel(tx: TxClient, userId: string, last4: string): Promise<string> {
  const { rows } = await tx.query(
    `SELECT display_label FROM trading_accounts
      WHERE user_id = $1 AND account_number_last4 = $2 AND status = 'active'`,
    [userId, last4]);
  if (rows.length === 0) return last4;

  // A plain "0001" already exists — rename it to 0001-A, then hand back the next letter.
  const plain = rows.find(r => r.display_label === last4);
  if (plain) {
    await tx.query(
      `UPDATE trading_accounts SET display_label = $3, name = $4, updated_at = NOW()
        WHERE user_id = $1 AND display_label = $2 AND status = 'active'`,
      [userId, last4, `${last4}-A`, `Acct ${last4}-A`]);
  }
  const used = new Set(rows.map(r => String(r.display_label)));
  if (plain) used.add(`${last4}-A`);
  for (let i = 0; i < 26; i++) {
    const cand = `${last4}-${String.fromCharCode(65 + i)}`;
    if (!used.has(cand)) return cand;
  }
  throw new CascadeError(`Cannot allocate a label for ${last4}`, 'label_exhausted');
}

/**
 * Resolve an account by what Daniel actually says ("0857", "0001-B").
 * Refuses to guess when a bare last4 matches more than one active account.
 */
async function resolveAccount(tx: TxClient, userId: string, ref: string) {
  const key = String(ref || '').trim();
  if (!key) throw new CascadeError('No account reference given', 'no_ref');

  // Accept whatever Daniel actually types:
  //   nickname        "LUCD"
  //   FIRST-LAST      "APEX-0001"   <- unambiguous, preferred
  //   bare first4     "APEX"
  //   bare last4      "0001"        <- may be ambiguous; we error rather than guess
  //   display label   "0001-B"
  // Account numbers are not always numeric, so first4 is text and matched
  // case-insensitively.
  const parts = key.includes('-') ? key.split('-') : null;
  const pairFirst = parts && parts.length === 2 ? parts[0] : null;
  const pairLast = parts && parts.length === 2 ? parts[1] : null;

  const { rows } = await tx.query(
    `SELECT ta.*, ch.id AS challenge_id, ch.lifecycle, ch.payout_count, ch.eval_type AS ch_eval_type
       FROM trading_accounts ta
       LEFT JOIN challenges ch ON ch.account_id = ta.id
      WHERE ta.user_id = $1
        AND ( lower(ta.nickname) = lower($2)
              OR ta.display_label = $2
              OR ta.account_number_last4 = $2
              OR upper(ta.account_first4) = upper($2)
              OR ($3::text IS NOT NULL
                  AND upper(ta.account_first4) = upper($3)
                  AND ta.account_number_last4 = $4) )
        AND ta.status = 'active'`,
    [userId, key, pairFirst, pairLast]);

  if (rows.length === 0) {
    throw new CascadeError(`No active account matching "${key}"`, 'not_found');
  }
  if (rows.length > 1) {
    const opts = rows.map(r => r.display_label).join(', ');
    throw new CascadeError(
      `"${key}" matches ${rows.length} active accounts (${opts}). Say which one.`,
      'ambiguous');
  }
  return rows[0];
}

/** Create the account card. Shared by buyEval and passEval. */
async function insertAccountCard(tx: TxClient, userId: string, o: {
  label: string; last4: string | null; firmName: string; accountSize: number;
  maxDrawdown?: number; dailyDrawdown?: number; riskPerTrade?: number;
  rules?: string[]; phase: 'challenge' | 'funded' | 'live';
  evalType?: string | null; firmType?: string | null; floorLockLevel?: number;
}): Promise<string> {
  const size = Math.max(0, Math.round(Number(o.accountSize) || 0));
  const id = randomUUID();
  const { rows } = await tx.query(
    `SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM trading_accounts WHERE user_id = $1`, [userId]);

  await tx.query(`
    INSERT INTO trading_accounts (
      id, user_id, name, display_label, firm, account_number_last4, account_size, balance,
      drawdown_used, high_water_mark, max_drawdown, daily_drawdown, risk_per_trade, rules,
      status, phase, sort_order, day_start_balance, settled_high_water_mark, last_settled_at,
      floor_lock_level, eval_type, firm_type, created_at, updated_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$7,
      '0',$7,$8,$9,$10,$11::text[],
      'active',$12,$13,$7,$7,$14,
      $15,$16,$17,NOW(),NOW()
    )`, [
    id, userId, `Acct ${o.label}`, o.label, o.firmName, o.last4, String(size),
    String(o.maxDrawdown ?? 0), String(o.dailyDrawdown ?? 0), String(o.riskPerTrade ?? 0),
    toPgTextArray(o.rules), o.phase, rows[0]?.n ?? 1, sessionStart(),
    String(o.floorLockLevel ?? size + 100), o.evalType ?? null, o.firmType ?? 'futures',
  ]);
  return id;
}

/** Create the challenge row linked 1:1 to an account card. */
async function insertChallenge(tx: TxClient, userId: string, o: {
  accountId: string; firmId: string; label: string; accountSize: number;
  cost: number; startDate: string; evalType?: string | null; firmType?: string | null;
  totalPhases?: number; lifecycle: Lifecycle; status: string;
  phase1Completed?: boolean; highestMilestone: string; outcomeType: string;
  sourceChallengeId?: string | null; brokerName?: string;
}): Promise<string> {
  const id = randomUUID();
  await tx.query(`
    INSERT INTO challenges (
      id, user_id, firm_id, account_id, broker_name, account_size, start_date,
      cost, initial_cost, total_phases, phase1_completed, phase1_completed_at,
      has_activation_fee, strategy, firm_type, eval_type, status, lifecycle,
      live_account, payout_count, account_last4, highest_milestone, outcome_type,
      source_challenge_id, created_at, updated_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,
      $8,$8,$9,$10,$11,
      false,'',$12,$13,$14,$15,
      false,0,$16,$17,$18,
      $19,NOW(),NOW()
    )`, [
    id, userId, o.firmId, o.accountId, o.brokerName || 'Trading Account',
    Math.round(Number(o.accountSize) || 0), o.startDate,
    String(round2(o.cost)), o.totalPhases ?? 1,
    !!o.phase1Completed, o.phase1Completed ? new Date() : null,
    o.firmType ?? 'futures', o.evalType ?? null, o.status, o.lifecycle,
    o.label, o.highestMilestone, o.outcomeType, o.sourceChallengeId ?? null,
  ]);
  return id;
}

/** Give an account its Rule Calendar row. Idempotent. */
async function insertCalendarAccount(
  tx: TxClient, userId: string, name: string, challengeId: string,
): Promise<string> {
  const existing = await tx.query(
    `SELECT id FROM calendar_accounts WHERE user_id=$1 AND challenge_id=$2 LIMIT 1`,
    [userId, challengeId]);
  if (existing.rows.length) return String(existing.rows[0].id);

  const id = randomUUID();
  await tx.query(
    `INSERT INTO calendar_accounts (id,user_id,name,challenge_id,is_active,created_at)
     VALUES ($1,$2,$3,$4,true,NOW())`, [id, userId, name, challengeId]);
  return id;
}

/**
 * Append a budget transaction and move the paying account's balance.
 *
 * budget_state is ONE JSONB row per user — always read-modify-write, never a
 * blind overwrite. Credit/debt accounts store the amount OWED, so a charge
 * INCREASES the balance; cash/bank accounts decrease.
 */
async function applyBudgetTransaction(tx: TxClient, userId: string, t: {
  name: string; amount: number; accountId: string; date?: string;
  type?: 'expense' | 'income'; categoryId?: string; isPropFirm?: boolean;
}): Promise<void> {
  const amount = round2(t.amount);
  if (amount <= 0) return;

  const { rows } = await tx.query(
    `SELECT state FROM budget_state WHERE user_id = $1 LIMIT 1 FOR UPDATE`, [userId]);
  if (!rows.length) return;

  const state = typeof rows[0].state === 'string' ? JSON.parse(rows[0].state) : rows[0].state;
  if (!state || typeof state !== 'object') return;

  const type = t.type ?? 'expense';
  state.transactions = Array.isArray(state.transactions) ? state.transactions : [];
  state.transactions.push({
    id: randomUUID().slice(0, 8),
    name: t.name,
    amount,
    type,
    date: t.date || todayET(),
    accountId: t.accountId,
    categoryId: t.categoryId || (t.isPropFirm ? 'cat_propfirm' : 'cat_other'),
    excluded: false,
    ...(t.isPropFirm ? { isPropFirm: true } : {}),
  });

  const accounts = Array.isArray(state.accounts) ? state.accounts : [];
  const target = accounts.find((a: any) => a && a.id === t.accountId);
  if (target) {
    const kind = String(target.loanKind || '');
    const isLiability = kind === 'credit' || kind === 'debt' || kind === 'borrow';
    const bal = Number(target.balance) || 0;
    const delta = type === 'income' ? -amount : amount;
    target.balance = round2(isLiability ? bal + delta : bal - delta);
  }
  state.accounts = accounts;

  await tx.query(
    `UPDATE budget_state SET state = $2::jsonb, updated_at = NOW() WHERE user_id = $1`,
    [userId, JSON.stringify(state)]);
}

// ─────────────────────────────────────────────────────────────────────────────
// THE CASCADES — one statement from Daniel, one call, every surface updated
// ─────────────────────────────────────────────────────────────────────────────

export interface BuyEvalInput {
  userId: string;
  firmName: string;
  accountSize: number;
  cost: number;
  accountLast4: string;
  evalType?: string;
  firmType?: 'futures' | 'cfd';
  maxDrawdown?: number;
  dailyDrawdown?: number;
  riskPerTrade?: number;
  rules?: string[];
  /** Which budget account paid. Omit only if the purchase truly had no cost. */
  budgetAccountId?: string;
  startDate?: string;
  totalPhases?: number;
}

export interface CascadeResult {
  challengeId: string;
  accountId: string;
  calendarAccountId: string;
  label: string;
  lifecycle: Lifecycle;
  warnings: string[];
}

/**
 * "I bought a Lucid Flex 50k for 90 on Destiny."
 * → challenge + account card + budget expense + rule-calendar row. Atomically.
 */
export async function buyEval(input: BuyEvalInput): Promise<CascadeResult> {
  const { userId } = input;
  if (!input.accountLast4) throw new CascadeError('accountLast4 is required', 'missing_last4');
  const cost = round2(input.cost);
  if (cost > 0 && !input.budgetAccountId) {
    throw new CascadeError('budgetAccountId is required when cost > 0 — which account paid?', 'no_funding_source');
  }

  return withTransaction(async (tx) => {
    const warnings: string[] = [];
    const startDate = input.startDate || todayET();
    const firm = await findOrCreateFirm(tx, userId, input.firmName, input.firmType);
    const label = await allocateLabel(tx, userId, input.accountLast4);
    if (label !== input.accountLast4) {
      warnings.push(`Another active account already uses ${input.accountLast4}; this one is "${label}".`);
    }
    if (!input.rules?.length) {
      warnings.push('No rules set on this account — the Rule Calendar has nothing to check.');
    }

    const accountId = await insertAccountCard(tx, userId, {
      label, last4: input.accountLast4, firmName: firm.name,
      accountSize: input.accountSize, maxDrawdown: input.maxDrawdown,
      dailyDrawdown: input.dailyDrawdown, riskPerTrade: input.riskPerTrade,
      rules: input.rules, phase: 'challenge', evalType: input.evalType,
      firmType: input.firmType,
    });

    const challengeId = await insertChallenge(tx, userId, {
      accountId, firmId: firm.id, label, accountSize: input.accountSize,
      cost, startDate, evalType: input.evalType, firmType: input.firmType,
      totalPhases: input.totalPhases ?? 1, lifecycle: 'eval_active', status: 'active',
      highestMilestone: 'purchased', outcomeType: 'active',
    });

    const calendarAccountId = await insertCalendarAccount(
      tx, userId, `Acct ${label} (${firm.name})`, challengeId);

    if (cost > 0) {
      await applyBudgetTransaction(tx, userId, {
        name: `Eval — ${firm.name} ${Math.round(input.accountSize / 1000)}K (${label})`,
        amount: cost, accountId: input.budgetAccountId!, date: startDate, isPropFirm: true,
      });
    }

    return { challengeId, accountId, calendarAccountId, label, lifecycle: 'eval_active', warnings };
  });
}

export interface PassEvalInput {
  userId: string;
  /** The eval being passed, e.g. "0045" or "0001-B". */
  accountRef: string;
  /** Last4 of the NEW funded account the firm issued. */
  fundedLast4: string;
  /** Funded accounts often carry different rules than the eval. */
  rules?: string[];
  maxDrawdown?: number;
  dailyDrawdown?: number;
  accountSize?: number;
  activationFee?: number;
  budgetAccountId?: string;
}

/**
 * "I passed 0045, funded account is 0016."
 *
 * → source eval marked passed, NEW funded account card + challenge + calendar
 *   row created and linked back to the eval. Atomically.
 *
 * The result is always FUNDED. Never live — that is a separate, later,
 * payout-gated promotion (see promoteToLive).
 */
export async function passEval(input: PassEvalInput): Promise<CascadeResult & { sourceChallengeId: string }> {
  const { userId } = input;
  if (!input.fundedLast4) throw new CascadeError('fundedLast4 is required', 'missing_last4');

  return withTransaction(async (tx) => {
    const warnings: string[] = [];
    const src = await resolveAccount(tx, userId, input.accountRef);

    if (!src.challenge_id) {
      throw new CascadeError(`Account ${src.display_label} has no challenge row`, 'no_challenge');
    }
    if (src.lifecycle !== 'eval_active') {
      throw new CascadeError(
        `${src.display_label} is "${src.lifecycle}", not an active eval — cannot pass it.`,
        'bad_lifecycle');
    }

    // 1. Retire the eval.
    await tx.query(`
      UPDATE challenges
         SET status='passed', lifecycle='eval_passed',
             phase1_completed=true, phase1_completed_at=COALESCE(phase1_completed_at, NOW()),
             highest_milestone='funded', outcome_type='funded_active', updated_at=NOW()
       WHERE id=$1`, [src.challenge_id]);
    await tx.query(
      `UPDATE trading_accounts SET status='passed', updated_at=NOW() WHERE id=$1`, [src.id]);
    await tx.query(
      `UPDATE calendar_accounts SET is_active=false WHERE challenge_id=$1`, [src.challenge_id]);

    // 2. Spawn the funded account.
    const firm = await findOrCreateFirm(tx, userId, String(src.firm), src.firm_type || 'futures');
    const label = await allocateLabel(tx, userId, input.fundedLast4);
    if (label !== input.fundedLast4) {
      warnings.push(`${input.fundedLast4} was taken; funded account is "${label}".`);
    }
    const size = input.accountSize ?? Number(src.account_size);
    const rules: string[] = input.rules ?? (Array.isArray(src.rules) ? src.rules : []);
    if (!input.rules) {
      warnings.push(`Copied the eval's rules to ${label}. Funded rules often differ — check them.`);
    }

    const accountId = await insertAccountCard(tx, userId, {
      label, last4: input.fundedLast4, firmName: firm.name, accountSize: size,
      maxDrawdown: input.maxDrawdown ?? Number(src.max_drawdown),
      dailyDrawdown: input.dailyDrawdown ?? Number(src.daily_drawdown),
      riskPerTrade: Number(src.risk_per_trade), rules,
      phase: 'funded', evalType: src.eval_type, firmType: src.firm_type,
    });

    const challengeId = await insertChallenge(tx, userId, {
      accountId, firmId: firm.id, label, accountSize: size,
      cost: round2(input.activationFee ?? 0), startDate: todayET(),
      evalType: src.eval_type, firmType: src.firm_type, totalPhases: 1,
      lifecycle: 'funded_active', status: 'passed', phase1Completed: true,
      highestMilestone: 'funded', outcomeType: 'funded_active',
      sourceChallengeId: String(src.challenge_id),
    });

    const calendarAccountId = await insertCalendarAccount(
      tx, userId, `Acct ${label} (${firm.name})`, challengeId);

    // 3. An activation fee is a real expense.
    const fee = round2(input.activationFee ?? 0);
    if (fee > 0) {
      if (!input.budgetAccountId) {
        throw new CascadeError('budgetAccountId required for an activation fee', 'no_funding_source');
      }
      await applyBudgetTransaction(tx, userId, {
        name: `Activation — ${firm.name} (${label})`,
        amount: fee, accountId: input.budgetAccountId, isPropFirm: true,
      });
    }

    warnings.push(`${label} is FUNDED, not live. Live needs ${MIN_PAYOUTS_FOR_LIVE}+ payouts and the firm's decision.`);

    // 4. Retire the EVAL's own account card.
    //
    // Passing spawns a new funded card, but the original eval card was left
    // 'active', so two active cards shared one label and the Dashboard counted
    // the pass twice (Daniel saw 3 funded accounts against 2 real ones). The
    // eval account ceases to exist at the firm once it converts, so retire it
    // in the same transaction that creates its successor.
    await tx.query(
      `UPDATE trading_accounts SET status='passed', updated_at=NOW() WHERE id=$1`,
      [src.id]);
    // Its rule calendar stops too — you can't trade the eval any more.
    await tx.query(
      `UPDATE calendar_accounts SET is_active=false WHERE challenge_id=$1`,
      [src.challenge_id]);

    return {
      challengeId, accountId, calendarAccountId, label,
      lifecycle: 'funded_active' as Lifecycle,
      sourceChallengeId: String(src.challenge_id), warnings,
    };
  });
}

/**
 * "The firm moved 0857 to a live account."
 *
 * The ONLY path from funded → live. Requires MIN_PAYOUTS_FOR_LIVE payouts
 * already recorded against the funded account. Postgres enforces this too, so
 * even a bug here cannot fabricate a live account.
 */
export async function promoteToLive(input: {
  userId: string; accountRef: string;
}): Promise<{ accountId: string; challengeId: string; label: string; payoutCount: number }> {
  return withTransaction(async (tx) => {
    const acct = await resolveAccount(tx, input.userId, input.accountRef);
    if (!acct.challenge_id) throw new CascadeError('No challenge row', 'no_challenge');

    if (acct.lifecycle !== 'funded_active') {
      throw new CascadeError(
        `${acct.display_label} is "${acct.lifecycle}". Only a funded_active account can go live.`,
        'bad_lifecycle');
    }

    // Recount from the payouts table rather than trusting the cached column.
    const { rows: pc } = await tx.query(
      `SELECT count(*)::int AS n FROM payouts WHERE challenge_id = $1`, [acct.challenge_id]);
    const payoutCount = pc[0]?.n ?? 0;

    if (payoutCount < MIN_PAYOUTS_FOR_LIVE) {
      throw new CascadeError(
        `${acct.display_label} has ${payoutCount} payout(s). Live requires at least ` +
        `${MIN_PAYOUTS_FOR_LIVE} — and even then the firm decides.`,
        'insufficient_payouts');
    }

    await tx.query(`
      UPDATE challenges
         SET payout_count=$2, lifecycle='live_active', live_account=true,
             went_live_at=NOW(), updated_at=NOW()
       WHERE id=$1`, [acct.challenge_id, payoutCount]);
    await tx.query(
      `UPDATE trading_accounts SET phase='live', updated_at=NOW() WHERE id=$1`, [acct.id]);

    return {
      accountId: String(acct.id), challengeId: String(acct.challenge_id),
      label: String(acct.display_label), payoutCount,
    };
  });
}

/**
 * "I failed 9056."
 * → challenge failed, card lost, calendar retired. Identical for evals, funded
 *   and live accounts — the old code only handled evals, which is why failing a
 *   funded account reported "Challenges failed: 0". Trades are kept as history.
 */
export async function failAccount(input: {
  userId: string; accountRef: string; failureReason?: string; failureDate?: string;
}): Promise<{ accountId: string; challengeId: string; label: string; lifecycle: Lifecycle }> {
  return withTransaction(async (tx) => {
    const acct = await resolveAccount(tx, input.userId, input.accountRef);
    if (!acct.challenge_id) throw new CascadeError('No challenge row', 'no_challenge');

    const was = acct.lifecycle as Lifecycle;
    const lifecycle: Lifecycle =
      was === 'live_active' ? 'live_failed'
      : was === 'funded_active' ? 'funded_failed'
      : 'eval_failed';

    // highest_milestone records the furthest point ever reached — never regress it.
    const outcome =
      lifecycle === 'live_failed' || lifecycle === 'funded_failed'
        ? 'failed_after_funded' : 'failed_pre_phase';
    const milestone = was.startsWith('funded') || was.startsWith('live') ? 'funded' : 'purchased';

    await tx.query(`
      UPDATE challenges
         SET status='failed', lifecycle=$2, outcome_type=$3,
             highest_milestone=COALESCE(NULLIF(highest_milestone,''), $4),
             failure_reason=$5, failure_date=$6, updated_at=NOW()
       WHERE id=$1`,
      [acct.challenge_id, lifecycle, outcome, milestone,
       input.failureReason || 'unknown', input.failureDate || todayET()]);

    await tx.query(
      `UPDATE trading_accounts SET status='lost', updated_at=NOW() WHERE id=$1`, [acct.id]);
    await tx.query(
      `UPDATE calendar_accounts SET is_active=false WHERE challenge_id=$1`, [acct.challenge_id]);

    // Failing is the one destructive call Daniel makes routinely, and the most
    // likely to be aimed at the wrong account. Make it reversible.
    await logAction(tx, input.userId, 'fail-account',
      `Marked ${acct.display_label} as failed (${input.failureReason || 'unknown'})`,
      {
        accountId: String(acct.id), challengeId: String(acct.challenge_id),
        priorStatus: acct.status ?? 'active', priorLifecycle: was,
        priorOutcome: acct.outcome_type ?? 'active',
        priorCardStatus: acct.card_status ?? 'active',
      });

    return {
      accountId: String(acct.id), challengeId: String(acct.challenge_id),
      label: String(acct.display_label), lifecycle,
    };
  });
}

/**
 * "I spent $X on <thing> from <account>."  Budget only — touches no trading surface.
 *
 * Handles the three money movements Daniel actually makes:
 *   expense   money out   (cash: balance down · credit: owed UP)
 *   income    money in    (cash: balance up   · credit: owed DOWN, i.e. a payment)
 *   transfer  account → account, both sides moved in one transaction
 *
 * The credit/debt sign flip is the trap here: a liability account stores the
 * amount OWED, so a charge INCREASES it. Subtracting unconditionally understated
 * debt by 2x the cost on every eval bought on a card.
 */
export async function logExpense(input: {
  userId: string; name: string; amount: number; budgetAccountId: string;
  date?: string; type?: 'expense' | 'income'; categoryId?: string;
}): Promise<{ ok: true }> {
  return withTransaction(async (tx) => {
    await applyBudgetTransaction(tx, input.userId, {
      name: input.name, amount: input.amount, accountId: input.budgetAccountId,
      date: input.date, type: input.type ?? 'expense', categoryId: input.categoryId,
    });
    return { ok: true as const };
  });
}

/** A budget account as the bot/UI needs to see it, to pick a valid funding source. */
export interface BudgetAccountSummary {
  id: string;
  name: string;
  balance: number;
  kind: 'cash' | 'credit' | 'debt' | 'borrow';
  isLiability: boolean;
}

/**
 * List the budget accounts. The bot must call this rather than guessing an id —
 * `budgetAccountId` is required on any purchase with a cost, and an invalid id
 * silently books the expense against nothing.
 */
export async function listBudgetAccounts(userId: string): Promise<BudgetAccountSummary[]> {
  return withTransaction(async (tx) => {
    const { rows } = await tx.query(
      `SELECT state FROM budget_state WHERE user_id = $1 LIMIT 1`, [userId]);
    if (!rows.length) return [];
    const state = typeof rows[0].state === 'string' ? JSON.parse(rows[0].state) : rows[0].state;
    return (state?.accounts ?? []).map((a: any) => {
      const kind = String(a.loanKind || 'cash') as BudgetAccountSummary['kind'];
      return {
        id: String(a.id),
        name: String(a.name),
        balance: round2(a.balance),
        kind,
        isLiability: kind === 'credit' || kind === 'debt' || kind === 'borrow',
      };
    });
  });
}

/**
 * Move money between two budget accounts (e.g. paying a credit card from Sofi).
 *
 * Written as ONE transaction touching both sides. Doing it as two separate
 * expense/income calls can leave money destroyed if the second call fails.
 */
export async function transferBetweenAccounts(input: {
  userId: string; fromAccountId: string; toAccountId: string;
  amount: number; name?: string; date?: string;
}): Promise<{ ok: true; from: number; to: number }> {
  const amount = round2(input.amount);
  if (amount <= 0) throw new CascadeError('Transfer amount must be positive', 'bad_amount');
  if (input.fromAccountId === input.toAccountId) {
    throw new CascadeError('Cannot transfer to the same account', 'same_account');
  }

  return withTransaction(async (tx) => {
    const { rows } = await tx.query(
      `SELECT state FROM budget_state WHERE user_id = $1 LIMIT 1 FOR UPDATE`, [input.userId]);
    if (!rows.length) throw new CascadeError('No budget state', 'no_budget');

    const state = typeof rows[0].state === 'string' ? JSON.parse(rows[0].state) : rows[0].state;
    const accounts = Array.isArray(state.accounts) ? state.accounts : [];

    const from = accounts.find((a: any) => a?.id === input.fromAccountId);
    const to = accounts.find((a: any) => a?.id === input.toAccountId);
    if (!from) throw new CascadeError(`No budget account "${input.fromAccountId}"`, 'not_found');
    if (!to) throw new CascadeError(`No budget account "${input.toAccountId}"`, 'not_found');

    const isLiab = (a: any) => ['credit', 'debt', 'borrow'].includes(String(a.loanKind || ''));

    // Money leaves `from`: a cash account drops; paying FROM a card adds to what's owed.
    from.balance = round2(Number(from.balance) + (isLiab(from) ? amount : -amount));
    // Money arrives at `to`: a cash account rises; paying a card REDUCES what's owed.
    to.balance = round2(Number(to.balance) + (isLiab(to) ? -amount : amount));

    state.transactions = Array.isArray(state.transactions) ? state.transactions : [];
    state.transactions.push({
      id: randomUUID().slice(0, 8),
      name: input.name || `Transfer — ${from.name} → ${to.name}`,
      amount,
      type: 'transfer',
      date: input.date || todayET(),
      accountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      excluded: false,
    });
    state.accounts = accounts;

    await tx.query(
      `UPDATE budget_state SET state = $2::jsonb, updated_at = NOW() WHERE user_id = $1`,
      [input.userId, JSON.stringify(state)]);

    return { ok: true as const, from: from.balance, to: to.balance };
  });
}
