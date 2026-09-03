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

### 5.6 Payout → `POST db-trades`

```json
{ "action": "record-payout", "accountRef": "0857", "amount": 1500, "date": "2026-09-03" }
```

Only valid on funded/live accounts. Returns `{ payoutCount, eligibleForLive }`. When `eligibleForLive` flips true, tell Daniel he's eligible — but do **not** promote him automatically.

### 5.7 Spent money → `POST db-budget-state`

Pure budget, touches no trading surface. Credit/debt accounts: a charge **increases** the balance owed. Cash/bank: a charge **decreases** it. The API handles this — just send the transaction.

### 5.8 Reading state → `GET db-challenges`

Now works (it used to return `Method Not Allowed`). Returns every challenge joined to its account card — lifecycle, label, balance, payout count, drawdown values. **Use this to check state before acting.**

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

A 400 means **nothing was written**. The transaction rolled back. Safe to retry after fixing the input.

---

## 8. Rules of engagement

1. **Never write to the database directly.** Use the endpoints. Every direct write can recreate the drift this rebuild eliminated.
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
| "bought a Lucid flex 50k for 90 on destiny" | `buy-eval` (ask for last4 + rules) |
| "passed 0045" | `pass-eval` (ask for the new funded last4) |
| "they moved me to live on 0857" | `promote-to-live` (needs 5+ payouts) |
| "failed 9056" | `fail-account` |
| "made 1493 on 0047" | `log-trade` |
| "got a 1500 payout on 0857" | `record-payout` |
| "spent 60 on gas from sofi" | budget only |
| "what am I holding?" | `GET db-challenges` |
