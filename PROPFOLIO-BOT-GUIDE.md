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

## 3. Account references — FIRST4 + LAST4

Daniel gives the **first four AND last four** characters of the account number. The label is `FIRST-LAST`, which is unique on its own. (Account numbers are often letters, not just digits.)

`accountRef` accepts **any** of these, case-insensitively:

| Form | Example |
|---|---|
| Full pair — **prefer this** | `LDE0-0001` |
| First 4 only | `LDE0` |
| Last 4 only | `0001` |
| Nickname, if he set one | `LUCD` |

A **mismatched** pair like `ZERO-0001` returns `not_found` — it will never be fuzzy-matched onto a nearby account. A genuinely ambiguous bare last4 still returns HTTP 400 `code: "ambiguous"` with the options listed. **Ask Daniel — never guess.**

**When he buys a new account, ask for both halves** and record them:

```json
{ "action": "set-account-number", "accountRef": "<current label>",
  "first4": "APEX", "last4": "0001" }
```

---

## 4. Current live state (Sep 26 2026, 01:40 UTC)

| Label | Firm | Plan | Stage | Size | Balance | Notes |
|---|---|---|---|---|---|---|
| `LFF0-0002` | Lucid Trading | Lucid Flex | funded_active | $25K | $25,425.00 | 1 payout ($535.05) |
| `MFFU-9065` | MFF | Builder | funded_active | $50K | $50,000.00 | |

**2 funded, 0 live, 0 active evals.**

Don't hardcode this table — call `GET db-state-full` at the start of every conversation. It is always current. Everything before the Sep 3 rebuild was archived; see §9.

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

### 5.1b Bought a BATCH of evals → `POST db-challenges`

**I bought 3 Lucid 50Ks.** One call creates all N accounts in one transaction.

```json
{
  "action": "buy-eval",
  "firmName": "Lucid Trading",
  "accountSize": 50000,
  "cost": 90.20,
  "evalType": "Lucid Flex",
  "firmType": "futures",
  "maxDrawdown": 2000,
  "dailyDrawdown": 1200,
  "rules": ["200$ Per Trade", "6 Max Loss"],
  "budgetAccountId": "acc_sofi",
  "accounts": [
    { "last4": "0048" },
    { "last4": "0049" },
    { "last4": "0050" }
  ]
}
```

Each entry in `accounts[]` gets its own account card, challenge row, budget expense and calendar row — all linked, all in one transaction. Leave `last4` blank when Daniel hasn't given the account number yet; the cascade allocates a label and you can set it later with `set-account-number`.

Returns `{ count, purchaseGroupId, accounts: [{ challengeId, accountId, label, ... }], warnings }`.

**Never call `buy-eval` N times in a loop for a batch.** The old loop hit the unique index on the second call and produced only 1 card for a batch of 3. Use `accounts[]` so all N are created atomically.

### 5.2 Passed an eval → `POST db-challenges`

Retires the eval, creates the **funded** account, links them.

```json
{
  "action": "pass-eval",
  "accountRef": "LDE0-0001",
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
{ "action": "promote-to-live", "accountRef": "ZERO-0857" }
```

The **only** path to live. Rejected with `code: "insufficient_payouts"` below 5 payouts:

```json
{ "error": "ZERO-0857 has 2 payout(s). Live requires at least 5 — and even then the firm decides.",
  "code": "insufficient_payouts" }
```

Only call this when Daniel explicitly says the firm moved him. Reaching 5 payouts makes him *eligible*, not live.

### 5.4 Failed an account → `POST db-challenges`

```json
{
  "action": "fail-account",
  "accountRef": "LDE0-0001",
  "failureReason": "max_drawdown",
  "failureDate": "2026-09-03"
}
```

Works identically for evals, funded and live accounts — the old flow only handled evals, which is why failing a funded account did nothing on the Dashboard. Sets challenge → failed, card → lost, calendar → retired. **Trades are kept** as history.

Reasons: `rule_break`, `max_drawdown`, `daily_loss`, `tilt_revenge`, `overtrading`, `account_expired`, `strategic_reset`, `firm_platform_issue`, `unknown`.

