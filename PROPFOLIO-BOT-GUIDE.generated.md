# PROPFOLIO Bot Guide (GENERATED)

> ⚠️  This file is **generated** by `scripts/generate-bot-guide.mjs`
> from the code in `netlify/functions/*.ts`. Do not edit by hand.
>
> Regenerate with: `node scripts/generate-bot-guide.mjs`
> The pre-existing `PROPFOLIO-BOT-GUIDE.md` is the human-curated
> prose; this generated file is the *machine-readable contract*.

---

## `db-accounts.ts`

```
POST /.netlify/functions/db-accounts
{ "action": "<one of the actions below>", ...fields }
```

### `add-trading-mode-rule`

* style: `if` · source: `db-accounts.ts:731`

_No description in code — read the source at the line above._

### `correct-plan`

* style: `if` · source: `db-accounts.ts:315`

Set daily order

### `create`

* style: `if` · source: `db-accounts.ts:259`

Create a new trading account

### `daily-order`

* style: `if` · source: `db-accounts.ts:131`

Personal-account risk per trade. Fixed-dollar floor by mode, with 1% of the personal balance taking over once it exceeds the floor (crossover at $5,000 when 1% = $50). Fixed $, never a % of balance for small accounts.

### `daily-orders`

* style: `if` · source: `db-accounts.ts:161`

Get all daily orders

### `done-for-day`

* style: `if` · source: `db-accounts.ts:666`

Mark account as done for the day

### `edit-trading-mode`

* style: `if` · source: `db-accounts.ts:779`

_No description in code — read the source at the line above._

### `get-session-limits`

* style: `if` · source: `db-accounts.ts:155`

Get session limits

### `get-trading-mode`

* style: `if` · source: `db-accounts.ts:138`

Personal-account risk per trade. Fixed-dollar floor by mode, with 1% of the personal balance taking over once it exceeds the floor (crossover at $5,000 when 1% = $50). Fixed $, never a % of balance for small accounts.

### `link-copy-trade`

* style: `if` · source: `db-accounts.ts:622`

Link accounts as copy-trades (group them under one label)

### `list-trading-mode-rules`

* style: `if` · source: `db-accounts.ts:719`

Trading Mode rules — managed by bot, read by widget

### `list-trading-modes`

* style: `if` · source: `db-accounts.ts:762`

Trading Mode rules — list from DB (bot-managed)

### `remove-trading-mode-rule`

* style: `if` · source: `db-accounts.ts:738`

_No description in code — read the source at the line above._

### `reorder`

* style: `if` · source: `db-accounts.ts:787`

Reorder accounts

### `set-account-number`

* style: `if` · source: `db-accounts.ts:329`

_No description in code — read the source at the line above._

### `set-account-size`

* style: `if` · source: `db-accounts.ts:445`

_No description in code — read the source at the line above._

### `set-balance`

* style: `if` · source: `db-accounts.ts:542`

_No description in code — read the source at the line above._

### `set-daily-order`

* style: `if` · source: `db-accounts.ts:608`

_No description in code — read the source at the line above._

### `set-green-days`

* style: `if` · source: `db-accounts.ts:492`

_No description in code — read the source at the line above._

### `set-nickname`

* style: `if` · source: `db-accounts.ts:393`

_No description in code — read the source at the line above._

### `set-session-limits`

* style: `if` · source: `db-accounts.ts:751`

_No description in code — read the source at the line above._

### `set-trading-mode-rules`

* style: `if` · source: `db-accounts.ts:724`

_No description in code — read the source at the line above._

### `uncollapse-all`

* style: `if` · source: `db-accounts.ts:681`

_No description in code — read the source at the line above._

### `unlink-copy-trade`

* style: `if` · source: `db-accounts.ts:650`

_No description in code — read the source at the line above._

### `update-trading-mode`

* style: `if` · source: `db-accounts.ts:700`

_No description in code — read the source at the line above._

## `db-budget-state.ts`

```
POST /.netlify/functions/db-budget-state
{ "action": "<one of the actions below>", ...fields }
```

### `accounts`

* style: `if` · source: `db-budget-state.ts:104`

Coerce the stored recurring list into a known shape. Entries predating this model (or written by hand in the browser) may be missing `active` — an entry with no flag is treated as ACTIVE, because silently switching off a charge Daniel is still paying would understate his cost of living.

### `add-budget-account`

* style: `switch` · source: `db-budget-state.ts:224`

_No description in code — read the source at the line above._

### `add-recurring`

* style: `switch` · source: `db-budget-state.ts:291`

_No description in code — read the source at the line above._

### `delete-recurring`

* style: `switch` · source: `db-budget-state.ts:350`

_No description in code — read the source at the line above._

### `delete-transaction`

* style: `if` · source: `db-budget-state.ts:143`

