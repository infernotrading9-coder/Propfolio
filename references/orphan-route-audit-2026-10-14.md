# Orphan-Route Audit (Oct 14 2026)

> Scope: 7 Netlify function candidates flagged earlier from a string-search
> grep. Audited against `src/` (frontend), `server/` (server-side), the bot's
> skill on the trading profile, all bot scripts in `/root/trading-risk-assistant/`,
> both versions of `PROPFOLIO-BOT-GUIDE.md`, and the migration harnesses.

## Summary table

| File | LOC | Frontend fetch? | Server-side import? | Bot script? | Bot skill/guide? | Migration harness? | Recommendation |
|---|---:|---|---|---|---|---|---|
| `db-state.ts` | 91 | ❌ grep hit was substring of `db-state-full` | ❌ | ❌ | ❌ (only `db-state-full` referenced) | ✅ still in `test-new-features.mts`, `test-trades-retired.mts`, `test-bot-notes.mts` | **Likely orphan. Hards:** migration harnesses call the path; need to update harnesses *before* delete. |
| `db-budget.ts` | 180 | ❌ grep hit was substring of `db-budget-state` | ❌ | ❌ (only `db-budget-state`) | ❌ | ✅ in `test-new-features.mts`, `test-trades-retired.mts`, `verify-budget-endpoints.sh` | **Likely orphan. Same harness caveat.** |
| `db-firms.ts` | 23 | ❌ zero hits | ❌ | ❌ | ❌ | ❌ zero | **Strong orphan candidate. Smallest of the seven.** |
| `db-bulk.ts` | 43 | ❌ zero hits | ❌ | ❌ | ❌ | ❌ zero | **Strong orphan candidate.** |
| `db-payouts.ts` | 29 | ❌ zero hits | ❌ | ❌ | ❌ | ❌ zero | **Strong orphan candidate.** |
| `db-phase.ts` | 37 | ❌ zero hits | ❌ | ❌ | ❌ | ✅ `44-regression-connected-writes.ts` | **Likely orphan. Harness caveat.** |
| `db-bot-notes.ts` | 122 | ❌ | ❌ (only doc references in `stateService.ts` comments) | ❌ no `.mjs` actually POSTs to it | ✅ skill mentions `bot_notes` data, but it travels in `db-state-full` `botNotes` field — no fetch needed | ✅ `test-bot-notes.mts` | **NOT orphan. It is the bot's contract to write facts.** Keep. |

## Why each "strong orphan" is safe to delete (and what protects us)

**`db-firms.ts`** (23 lines)
- Exports a single handler. Takes only GETs.
- `propFirmService.getByUserId(...)` is what it calls — same as `db-accounts.ts` uses internally.
- The frontend never calls `db-firms`. Firm lists come back as `firms[]` inside `db-state`/`db-state-full` payloads.
- No harnesses reference it.

**`db-bulk.ts`** (43 lines)
- Uses raw SQL via `server/db/connection` + `drizzle-orm`'s `sql` tag.
- No frontend fetch. No bot usage. No harness usage.
- Suggests this was an early-batch-eval endpoint, since `cascadeService.buyEvalBatch` now exists and `db-challenges { action: 'buy-eval', accounts: [...] }` is the documented batch path.

**`db-payouts.ts`** (29 lines)
- Frontend never fetches it. Bot never calls it.
- Recording payouts goes through `db-trades { action: 'record-payout' }` — that's in `PROPFOLIO-BOT-GUIDE.md` §5.
- This is a thin wrapper around `payoutService` that nothing uses.

## The four "likely orphans with caveats"

These have **at least one** test or regression harness that names the path, but **no production caller**. The harnesses are tests we control — they aren't users.

**`db-state.ts`** (91 lines)
- Imports `dashboardService, payoutService` from `server/db/service`. Used by the legacy `dbStateService.getUserData()`.
- The newer `db-state-full.ts` calls `getFullState()` directly — different shape, richer.
- 3 test harnesses call it. The harnesses would have to update — the migration scripts `test-trades-retired.mts`, `test-new-features.mts`, `test-bot-notes.mts`. Each one is internal-only; updating them is low-risk, but it is more than one file.

**`db-budget.ts`** (180 lines)
- Larger than `db-state`. Re-reads `budgetTransactionService.getByUserId()` + `budgetAccountService.getByUserId()`.
- The modern `db-budget-state.ts` writes & reads from the same `budget_state` table.
- 3 test references: same harnesses + `verify-budget-endpoints.sh`.

**`db-phase.ts`** (37 lines)
- Calls `challengeService` with a single "phase" intent.
- `db-challenges { action: 'phase' }` likely redundant.
- 1 test harness: `44-regression-connected-writes.ts`.

## What I'm NOT proposing

I am **not** proposing any of:
- Touching `server/db/*Service.ts` (those are imported by live endpoints).
- Touching the 4 *modern* endpoints (`db-accounts`, `db-challenges`, `db-state-full`, `db-budget-state`, `db-trades`, `db-personal-trades`, `db-prop-trades`, `db-notes`, `db-calendar`, `trading-mode`, `daily-agenda`).
- The bot's skill files in `/root/.hermes/profiles/trading/skills/`.
- The 70 migration scripts (harnesses that test these orphans MAY need edits — those edits are scoped to the harnesses, not to live code).

## My recommendation — proceed in two waves

**Wave 1 — safe now, smallest, no harness edits needed:**
- `git rm` `db-firms.ts` (23 lines)
- `git rm` `db-bulk.ts` (43 lines)
- `git rm` `db-payouts.ts` (29 lines)
- 95 lines of dead handler code. No harness, no bot, no frontend touches.
- After: run `tsc` and `vite build` to confirm nothing else imports them. (I checked — nothing does.)

**Wave 2 — only after Daniel signs off on the harness updates:**
- `db-state.ts`, `db-budget.ts`, `db-phase.ts` delete + edit 3-4 migration harnesses to remove the path assertions.

**Keep (NOT orphans despite old grep noise):**
- `db-bot-notes.ts` — bot's only write path for `bot_notes` table. Live when the bot has facts to set; the data rides along on every `db-state-full`. Cannot be deleted without breaking the bot's scratchpad.

## Verification gate before Wave 1

Confirm `git grep "^import.*db-firms\b\|^import.*db-bulk\b\|^import.*db-payouts\b"` returns no hits across `src/`, `server/`, `netlify/functions/`, `migration/`. Then:
1. `git rm netlify/functions/db-firms.ts netlify/functions/db-bulk.ts netlify/functions/db-payouts.ts`
2. `node ./node_modules/.bin/tsc --noEmit`
3. `./node_modules/.bin/esbuild` sweep over the remaining functions
4. `npm run build` (full vite build)
5. `node migration/scripts/test-balance-and-undo.mts` (must pass 48/48)
6. `node migration/scripts/test-payout-tracker.mjs` (must pass 17/17)

If all green, we have 3 dead handlers out of `netlify/`. No live behavior change. No bot contract change.

**Wave 2** is a separate session — harness updates are out of scope for today.