### 5.4b Account nickname → `POST db-accounts`

**Give an account a nickname** so "0001" is never ambiguous:

```json
{ "action": "set-nickname", "accountRef": "LDE0-0001", "nickname": "LUCD" }
```

4–16 characters, letters/digits/dashes, unique among active accounts. Once set, `accountRef` accepts the nickname, the display label, or the raw last 4 — all three resolve to the same account. Prefer the nickname when talking to Daniel; it's the handle he chose.

### 5.4c Wrong plan? → `POST db-accounts`

If Daniel realises he told you the wrong plan — *"that wasn't a Flex, it was a Lucid Daily"* — fix it:

```json
{ "action": "correct-plan", "accountRef": "LDI0-0007", "evalType": "Lucid Daily" }
```

Add `"firmName"` too if the firm was also wrong.

**Works on dead accounts** — correcting history is the main use. Updates the account card *and* the challenge together so they can't disagree, and re-resolves the drawdown style from the catalogue for the new plan. Journalled, so `undo` reverses it.

Never changes lifecycle, cost, balance, or size. It corrects a **label** and the rules that follow from it, nothing else.

If the new plan isn't in the catalogue you'll get `styleSource: "unknown"` and a warning — ask him for the drawdown style and store it with `set-plan-rule`.

Why it matters: eval cost is grouped by plan, so a mislabelled eval pollutes that plan's spend and pass-rate stats. One dead eval put $101.60 under Lucid Flex that belonged to Lucid Daily.

### 5.5 Logged a trade → `POST db-trades`

```json
{
  "action": "log-trade",
  "accountRef": "ZERO-0857",
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
{ "action": "record-payout", "accountRef": "ZERO-0857", "amount": 1500 }
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
{ "action": "record-payout", "accountRef": "ZERO-0857", "amount": 1500,
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

### 5.7 Budget accounts — what counts as what

**Never create budget accounts for one-time bills.** SplitPay and American Water were created as `credit` accounts by mistake — they're one-time payments, not revolving credit. This made the budget treat them as credit cards accumulating debt.

| `loanKind` | What it is | Examples |
|---|---|---|
| `cash` | Money you have | Sofi, Cash, Atlas, One Pay |
| `credit` | Revolving credit card — balance goes UP on expense, DOWN on payment | Destiny, Affirm, Klarna, Aspire, Premier, Capital One, Revel |
| `debt` | Fixed debt / payment plan — not revolving | SplitPay (rent payment plan), Christian |
| `borrow` | Loan | |

**For utility bills and one-time payments:** use `log-expense` against the cash/bank account that paid (e.g. `acc_sofi`). Do NOT create a new budget account for the utility company. The expense is the bill, not a credit account.

**For payment plans (SplitPay, Klarna, Affirm):** if it's a BNPL where you pay installments, it's `credit` (the balance owed goes up when you buy, down when you pay). If it's a fixed payment plan where you owe a set amount, it's `debt`.



Daniel sometimes goes days without logging, or makes too many small transactions to bother itemising. Instead of reconstructing every one, he reads the real balances off his banking apps and hands them over.

**Always dry-run first and show him the deltas:**

```json
{ "action": "reconcile-balances", "dryRun": true,
  "balances": [
    { "accountRef": "Cash",    "actualBalance": 119.00 },
    { "accountRef": "Destiny", "actualBalance": 1016.56 }
  ] }
