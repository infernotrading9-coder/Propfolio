# Propfolio — Trading Bot Integration Guide

**Audience:** the trading bot (@Ticksenseibot) that logs Daniel's trades, evals and budget.
**Status:** Propfolio was rebuilt Sep 3 2026. The rules below replace everything you knew about its data model.
**Site:** https://silly-gaufre-f1dd14.netlify.app

---

## 1. What changed, in one paragraph

Propfolio used to be two disconnected tables — `challenges` (what the Dashboard read) and `trading_accounts` (what the Accounts tab read) — joined only by a nullable text `last4` with no constraint. That is why the Dashboard and the Accounts tab disagreed, why failing a funded account reported "Challenges failed: 0", and why the 2026 dashboard claimed 70 funded accounts against 3 real ones. They are now **one linked record** joined by a real foreign key, and every life event goes through a **cascade service** that updates all five surfaces in a single database transaction.

**Stop writing rows directly.** Do not INSERT or UPDATE `challenges`, `trading_accounts`, `calendar_accounts`, `payouts` or `budget_state` yourself. Every direct write risks reintroducing the drift this rebuild removed. Call the endpoints below instead.

---

## 2. The three stages — do not conflate these

This is the rule that matters most, and the one that has been gotten wrong before.

| Stage | How it is reached |
|---|---|
| **eval** | Daniel bought a challenge and is trying to pass it |
| **funded** | He passed the eval. **A pass ALWAYS lands here.** |
| **live** | The firm moved him onto real capital. Requires **≥ 5 payouts** on that funded account **and** the firm's decision. Never automatic, never guaranteed. |

**An eval never goes straight to live. A funded account with no payouts is not live.**

Postgres enforces this with CHECK constraints, so an attempt to fake it fails at the database layer, not silently. If you try, you get an error — treat that as correct behaviour, not a bug to work around.

The `lifecycle` field is the single source of truth:

```
eval_active | eval_passed | eval_failed
funded_active | funded_failed
live_active | live_failed
```

Never infer stage from `phase1_completed`, `status`, or `live_account`. Those still exist for backwards compatibility but are **not authoritative**. Read `lifecycle`.

---

## 3. Account references — the 0001 problem

Daniel holds multiple accounts that share a last4. Two Lucid Daily "0001"s exist right now with **different rules** (one has a $600 daily loss limit, one has none). The old code resolved a bare `0001` by picking the oldest match silently, so trades landed on the wrong account.

Accounts now have a **`display_label`**, unique among active accounts:

- One account with last4 `0857` → label is `0857`
- Two accounts with last4 `0001` → labels are `0001-A` and `0001-B`

**Always send the `display_label`.** If you send a bare `0001` and it is ambiguous, the API returns HTTP 400 with `code: "ambiguous"` and lists the options. **Ask Daniel which one — never guess.**

```json
{ "error": "\"0001\" matches 2 active accounts (0001-A, 0001-B). Say which one.",
  "code": "ambiguous" }
```

---

## 4. Current live state (Sep 3 2026)

| Label | Firm | Plan | Stage | Size | Daily DD | Notes |
|---|---|---|---|---|---|---|
| `0001-A` | Lucid Trading | Lucid Daily | eval_active | $25K | $600 | cost $68.20 |
| `0001-B` | Lucid Trading | Lucid Daily | eval_active | $25K | none | cost $75.00 |
| `0857` | Alpha Futures | Zero | funded_active | $50K | $1,000 | cost $71.40, 0 payouts |

Everything before this was archived. See §9.

---

## 5. The endpoints

Base: `https://silly-gaufre-f1dd14.netlify.app/.netlify/functions/`

Auth headers on every request:

```
Content-Type: application/json
X-User-Id: 293080f9-a395-4482-9ec2-ad31bf105848
X-User-Email: infernotrading9@gmail.com
```

Each call below is **one atomic transaction**. It either updates every surface or none of them. There is no half-applied state to clean up.

### 5.1 Bought an eval → `POST db-challenges`

Spawns: challenge + account card + budget expense + rule-calendar row.

```json
{
  "action": "buy-eval",
  "firmName": "Lucid Trading",
  "accountSize": 50000,
  "cost": 90.20,
  "accountLast4": "0048",
  "evalType": "Lucid Flex",
  "firmType": "futures",
  "maxDrawdown": 2000,
  "dailyDrawdown": 1200,
  "rules": ["200$ Per Trade", "6 Max Loss"],
  "budgetAccountId": "acc_destiny"
}
```

