import type { Handler } from '@netlify/functions';
import { json, getUserFromSession } from './_utils';
import { instantService, INSTANT_FUNDING_SOURCES } from '../../server/db/instantService';
import { withIdempotency } from '../../server/db/stateService';

/**
 * Vest Markets instant accounts — the Instant tab's API.
 *
 * DELIBERATELY ISOLATED. This endpoint touches only the `instant_*` tables. It
 * cannot read or write `challenges` / `trading_accounts`, so nothing here can
 * affect an eval statistic. The Funded Pass Rate is derived from `challenges`,
 * and an instant account has no evaluation — the two must never mix.
 *
 * Money takes POST-split figures. `cost` is a sunk expense; instant accounts
 * cannot receive deposits and the payment is never recoverable.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BATCH = 50;

const isDate = (v: unknown): v is string => typeof v === 'string' && DATE_RE.test(v);
const isFundingSource = (v: unknown): boolean =>
  typeof v === 'string' && (INSTANT_FUNDING_SOURCES as readonly string[]).includes(v);

const positive = (v: unknown): number | null => {
  const num = Number(v);
  return Number.isFinite(num) && num > 0 ? num : null;
};

/** Firm names are filter keys, so they are length-capped and never blank. */
const FIRM_MAX = 60;

/**
 * `undefined` / `null` → "not specified" (the caller applies the default).
 * A blank or over-long value is an ERROR, not a silent default: a bot passing an
 * empty variable would otherwise file accounts under the wrong firm, and a firm is
 * a statistics boundary — every cost-per-payout figure depends on it.
 */
const parseFirm = (v: unknown): { ok: true; firm: string | null } | { ok: false } => {
  if (v === undefined || v === null) return { ok: true, firm: null };
  const s = String(v).trim();
  if (!s || s.length > FIRM_MAX) return { ok: false };
  return { ok: true, firm: s };
};