```

Returns each delta with a `direction` (`spent` / `received` / `unchanged`) and `totalUnlogged`. Show him, get a yes, then send the same call without `dryRun`.

Each account gets **one balancing `adjustment` transaction**, so the ledger still explains every dollar and the nightly reconcile sees an explained delta instead of mystery drift. Reversible with `undo`.

**⚠️ EVAL PURCHASES ARE NEVER ABSORBED THIS WAY.**

If he says *"I also bought two evals in there somewhere"*, do **not** let the adjustment swallow them. Log each one with `buy-eval` — real cost, real funding source — **then** reconcile the remainder. Eval cost drives spend-per-eval, pass rate, and the whole "am I making money or funding prop firms?" question. An adjustment that hides a $75 eval makes that unanswerable.

Same for payouts (`record-payout`) and activation fees. Adjustments are for **living noise only** — gas, food, the stuff he forgets.

Ask him directly: *"Any eval purchases or payouts in that period? Those I need to log properly first."*

### 5.7c Add / remove budget accounts → `POST db-budget-state`

**Add a budget account:**

```json
{ "action": "add-budget-account", "id": "acc_newcard", "name": "New Card", "balance": 0, "loanKind": "credit" }
```

`id` must be unique (use `acc_` prefix). `loanKind` is `cash`, `credit`, `debt`, or `borrow`.

**Remove a budget account:**

```json
{ "action": "remove-budget-account", "id": "acc_oldcard" }
```

This removes the account and all its transactions. Use carefully — removing an account deletes its history.

### 5.7h Reorder accounts → `POST db-accounts`

The bot can reorder the trading order of accounts (sort_order is the single source of truth for card order).

**Get current order:** Just GET accounts — they come back sorted by sort_order already.

**Set new order:**
```json
{ "action": "reorder", "orderedIds": ["id1", "id2", "id3", "id4", "id5"] }
```

This sets sort_order 0,1,2,3,4... for each account in the order given. The account cards on the Accounts tab and the drag-and-drop order both read from sort_order.

**When Daniel says "put 0048 first then 0049 then 0050"** — look up the account IDs by last4/displayLabel, build the orderedIds array in that order, and call reorder.

### 5.7i Transfers with fees → `POST db-budget-state`

When Daniel pays a credit card and there's a fee (e.g. $4.95 debit card fee), use the `fee` field on the transfer — it auto-logs the fee as a separate expense in the same call. No need for two transactions.

```json
{ "action": "transfer", "fromAccountId": "acc_sofi", "toAccountId": "acc_capitalone", "amount": 200, "fee": 4.95, "feeName": "Capital One payment fee" }
```

This creates:
1. A transfer of $200 from Sofi to Capital One
2. An expense of $4.95 on Sofi (the fee)

All in one call, one atomic transaction. The `feeName` is optional — defaults to "Fee — [from] → [to]".

### 5.7i-b Delete a transaction -> `POST db-budget-state`

When Daniel says "delete that transaction" or "remove the last one I logged" or "that was wrong, get rid of it":

```json
{ "action": "delete-transaction", "transactionId": "abc12345" }
```

This reverses the balance effect on the account (income subtracts, expense adds back) and removes the transaction entirely. Use the transaction's `id` field.

If Daniel says "delete the last transaction I logged" but does not give an id, look up the most recent transaction from GET budget state and use its id.

### 5.7j Budget categorization — Needs vs Wants → `POST db-budget-state`

When logging expenses, tag them with the correct categoryId:

| categoryId | What goes here | Examples |
|---|---|---|
| `cat_needs` | Essential living expenses | Rent, utilities, water bill, insurance, food (groceries), car payment |
| `cat_wants` | Non-essential spending | Gym, subscriptions, entertainment, dining out, snacks |
| `8sxjlu9` | Savings | Savings contributions |
| `cat_propfirm` | Prop firm eval purchases | Eval costs, activation fees |
| `cat_other` | Uncategorized | Use sparingly — prefer needs or wants |

**When Daniel says "log $45 for gym on Sofi":** use `categoryId: "cat_wants"` (gym is a want, not a need).

**When Daniel says "log $1099 for rent on SplitPay":** use `categoryId: "cat_needs"` (rent is a need).

**When Daniel says "log $90 for Lucid eval on Sofi":** use `categoryId: "cat_propfirm"` and `isPropFirm: true`.

Do NOT use `cat_other` for everything. If you are unsure, ask: "Is this a need (essential) or a want (non-essential)?"

### 5.7k Recurring expenses / cost of living → `POST db-budget-state`

The bot can tag transactions as recurring (monthly cost-of-living) so the gauge can factor in fixed monthly obligations.

**Tag a transaction as recurring:**
```json
{ "action": "set-recurring", "transactionId": "abc123", "recurring": true, "frequency": "monthly", "dayOfMonth": 15 }
```

**Untag:**
```json
{ "action": "set-recurring", "transactionId": "abc123", "recurring": false }
```

**List all recurring transactions:**
```json
{ "action": "get-recurring" }
```
Returns: `{ recurring: [{ id, name, amount, type, frequency, dayOfMonth }], monthlyTotal }`

**Get monthly cost of living (for gauge scoring):**
```json
{ "action": "get-cost-of-living" }
```
Returns: `{ monthlyCostOfLiving, recurring: [{ id, name, amount }] }`

**How the gauge uses this:** The cron job calls `get-cost-of-living` and factors the monthly cost of living into the score. If monthly cost of living is high relative to cash on hand, the gauge pushes more defensive — Daniel needs to keep cash for living expenses, not just eval resets.

**When Daniel says "my rent is $1099/month on the 1st" or "Hermes costs $10.60/month"** — find the transaction by name, then call `set-recurring` to tag it.

### 5.7l Rent / bill money pool → `POST db-budget-state`

Daniel shares rent and bills with roommates. He sometimes pulls from that pool money to buy evals or cover things, then pays the **whole pool back** when a payout lands. Because he's always paying the full amount, he doesn't track exactly what he owes per bill — the pool is one running balance.

**The `Rent money held` account (`acc_rent_held`, kind `borrow`) is a LIABILITY** whose balance = how much Daniel currently owes back to the rent/bill pool. Positive = he owes that much.

**When Daniel uses pool money for an eval or expense:**
1. Log the eval/expense from the cash account it actually came from (e.g. `log-expense` on `acc_sofi` or `acc_one_pay`).
2. **Also** record a borrow that *increases* `Rent money held` by the same amount — he now owes the pool that much more. Use `log-expense` on `acc_rent_held` (it's a liability, so the amount owed goes UP).

**When Daniel repays the pool (from a payout or income):**
- Log a `transfer` from the cash account → `acc_rent_held`. This *decreases* the liability (he owes less).

**Cash → bank → eval flow (Daniel can't buy evals with cash):**
When Daniel says he's depositing cash to buy an eval:
1. `transfer` from `acc_cash` → `acc_sofi` (or `acc_one_pay`) for the deposit amount.
2. Then `buy-eval` (or `log-expense` for the eval) from `acc_sofi`/`acc_one_pay`.
3. If the cash came from the rent pool, also increase `acc_rent_held` as above.

**ALWAYS use the API endpoints — never write to the database directly.** Every `log-expense`, `log-income`, `transfer`, `buy-eval`, `record-payout` call records undo data, so `undo` can revert the balance AND the budget stats together. Direct SQL writes bypass this and make stats drift.

### 5.7g Trading Mode widget — full bot control → `POST db-accounts`

The Trading Mode gauge widget on the Accounts tab is fully bot-driven. The bot computes the score, sets the mode, manages the bullet points, and sets the session loss limits. The widget just reads from the API.

**The bot's job (every NY + Asian session):**

1. Read state: `GET db-state-full` → get active accounts, payouts, budget
2. Compute score (see formula below)
3. Push state: `POST db-accounts { action: "update-trading-mode", score, mode, maxEvalLoss, maxFundedLoss, maxLiveLoss, notes }`
4. Ask Daniel for session limits if needed: "How many evals, funded, and live accounts can you risk losing this session?"
5. Set limits: `POST db-accounts { action: "set-session-limits", maxEvalLoss, maxFundedLoss, maxLiveLoss }`
6. Send summary to Daniel on Telegram

**You do NOT need to compute or push `evalCount`, `fundedCount`, `liveCount`, `cashOnHand`, or `totalDebt`.** Those counters are now derived automatically from the budget and accounts tabs on every read — the widget ignores whatever you send for them. You only control the mode, score, session limits, notes, and rules. (If you still send the counters, they're stored but overridden on read.)

**Score formula:**

```
avgEvalCost = average of cost field from active challenges
  (fallback: $25K ≈ $70, $50K ≈ $90, $100K ≈ $175)