delete-transaction — remove a transaction by id

### `get-cost-of-living`

* style: `switch` · source: `db-budget-state.ts:401`

_No description in code — read the source at the line above._

### `get-recurring`

* style: `switch` · source: `db-budget-state.ts:279`

── Recurring charges ───────────────────────────────────────── A recurring charge is a DEFINITION (rent, car + insurance), not a transaction. It lives in its own list so the bot can SEE what repeats without inferring it, and so a charge can be switched off the moment the underlying thing is paid off — without editing history or deleting the record of what it used to cost.

### `log-expense`

* style: `switch` · source: `db-budget-state.ts:182`

_No description in code — read the source at the line above._

### `log-income`

* style: `switch` · source: `db-budget-state.ts:183`

_No description in code — read the source at the line above._

### `reconcile-balances`

* style: `switch` · source: `db-budget-state.ts:410`

_No description in code — read the source at the line above._

### `remove-budget-account`

* style: `switch` · source: `db-budget-state.ts:250`

_No description in code — read the source at the line above._

### `set-overdue`

* style: `switch` · source: `db-budget-state.ts:373`

── Overdue / bad debt ──────────────────────────────────────── "Bad debt" used to be a judgement the bot had to remember. Now it is a fact on the account, so the gauge can score it and the bot can read it instead of guessing from a balance.

### `set-recurring`

* style: `if` · source: `db-budget-state.ts:118`

set-recurring — handled BEFORE the cascade switch to avoid the outer catch block that swallows non-CascadeError exceptions as generic 500s

### `transfer`

* style: `switch` · source: `db-budget-state.ts:210`

_No description in code — read the source at the line above._

### `update-recurring`

* style: `switch` · source: `db-budget-state.ts:320`

_No description in code — read the source at the line above._

## `db-calendar.ts`

```
POST /.netlify/functions/db-calendar
{ "action": "<one of the actions below>", ...fields }
```

### `all`

* style: `if` · source: `db-calendar.ts:14`

Get all calendar accounts + entries for this user

### `create-account`

* style: `if` · source: `db-calendar.ts:55`

Create a new calendar account

### `upsert-entry`

* style: `if` · source: `db-calendar.ts:63`

Upsert a calendar entry (create or update by date)

## `db-challenges.ts`

```
POST /.netlify/functions/db-challenges
{ "action": "<one of the actions below>", ...fields }
```

### `buy-eval`

* style: `switch` · source: `db-challenges.ts:98`

_No description in code — read the source at the line above._

### `fail-account`

* style: `switch` · source: `db-challenges.ts:117`

_No description in code — read the source at the line above._

### `pass-eval`

* style: `switch` · source: `db-challenges.ts:105`

_No description in code — read the source at the line above._

### `promote-to-live`

* style: `switch` · source: `db-challenges.ts:111`

_No description in code — read the source at the line above._

## `db-notes.ts`

```
POST /.netlify/functions/db-notes
{ "action": "<one of the actions below>", ...fields }
```

### `create-note`

* style: `if` · source: `db-notes.ts:36`

Diary / plan notes — Daniel's short, mid and long-term planning board. Notes are user-authored text with no link to accounts or challenges, so a note outlives any account that gets archived or failed.

### `delete-note`

* style: `if` · source: `db-notes.ts:128`

── delete-note ────────────────────────────────────────────────────────

### `request-breakdown`

* style: `if` · source: `db-notes.ts:136`

── request-breakdown (Ticksensei picks these up) ──────────────────

### `update-note`

* style: `if` · source: `db-notes.ts:75`

── update-note ──────────────────────────────────────────────────────── Partial: send only what changed. The checkbox sends {completed} alone and must not wipe the body.

## `db-personal-trades.ts`

```
POST /.netlify/functions/db-personal-trades
{ "action": "<one of the actions below>", ...fields }
```

### `add-prompt-option`

* style: `if` · source: `db-personal-trades.ts:130`

Add a new prompt option

### `delete-trade`

* style: `if` · source: `db-personal-trades.ts:59`

Delete a trade

### `log-strategy`

* style: `if` · source: `db-personal-trades.ts:120`

Log a strategy press with full details (from cockpit)

### `log-trade`

* style: `if` · source: `db-personal-trades.ts:29`

Log a trade

### `prompt-options`

* style: `if` · source: `db-personal-trades.ts:99`

Get prompt options for cockpit

### `remove-prompt-option`

* style: `if` · source: `db-personal-trades.ts:138`

Remove a prompt option

### `stats`

* style: `if` · source: `db-personal-trades.ts:14`

Get stats

### `strategies`

* style: `if` · source: `db-personal-trades.ts:83`

List distinct strategies for autocomplete

### `strategy-stats`

