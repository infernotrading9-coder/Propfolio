import { db } from './connection';
import { instantAccounts, instantClaims } from './schema';
import { and, eq, sql } from 'drizzle-orm';
// Money writes go through a REAL transaction (the drizzle neon-http driver cannot
// hold one) and land in the shared budget ledger, so an instant purchase books its
// expense exactly the way an eval purchase does.
import { withTransaction } from './txConnection';
import {
  applyBudgetTransaction,
  removeBudgetTransactionById,
  replaceBudgetTransaction,
} from './budgetLedger';
// The stats maths lives in shared/ so the service, the dev mock and the UI all
// use ONE implementation. See the header of that file for why.
import {
  computeInstantStats,
  daysBetween,
  type InstantStats,
} from '../../shared/instantStats.mts';

export type { InstantStats };

/**
 * Vest Markets instant accounts.
 *
 * SEGREGATION IS THE POINT. Nothing in here touches `challenges` or
 * `trading_accounts`, and no eval statistic touches these tables. An instant
 * account has no evaluation, so it must never reach the pass-rate denominator.
 *
 * ONE IMPLEMENTATION OF THE ARITHMETIC. `stats()` below is the only place these
 * sums exist — the UI displays what it returns and never re-derives a total.
 * (Two divergent copies of the personal-trade stats caused a real bug in
 * Oct 2026; do not inline this maths anywhere else.)
 *
 * MONEY CONVENTIONS:
 *   - `cost` is 100% sunk. On an instant account the payment IS the max
 *     drawdown and it is never recoverable. There is no equity, ever.
 *   - `instantClaims.amount` is stored POST-split (what Vest credits), so
 *     break-even is simply SUM(claims) >= SUM(cost). No split maths here.
 */

export const INSTANT_FUNDING_SOURCES = ['card', 'crypto', 'credit'] as const;
export type InstantFundingSource = (typeof INSTANT_FUNDING_SOURCES)[number];

/**
 * The firm a purchase is attributed to when nobody says otherwise.
 *
 * A FIRM IS A STATISTICS BOUNDARY, not a label. Accounts-per-payout, cost-per-payout
 * and break-even are all firm-specific (Vest is $10 on $500 with a 95% split; the
 * next firm will price differently), so every read that drives a number can be
 * scoped to one firm. Never blend firms in a figure and never sum across them
 * without saying so.
 */
export const INSTANT_DEFAULT_FIRM = 'Vest Markets';

/**
 * 500 → '500', 5000 → '5K'. The eval naming style (`Lucid Trading 50K`) would turn
 * a $500 instant account into "1K", so small sizes keep their full figure.
 */
const sizeLabel = (size: number): string => (size >= 1000 ? `${Math.round(size / 1000)}K` : String(size));

/**
 * How an instant purchase appears in the Budget tab:
 *   `Instant — Vest Markets 500 (V18)`
 * Mirrors `Eval — Lucid Trading 50K (0064)` so the two sit side by side and the
 * prop-firm spend rollup treats them alike.
 */
const instantTxnName = (firm: string, accountSize: number, nickname: string): string =>
  `Instant — ${firm} ${sizeLabel(accountSize)} (${nickname})`;

export interface InstantAccountWithClaims {
  id: string;
  nickname: string;
  firm: string;
  accountSize: number;
  cost: number;
  purchasedAt: string;
  status: 'alive' | 'dead';
  diedAt: string | null;
  fundingSource: string | null;
  notes: string | null;
  claimed: number;      // sum of this account's claims (post-split)
  pnl: number;          // claimed - cost
  claimCount: number;
  lifespanDays: number | null; // set only once dead
}

// InstantStats is defined in shared/instantStats.mts and re-exported above —
// one definition for the service, the dev mock and the UI.