**`budgetAccountId` is required whenever `cost > 0`.** If Daniel doesn't say which account paid, **ask him** — the API rejects it with `code: "no_funding_source"` rather than guessing. Valid ids: `acc_sofi`, `acc_cash`, `acc_affirm`, `acc_klarna`, `acc_sezzle`, `acc_premier`, `acc_aspire`, `acc_destiny`, `acc_capitalone`, `acc_cashapp`, `acc_christian`, `acc_atlas`, `acc_one_pay`, `acc_revel`.

Also prompt him for the **rules** if he doesn't give them — an account with no rules gives the Rule Calendar nothing to check, and the response will warn you about it.

Returns `{ challengeId, accountId, calendarAccountId, label, lifecycle, warnings[] }`. **Read `warnings` and relay them** — that's where "your last4 collided, this is 0048-B" shows up.

### 5.2 Passed an eval → `POST db-challenges`

Retires the eval, creates the **funded** account, links them.

```json
{
  "action": "pass-eval",
  "accountRef": "0001-A",
  "fundedLast4": "0019",
  "rules": ["200$ Per Trade", "Hard SL"],
  "maxDrawdown": 2000,
  "dailyDrawdown": 1000,
  "activationFee": 0,
  "budgetAccountId": "acc_destiny"
}
```

- `accountRef` = the eval being passed. `fundedLast4` = the **new** account number the firm issued. Ask for it if he doesn't volunteer it.
- Funded rules often differ from eval rules — ask, don't copy blindly. If you omit `rules` it copies the eval's and warns you.
- `budgetAccountId` only needed if there's an `activationFee`.
- **Result is `funded_active`. Not live.** The response says so in `warnings`.

### 5.3 Firm moved him to live → `POST db-challenges`

```json
{ "action": "promote-to-live", "accountRef": "0857" }
```

The **only** path to live. Rejected with `code: "insufficient_payouts"` below 5 payouts:

```json
{ "error": "0857 has 2 payout(s). Live requires at least 5 — and even then the firm decides.",
  "code": "insufficient_payouts" }
```

Only call this when Daniel explicitly says the firm moved him. Reaching 5 payouts makes him *eligible*, not live.

### 5.4 Failed an account → `POST db-challenges`

```json
{
  "action": "fail-account",
  "accountRef": "0001-B",
  "failureReason": "max_drawdown",
  "failureDate": "2026-09-03"
}
```

Works identically for evals, funded and live accounts — the old flow only handled evals, which is why failing a funded account did nothing on the Dashboard. Sets challenge → failed, card → lost, calendar → retired. **Trades are kept** as history.

Reasons: `rule_break`, `max_drawdown`, `daily_loss`, `tilt_revenge`, `overtrading`, `account_expired`, `strategic_reset`, `firm_platform_issue`, `unknown`.

### 5.4b Account nickname → `POST db-accounts`

**Give an account a nickname** so "0001" is never ambiguous:

```json
{ "action": "set-nickname", "accountRef": "0001-B", "nickname": "LUCD" }
```

4–16 characters, letters/digits/dashes, unique among active accounts. Once set, `accountRef` accepts the nickname, the display label, or the raw last 4 — all three resolve to the same account. Prefer the nickname when talking to Daniel; it's the handle he chose.

### 5.5 Logged a trade → `POST db-trades`

```json
{
  "action": "log-trade",
  "accountRef": "0857",
  "amount": 1493.00,
  "instrument": "NQ",
  "direction": "long",
  "rulesFollowed": true,
  "rulesBroken": [],
  "behaviors": [],
  "tradeDate": "2026-09-03",
  "netIntoSession": false
}
```

`amount` is **signed** — positive win, negative loss. Updates the trade row, balance, high-water mark, the rule-calendar entry for that day, and returns a drawdown verdict (see §6).

**`netIntoSession: true`** folds a small scratch trade into that day's main trade instead of creating a new row — Daniel's standing rule, since small trades pollute his stats. **Exception:** if the small trade is a *rule break*, log it separately with `netIntoSession: false` so it stays visible.

### 5.6 Payout → `POST db-trades` — TWO STEPS, always

A payout is **income**, not just a trading stat. It has to land in the budget, and Daniel decides where.

**Step 1 — ask what the split should be.** Call WITHOUT `allocations`. This writes **nothing**:

