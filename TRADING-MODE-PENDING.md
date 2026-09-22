# Trading Mode Gauge — Pending Changes

These changes are ready to implement when Netlify credits are available.
Do NOT push until Daniel says so.

## 1. Dynamic eval cost based on account size

Right now AVG_EVAL_COST is hardcoded at $85. It should be computed from
the actual active accounts' sizes.

- $25K accounts ≈ $70 per eval
- $50K accounts ≈ $90 per eval
- $100K accounts ≈ $175 per eval

Formula: weightedAvgEvalCost = sum(accountSize * costMultiplier) / count
Or simpler: read the actual `cost` field from the active challenges and
average it.

Then: cashShots = cashOnHand / weightedAvgEvalCost

This way $2000 cash buying $25K evals = ~28 shots (aggressive) but
$2000 buying $100K evals = ~11 shots (balanced).

## 3. Payout income factor

If Daniel has been getting payouts recently, that's income that offsets
his cash needs. He can be slightly more aggressive because money is
flowing in.

- If payouts in last 30 days > $500 → score += 10
- If payouts in last 30 days > $2000 → score += 15
- If zero payouts ever → no bonus (neutral, not a penalty)

Data source: query the `payouts` table for sum(amount) where
payout_date > now() - 30 days.

## 4. Loss momentum penalty

If Daniel has been losing evals rapidly, he's on a losing streak and
should trade more carefully even if cash says otherwise.

- If 3+ accounts failed in last 7 days → score -= 10
- If 5+ accounts failed in last 7 days → score -= 15

Data source: query `trading_accounts` where status = 'lost' and
updated_at > now() - 7 days, count them.

## NOT doing: Drawdown proximity (#2)

Daniel said NO. He full-ports the last $100-200 when an eval is low.
If it hits, he recovers. If it doesn't, he starts fresh. Zero stress.
Babying an eval out of a hole is worse than blowing it and restarting.
Do NOT add a drawdown proximity penalty.

## Current scoring (as of Sep 19):

```
adjustedShots = (totalAccounts + cashOnHand/AVG_EVAL_COST) - totalDebt/1000

< 0  → score 5
< 2  → score 15
< 5  → score 25
< 8  → score 45
< 12 → score 55
< 18 → score 70
< 25 → score 85
else → score 95
```

With $63 cash, $10K debt, 5 accounts: score 5 (hard defensive).
Need ~$863 cash to reach balanced with current debt.
