/**
 * payoutService — a payout is INCOME, not just a trading statistic.
 * =================================================================
 *
 * recordPayout() used to write a `payouts` row and stop there. The money never
 * reached the Budget tab, so a $1,500 withdrawal was invisible to the finance
 * side of the very app built to join the two. Daniel spotted it.
 *
 * A payout now:
 *   1. records against the funded/live challenge (payout_count gates live)
 *   2. lands in the budget as income on a real account
 *   3. can be SPLIT across buckets — savings, prop cushion, debt, spending
 *
 * And because the app can already see every balance and every APR, it proposes
 * the split instead of making Daniel work it out. The proposal is a suggestion:
 * nothing moves until he confirms an allocation.
 */

import { randomUUID } from 'crypto';
import { withTransaction, type TxClient } from './txConnection';
import { CascadeError, todayET, listBudgetAccounts } from './cascadeService';
import { logAction } from './actionLog';

const round2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;

export type Bucket = 'debt' | 'prop_cushion' | 'savings' | 'spending';

export interface AllocationSlice {
  bucket: Bucket;
  accountId: string;
  accountName: string;
  amount: number;
  reason: string;
}

export interface AllocationProposal {
  payoutAmount: number;
  slices: AllocationSlice[];
  summary: string;
  context: {
    totalDebt: number;
    highestAprAccount?: string;
    cashOnHand: number;
    monthlyEvalSpend: number;
    suggestedCushion: number;
  };
}

/**
 * Interest rate we assume when an account has no APR recorded.
 *
 * Buy-now-pay-later accounts (Affirm, Klarna, Sezzle) are usually fee-based
 * rather than APR-based, and subprime cards (Destiny, Aspire, Premier) run
 * high. Ordering by balance alone would send money at the biggest balance
 * rather than the most expensive one, so an assumed rate is better than none.
 */
const ASSUMED_APR: Record<string, number> = {
  acc_destiny: 35, acc_aspire: 36, acc_premier: 36, acc_capitalone: 30,
  acc_revel: 30, acc_cashapp: 0, acc_affirm: 15, acc_klarna: 0,
  acc_sezzle: 0, acc_christian: 0,
};

/**
 * Propose where a payout should go, from Daniel's actual finances.
 *
 * Priority reflects how he actually operates — he funds evals on credit, so
 * the cushion protects the business, but expensive debt compounds against him:
 *
 *   1. PROP CUSHION — keep roughly one month of eval spend liquid, so the next
 *      eval is not bought on a card. Capped at 30% of the payout.
 *   2. DEBT — the rest weighted to the highest-APR balance. This is the biggest
 *      lever: 35% APR on Destiny costs more than any savings account earns.
 *   3. SAVINGS — only once high-APR debt is cleared.
 *
 * Returns a PROPOSAL. Nothing moves until Daniel confirms.
 */