monthlyCostOfLiving = sum of recurring expense transactions (GET db-budget-state action=get-cost-of-living)

adjustedCash = cashOnHand - monthlyCostOfLiving
cushion = adjustedCash / avgEvalCost

debtPenalty = totalDebt / 1000
adjustedCushion = cushion - debtPenalty

Payout bonus: if payouts last 30 days > $500 → +10, > $2000 → +15 (cumulative)
Loss penalty: if 3+ accounts failed last 7 days → -10, if 5+ → -15

Score mapping:
  adjustedCushion < 0  → 5   (Survival)
  < 3  → 15  (Survival)
  < 7  → 25  (Defensive)
  < 10 → 40  (Cautious)
  < 15 → 55  (Balanced)
  < 20 → 70  (Confident)
  else → 90  (Aggressive)

Mode: < 15 = survival, < 30 = defensive, < 45 = cautious,
      < 60 = balanced, < 75 = confident, else = aggressive
```

**6 Modes and their rules:**

| Score | Mode | Cushion | Rules |
|-------|------|---------|-------|
| 0-15 | Survival | < 3 evals | One account at a time. No copy trading. No new eval purchases. You are one loss from zero. |
| 15-30 | Defensive | 3-7 | One account at a time. No copy trading. Can buy 1-2 evals to replace losses. If you lose 2 evals in one session, STOP. |
| 30-45 | Cautious | 7-10 | 1-2 accounts at a time, all individual. No copy trading until 5 funded accounts. Can buy 2-3 evals to replace losses. If you lose 3 evals, STOP. |
| 45-60 | Balanced | 10-15 | 2-3 accounts, all individual (need 5 funded to start copy trading). Do not waste your cushion. Aim for consistent payouts. Last time you were here you splurged — trade carefully. |
| 60-75 | Confident | 15-20 | 3-5 accounts. If 5+ funded: 3 individual + 2 copy traded. Copy group max 2. Aim for consistent payouts. You can absorb losses. Do not splurge on evals. |
| 75-100 | Aggressive | 20+ | Copy trade all — 4+ individual + 3+ copy. Always more individual than copy (4 individual + 3 copy at 7 accounts). Max out payouts. This is the goal. Even here: do not go back to zero. Keep your floor. |

**Copy-trading rule (HARD RULE — not a suggestion):**
- You need at least 5 funded accounts to start copy trading
- Below 5 funded: ALL accounts traded individually
- At 5 funded: 3 individual + 2 copy-traded
- At 6 funded: 4 individual + 2 copy-traded
- At 7+ funded: 4+ individual + 3+ copy-traded
- Individual accounts are ALWAYS the majority
- If Daniel says "copy trade 0001 and 0002" but he only has 4 funded accounts, say: "You only have 4 funded accounts. You need 5 to start copy trading. Keep them individual."

**Splurge guardrail:**
When Daniel moves UP a level (e.g., from Cautious to Balanced), send: "You just reached [mode]. Last time you were at Level 2, you splurged and lost it all. Trade carefully — do not buy 10 evals just because you can."

**Managing bullet points (rules):**

Daniel can add and remove bullet points per mode (survival, defensive, cautious, balanced, confident, aggressive) on the gauge widget. The bot can manage them:

```json
{ "action": "list-trading-modes" }
{ "action": "list-trading-mode-rules" }
{ "action": "add-trading-mode-rule", "mode": "defensive", "rule": "New rule text" }
{ "action": "remove-trading-mode-rule", "mode": "defensive", "index": 2 }
{ "action": "set-trading-mode-rules", "mode": "defensive", "rules": ["rule 1", "rule 2"] }
{ "action": "edit-trading-mode", "mode": "defensive", "rules": ["rule 1", "rule 2", "rule 3"] }
```

`set-trading-mode-rules` and `edit-trading-mode` both replace a mode's full rule list. When Daniel says "add a rule to defensive that says X" or "remove rule 2 from aggressive", use these.

**Session loss limits:**

Daniel sets how many evals, funded, and live accounts he can risk losing per session. Ask him when his situation changes — e.g. at the start of each session, or if he says "I can lose 3 evals today" or "how many accounts can I risk?" — then set them.

```json
{ "action": "get-session-limits" }
{ "action": "set-session-limits", "maxEvalLoss": 2, "maxFundedLoss": 1, "maxLiveLoss": 0 }
```

**Cron jobs:**
- NY session: 09:00 UTC (5am EST), Mon-Fri
- Asian session: 21:00 UTC (5pm EST), Sun-Thu

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
{ "action": "log-trade", "accountRef": "ZERO-0857", "amount": 1493,
  "idempotencyKey": "tg-msg-84321" }
```

