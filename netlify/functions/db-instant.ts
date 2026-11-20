import type { Handler } from '@netlify/functions';
import { json, getUserFromSession } from './_utils';
import { instantService, INSTANT_FUNDING_SOURCES, InstantRenameError } from '../../server/db/instantService';
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
/** A batch rename is a correction, not a bulk import — 200 is generous and bounded. */
const MAX_RENAME = 200;
/** `V107` today; capped so nothing can be smuggled in as a label. */
const NICKNAME_MAX = 24;

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
    //
    // `stats` carries the derived figures PLUS the money-risk ones, all scoped to the
    // filter: hitRate, winningAccounts, losingAccounts, grossWin, grossLoss,
    // profitFactor, and daily / weekly / monthly P&L rows (newest first).
    // `profitFactor` is null when nothing has lost yet — that is UNDEFINED, not 1.00.
    // `hitRate` counts only accounts that came out AHEAD: a break-even account is not a
    // hit, and an account that claimed less than its price is a loser even though it paid.
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

    // Buy N instant accounts in ONE statement — each is its own card, so "15 bought,
    // 13 dead, 2 alive" stays trackable.
    // Fields: count (1-50), firm (default 'Vest Markets'), accountSize (trading capital:
    // 500/5000/10000/25000), cost (REQUIRED), purchasedAt (YYYY-MM-DD), fundingSource
    // (card|crypto|credit), notes, budgetAccountId, startAt.
    // `startAt` names the batch yourself: the FIRST V<n> to use, e.g. startAt 108 for ten
    // accounts. Omit it and numbering continues from the highest V<n> in the table, which
    // is wrong whenever Vest's own numbering has run ahead of ours (accounts bought and
    // never logged) — Vest's screen is the only place the true number lives. A startAt
    // that would reuse a name in use is REFUSED with code `nickname_taken` and the
    // offending numbers, and nothing is created.
    // ⚠️ cost is REQUIRED and is NEVER the account size — it is the price actually paid.
    // Vest's ladder is nominal and promos move it ($500->$10, $5k->$200, but a $5k promo
    // can be $190), so omitting it is REFUSED (missing_cost) rather than inferred:
    // inferring would book the SIZE as an expense, i.e. $5,000 charged for a $190 purchase.
    // ⚠️ budgetAccountId is the account the money came OUT of; the purchase books a
    // prop-firm EXPENSE named `Instant — <firm> <size> (<nickname>)` there and moves its
    // balance, exactly like an eval purchase. Omit it and the cards are still created but
    // NO expense is booked — the response says so in `warnings`.
    // FIRM: cost-per-payout and break-even differ per firm, so pass it whenever it isn't
    // Vest, and read back with `GET ?firm=`. MONEY MODEL: cost is 100% sunk — it IS the
    // max drawdown and never comes back; re-check that per firm.
    // RETRY-SAFE: send idempotencyKey (any unique string). A retry returns the ORIGINAL
    // result with idempotentReplay: true instead of buying twice — a Netlify timeout after
    // the write makes bots retry.
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
      // `cost` IS REQUIRED, and deliberately not defaulted to the account size.
      //
      // It used to default, which was harmless only while every purchase was $9.50: the
      // real product price is NEVER derivable from the size (Vest: $500->$10, $5k->$200
      // — and a promo can make a $5k cost $190). A bot that forgot the field would have
      // booked a $5,000 EXPENSE against a real account for a $190 purchase. Failing
      // loudly is the only safe answer: an instant price is a fact about the purchase,
      // not something the API can infer.
      if (input.cost == null) {
        return json(400, {
          error: 'cost is required — the price actually paid (e.g. 190). It is NOT the ' +
            'account size: a $5,000 instant account can cost $190.',
          code: 'missing_cost',
        });
      }
      const cost = positive(input.cost);
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

      // `startAt` — the first V<n> of the batch. Needed because Vest's own numbering can
      // run ahead of ours (accounts bought and never logged), and then every
      // server-generated number is off by however many were missed. Refused if it would
      // REUSE a name already in use: two cards called V98 is worse than a gap.
      let startAt: number | null = null;
      if (input.startAt != null) {
        const s = Math.trunc(Number(input.startAt));
        if (!Number.isFinite(s) || s < 1) {
          return json(400, { error: 'startAt must be a positive whole number', code: 'bad_start_at' });
        }
        const taken = await instantService.takenNicknames(user.id, s, s + count - 1);
        if (taken.length > 0) {
          return json(400, {
            error: `nicknames already in use: ${taken.join(', ')} — choose a startAt that avoids them`,
            code: 'nickname_taken',
            taken,
          });
        }
        startAt = s;
      }

      // Wrap an OBJECT, not the bare array: withIdempotency replays a stored
      // response by spreading it, and spreading an array yields a plain object
      // — a replayed buy would then report "created: 0" and look like it failed.
      const result = await withIdempotency(
        user.id,
        typeof input.idempotencyKey === 'string' ? input.idempotencyKey : undefined,
        'instant.buy-accounts',
        async () => {
          const bought = await instantService.buyAccounts(user.id, {
            count,
            firm: firm.firm,
            startAt,
            accountSize,
            cost,
            purchasedAt,
            fundingSource: input.fundingSource ?? null,
            notes: input.notes != null ? String(input.notes) : null,
            // The money side: the purchase books a prop-firm expense out of this
            // account, exactly like an eval purchase, inside the same transaction.
            budgetAccountId: typeof input.budgetAccountId === 'string' ? input.budgetAccountId : null,
          });
          return { accounts: bought.accounts, warnings: bought.warnings };
        },
      );
      const accounts = result?.accounts ?? [];
      return json(200, {
        created: accounts.length,
        accounts,
        warnings: result?.warnings ?? [],
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
        // Refuse a name another card already has — two cards labelled the same render as the
        // same "Account N" and the duplicate is invisible until a number looks wrong.
        const holder = await instantService.nicknameHolder(user.id, nickname, id);
        if (holder) {
          return json(400, {
            error: `another card is already called ${nickname} (${holder}) — use rename-accounts to swap two names`,
            code: 'nickname_taken',
            taken: [nickname],
          });
        }
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

      // `budgetAccountId` on its own is meaningful: it ATTACHES a ledger row to a card
      // that never had one (every account logged before instant purchases reached the
      // budget), which is how a backfill is done one card at a time.
      const budgetAccountId = typeof input.budgetAccountId === 'string' && input.budgetAccountId.trim()
        ? input.budgetAccountId.trim()
        : null;
      if (Object.keys(patch).length === 0 && !budgetAccountId) {
        return json(400, { error: 'nothing to update', code: 'empty_patch' });
      }

      const account = await instantService.updateAccount(user.id, id, patch as any, { budgetAccountId });
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
      // The budget entries the card and its claims had booked are reversed with it —
      // money that is still missing from a balance after a delete is a silent lie.
      return json(200, {
        deleted: deleted.id,
        cascadedClaims: deleted.cascadedClaims,
        cascadedClaimsCount: deleted.cascadedClaimsCount,
        removedBudgetEntries: deleted.removedBudgetEntries,
      });
    }

    // ── rename-accounts ──────────────────────────────────────────────────────

    // Rename MANY cards in ONE call. Vest's numbering does not follow purchase order
    // (Daniel: "I got the 100s, the accounts above 100…"), so a batch routinely needs
    // renumbering after the fact. Doing that one card at a time — highest number first, to
    // dodge collisions — is exactly where a half-finished renumber leaves a card wearing the
    // wrong number.
    // Fields: renames, a non-empty array of {id, nickname} (max 200 per call).
    // SWAPS ARE LEGAL: because a target name may belong to another card in the SAME request,
    // V96 and V97 can be exchanged in one call. A name held by a card OUTSIDE the request is
    // refused (`nickname_taken`, with the offending names in `taken`), and the same name twice
    // in one request is refused (`duplicate_in_request`). Names compare case-insensitively,
    // since the UI renders `V98` and `v98` as the same "Account 98".
    // ATOMIC: every rename lands or none does. Each card's budget expense row is renamed with
    // it, in place — no balance moves, because a rename is not a money event.
    // No idempotencyKey needed: re-running the same list is a no-op.
    if (input.action === 'rename-accounts') {
      const raw = Array.isArray(input.renames) ? input.renames : null;
      if (!raw || raw.length === 0) {
        return json(400, { error: 'renames must be a non-empty array of {id, nickname}', code: 'bad_renames' });
      }
      if (raw.length > MAX_RENAME) {
        return json(400, { error: `at most ${MAX_RENAME} renames per call`, code: 'too_many_renames' });
      }
      const cleaned: { id: string; nickname: string }[] = [];
      for (const r of raw) {
        const rid = typeof r?.id === 'string' ? r.id.trim() : '';
        const nick = typeof r?.nickname === 'string' ? r.nickname.trim() : '';
        if (!rid) return json(400, { error: 'every rename needs an id', code: 'no_id' });
        if (!nick) return json(400, { error: `empty nickname for ${rid}`, code: 'no_nickname' });
        if (nick.length > NICKNAME_MAX) {
          return json(400, { error: `nickname too long (max ${NICKNAME_MAX}): ${nick}`, code: 'bad_nickname' });
        }
        cleaned.push({ id: rid, nickname: nick });
      }
      try {
        const out = await instantService.renameAccounts(user.id, cleaned);
        return json(200, { renamed: out.renamed, accounts: out.accounts });
      } catch (err) {
        // A refused rename is a 400 with the reason, never a 500 — it is a request problem.
        if (err instanceof InstantRenameError) {
          return json(400, { error: err.message, code: err.code, taken: err.taken });
        }
        throw err;
      }
    }

    // ── log-claim ────────────────────────────────────────────────────────────

    // Record ONE Claim Profit request. Vest pays on demand with no minimum, so the
    // same account can claim many times — each claim is its own row.
    // Fields: accountId, amount, claimedAt (YYYY-MM-DD), budgetAccountId, notes.
    // `amount` MUST be POST-split: the figure Vest actually credits after the 95%
    // split. Storing a pre-split figure inflates every money statistic in the tab by
    // ~5% and cannot be detected after the fact.
    // DESTINATION: a claim lands in `acc_vest` ("Vest balance"), NOT a bank account —
    // the money sits at Vest for ~24h, then spends ~24h moving as crypto. So pass
    // `budgetAccountId: "acc_vest"`, and record each later leg as a `transfer`
    // (vest -> kraken -> bank) dated when the money actually arrived. Buying MORE
    // accounts from that Vest balance is an expense against `acc_vest`, which leaves
    // Sofi untouched. Do not default a claim into a bank account.
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
            // EXPLICIT, never automatic — a claim still sitting on the firm's platform
            // is not in a bank account yet. Omit it and the response warns.
            budgetAccountId: typeof input.budgetAccountId === 'string' ? input.budgetAccountId : null,
          }),
        }),
      );
      const claim = result?.claim ?? null;
      if (!claim) return json(404, { error: `Account ${accountId} not found`, code: 'no_account' });
      return json(200, {
        claim,
        warnings: claim.warnings ?? [],
        idempotentReplay: result?.idempotentReplay === true,
      });
    }

    // ── update-claim ─────────────────────────────────────────────────────────

    // Fix a mistyped payout in place. Fields: id (required), amount, claimedAt
    // (YYYY-MM-DD), notes, budgetAccountId. `amount` is POST-split, exactly as
    // log-claim requires. Partial — send only what changed. For a payout that should
    // not exist at all, use delete-claim instead.
    // `budgetAccountId` books (or re-books) the income entry: send it to move a claim
    // into the Budget tab, which is how a claim logged while the money was still on
    // the platform gets booked once it lands.
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
      const budgetAccountId = typeof input.budgetAccountId === 'string' && input.budgetAccountId.trim()
        ? input.budgetAccountId.trim()
        : null;
      if (budgetAccountId) patch.budgetAccountId = budgetAccountId;

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
