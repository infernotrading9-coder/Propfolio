import { db } from './connection';
import { instantAccounts, instantClaims } from './schema';
import { and, eq, sql } from 'drizzle-orm';
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
   * Buy N accounts in ONE statement.
   *
   * A batch, not a loop: `buyEval` taught this the hard way — looping N inserts
   * is N round-trips and N chances to half-succeed. The neon-http driver has no
   * interactive transactions, so a single multi-row INSERT is the atomic unit.
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
    },
  ) {
    const count = Math.trunc(input.count);
    const taken = await db.execute(sql`
      SELECT COALESCE(MAX(NULLIF(regexp_replace(nickname, '\\D', '', 'g'), '')::int), 0) AS maxn
        FROM instant_accounts WHERE user_id = ${userId}::uuid`);
    let next = n((taken.rows as any[])[0]?.maxn);

    const firm = input.firm && input.firm.trim() ? input.firm.trim() : INSTANT_DEFAULT_FIRM;

    const values = Array.from({ length: count }, () => {
      next += 1;
      return {
        userId,
        nickname: `V${next}`,
        firm,
        accountSize: String(input.accountSize),
        cost: String(input.cost),
        purchasedAt: input.purchasedAt,
        status: 'alive',
        fundingSource: input.fundingSource ?? null,
        notes: input.notes ?? null,
      };
    });

    const rows = await db.insert(instantAccounts).values(values).returning();
    // Same shape as GET, so a client can treat a create response like a list row.
    return rows.map((r) => shapeRow(r));
  },

  /** Partial update. Only the keys present are written. Status and diedAt are kept in step. */
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
  ) {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.nickname !== undefined) set.nickname = patch.nickname;
    if (patch.firm !== undefined) set.firm = patch.firm;
    if (patch.accountSize !== undefined) set.accountSize = String(patch.accountSize);
    if (patch.cost !== undefined) set.cost = String(patch.cost);
    if (patch.purchasedAt !== undefined) set.purchasedAt = patch.purchasedAt;
    if (patch.fundingSource !== undefined) set.fundingSource = patch.fundingSource;
    if (patch.notes !== undefined) set.notes = patch.notes;
    if (patch.status !== undefined) {
      set.status = patch.status;
      // Dying sets a date; coming back to life must clear it, or lifespan is a lie.
      if (patch.status === 'dead') set.diedAt = patch.diedAt ?? new Date().toISOString().slice(0, 10);
      else set.diedAt = null;
    } else if (patch.diedAt !== undefined) {
      set.diedAt = patch.diedAt;
    }

    const rows = await db
      .update(instantAccounts)
      .set(set as any)
      .where(and(eq(instantAccounts.userId, userId), eq(instantAccounts.id, id)))
      .returning();
    if (!rows[0]) return null;
    // Re-read so the response carries this card's claim totals too. Returning the
    // bare update row would report claimed 0 and make a card look like it lost
    // its payouts.
    const all = await this.listAccounts(userId);
    return all.find((a) => a.id === id) ?? null;
  },

  /** Deleting an account cascades its claims away (FK ON DELETE CASCADE). */
  async deleteAccount(userId: string, id: string) {
    const rows = await db
      .delete(instantAccounts)
      .where(and(eq(instantAccounts.userId, userId), eq(instantAccounts.id, id)))
      .returning();
    return rows[0] ?? null;
  },

  /** Record a Claim Profit. `amount` must already be post-split. */
  async logClaim(
    userId: string,
    input: { accountId: string; amount: number; claimedAt: string; notes?: string | null },
  ) {
    const owns = await db
      .select({ id: instantAccounts.id })
      .from(instantAccounts)
      .where(and(eq(instantAccounts.userId, userId), eq(instantAccounts.id, input.accountId)))
      .limit(1);
    if (!owns[0]) return null;

    const rows = await db
      .insert(instantClaims)
      .values({
        userId,
        accountId: input.accountId,
        amount: String(input.amount),
        claimedAt: input.claimedAt,
        notes: input.notes ?? null,
      })
      .returning();
    const r: any = rows[0];
    return {
      id: r.id,
      accountId: r.account_id ?? r.accountId,
      amount: round2(n(r.amount)),
      claimedAt: r.claimed_at ?? r.claimedAt,
      notes: r.notes ?? null,
    };
  },

  async deleteClaim(userId: string, id: string) {
    const rows = await db
      .delete(instantClaims)
      .where(and(eq(instantClaims.userId, userId), eq(instantClaims.id, id)))
      .returning();
    return rows[0] ?? null;
  },

  /**
   * Partial edit of one claim — the path for a mistyped amount.
   *
   * `instant_claims` has NO updated_at column, unlike `instant_accounts`, so a
   * correction leaves no trail. That is deliberate: a claim is an EVENT, and the
   * alternative (delete + re-log) loses the same information while also moving the
   * row's created_at. Only the keys present are written.
   */
  async updateClaim(
    userId: string,
    id: string,
    patch: { amount?: number; claimedAt?: string; notes?: string | null },
  ) {
    const set: Record<string, unknown> = {};
    if (patch.amount !== undefined) set.amount = String(patch.amount);
    if (patch.claimedAt !== undefined) set.claimedAt = patch.claimedAt;
    if (patch.notes !== undefined) set.notes = patch.notes;

    const rows = await db
      .update(instantClaims)
      .set(set as any)
      .where(and(eq(instantClaims.userId, userId), eq(instantClaims.id, id)))
      .returning();
    if (!rows[0]) return null;
    // Same shape as log-claim, so a client can treat an edit response like a create.
    const r: any = rows[0];
    return {
      id: r.id,
      accountId: r.account_id ?? r.accountId,
      amount: round2(n(r.amount)),
      claimedAt: r.claimed_at ?? r.claimedAt,
      notes: r.notes ?? null,
    };
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