Use something stable and unique — the Telegram message id is ideal. The response carries `idempotentReplay: true` when it's a replay. Supported on `buy-eval`, `pass-eval`, `fail-account`, `log-trade`, `record-payout` and `undo`.

### 5.7d "Done for the Day" → `POST db-accounts`

When Daniel says he's done trading an account for the day, after logging the session P&L with `log-trade`, mark it done:

**Mark one account done:**
```json
{ "action": "done-for-day", "accountRef": "0048" }
```

**Reset all cards (start a new trading day):**
```json
{ "action": "uncollapse-all" }
```

This clears `done_for_day` on all accounts so the "DONE FOR THE DAY" overlay disappears. Use when Daniel says "new day", "reset", or "starting fresh".



"Scratch that, wrong account."

```json
{ "action": "undo" }
```

Reverses the last action. Pass `actionId` to target a specific one; `GET db-state-full?action=history` lists them.

Reversible: `log-trade`, `correct-trade`, `record-payout` (including every budget slice), `fail-account`, `log-expense`, `transfer`, `reconcile-balances`, `correct-plan`. Buying and passing an eval are **not** auto-reversible — they create accounts that may have been traded on since; you'll get `not_undoable` and should ask Daniel exactly what to unwind.

**Confirm before undoing.** Read the summary back to him first: *"Last action was 'Win of $800.00 on 0857' — undo that?"*