```json
{ "action": "record-payout", "accountRef": "0857", "amount": 1500 }
```

You get back a proposal built from his actual finances:

```json
{ "applied": false,
  "proposal": {
    "summary": "Suggested split of $1500.00: $148.01 → Sofi (prop cushion) · $1351.99 → Aspire (debt)",
    "slices": [
      { "bucket": "prop_cushion", "accountId": "acc_sofi", "amount": 148.01,
        "reason": "Cash on hand is $66.59 against ~$148 of eval spend in the last 30 days. This keeps the next eval off a credit card." },
      { "bucket": "debt", "accountId": "acc_aspire", "amount": 1351.99,
        "reason": "Aspire carries $1969.27 at roughly 36% APR — the most expensive money you owe." }
    ],
    "context": { "totalDebt": 6916.20, "cashOnHand": 66.59, "highestAprAccount": "Aspire" }
  } }
```

**Show him the split and the reasons, then ask.** He may want it entirely different — it's his money.

**Step 2 — apply what he confirms:**

```json
{ "action": "record-payout", "accountRef": "0857", "amount": 1500,
  "allocations": [
    { "bucket": "debt", "accountId": "acc_aspire", "amount": 1000 },
    { "bucket": "savings", "accountId": "acc_cash", "amount": 500 }
  ] }
```

Buckets: `debt` · `prop_cushion` · `savings` · `spending`.

Allocations **must sum exactly to the payout** or you get `allocation_mismatch` and nothing is written. Only funded/live accounts take payouts. Returns `{ payoutCount, eligibleForLive }` — when `eligibleForLive` turns true, tell him he's eligible, but never promote automatically.

Want just the suggestion without touching a payout? `{ "action": "propose-allocation", "amount": 1500 }`.

### 5.7 Spent money → `POST db-budget-state`

**Budget writes now go through cascade actions. Do NOT PUT the whole state document** — that is a read-modify-write race against whatever Daniel is editing in the browser, and one stale read silently reverts his real changes. A whole-state `PUT` without the web UI's header returns **403 `use_cascade_action`**.

**First, get the valid account ids** (never guess one — an unrecognised id books the expense against nothing):

```
GET db-budget-state?action=accounts
```

```json
{ "accounts": [
  { "id": "acc_cash",    "name": "Cash",    "balance": 159,    "kind": "cash",   "isLiability": false },
  { "id": "acc_destiny", "name": "Destiny", "balance": 896.56, "kind": "credit", "isLiability": true }
] }
```

**Log an expense:**

```json
{ "action": "log-expense", "name": "Gas", "amount": 60,
  "budgetAccountId": "acc_sofi", "date": "2026-09-03" }
```

**Log income** — same shape, `"action": "log-income"`.

**Transfer between accounts** (e.g. paying a card from Sofi) — both sides move in one transaction, so a mid-way failure cannot destroy money:

```json
{ "action": "transfer", "fromAccountId": "acc_sofi",
  "toAccountId": "acc_destiny", "amount": 200, "name": "Card payment" }
```

**The sign rule — get this wrong and you corrupt his debt figures:**

| Account kind | Expense / charge | Income / payment |
|---|---|---|
| **cash / bank** (Sofi, Cash, Atlas, One Pay) | balance **down** | balance **up** |
| **credit / debt** (Destiny, Affirm, Klarna, Aspire, Premier, Capital One, Cash App, Revel, Christian) | amount owed **UP** | amount owed **DOWN** |

A credit account stores the amount **owed**, so buying an eval on Destiny *increases* that number. You do not apply this yourself — the API handles it. Just send the transaction and never pre-negate an amount. **Amounts are always positive.**

Every action returns the touched account's new balance, so you can confirm the direction was right.

### 5.8 Reading state → `GET db-state-full` ← **start here every time**

**One call, the whole picture.** Use this instead of stitching together several reads:

```
GET db-state-full
```

Returns every active account with balance, room to stop-out, day P&L, rules, payout count, plan facts (consistency %, split, payout minimum), **best day**, **true profit target**, and whether the consistency rule is currently satisfied. Plus the full budget, month-to-date spend and payouts, and the last few undoable actions.

**The true profit target matters.** The real pass bar is not the nominal target — it's `bestDay / consistency%`. Daniel nearly failed an eval at exactly $3,000 because a $1,500.50 best day pushed the true bar to $3,001. That number is computed for you; quote it, don't recalculate it.

`GET db-challenges` still returns the raw challenge/account join if you need it.