export async function proposeAllocation(
  userId: string, payoutAmount: number,
): Promise<AllocationProposal> {
  const amount = round2(payoutAmount);
  if (amount <= 0) throw new CascadeError('Payout amount must be positive', 'bad_amount');

  const accounts = await listBudgetAccounts(userId);
  const liabilities = accounts.filter(a => a.isLiability && a.balance > 0);
  const cashAccounts = accounts.filter(a => !a.isLiability);
  const cashOnHand = round2(cashAccounts.reduce((s, a) => s + a.balance, 0));
  const totalDebt = round2(liabilities.reduce((s, a) => s + a.balance, 0));

  // What does he actually spend on evals in a month? Use it to size the cushion.
  const monthlyEvalSpend = await withTransaction(async (tx) => {
    const { rows } = await tx.query(`
      SELECT COALESCE(SUM(cost), 0) AS total FROM challenges
       WHERE user_id = $1 AND start_date >= to_char(NOW() - INTERVAL '30 days', 'YYYY-MM-DD')`,
      [userId]);
    return round2(rows[0]?.total);
  });

  // Fall back to a sane floor when there is no recent history to learn from.
  const suggestedCushion = Math.max(monthlyEvalSpend, 200);

  const slices: AllocationSlice[] = [];
  let remaining = amount;

  // ── 1. Prop cushion ──────────────────────────────────────────────────────
  const cushionGap = Math.max(0, suggestedCushion - cashOnHand);
  if (cushionGap > 0 && remaining > 0) {
    const cushion = round2(Math.min(cushionGap, amount * 0.30, remaining));
    if (cushion > 0) {
      const target = accounts.find(a => a.id === 'acc_sofi')
        ?? cashAccounts.find(a => a.balance >= 0) ?? cashAccounts[0];
      if (target) {
        slices.push({
          bucket: 'prop_cushion', accountId: target.id, accountName: target.name,
          amount: cushion,
          reason: `Cash on hand is $${cashOnHand.toFixed(2)} against ~$${suggestedCushion.toFixed(2)} of eval spend in the last 30 days. `
            + `This keeps the next eval off a credit card.`,
        });
        remaining = round2(remaining - cushion);
      }
    }
  }

  // ── 2. Debt, highest APR first ───────────────────────────────────────────
  const byApr = [...liabilities].sort((a, b) => {
    const ra = ASSUMED_APR[a.id] ?? 25, rb = ASSUMED_APR[b.id] ?? 25;
    if (rb !== ra) return rb - ra;
    return b.balance - a.balance;
  });

  for (const acct of byApr) {
    if (remaining <= 0) break;
    const apr = ASSUMED_APR[acct.id] ?? 25;
    if (apr < 10) continue;                       // 0% BNPL waits its turn
    const pay = round2(Math.min(acct.balance, remaining));
    if (pay <= 0) continue;
    slices.push({
      bucket: 'debt', accountId: acct.id, accountName: acct.name, amount: pay,
      reason: `${acct.name} carries $${acct.balance.toFixed(2)} at roughly ${apr}% APR — `
        + `the most expensive money you owe.`,
    });
    remaining = round2(remaining - pay);
  }

  // ── 3. Whatever is left ──────────────────────────────────────────────────
  if (remaining > 0) {
    const zeroPct = byApr.filter(a => (ASSUMED_APR[a.id] ?? 25) < 10 && a.balance > 0);
    if (zeroPct.length) {
      const target = zeroPct[0];
      const pay = round2(Math.min(target.balance, remaining));
      slices.push({
        bucket: 'debt', accountId: target.id, accountName: target.name, amount: pay,
        reason: `${target.name} is interest-free but still owed — clearing it frees future cash flow.`,
      });
      remaining = round2(remaining - pay);
    }
  }
  if (remaining > 0) {
    const target = accounts.find(a => a.id === 'acc_atlas')
      ?? cashAccounts[0] ?? accounts[0];
    if (target) {
      slices.push({
        bucket: 'savings', accountId: target.id, accountName: target.name,
        amount: remaining,
        reason: 'High-interest debt is covered — the remainder can be saved.',
      });
      remaining = 0;
    }
  }

  const highestApr = byApr[0];
  const parts = slices.map(s =>
    `$${s.amount.toFixed(2)} → ${s.accountName} (${s.bucket.replace('_', ' ')})`);

  return {
    payoutAmount: amount,
    slices,
    summary: `Suggested split of $${amount.toFixed(2)}: ${parts.join(' · ')}`,
    context: {
      totalDebt, cashOnHand, monthlyEvalSpend, suggestedCushion,
      highestAprAccount: highestApr?.name,
    },
  };
}