**Correcting a trade** (wrong amount, wrong win/loss) is also undoable. Use `correct-trade` to fix it in-place — the account balance is recomputed from the trade ledger — or `undo` to reverse the last trade entirely. Both are journaled.

---

## 6. Drawdown verdicts — the rule that got 9058 wrong

`log-trade` returns a `verdict`. **Read `consequence`, not `breached`.** What a breach *means* depends on the plan:

| `consequence` | Meaning |
|---|---|
| `none` | Fine, keep trading |
| `session_lockout` | Daily limit hit on an **EOD** plan. Locked out for the session, **account survives**, trades again next session. |
| `account_lost` | **A WARNING ONLY — the account is NOT dead.** Propfolio only sees trades Daniel logged, not his real broker balance, so this verdict can be wrong. Tell him it *looks* blown by Propfolio's numbers and ask him to check the platform. **Nothing changes until he says it failed**, at which point you call `fail-account`. |

Two drawdown styles:

- **EOD / session** — the limit resets each session. Hitting it is a lockout; the account survives.
- **Intraday trailing** — the floor trails equity during the session. Touching it is far more serious.

**Do NOT infer the style from the plan name.** That was wrong on Daniel's own account — the old table had Alpha **Zero** as trailing when it is actually **EOD**, which would have reported a survivable lockout as a dead account. Style is now a stored per-account fact in the `plan_rules` catalogue. If it isn't recorded, the verdict says so and defaults to EOD — ask Daniel once and store it with `set-plan-rule`.

Firms change this often (MFF now sells an EOD Rapid), so treat the catalogue as the truth and the plan name as meaningless.

**Either way, the account is never marked lost by a calculation.** Daniel decides. See `account_lost` above.