* style: `if` · source: `db-personal-trades.ts:146`

Get strategy stats (for Ticksensei analysis)

### `update-balance`

* style: `if` · source: `db-personal-trades.ts:89`

Update the live account balance (trade monitor bot pushes from Tradovate)

### `update-trade`

* style: `if` · source: `db-personal-trades.ts:66`

Update trade metadata (strategy, SL type, TP method, etc.)

### `variant-history`

* style: `if` · source: `db-personal-trades.ts:110`

Get variant history for autocomplete

## `db-prop-trades.ts`

```
POST /.netlify/functions/db-prop-trades
{ "action": "<one of the actions below>", ...fields }
```

### `create`

* style: `if` · source: `db-prop-trades.ts:69`

_No description in code — read the source at the line above._

### `delete`

* style: `if` · source: `db-prop-trades.ts:78`

_No description in code — read the source at the line above._

### `stats`

* style: `if` · source: `db-prop-trades.ts:83`

_No description in code — read the source at the line above._

### `update`

* style: `if` · source: `db-prop-trades.ts:73`

_No description in code — read the source at the line above._

## `db-state-full.ts`

```
POST /.netlify/functions/db-state-full
{ "action": "<one of the actions below>", ...fields }
```

### `history`

* style: `if` · source: `db-state-full.ts:26`

db-state-full — one read for everything the bot needs, plus undo. The bot used to assemble its picture from several calls (accounts, then challenges, then budget), which is slow over Telegram and lets it act on a half-stale view. This returns the whole thing in one shot, including the consistency maths Daniel otherwise does by hand. GET                    -> full state GET  ?action=history   -> recent reversible actions POST { action: 'undo' } -> reverse the last action (or a specific id)

### `undo`

* style: `if` · source: `db-state-full.ts:38`

db-state-full — one read for everything the bot needs, plus undo. The bot used to assemble its picture from several calls (accounts, then challenges, then budget), which is slow over Telegram and lets it act on a half-stale view. This returns the whole thing in one shot, including the consistency maths Daniel otherwise does by hand. GET                    -> full state GET  ?action=history   -> recent reversible actions POST { action: 'undo' } -> reverse the last action (or a specific id)

## `db-trades.ts`

```
POST /.netlify/functions/db-trades
{ "action": "<one of the actions below>", ...fields }
```

### `plan-rules`

* style: `if` · source: `db-trades.ts:40`

TRADE LOGGING IS RETIRED (Oct 2026). Daniel does not log trades. The `trades` table has been dropped, so every endpoint that used to read or write a trade row now answers 410 Gone instead of throwing "relation trades does not exist" (which surfaced as an opaque 500). Balances move through `POST db-accounts { action: 'set-balance' }` — see the bot guide §5.11. Green days, payout progress and best day all read the balance and the recorded daily P&L, so nothing here is needed to keep them current. STILL LIVE on this endpoint: plan-rules (the plan catalogue), set-plan-rule, record-payout and propose-allocation. Payouts are a separate table and feed the dashboard stats — do not remove them.

### `propose-allocation`

* style: `if` · source: `db-trades.ts:68`

_No description in code — read the source at the line above._

### `record-payout`

* style: `if` · source: `db-trades.ts:107`

_No description in code — read the source at the line above._

### `set-plan-rule`

* style: `if` · source: `db-trades.ts:74`

_No description in code — read the source at the line above._

## `trading-mode.ts`

```
POST /.netlify/functions/trading-mode
{ "action": "<one of the actions below>", ...fields }
```

### `breach`

* style: `switch` · source: `trading-mode.ts:128`

_No description in code — read the source at the line above._

### `ddl`

* style: `switch` · source: `trading-mode.ts:123`

_No description in code — read the source at the line above._

### `enter_cockpit`

* style: `switch` · source: `trading-mode.ts:84`

_No description in code — read the source at the line above._

### `fresh_trade`

* style: `switch` · source: `trading-mode.ts:133`

_No description in code — read the source at the line above._

### `in_trade`

* style: `switch` · source: `trading-mode.ts:90`

_No description in code — read the source at the line above._

### `out_of_trade`

* style: `switch` · source: `trading-mode.ts:96`

_No description in code — read the source at the line above._

### `out_trade`

* style: `switch` · source: `trading-mode.ts:95`

_No description in code — read the source at the line above._

### `pre_trade`

* style: `switch` · source: `trading-mode.ts:85`

_No description in code — read the source at the line above._

### `sl_hit`

* style: `switch` · source: `trading-mode.ts:113`

_No description in code — read the source at the line above._

### `strategy`

* style: `switch` · source: `trading-mode.ts:138`

_No description in code — read the source at the line above._

### `tp_hit`

* style: `switch` · source: `trading-mode.ts:118`

_No description in code — read the source at the line above._