### 5.9 Plan rules → `GET db-trades?action=plan-rules`

**Check this before buying an eval.** It's what Propfolio has learned about each plan.

**Rules are STAGE-SCOPED.** Consistency commonly differs between the eval and the funded account — some plans drop the rule once funded, others change the percentage. Always pass the stage you mean:

```
GET db-trades?action=plan-rules&firm=Lucid%20Trading&evalType=Lucid%20Flex&stage=eval
```

```json
{ "known": true,
  "rule": { "stage": "eval", "consistencyPct": 50, "profitSplitPct": 90,
            "payoutMin": 2000, "dailyLossLimit": 1200 } }
```

Ask the same plan at `stage=funded` and you get `consistencyPct: null` — because nobody has told Propfolio the funded rule for Lucid Flex yet.

**Three states, three different behaviours:**

| Value | Meaning | What you do |
|---|---|---|
| a number (e.g. `50`) | confirmed rule at that stage | use it |
| `null` | **nobody has told us** | **ask Daniel**, then save it |
| `0` | confirmed there is **no** rule at that stage | don't warn about consistency |

Never treat `null` as "no rule" — that hides a real constraint he could fail on.

**Teaching a rule** — include the stage:

```json
{ "action": "set-plan-rule", "firmName": "My Funded Futures", "evalType": "Rapid EOD",
  "accountSize": 50000, "stage": "eval", "consistencyPct": 30, "drawdownStyle": "eod" }
```

- `stage: "eval"` — applies while it's an eval
- `stage: "funded"` — applies once funded (live accounts follow funded rules)
- `stage: "any"` — holds at both stages. Use for profit split, payout max, DD limits.

Send `consistencyPct: 0` with `stage: "funded"` when a plan's rule genuinely disappears after funding.

Shared facts on the `any` row are inherited at both stages, so you only record what actually differs.

**Known so far:** Lucid Flex 50K — eval 50%, funded unknown · Alpha Zero 50K — funded 40%, eval unknown · Lucid Daily 25K · MFF Builder (80/20, the only one) · MFF Rapid · MFF Rapid EOD · Tradify Select Flex.

### 5.10 Idempotency — send a key with every write

Netlify can time out *after* the write committed. Retrying then double-logs the trade. Send a unique `idempotencyKey` per statement and a retry returns the original result instead:

```json
{ "action": "log-trade", "accountRef": "0857", "amount": 1493,
  "idempotencyKey": "tg-msg-84321" }
```

Use something stable and unique — the Telegram message id is ideal. The response carries `idempotentReplay: true` when it's a replay. Supported on `buy-eval`, `pass-eval`, `fail-account`, `log-trade`, `record-payout` and `undo`.

### 5.11 Undo → `POST db-state-full`

"Scratch that, wrong account."

```json
{ "action": "undo" }
```

Reverses the last action. Pass `actionId` to target a specific one; `GET db-state-full?action=history` lists them.

Reversible: `log-trade`, `record-payout` (including every budget slice), `fail-account`, `log-expense`, `transfer`. Buying and passing an eval are **not** auto-reversible — they create accounts that may have been traded on since; you'll get `not_undoable` and should ask Daniel exactly what to unwind.

**Confirm before undoing.** Read the summary back to him first: *"Last action was 'Win of $800.00 on 0857' — undo that?"*

---

## 6. Drawdown verdicts — the rule that got 9058 wrong

`log-trade` returns a `verdict`. **Read `consequence`, not `breached`.** What a breach *means* depends on the plan:

| `consequence` | Meaning |
|---|---|
| `none` | Fine, keep trading |
| `session_lockout` | Daily limit hit on an **EOD** plan. Locked out for the session, **account survives**, trades again next session. |
| `account_lost` | **Account is dead.** Already marked lost across every surface — do not call `fail-account`. |

Two drawdown styles:

- **EOD / session** (Lucid Flex, Lucid Daily, MFF Builder, Tradify Select Flex) — hitting the daily limit is a lockout. Account survives.
- **Intraday trailing** (MFF **Rapid**, Alpha **Zero**) — the floor trails equity intraday. Touching it is **terminal**. Account lost, not locked.

This is what was wrong before: 9058 (a Rapid account) was reported as "daily DD hit, account survives" using EOD logic. It was actually blown. **Never apply EOD logic to a Rapid or Zero account.**

A max-drawdown breach is terminal on **every** plan.

---

## 7. Error handling

