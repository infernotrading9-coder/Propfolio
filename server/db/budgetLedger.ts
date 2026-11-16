/**
 * THE BUDGET LEDGER — the one place money moves in `budget_state`.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `budget_state` is ONE JSONB row per user, so every write is a read-modify-write
 * of a document that 20+ call sites touch. Cash-in and cash-out maths had been
 * implemented twice (the eval cascade had `applyBudgetTransaction`, the payout
 * flow had `applyIncome`) and the balance rules are subtle enough to get wrong in
 * silence:
 *
 *   - `loanKind` credit | debt | borrow means the stored `balance` is what is OWED,
 *     so a CHARGE increases it and INCOME pays it down.
 *   - cash / bank accounts move the other way.
 *
 * Two copies of that = one of them eventually drifts (Oct 2026: the personal-trade
 * stats were duplicated and silently disagreed). So the maths lives here ONCE, and
 * the reversal path is written as the exact inverse of the apply path by sharing
 * the same delta helper — a reversal that is hand-written separately is the classic
 * way to double-count money.
 *
 * Instant accounts (Vest etc.) now book through here too, which is the point:
 * buying an instant account is a real expense out of a real account, exactly like
 * buying an eval.
 */
import { randomUUID } from 'crypto';
import type { TxClient } from './txConnection';

const round2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Local "today" in ET, matching how the budget dates its own entries. */
function todayET(): string {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return `${et.getFullYear()}-${String(et.getMonth() + 1).padStart(2, '0')}-${String(et.getDate()).padStart(2, '0')}`;
}

export interface LedgerEntry {
  name: string;
  amount: number;
  /** Which budget account the money moved through. null = book it but move no balance. */
  accountId: string | null;
  date?: string;
  type?: 'expense' | 'income';
  categoryId?: string;
  /** Marks the row as dashboard-bound: it survives a budget reset and cannot be
   *  deleted from the budget UI. Every eval purchase sets it; so do instant purchases. */
  isPropFirm?: boolean;
}

interface BudgetState { transactions?: any[]; accounts?: any[]; [k: string]: any }

const isLiability = (a: any) => ['credit', 'debt', 'borrow'].includes(String(a?.loanKind || ''));

/**
 * Move one account's balance for one entry. THE single definition of the sign
 * rules, used by both apply and reverse so they cannot disagree.
 */
function moveBalance(state: BudgetState, accountId: string | null, type: 'expense' | 'income', amount: number): void {
  if (!accountId) return;
  const acct = (state.accounts || []).find((a: any) => a?.id === accountId);
  if (!acct) return;
  const delta = type === 'income' ? -amount : amount;
  acct.balance = round2(Number(acct.balance) + (isLiability(acct) ? delta : -delta));
}

async function readState(tx: TxClient, userId: string, strict: boolean): Promise<BudgetState | null> {
  const { rows } = await tx.query(
    `SELECT state FROM budget_state WHERE user_id = $1 LIMIT 1 FOR UPDATE`, [userId]);
  if (!rows.length) {
    if (strict) throw new Error('No budget state');
    return null;
  }
  const state = typeof rows[0].state === 'string' ? JSON.parse(rows[0].state) : rows[0].state;
  if (!state || typeof state !== 'object') {
    if (strict) throw new Error('No budget state');
    return null;
  }
  return state as BudgetState;
}

async function writeState(tx: TxClient, userId: string, state: BudgetState): Promise<void> {
  await tx.query(
    `UPDATE budget_state SET state = $2::jsonb, updated_at = NOW() WHERE user_id = $1`,
    [userId, JSON.stringify(state)]);
}

/**
 * Append a transaction and move the paying account's balance.
 * Returns the new transaction's id, or null when nothing was written.
 *
 * `strict` keeps the payout flow's older behaviour of THROWING when the target
 * account is unknown (it must not silently swallow a payout); the eval cascade
 * returns quietly instead. Both share the balance maths above.
 */
export async function applyBudgetTransaction(
  tx: TxClient, userId: string, t: LedgerEntry, opts: { strict?: boolean } = {},
): Promise<string | null> {
  const round2Amount = round2(t.amount);
  if (!(round2Amount > 0)) return null;

  const strict = opts.strict === true;
  const state = await readState(tx, userId, strict);
  if (!state) return null;

  if (strict && t.accountId) {
    const exists = (state.accounts || []).some((a: any) => a?.id === t.accountId);
    if (!exists) throw new Error(`No budget account "${t.accountId}"`);
  }

  const type = t.type ?? 'expense';
  const id = randomUUID().slice(0, 8);
  state.transactions = Array.isArray(state.transactions) ? state.transactions : [];
  state.transactions.push({
    id,
    name: t.name,
    amount: round2Amount,
    type,
    date: t.date || todayET(),
    accountId: t.accountId,
    categoryId: t.categoryId || (t.isPropFirm ? 'cat_propfirm' : 'cat_other'),
    excluded: false,
    ...(t.isPropFirm ? { isPropFirm: true } : {}),
  });

  moveBalance(state, t.accountId, type, round2Amount);
  await writeState(tx, userId, state);
  return id;
}

/**
 * Drop transactions matching `match`, undoing the balance each one moved.
 * This is what makes an EDIT or a DELETE safe: an expense whose row is gone but
 * whose money is still missing from the balance is a silent lie.
 */
export async function removeBudgetTransactions(
  tx: TxClient, userId: string, match: (t: any) => boolean,
): Promise<number> {
  const state = await readState(tx, userId, false);
  if (!state) return 0;

  const all = Array.isArray(state.transactions) ? state.transactions : [];
  const doomed = all.filter(match);
  if (!doomed.length) return 0;

  for (const t of doomed) {
    const amount = round2(Number(t.amount) || 0);
    const type = t.type === 'income' ? 'income' : 'expense';
    // Exact inverse of the apply path — same helper, opposite direction.
    moveBalance(state, t.accountId ?? null, type === 'income' ? 'expense' : 'income', amount);
  }
  state.transactions = all.filter((t) => !match(t));
  await writeState(tx, userId, state);
  return doomed.length;
}

/** Convenience for the common case: the ledger row we stored on a card. */
export async function removeBudgetTransactionById(
  tx: TxClient, userId: string, txnId: string | null | undefined,
): Promise<number> {
  if (!txnId) return 0;
  return removeBudgetTransactions(tx, userId, (t) => t?.id === txnId);
}

/**
 * Replace one transaction: reverse the old effect, then apply the new one.
 * Used when a card's price or date is edited — the alternative (patching the
 * amount in place) has to re-derive the balance delta and gets the liability sign
 * wrong sooner or later.
 */
export async function replaceBudgetTransaction(
  tx: TxClient, userId: string, oldTxnId: string | null | undefined, next: LedgerEntry,
  opts: { strict?: boolean } = {},
): Promise<string | null> {
  await removeBudgetTransactionById(tx, userId, oldTxnId);
  return applyBudgetTransaction(tx, userId, next, opts);
}