const n = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * One shape for every account, whatever read it came from.
 *
 * Raw SQL returns snake_case and drizzle `.returning()` returns camelCase, and
 * numeric columns come back as strings either way. Without this, GET would hand
 * the UI numbers while POST handed it strings, and every `=== 200` on the client
 * would quietly fail. Accepts both casings.
 */
function shapeRow(r: any, claimed: unknown = 0, claimCount: unknown = 0): InstantAccountWithClaims {
  const cost = n(r.cost);
  const cl = n(claimed);
  const status: 'alive' | 'dead' = r.status === 'dead' ? 'dead' : 'alive';
  const purchasedAt: string = r.purchased_at ?? r.purchasedAt;
  const diedAt: string | null = r.died_at ?? r.diedAt ?? null;
  return {
    id: r.id,
    nickname: r.nickname,
    firm: (r.firm ?? r.firm_name ?? INSTANT_DEFAULT_FIRM) as string,
    accountSize: n(r.account_size ?? r.accountSize),
    cost: round2(cost),
    purchasedAt,
    status,
    diedAt,
    fundingSource: r.funding_source ?? r.fundingSource ?? null,
    notes: r.notes ?? null,
    claimed: round2(cl),
    pnl: round2(cl - cost),
    claimCount: n(claimCount),
    lifespanDays: status === 'dead' && diedAt ? daysBetween(purchasedAt, diedAt) : null,
  };
}