export const handler: Handler = async (event) => {
  try {
    const user = await getUserFromSession(event);
    if (!user) return json(401, { error: 'Unauthorized' });

    // ── READ ─────────────────────────────────────────────────────────────────
    // One shape for the whole tab: stats + account cards + claim history. The UI
    // never derives a total of its own.
    //
    // FILTER BY FIRM: `?firm=Vest%20Markets` scopes accounts, claims AND stats to
    // one firm. Use it whenever a per-firm figure is what matters — cost-per-payout
    // and break-even are firm-specific, so a blended number averages two different
    // products. Omit it and you get every firm added together.
    // `firms` is ALWAYS the unfiltered list of firms this user holds, so a filter
    // control can still offer the others while one is selected.
    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      if (params.action && params.action !== 'list') {
        return json(400, { error: `Unknown action "${params.action}". Use: list` });
      }
      const firm = params.firm && params.firm.trim() ? params.firm.trim() : null;
      const filter = { firm };
      const [accounts, claims, stats, firms] = await Promise.all([
        instantService.listAccounts(user.id, filter),
        instantService.listClaims(user.id, filter),
        instantService.stats(user.id, filter),
        instantService.listFirms(user.id),
      ]);
      return json(200, { accounts, claims, stats, firms, firm });
    }

    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

    const input = JSON.parse(event.body || '{}');

    // ── buy-accounts ─────────────────────────────────────────────────────────

    // Buy N instant accounts in ONE statement. Every account is its own card, so
    // "15 bought, 13 dead, 2 alive" stays trackable.
    // Fields: count (1-50), firm (default 'Vest Markets'), accountSize (trading
    // capital — Vest: 500 / 5000 / 10000 / 25000), cost (defaults to accountSize),
    // purchasedAt (YYYY-MM-DD), fundingSource (card|crypto|credit), notes.
    // FIRM: instant products are now sold by more than one firm, and cost-per-payout
    // and break-even DIFFER per firm, so always pass it when it isn't Vest. Read back
    // with `GET ?firm=` to keep one firm's figures out of another's.
    // MONEY MODEL: the price IS the max drawdown — Vest: $500->$10, $5k->$200,
    // $10k->$400, $25k->$1,000 — and it is NEVER recoverable, because Vest funded
    // accounts cannot receive deposits and the trading capital is Vest's. Re-check
    // that assumption per firm; not every instant product refunds nothing.
    // Record it as sunk expense, never as equity or a deposit. This purchase does
    // NOT touch the budget side.
    // RETRY-SAFE: send idempotencyKey (any unique string per statement, e.g. a UUID).
    // A retried call returns the ORIGINAL result with idempotentReplay: true instead of
    // buying the accounts twice — a Netlify timeout after the write makes bots retry.
    if (input.action === 'buy-accounts') {
      const count = Math.trunc(Number(input.count));
      if (!Number.isFinite(count) || count < 1 || count > MAX_BATCH) {
        return json(400, {
          error: `count must be 1-${MAX_BATCH}`,
          code: 'bad_count',
        });
      }
      const accountSize = positive(input.accountSize);
      if (accountSize === null) {
        return json(400, { error: 'accountSize must be a positive number', code: 'bad_size' });
      }
      const cost = input.cost == null ? accountSize : positive(input.cost);
      if (cost === null) {
        return json(400, { error: 'cost must be a positive number', code: 'bad_cost' });
      }
      const purchasedAt = isDate(input.purchasedAt)
        ? input.purchasedAt
        : new Date().toISOString().slice(0, 10);
      if (input.fundingSource != null && !isFundingSource(input.fundingSource)) {
        return json(400, {
          error: `fundingSource must be one of: ${INSTANT_FUNDING_SOURCES.join(', ')}`,
          code: 'bad_funding_source',
        });
      }
      const firm = parseFirm(input.firm);
      if (!firm.ok) {
        return json(400, {
          error: `firm must be a non-empty name of ${FIRM_MAX} characters or fewer`,
          code: 'bad_firm',
        });
      }

      // Wrap an OBJECT, not the bare array: withIdempotency replays a stored
      // response by spreading it, and spreading an array yields a plain object
      // — a replayed buy would then report "created: 0" and look like it failed.
      const result = await withIdempotency(
        user.id,
        typeof input.idempotencyKey === 'string' ? input.idempotencyKey : undefined,
        'instant.buy-accounts',
        async () => ({
          accounts: await instantService.buyAccounts(user.id, {
            count,
            firm: firm.firm,
            accountSize,
            cost,
            purchasedAt,
            fundingSource: input.fundingSource ?? null,
            notes: input.notes != null ? String(input.notes) : null,
          }),
        }),
      );
      const accounts = result?.accounts ?? [];
      return json(200, {
        created: accounts.length,
        accounts,
        idempotentReplay: result?.idempotentReplay === true,
      });
    }

    // ── update-account ───────────────────────────────────────────────────────

    // Partial edit of one card — send only what changed.
    // Fields: id (required), nickname, firm, accountSize, cost, purchasedAt,
    // status ('alive'|'dead'), diedAt, fundingSource, notes.
    // status 'dead' sets diedAt to today unless one is supplied; setting it back to
    // 'alive' CLEARS diedAt, so a stale date can never fake a lifespan.
    if (input.action === 'update-account') {
      const id = typeof input.id === 'string' ? input.id : '';
      if (!id) return json(400, { error: 'id required', code: 'no_id' });

      const patch: Record<string, unknown> = {};
      if (input.nickname !== undefined) {
        const nickname = String(input.nickname).trim();
        if (!nickname) return json(400, { error: 'nickname cannot be empty', code: 'no_nickname' });
        patch.nickname = nickname;
      }
      const firm = parseFirm(input.firm);
      if (!firm.ok) {
        return json(400, {
          error: `firm must be a non-empty name of ${FIRM_MAX} characters or fewer`,
          code: 'bad_firm',
        });
      }
      if (firm.firm !== null) patch.firm = firm.firm;
      if (input.accountSize !== undefined) {
        const v = positive(input.accountSize);
        if (v === null) return json(400, { error: 'accountSize must be positive', code: 'bad_size' });
        patch.accountSize = v;
      }
      if (input.cost !== undefined) {
        const v = positive(input.cost);
        if (v === null) return json(400, { error: 'cost must be positive', code: 'bad_cost' });
        patch.cost = v;
      }
      if (input.purchasedAt !== undefined) {
        if (!isDate(input.purchasedAt)) {
          return json(400, { error: 'purchasedAt must be YYYY-MM-DD', code: 'bad_date' });
        }
        patch.purchasedAt = input.purchasedAt;
      }
      if (input.status !== undefined) {
        if (input.status !== 'alive' && input.status !== 'dead') {
          return json(400, { error: 'status must be alive or dead', code: 'bad_status' });
        }
        patch.status = input.status;
      }
      if (input.diedAt !== undefined && input.diedAt !== null) {
        if (!isDate(input.diedAt)) {
          return json(400, { error: 'diedAt must be YYYY-MM-DD', code: 'bad_date' });
        }
        patch.diedAt = input.diedAt;
      }
      if (input.fundingSource !== undefined) {
        if (input.fundingSource !== null && !isFundingSource(input.fundingSource)) {
          return json(400, { error: 'bad fundingSource', code: 'bad_funding_source' });
        }
        patch.fundingSource = input.fundingSource;
      }
      if (input.notes !== undefined) patch.notes = input.notes === null ? null : String(input.notes);

      if (Object.keys(patch).length === 0) {
        return json(400, { error: 'nothing to update', code: 'empty_patch' });
      }

      const account = await instantService.updateAccount(user.id, id, patch as any);
      if (!account) return json(404, { error: `Account ${id} not found`, code: 'no_account' });
      return json(200, { account });
    }

    // ── delete-account ───────────────────────────────────────────────────────

    // Remove one card. Fields: id.
    // Its claims are CASCADE-deleted with it — an account cannot be deleted while its
    // payouts survive. Use this for a mistaken purchase, NOT for a blown account
    // (that is update-account status 'dead', which keeps the card and its history).
    if (input.action === 'delete-account') {
      const id = typeof input.id === 'string' ? input.id : '';
      if (!id) return json(400, { error: 'id required', code: 'no_id' });
      const deleted = await instantService.deleteAccount(user.id, id);
      if (!deleted) return json(404, { error: `Account ${id} not found`, code: 'no_account' });
      return json(200, { deleted: deleted.id, cascadedClaims: true });
    }

    // ── log-claim ────────────────────────────────────────────────────────────

    // Record ONE Claim Profit request. Vest pays on demand with no minimum, so the
    // same account can claim many times — each claim is its own row.
    // Fields: accountId, amount, claimedAt (YYYY-MM-DD), notes.
    // `amount` MUST be POST-split: the figure Vest actually credits after the 95%
    // split. Storing a pre-split figure inflates every money statistic in the tab by
    // ~5% and cannot be detected after the fact.
    // RETRY-SAFE: send idempotencyKey (any unique string per claim). A retried call
    // returns the ORIGINAL claim with idempotentReplay: true instead of crediting the
    // same payout twice — double-counting money is the failure this prevents.
    if (input.action === 'log-claim') {
      const accountId = typeof input.accountId === 'string' ? input.accountId : '';
      if (!accountId) return json(400, { error: 'accountId required', code: 'no_account_id' });
      const amount = positive(input.amount);
      if (amount === null) {
        return json(400, { error: 'amount must be a positive number', code: 'bad_amount' });
      }
      const claimedAt = isDate(input.claimedAt)
        ? input.claimedAt
        : new Date().toISOString().slice(0, 10);

      // Object-wrapped for the same replay reason as buy-accounts.
      const result = await withIdempotency(
        user.id,
        typeof input.idempotencyKey === 'string' ? input.idempotencyKey : undefined,
        'instant.log-claim',
        async () => ({
          claim: await instantService.logClaim(user.id, {
            accountId,
            amount,
            claimedAt,
            notes: input.notes != null ? String(input.notes) : null,
          }),
        }),
      );
      const claim = result?.claim ?? null;
      if (!claim) return json(404, { error: `Account ${accountId} not found`, code: 'no_account' });
      return json(200, { claim, idempotentReplay: result?.idempotentReplay === true });
    }

    // ── update-claim ─────────────────────────────────────────────────────────

    // Fix a mistyped payout in place. Fields: id (required), amount, claimedAt
    // (YYYY-MM-DD), notes. `amount` is POST-split, exactly as log-claim requires.
    // Partial — send only what changed. For a payout that should not exist at all,
    // use delete-claim instead.
    if (input.action === 'update-claim') {
      const id = typeof input.id === 'string' ? input.id : '';
      if (!id) return json(400, { error: 'id required', code: 'no_id' });

      const patch: Record<string, unknown> = {};
      if (input.amount !== undefined) {
        const v = positive(input.amount);
        if (v === null) {
          return json(400, { error: 'amount must be a positive number', code: 'bad_amount' });
        }
        patch.amount = v;
      }
      if (input.claimedAt !== undefined) {
        if (!isDate(input.claimedAt)) {
          return json(400, { error: 'claimedAt must be YYYY-MM-DD', code: 'bad_date' });
        }
        patch.claimedAt = input.claimedAt;
      }
      if (input.notes !== undefined) patch.notes = input.notes === null ? null : String(input.notes);

      if (Object.keys(patch).length === 0) {
        return json(400, { error: 'nothing to update', code: 'empty_patch' });
      }

      const claim = await instantService.updateClaim(user.id, id, patch as any);
      if (!claim) return json(404, { error: `Claim ${id} not found`, code: 'no_claim' });
      return json(200, { claim });
    }

    // ── delete-claim ─────────────────────────────────────────────────────────

    // Remove one payout row. Fields: id. For a payout that never happened (or was
    // logged twice); update-claim handles a wrong amount without losing the row.
    if (input.action === 'delete-claim') {
      const id = typeof input.id === 'string' ? input.id : '';
      if (!id) return json(400, { error: 'id required', code: 'no_id' });
      const deleted = await instantService.deleteClaim(user.id, id);
      if (!deleted) return json(404, { error: `Claim ${id} not found`, code: 'no_claim' });
      return json(200, { deleted: deleted.id });
    }

    return json(400, {
      error:
        `Unknown action "${input.action}". Use: buy-accounts, update-account, ` +
        'delete-account, log-claim, update-claim, delete-claim',
    });
  } catch (err: any) {
    console.error('db-instant error:', err);
    return json(500, { error: 'Internal Server Error', detail: String(err?.message || err) });
  }
};