A max-drawdown breach is serious on **every** plan — but it is still only a warning from Propfolio, which cannot see his broker. Report it, don't act on it.

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
| `use_buy_eval` | Bare challenge POST without `action: "buy-eval"` | Use `action: "buy-eval"` instead. |

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
9. **Everything is connected through code.** One `buy-eval` call creates the challenge row, account card, budget expense, and calendar row in one transaction. One `pass-eval` retires the eval, creates the funded card, and links them. One `log-trade` updates the trade row, balance, HWM, calendar entry, and drawdown verdict. Never call three endpoints to do what one does — the cascade is the atomic unit, and calling pieces separately is how surfaces drift apart.
10. **Never loop `buy-eval` for a batch.** Use `accounts[]` in a single `buy-eval` call. Looping produced only 1 card for a batch of 3 because the unique index blocked the 2nd insert.
11. **Always send `idempotencyKey` on writes.** The Telegram message id works. Without it, a Netlify timeout + retry double-writes the trade.

---

## 9. The old data

221 challenges, 23 accounts, 46 trades and 29 payouts of history (lifetime $30,730.62 spent / $42,089.37 paid out) were **imported into the public schema on Sep 10 2026**. The archive schema still exists as a backup, but the data is now visible on the dashboard — the year filter shows 2025 vs 2026 breakdowns, and the pass rate / spend / payout stats include all history.

The imported archive challenges have `lifecycle` derived from their old `status` field (failed → eval_failed, passed → eval_passed). Some have `funded_failed` if they had payouts. They do NOT have `account_id` links (the archive didn't store them) or `account_first4`.

If Daniel asks about pre-September-2026 history, it's all on the dashboard now — no need to query the archive schema separately.

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
| "made 800 on each of the 3 copy-traded 50Ks" | `log-trade` 3 times — one per account ref (see §5.12) |
| "actually it was 1200, not 1493" | `correct-trade` (fixes the amount in-place, recomputes balance) |
| "bought 3 lucid 50ks" | `buy-eval` with `accounts[]` (NOT a loop of 3 calls) |
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

---

## 12. Copy-trade groups — logging trades on linked accounts

Daniel copy-trades multiple accounts at once. They are linked as a **copy-trade group** in the database (`trading_accounts.copy_trade_group`). The dashboard shows them as ONE card (using the first account's balance/size) — double-click expands to see each account individually.

### How to log trades on a copy-trade group

**Log EACH account separately.** Different firms have different fills and fees, so the end result on each account may be slightly different. Daniel will give you individual amounts per account.

```json
{ "action": "log-trade", "accountRef": "LFE0-0048", "amount": 800.00 }
{ "action": "log-trade", "accountRef": "LFE0-0049", "amount": 798.50 }
{ "action": "log-trade", "accountRef": "LFE0-0050", "amount": 801.25 }
```

Send one `log-trade` per account. Each gets its own trade row, its own balance update, and its own drawdown verdict. The `idempotencyKey` prevents a retry from double-logging.

### What NOT to do

- **Do NOT sum the amounts and log once.** Each account has its own balance, its own drawdown, and its own stop-out level. Logging $2,400 on one account would blow its drawdown calculation.
- **Do NOT guess that the amounts are the same.** Daniel will tell you each one. If he says "made 800 on each" without specifics, ask: "Were the fills identical or should I log each one separately?"
- **Do NOT unlink accounts to log trades.** The `unlink-copy-trade` API is for managing group membership, not for logging. Log each account by its own ref.

### Linking / unlinking copy-trade accounts

```
POST db-accounts { "action": "link-copy-trade", "accountRefs": ["0048","0049","0050"], "groupLabel": "Lucid Flex 50K trio" }
POST db-accounts { "action": "unlink-copy-trade", "accountRef": "0049" }
```

Linking sets `copy_trade_group` on each account to the same label. Unlinking clears it on one account only. The dashboard groups accounts with the same `copy_trade_group` value into one card.

### When Daniel passes an eval that's copy-traded

When he passes an eval that's part of a copy-trade group, `pass-eval` retires that ONE eval and creates ONE funded account. The other copy-traded evals remain active. If he passes all of them, each gets its own `pass-eval` call — and he'll tell you the funded account numbers for each. Ask: "Same funded number for all, or different ones?"