export const instantService = {
  /**
   * Every account for the user, each carrying its own claim totals. Newest last.
   *
   * `filter.firm` scopes the read to ONE firm. Use it whenever a figure is about to
   * be shown: accounts-per-payout and cost-per-payout are firm-specific, so a
   * blended number across two firms averages two different products.
   */
  async listAccounts(userId: string, filter?: { firm?: string | null }): Promise<InstantAccountWithClaims[]> {
    const firm = filter?.firm && filter.firm.trim() ? filter.firm.trim() : null;
    const { rows } = await db.execute(sql`
      SELECT a.id, a.nickname, a.firm, a.account_size, a.cost, a.purchased_at, a.status,
             a.died_at, a.funding_source, a.notes,
             COALESCE(c.claimed, 0)      AS claimed,
             COALESCE(c.claim_count, 0)  AS claim_count
        FROM instant_accounts a
        LEFT JOIN (
          SELECT account_id, SUM(amount) AS claimed, COUNT(*)::int AS claim_count
            FROM instant_claims
           WHERE user_id = ${userId}::uuid
           GROUP BY account_id
        ) c ON c.account_id = a.id
       WHERE a.user_id = ${userId}::uuid
         AND (${firm}::text IS NULL OR a.firm = ${firm}::text)
       ORDER BY a.purchased_at ASC, a.created_at ASC`);

    return (rows as any[]).map((r) => shapeRow(r, r.claimed, r.claim_count));
  },

  /** The distinct firms this user actually has accounts at, for the tab's filter. */
  async listFirms(userId: string): Promise<string[]> {
    const { rows } = await db.execute(sql`
      SELECT firm, count(*)::int AS n
        FROM instant_accounts
       WHERE user_id = ${userId}::uuid
       GROUP BY firm
       ORDER BY n DESC, firm ASC`);
    return (rows as any[]).map((r) => String(r.firm));
  },

  async listClaims(userId: string, filter?: { firm?: string | null }) {
    const firm = filter?.firm && filter.firm.trim() ? filter.firm.trim() : null;
    const { rows } = await db.execute(sql`
      SELECT c.id, c.account_id, c.amount, c.claimed_at, c.notes, a.nickname, a.firm
        FROM instant_claims c
        JOIN instant_accounts a ON a.id = c.account_id
       WHERE c.user_id = ${userId}::uuid
         AND (${firm}::text IS NULL OR a.firm = ${firm}::text)
       ORDER BY c.claimed_at DESC, c.created_at DESC`);
    return (rows as any[]).map((r) => ({
      id: r.id,
      accountId: r.account_id,
      nickname: r.nickname,
      firm: (r.firm ?? INSTANT_DEFAULT_FIRM) as string,
      amount: n(r.amount),
      claimedAt: r.claimed_at,
      notes: r.notes ?? null,
    }));
  },

  /**
   * Buy N accounts in ONE statement — and book the money, exactly like `buyEval`.
   *
   * A batch, not a loop: `buyEval` taught this the hard way — looping N inserts
   * is N round-trips and N chances to half-succeed.
   *
   * Nicknames continue from the highest existing V<n> so a re-run never
   * reuses a name that is already on a card.
   */
  async buyAccounts(
    userId: string,
    input: {
      count: number;
      firm?: string | null;
      accountSize: number;
      cost: number;
      purchasedAt: string;
      fundingSource?: string | null;
      notes?: string | null;
      /** Which budget account the money came from. Omit and no expense is booked —
       *  the response says so in `warnings` rather than pretending. */
      budgetAccountId?: string | null;
    },
  ) {
    const count = Math.trunc(input.count);
    const firm = input.firm && input.firm.trim() ? input.firm.trim() : INSTANT_DEFAULT_FIRM;
    const budgetAccountId = input.budgetAccountId && String(input.budgetAccountId).trim()
      ? String(input.budgetAccountId).trim()
      : null;

    /**
     * ATOMIC + LEDGERED, like the eval dashboard's cascade.
     *
     * Each card is inserted and its budget expense booked inside ONE transaction.
     * A card with no expense is an understated spend that nobody can trace later;
     * an expense with no card is the same error in reverse. With the HTTP drizzle
     * driver BEGIN/COMMIT are meaningless, so the write path uses the pooled
     * WebSocket connection that can hold a real transaction.
     *
     * One ledger row PER CARD — same granularity as an eval purchase, so deleting
     * or re-pricing a single card can move exactly its own money.
     */
    return withTransaction(async (tx) => {
      const taken = await tx.query<{ maxn: number | string | null }>(
        `SELECT COALESCE(MAX(NULLIF(regexp_replace(nickname, '\\D', '', 'g'), '')::int), 0) AS maxn
           FROM instant_accounts WHERE user_id = $1`, [userId]);
      let next = n(taken.rows[0]?.maxn);

      const warnings: string[] = [];
      if (input.cost > 0 && !budgetAccountId) {
        warnings.push(
          'no budgetAccountId — purchases were recorded but NO expense was booked, so this money ' +
          'will not appear in the Budget tab. Send the account the money came from.',
        );
      }

      const created: InstantAccountWithClaims[] = [];
      for (let i = 0; i < count; i += 1) {
        next += 1;
        const nickname = `V${next}`;
        const { rows } = await tx.query(
          `INSERT INTO instant_accounts
             (user_id, nickname, firm, account_size, cost, purchased_at, status,
              funding_source, notes, budget_account_id)
           VALUES ($1,$2,$3,$4,$5,$6,'alive',$7,$8,$9)
           RETURNING *`,
          [userId, nickname, firm, String(input.accountSize), String(input.cost),
           input.purchasedAt, input.fundingSource ?? null, input.notes ?? null, budgetAccountId],
        );
        const row: any = rows[0];

        if (input.cost > 0 && budgetAccountId) {
          const txnId = await applyBudgetTransaction(tx, userId, {
            name: instantTxnName(row.firm, n(row.account_size), nickname),
            amount: input.cost,
            accountId: budgetAccountId,
            date: input.purchasedAt,
            isPropFirm: true,
          }, { strict: true });
          await tx.query(`UPDATE instant_accounts SET budget_txn_id = $2 WHERE id = $1`, [row.id, txnId]);
          row.budget_txn_id = txnId;
        }

        created.push(shapeRow(row, 0, 0));
      }

      return { accounts: created, warnings };
    });
  },

  /**
   * Partial update. Only the keys present are written. Status and diedAt are kept in step.
   *
   * MONEY: if the price, the date, the firm or the nickname changes, the card's
   * budget expense is REPLACED (reverse the old row, book the new one) rather than
   * patched in place — a delete-and-rebook cannot get the liability sign wrong.
   * Passing `budgetAccountId` on a card that has no ledger row yet (every account
   * logged before instant money reached the budget) attaches one.
   */
  async updateAccount(
    userId: string,
    id: string,
    patch: {
      nickname?: string;
      firm?: string;
      accountSize?: number;
      cost?: number;
      purchasedAt?: string;
      status?: 'alive' | 'dead';
      diedAt?: string | null;
      fundingSource?: string | null;
      notes?: string | null;
    },
    opts: { budgetAccountId?: string | null } = {},
  ) {
    await withTransaction(async (tx) => {
      const cur = await tx.query(`SELECT * FROM instant_accounts WHERE user_id = $1 AND id = $2 FOR UPDATE`,
        [userId, id]);
      const before: any = cur.rows[0];
      if (!before) return;

      const cols: Record<string, unknown> = {};
      if (patch.nickname !== undefined) cols.nickname = patch.nickname;
      if (patch.firm !== undefined) cols.firm = patch.firm;
      if (patch.accountSize !== undefined) cols.account_size = String(patch.accountSize);
      if (patch.cost !== undefined) cols.cost = String(patch.cost);
      if (patch.purchasedAt !== undefined) cols.purchased_at = patch.purchasedAt;
      if (patch.fundingSource !== undefined) cols.funding_source = patch.fundingSource;
      if (patch.notes !== undefined) cols.notes = patch.notes;
      if (patch.status !== undefined) {
        cols.status = patch.status;
        // Dying sets a date; coming back to life must clear it, or lifespan is a lie.
        cols.died_at = patch.status === 'dead'
          ? (patch.diedAt ?? new Date().toISOString().slice(0, 10))
          : null;
      } else if (patch.diedAt !== undefined) {
        cols.died_at = patch.diedAt;
      }

      const keys = Object.keys(cols);
      let after: any = before;
      if (keys.length > 0) {
        // `keys` is built from this function's own column map, never from user input.
        const assignments = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
        const res = await tx.query(
          `UPDATE instant_accounts SET ${assignments}, updated_at = NOW() WHERE id = $1 RETURNING *`,
          [id, ...keys.map((k) => cols[k])]);
        after = res.rows[0];
      }

      // ── keep the expense in step ──────────────────────────────────────────
      const moneyChanged = patch.cost !== undefined || patch.purchasedAt !== undefined
        || patch.firm !== undefined || patch.nickname !== undefined;
      const acct = (opts.budgetAccountId && String(opts.budgetAccountId).trim())
        || (before.budget_account_id as string | null)
        || null;
      const cost = n(after.cost);

      if (moneyChanged && acct && cost > 0) {
        const next = {
          name: instantTxnName(String(after.firm), n(after.account_size), String(after.nickname)),
          amount: cost,
          accountId: acct,
          date: String(after.purchased_at),
          isPropFirm: true,
        };
        const txnId = before.budget_txn_id
          ? await replaceBudgetTransaction(tx, userId, before.budget_txn_id, next, { strict: true })
          : await applyBudgetTransaction(tx, userId, next, { strict: true });
        await tx.query(`UPDATE instant_accounts SET budget_txn_id = $2, budget_account_id = $3 WHERE id = $1`,
          [id, txnId, acct]);
      }
    });

    // Re-read so the response carries this card's claim totals too. Returning the
    // bare update row would report claimed 0 and make a card look like it lost
    // its payouts.
    const all = await this.listAccounts(userId);
    return all.find((a) => a.id === id) ?? null;
  },

  /**
   * Deleting an account cascades its claims away (FK ON DELETE CASCADE).
   *
   * The budget rows have to be reversed BEFORE the delete: once the cascade has
   * removed the claim rows, the ids of their income entries are gone, and money
   * stays missing from the balance with nothing left pointing at it.
   */
  async deleteAccount(userId: string, id: string) {
    return withTransaction(async (tx) => {
      const cur = await tx.query(`SELECT * FROM instant_accounts WHERE user_id = $1 AND id = $2 FOR UPDATE`,
        [userId, id]);
      const row: any = cur.rows[0];
      if (!row) return null;

      const removed = await removeBudgetTransactionById(tx, userId, row.budget_txn_id);
      const claims = await tx.query<{ budget_txn_id: string | null; id: string }>(
        `SELECT id, budget_txn_id FROM instant_claims WHERE account_id = $1`, [id]);
      let claimTxns = 0;
      for (const c of claims.rows) {
        claimTxns += await removeBudgetTransactionById(tx, userId, c.budget_txn_id);
      }

      await tx.query(`DELETE FROM instant_accounts WHERE id = $1`, [id]);

      return {
        id: row.id,
        nickname: row.nickname,
        firm: row.firm,
        cascadedClaims: claims.rows.length > 0,
        cascadedClaimsCount: claims.rows.length,
        removedBudgetEntries: removed + claimTxns,
      };
    });
  },

  /**
   * Record a Claim Profit. `amount` must already be post-split.
   *
   * `budgetAccountId` is an EXPLICIT decision, never automatic — the same rule as
   * eval payouts, which never move money without an allocation. A claim whose money
   * is still sitting on the firm's platform is not in a bank account yet, so with no
   * account named nothing is booked and the response says so.
   */
  async logClaim(
    userId: string,
    input: {
      accountId: string;
      amount: number;
      claimedAt: string;
      notes?: string | null;
      budgetAccountId?: string | null;
    },
  ) {
    const budgetAccountId = input.budgetAccountId && String(input.budgetAccountId).trim()
      ? String(input.budgetAccountId).trim()
      : null;

    return withTransaction(async (tx) => {
      const owned = await tx.query<{ id: string; nickname: string; firm: string }>(
        `SELECT id, nickname, firm FROM instant_accounts WHERE user_id = $1 AND id = $2`,
        [userId, input.accountId]);
      const acct = owned.rows[0];
      if (!acct) return null;

      const ins = await tx.query(
        `INSERT INTO instant_claims (user_id, account_id, amount, claimed_at, notes, budget_account_id)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [userId, input.accountId, String(input.amount), input.claimedAt, input.notes ?? null, budgetAccountId]);
      const r: any = ins.rows[0];

      const warnings: string[] = [];
      if (budgetAccountId) {
        const txnId = await applyBudgetTransaction(tx, userId, {
          name: `Claim ${acct.nickname} (${acct.firm})`,
          amount: input.amount,
          accountId: budgetAccountId,
          date: input.claimedAt,
          type: 'income',
          categoryId: 'cat_payout',
        }, { strict: true });
        await tx.query(`UPDATE instant_claims SET budget_txn_id = $2 WHERE id = $1`, [r.id, txnId]);
        r.budget_txn_id = txnId;
      } else {
        warnings.push(
          'no budgetAccountId — the claim was recorded but no income was booked, so it will not ' +
          'show in the Budget tab. Send the account the money landed in.',
        );
      }

      return {
        id: r.id,
        accountId: r.account_id ?? r.accountId,
        amount: round2(n(r.amount)),
        claimedAt: r.claimed_at ?? r.claimedAt,
        notes: r.notes ?? null,
        warnings,
      };
    });
  },

  async deleteClaim(userId: string, id: string) {
    return withTransaction(async (tx) => {
      const cur = await tx.query(`SELECT * FROM instant_claims WHERE user_id = $1 AND id = $2 FOR UPDATE`,
        [userId, id]);
      const row: any = cur.rows[0];
      if (!row) return null;
      await removeBudgetTransactionById(tx, userId, row.budget_txn_id);
      await tx.query(`DELETE FROM instant_claims WHERE id = $1`, [id]);
      return { id: row.id, accountId: row.account_id, amount: round2(n(row.amount)) };
    });
  },

  /**
   * Partial edit of one claim — the path for a mistyped amount.
   *
   * `instant_claims` has NO updated_at column, unlike `instant_accounts`, so a
   * correction leaves no trail. That is deliberate: a claim is an EVENT, and the
   * alternative (delete + re-log) loses the same information while also moving the
   * row's created_at. Only the keys present are written.
   *
   * A corrected amount moves the money in the budget too: the income row is
   * replaced, not patched, so the balance can never drift from the claim.
   */
  async updateClaim(
    userId: string,
    id: string,
    patch: { amount?: number; claimedAt?: string; notes?: string | null; budgetAccountId?: string | null },
  ) {
    return withTransaction(async (tx) => {
      const cur = await tx.query(`SELECT * FROM instant_claims WHERE user_id = $1 AND id = $2 FOR UPDATE`,
        [userId, id]);
      const before: any = cur.rows[0];
      if (!before) return null;

      const cols: Record<string, unknown> = {};
      if (patch.amount !== undefined) cols.amount = String(patch.amount);
      if (patch.claimedAt !== undefined) cols.claimed_at = patch.claimedAt;
      if (patch.notes !== undefined) cols.notes = patch.notes;
      if (patch.budgetAccountId !== undefined && patch.budgetAccountId !== null) {
        const a = String(patch.budgetAccountId).trim();
        if (a) cols.budget_account_id = a;
      }

      const keys = Object.keys(cols);
      let after: any = before;
      if (keys.length > 0) {
        const assignments = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
        const res = await tx.query(
          `UPDATE instant_claims SET ${assignments} WHERE id = $1 RETURNING *`,
          [id, ...keys.map((k) => cols[k])]);
        after = res.rows[0];
      }

      const acct = (after.budget_account_id as string | null) || null;
      const amount = n(after.amount);
      const moneyChanged = patch.amount !== undefined || patch.claimedAt !== undefined || !!patch.budgetAccountId;

      if (moneyChanged && acct && amount > 0) {
        const owner = await tx.query<{ nickname: string; firm: string }>(
          `SELECT nickname, firm FROM instant_accounts WHERE id = $1`, [after.account_id]);
        const next = {
          name: `Claim ${owner.rows[0]?.nickname ?? '?'} (${owner.rows[0]?.firm ?? INSTANT_DEFAULT_FIRM})`,
          amount,
          accountId: acct,
          date: String(after.claimed_at),
          type: 'income' as const,
          categoryId: 'cat_payout',
        };
        const txnId = before.budget_txn_id
          ? await replaceBudgetTransaction(tx, userId, before.budget_txn_id, next, { strict: true })
          : await applyBudgetTransaction(tx, userId, next, { strict: true });
        await tx.query(`UPDATE instant_claims SET budget_txn_id = $2, budget_account_id = $3 WHERE id = $1`,
          [id, txnId, acct]);
      }

      // Same shape as log-claim, so a client can treat an edit response like a create.
      return {
        id: after.id,
        accountId: after.account_id ?? after.accountId,
        amount: round2(n(after.amount)),
        claimedAt: after.claimed_at ?? after.claimedAt,
        notes: after.notes ?? null,
      };
    });
  },

  /**
   * The stats. Derived every call from the rows — never stored, never cached.
   * A remembered total for this is a wrong total.
   */
  async stats(userId: string, filter?: { firm?: string | null }): Promise<InstantStats> {
    // Delegate to the ONE implementation in shared/instantStats.mts. Do not
    // re-derive here — the dev mock and the UI import the same function, and a
    // second copy is how dev silently stops matching live.
    return computeInstantStats(await this.listAccounts(userId, filter));
  },
};
