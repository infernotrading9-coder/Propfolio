/**
 * reconcileBalances — "here's what my accounts actually say, sort it out."
 * =======================================================================
 *
 * Daniel's real workflow: he sometimes goes days without logging, or makes too
 * many small transactions to bother itemising. Rather than reconstruct every
 * coffee, he reads the real balances off his banking app and hands them over.
 *
 * This sets each account to the stated balance and writes a single balancing
 * `adjustment` transaction for the difference, so:
 *
 *   - the ledger still explains every dollar (no silent balance edits)
 *   - the nightly reconcile sees an explained delta, not mystery drift
 *   - "unlogged spending" becomes a visible, measurable number
 *
 * WHAT IT DOES NOT TOUCH — deliberately:
 *
 *   Eval purchases are NEVER folded into an adjustment. They are the entire
 *   point of the app: `challenges.cost` drives spend-per-eval, pass rate and
 *   profitability. An adjustment that quietly absorbed a $75 eval would make
 *   the business question — "am I making money or funding prop firms?" —
 *   unanswerable. Those still go through buyEval, always, with a real cost and
 *   a real funding source.
 *
 * So the split is:
 *   living noise (gas, food, the stuff he forgets)  -> adjustment, fine
 *   eval purchases, payouts, activation fees        -> explicit cascades only
 */
import { randomUUID } from 'crypto';
import { withTransaction, type TxClient } from './txConnection';
import { CascadeError, todayET } from './cascadeService';
import { logAction } from './actionLog';

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface BalanceUpdate {
  /** Account id, or its name — whichever Daniel said. */
  accountRef: string;
  /** What the bank/card app actually shows right now. */
  actualBalance: number;
}

export interface ReconcileResult {
  applied: Array<{
    account: string;
    was: number;
    now: number;
    delta: number;
    direction: 'spent' | 'received' | 'unchanged';
  }>;
  totalUnlogged: number;
  transactionsCreated: number;
  warnings: string[];
  since: string | null;
}

/**
 * Preview or apply a balance reconciliation.
 *
 * Two-phase like the payout flow: with `dryRun` it reports what would change
 * and writes nothing, so the bot can show Daniel the deltas before he commits.
 */
export async function reconcileBalances(input: {
  userId: string;
  balances: BalanceUpdate[];
  date?: string;
  note?: string;
  dryRun?: boolean;
}): Promise<ReconcileResult> {
  const { userId, balances } = input;
  if (!Array.isArray(balances) || balances.length === 0) {
    throw new CascadeError('No balances given', 'no_balances');
  }
  for (const b of balances) {
    if (typeof b.actualBalance !== 'number' || Number.isNaN(b.actualBalance)) {
      throw new CascadeError(`Balance for "${b.accountRef}" is not a number`, 'bad_amount');
    }
  }

  return withTransaction(async (tx: TxClient) => {
    const { rows } = await tx.query(
      `SELECT state FROM budget_state WHERE user_id = $1 LIMIT 1 FOR UPDATE`, [userId]);
    if (!rows.length) throw new CascadeError('No budget state', 'no_budget');

    const state = typeof rows[0].state === 'string' ? JSON.parse(rows[0].state) : rows[0].state;
    state.accounts = Array.isArray(state.accounts) ? state.accounts : [];
    state.transactions = Array.isArray(state.transactions) ? state.transactions : [];

    const date = input.date || todayET();
    const applied: ReconcileResult['applied'] = [];
    const warnings: string[] = [];
    const undo: Array<{ id: string; balance: number; txnId: string | null }> = [];
    let totalUnlogged = 0;
    let created = 0;

    for (const b of balances) {
      const key = String(b.accountRef).trim().toLowerCase();
      const matches = state.accounts.filter((a: any) =>
        String(a.id).toLowerCase() === key || String(a.name).trim().toLowerCase() === key);

      if (matches.length === 0) {
        warnings.push(`No budget account matching "${b.accountRef}" — skipped.`);
        continue;
      }
      if (matches.length > 1) {
        warnings.push(`"${b.accountRef}" matches ${matches.length} accounts — skipped, name it exactly.`);
        continue;
      }

      const acct = matches[0];
      const was = round2(Number(acct.balance) || 0);
      const now = round2(b.actualBalance);
      const delta = round2(now - was);

      if (Math.abs(delta) < 0.01) {
        applied.push({ account: acct.name, was, now, delta: 0, direction: 'unchanged' });
        continue;
      }

      // On a LIABILITY (card, loan, borrowed money) the balance is what he
      // OWES, so a higher number means he spent more. On an asset it's the
      // opposite. Uses the same loanKind test as the rest of the codebase —
      // there is no `type` field on these accounts, which an earlier version
      // of this check got wrong and silently under-counted card spending.
      const isLiab = ['credit', 'debt', 'borrow'].includes(String(acct.loanKind || ''));
      const spent = isLiab ? delta > 0 : delta < 0;

      applied.push({
        account: acct.name, was, now, delta,
        direction: spent ? 'spent' : 'received',
      });
      if (spent) totalUnlogged += Math.abs(delta);

      if (!input.dryRun) {
        const txnId = randomUUID().slice(0, 8);
        state.transactions.push({
          id: txnId,
          name: input.note
            ? `Balance reconcile — ${input.note}`
            : `Balance reconcile (unlogged activity)`,
          amount: Math.abs(delta),
          account: acct.id,
          date,
          // 'adjustment' keeps these OUT of eval-spend analytics. They are
          // catch-up bookkeeping, not a categorised business expense.
          type: 'adjustment',
          category: 'adjustment',
          expenseGroup: 'living',
          isPropFirm: false,
          direction: spent ? 'expense' : 'income',
          reconciled: true,
        });
        undo.push({ id: acct.id, balance: was, txnId });
        acct.balance = now;
        created++;
      } else {
        undo.push({ id: acct.id, balance: was, txnId: null });
      }
    }

    if (input.dryRun) {
      return {
        applied, totalUnlogged: round2(totalUnlogged),
        transactionsCreated: 0,
        warnings: [...warnings, 'DRY RUN — nothing written.'],
        since: null,
      };
    }

    await tx.query(
      `UPDATE budget_state SET state = $2, updated_at = NOW() WHERE user_id = $1`,
      [userId, JSON.stringify(state)]);

    await logAction(tx, userId, 'reconcile-balances',
      `Reconciled ${applied.filter(a => a.direction !== 'unchanged').length} balance(s), ` +
      `$${round2(totalUnlogged).toFixed(2)} unlogged`,
      { balances: undo });

    if (totalUnlogged > 0) {
      warnings.push(
        `$${round2(totalUnlogged).toFixed(2)} of spending was never itemised — recorded as an ` +
        `adjustment. Eval purchases are NOT included and still need logging properly.`);
    }

    return {
      applied,
      totalUnlogged: round2(totalUnlogged),
      transactionsCreated: created,
      warnings,
      since: null,
    };
  });
}