/** Apply one slice to the budget as income. Mirrors applyBudgetTransaction. */
async function applyIncome(
  tx: TxClient, userId: string, o: { name: string; amount: number; accountId: string; date: string },
): Promise<void> {
  const { rows } = await tx.query(
    `SELECT state FROM budget_state WHERE user_id = $1 LIMIT 1 FOR UPDATE`, [userId]);
  if (!rows.length) throw new CascadeError('No budget state', 'no_budget');

  const state = typeof rows[0].state === 'string' ? JSON.parse(rows[0].state) : rows[0].state;
  const accounts = Array.isArray(state.accounts) ? state.accounts : [];
  const target = accounts.find((a: any) => a?.id === o.accountId);
  if (!target) throw new CascadeError(`No budget account "${o.accountId}"`, 'not_found');

  const isLiability = ['credit', 'debt', 'borrow'].includes(String(target.loanKind || ''));
  // Income into a cash account raises it; into a liability it PAYS DOWN what is owed.
  target.balance = round2(Number(target.balance) + (isLiability ? -o.amount : o.amount));

  state.transactions = Array.isArray(state.transactions) ? state.transactions : [];
  state.transactions.push({
    id: randomUUID().slice(0, 8),
    name: o.name, amount: o.amount, type: 'income',
    date: o.date, accountId: o.accountId, categoryId: 'cat_payout', excluded: false,
  });
  state.accounts = accounts;

  await tx.query(
    `UPDATE budget_state SET state = $2::jsonb, updated_at = NOW() WHERE user_id = $1`,
    [userId, JSON.stringify(state)]);
}

export interface RecordPayoutInput {
  userId: string;
  accountRef: string;
  amount: number;
  date?: string;
  description?: string;
  /**
   * Where the money goes. Omit to get a PROPOSAL back without moving anything —
   * that is the prompt-first flow: propose, Daniel confirms, then apply.
   */
  allocations?: Array<{ bucket: Bucket; accountId: string; amount: number }>;
}

export interface RecordPayoutResult {
  payoutId: string | null;
  label: string;
  payoutCount: number;
  eligibleForLive: boolean;
  applied: boolean;
  proposal?: AllocationProposal;
  allocated?: AllocationSlice[];
  warnings: string[];
}

/**
 * Record a payout and route the money into the budget.
 *
 * Two-phase by design:
 *   no `allocations` → returns a proposal, writes NOTHING
 *   with `allocations` → records the payout and applies the split atomically
 */