All cascade errors return HTTP 400 with a machine-readable `code`:

| Code | Meaning | What to do |
|---|---|---|
| `ambiguous` | Bare last4 matched several accounts | Ask Daniel which one. Never guess. |
| `not_found` | No active account with that ref | Read back what's active and ask. |
| `no_funding_source` | `cost > 0` without `budgetAccountId` | Ask which account paid. |
| `insufficient_payouts` | Live promotion below 5 payouts | Tell him he isn't eligible yet. |
| `bad_lifecycle` | Wrong stage for the operation | e.g. passing something already passed. Read state first. |
| `no_challenge` | Account card has no challenge row | Shouldn't happen now — report it. |
| `use_cascade_action` | You tried to PUT the whole budget state | Use `log-expense` / `log-income` / `transfer` instead. |
| `action_required` | POST to db-budget-state without an `action` | Add the action field. |
| `same_account` | Transfer source = destination | Check the two ids. |
| `bad_amount` | Amount is zero, negative or not a number | Always send a positive number. |
| `allocation_mismatch` | Payout allocations don't sum to the payout | Fix the split; nothing was written. |
| `nothing_to_undo` | No reversible action found | Tell him there's nothing pending. |
| `already_undone` | That action was already reversed | Don't retry. |
| `not_undoable` | buy-eval / pass-eval can't auto-reverse | Ask exactly what to unwind. |

A 400 means **nothing was written**. The transaction rolled back. Safe to retry after fixing the input.

---

## 8. Rules of engagement

1. **Never write to the database directly, and never PUT a whole state document.** Use the endpoints. Every direct write can recreate the drift this rebuild eliminated; every whole-state write can revert Daniel's browser edits.
2. **Never guess an account.** Ambiguous reference → ask.
3. **Never mark anything live** unless Daniel says the firm moved him, and it has 5+ payouts.
4. **Never invent a funding source.** Ask which account paid.
5. **Relay `warnings`** from every response — they carry label collisions, missing rules, and the funded-not-live reminder.
6. **Prompt for rules** on every new account. No rules = the Rule Calendar can't check anything.
7. **Dates are America/New_York local.** Never use `toISOString().slice(0,10)` — it rolls to tomorrow after ~7pm ET and files trades on the wrong day.
8. **A pass gives a FUNDED account.** Always ask for the new funded account number.

---

## 9. The old data

221 challenges, 23 accounts, 46 trades and 29 payouts of history (lifetime $30,730.62 spent / $42,089.37 paid out) were moved into a separate `archive` schema in the same database, plus a JSON backup on disk.

The app cannot see it — nothing renders, no stats are polluted. It is still fully queryable, but **only by the coding bot (@Uraharacoderbot)**. If Daniel asks about pre-September-2026 history, tell him to ask the coding bot. Do not attempt to query or restore it yourself.

---

## 10. Quick reference

| Daniel says | You call |
|---|---|
| anything at all — **check state first** | `GET db-state-full` |
| "bought a Lucid flex 50k for 90 on destiny" | check `plan-rules`, then `buy-eval` |
| "passed 0045" | `pass-eval` (ask for the new funded last4) |
| "they moved me to live on 0857" | `promote-to-live` (needs 5+ payouts) |
| "failed 9056" | `fail-account` |
| "made 1493 on 0047" | `log-trade` |
| "got a 1500 payout on 0857" | `record-payout` → show split → confirm → apply |
| "spent 60 on gas from sofi" | `log-expense` |
| "paid 200 to my destiny card" | `transfer` (sofi → destiny) |
| "got paid 1200" | `log-income` |
| "scratch that / wrong account" | `undo` (confirm the summary first) |
| "am I ok on consistency?" | `GET db-state-full` → `trueProfitTarget`, `consistencyOk` |
| "what accounts do I have?" | `GET db-budget-state?action=accounts` |

---

## 11. Habits that keep this clean

1. **Read `db-state-full` before acting.** One call, current picture, no stale assumptions.
2. **Send an `idempotencyKey` on every write.** The Telegram message id works.
3. **Relay `warnings`.** They carry label collisions, missing rules, live-eligibility and the "this app can't see your broker balance" caveat.
4. **Never decide for him.** Propose the payout split, propose the plan rule, then ask. The app records what Daniel says; it doesn't overrule him.
5. **A breach warning is not a failed account.** Propfolio only sees logged trades. Only mark an account failed when he says the platform confirmed it.