export async function recordPayoutWithAllocation(
  input: RecordPayoutInput,
): Promise<RecordPayoutResult> {
  const amount = round2(input.amount);
  if (amount <= 0) throw new CascadeError('Payout amount must be positive', 'bad_amount');

  // ── Phase 1: propose ─────────────────────────────────────────────────────
  if (!input.allocations || input.allocations.length === 0) {
    const acct = await withTransaction(async (tx) => {
      const { rows } = await tx.query(`
        SELECT ta.display_label, ch.lifecycle, ch.payout_count
          FROM trading_accounts ta
          LEFT JOIN challenges ch ON ch.account_id = ta.id
         WHERE ta.user_id = $1
           AND (lower(ta.nickname) = lower($2) OR ta.display_label = $2 OR ta.account_number_last4 = $2)
           AND ta.status = 'active'`, [input.userId, input.accountRef]);
      if (rows.length === 0) throw new CascadeError(`No active account "${input.accountRef}"`, 'not_found');
      if (rows.length > 1) {
        throw new CascadeError(
          `"${input.accountRef}" matches ${rows.length} accounts (${rows.map((r: any) => r.display_label).join(', ')}). Say which one.`,
          'ambiguous');
      }
      return rows[0];
    });

    const lc = String(acct.lifecycle || '');
    if (!lc.startsWith('funded') && !lc.startsWith('live')) {
      throw new CascadeError(
        `${acct.display_label} is "${lc}" — only funded or live accounts take payouts.`,
        'bad_lifecycle');
    }

    const proposal = await proposeAllocation(input.userId, amount);
    return {
      payoutId: null,
      label: String(acct.display_label),
      payoutCount: Number(acct.payout_count ?? 0),
      eligibleForLive: false,
      applied: false,
      proposal,
      warnings: ['Nothing recorded yet — confirm the split and send it back with `allocations`.'],
    };
  }

  // ── Phase 2: apply ───────────────────────────────────────────────────────
  const allocations = input.allocations;
  const total = round2(allocations.reduce((s, a) => s + round2(a.amount), 0));
  if (Math.abs(total - amount) > 0.01) {
    throw new CascadeError(
      `Allocations total $${total.toFixed(2)} but the payout is $${amount.toFixed(2)}. They must match.`,
      'allocation_mismatch');
  }

  return withTransaction(async (tx) => {
    const warnings: string[] = [];
    const date = input.date || todayET();

    const { rows: found } = await tx.query(`
      SELECT ta.id, ta.display_label, ch.id AS challenge_id, ch.lifecycle, ch.payout_count
        FROM trading_accounts ta
        LEFT JOIN challenges ch ON ch.account_id = ta.id
       WHERE ta.user_id = $1
         AND (lower(ta.nickname) = lower($2) OR ta.display_label = $2 OR ta.account_number_last4 = $2)
         AND ta.status = 'active'
       FOR UPDATE OF ta`, [input.userId, input.accountRef]);

    if (found.length === 0) throw new CascadeError(`No active account "${input.accountRef}"`, 'not_found');
    if (found.length > 1) {
      throw new CascadeError(
        `"${input.accountRef}" matches ${found.length} accounts. Say which one.`, 'ambiguous');
    }
    const acct = found[0];
    if (!acct.challenge_id) throw new CascadeError('No challenge row', 'no_challenge');

    const lc = String(acct.lifecycle || '');
    if (!lc.startsWith('funded') && !lc.startsWith('live')) {
      throw new CascadeError(
        `${acct.display_label} is "${lc}" — only funded or live accounts take payouts.`,
        'bad_lifecycle');
    }

    // 1. The payout record
    const payoutId = randomUUID();
    await tx.query(`
      INSERT INTO payouts (id, user_id, challenge_id, amount, date, description, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
      [payoutId, input.userId, acct.challenge_id, String(amount), date,
       input.description || `Payout — ${acct.display_label}`]);

    const { rows: pc } = await tx.query(
      `SELECT count(*)::int n FROM payouts WHERE challenge_id = $1`, [acct.challenge_id]);
    const payoutCount = pc[0]?.n ?? 0;
    await tx.query(
      `UPDATE challenges SET payout_count = $2, updated_at = NOW() WHERE id = $1`,
      [acct.challenge_id, payoutCount]);

    // 2. The money, split as confirmed
    const applied: AllocationSlice[] = [];
    const budgetAccounts = await listBudgetAccounts(input.userId);
    for (const a of allocations) {
      const slice = round2(a.amount);
      if (slice <= 0) continue;
      const meta = budgetAccounts.find(b => b.id === a.accountId);
      if (!meta) throw new CascadeError(`No budget account "${a.accountId}"`, 'not_found');

      await applyIncome(tx, input.userId, {
        name: `Payout ${acct.display_label} → ${meta.name}`,
        amount: slice, accountId: a.accountId, date,
      });
      await tx.query(`
        INSERT INTO payout_allocations (id, user_id, payout_id, bucket, account_id, amount, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
        [randomUUID(), input.userId, payoutId, a.bucket, a.accountId, String(slice)]);

      applied.push({
        bucket: a.bucket, accountId: a.accountId, accountName: meta.name,
        amount: slice,
        reason: meta.isLiability ? `Paid down ${meta.name}` : `Added to ${meta.name}`,
      });
    }

    const eligibleForLive = payoutCount >= 5 && lc === 'funded_active';
    if (eligibleForLive) {
      warnings.push(
        `${acct.display_label} now has ${payoutCount} payouts — eligible to be considered for LIVE. ` +
        `It is not live until the firm actually moves you and you tell me.`);
    }

    // Reversible: a payout touches the trading record AND several budget
    // balances, which is exactly the kind of multi-surface change that is
    // painful to unpick by hand.
    await logAction(tx, input.userId, 'record-payout',
      `Payout of $${amount.toFixed(2)} on ${acct.display_label}, split across `
      + applied.map(s => `${s.accountName} $${s.amount.toFixed(2)}`).join(', '),
      {
        payoutId, challengeId: String(acct.challenge_id), label: String(acct.display_label),
        allocations: applied.map(s => ({ accountId: s.accountId, amount: s.amount })),
      });

    return {
      payoutId, label: String(acct.display_label), payoutCount,
      eligibleForLive, applied: true, allocated: applied, warnings,
    };
  });
}
