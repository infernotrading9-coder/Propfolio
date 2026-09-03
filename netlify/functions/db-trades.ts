import type { Handler } from '@netlify/functions'
import { json, getUserFromSession } from './_utils'
import { tradeService, tradingAccountService } from '../../server/db/service'
import { logTrade, recordPayout, getPlanRule, listPlanRules, upsertPlanRule } from '../../server/db/tradeService'
import { CascadeError } from '../../server/db/cascadeService'
import { recordPayoutWithAllocation, proposeAllocation } from '../../server/db/payoutService'
import { withIdempotency } from '../../server/db/stateService'

export const handler: Handler = async (event) => {
  try {
    const user = await getUserFromSession(event)
    if (!user) return json(401, { error: 'Unauthorized' })

    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {}

      // Everything Propfolio has learned about plan rules. The bot consults
      // this BEFORE buying an eval, so it only asks Daniel about plans that
      // are genuinely new — and never re-asks about ones already confirmed.
      if (params.action === 'plan-rules') {
        if (params.firm && params.evalType) {
          // Consistency differs between eval and funded, so the stage must be
          // explicit. Defaults to 'eval' — the safer side to be wrong on, since
          // an eval rule is usually the stricter one.
          const stage = params.stage === 'funded' ? 'funded' : 'eval'
          const size = params.accountSize ? Number(params.accountSize) : null
          const rule = await getPlanRule(user.id, params.firm, params.evalType, size, stage)
          return json(200, {
            rule,
            known: !!rule,
            stage,
            consistencyKnown: rule ? rule.consistencyPct !== null : false,
          })
        }
        const rules = await listPlanRules(user.id)
        return json(200, { rules })
      }
      
      // Get stats
      if (params.action === 'stats') {
        const stats = await tradeService.getStats(user.id)
        return json(200, { stats })
      }

      // Get trades for a specific account
      if (params.accountId) {
        const accountTrades = await tradeService.getByAccountId(params.accountId)
        return json(200, { trades: accountTrades })
      }

      // Get all trades with optional limit
      const limit = params.limit ? parseInt(params.limit) : undefined
      const allTrades = await tradeService.getByUserId(user.id, limit)
      return json(200, { trades: allTrades })
    }

    if (event.httpMethod === 'POST') {
      const input = JSON.parse(event.body || '{}')

      // ── Cascade actions ─────────────────────────────────────────────────
      // logTrade updates the trade row, balance, HWM, the rule-calendar entry
      // and the drawdown verdict in one transaction — and auto-fails the
      // account when the breach is terminal for that plan.
      if (input.action === 'log-trade' || input.action === 'record-payout'
          || input.action === 'set-plan-rule' || input.action === 'propose-allocation') {
        try {
          if (input.action === 'propose-allocation') {
            // Dry run: what would the split look like? Writes nothing.
            const proposal = await proposeAllocation(user.id, Number(input.amount))
            return json(200, { proposal })
          }
          if (input.action === 'set-plan-rule') {
            // Teach Propfolio a plan's rules, or correct them after a firm
            // changes them. Applies to active accounts on that plan too.
            const r = await upsertPlanRule(user.id, {
              firmName: input.firmName,
              evalType: input.evalType,
              drawdownStyle: input.drawdownStyle,
              consistencyPct: input.consistencyPct,
              profitSplitPct: input.profitSplitPct,
              payoutMin: input.payoutMin,
              winningDayMin: input.winningDayMin,
              winningDaysReq: input.winningDaysReq,
              notes: input.notes,
              applyToActive: input.applyToActive,
            })
            return json(200, r)
          }
          if (input.action === 'log-trade') {
            // Idempotent when the bot supplies a key: a retry after a timeout
            // returns the original result instead of logging the trade twice.
            const r = await withIdempotency(user.id, input.idempotencyKey, 'log-trade',
              () => logTrade({ userId: user.id, ...input }))
            return json(200, r)
          }
          // A payout is INCOME, not just a stat. Without `allocations` this
          // returns a suggested split and writes nothing; send the confirmed
          // allocations back to apply it.
          const r = await withIdempotency(user.id, input.idempotencyKey, 'record-payout',
            () => recordPayoutWithAllocation({
              userId: user.id,
              accountRef: input.accountRef,
              amount: input.amount,
              date: input.date,
              description: input.description,
              allocations: input.allocations,
            }))
          return json(200, r)
        } catch (e) {
          if (e instanceof CascadeError) return json(400, { error: e.message, code: e.code })
          throw e
        }
      }

      const {
        accountId,
        direction,
        instrument,
        entryPrice,
        exitPrice,
        amount,
        result,
        riskReward,
        rulesFollowed,
        rulesBroken,
        behaviors,
        notes,
        tradeDate,
      } = input

      if (!accountId || amount === undefined || !result) {
        return json(400, { error: 'accountId, amount, and result are required' })
      }

      // Verify the account belongs to the user
      const account = await tradingAccountService.getById(accountId)
      if (!account || account.userId !== user.id) {
        return json(403, { error: 'Account not found or not owned by user' })
      }

      const trade = await tradeService.create(user.id, {
        accountId,
        direction: direction || null,
        instrument: instrument || null,
        entryPrice: entryPrice ? String(entryPrice) : null,
        exitPrice: exitPrice ? String(exitPrice) : null,
        amount: String(amount),
        result,
        riskReward: riskReward ? String(riskReward) : null,
        rulesFollowed: rulesFollowed !== false,
        rulesBroken: rulesBroken || [],
        behaviors: behaviors || [],
        notes: notes || null,
        tradeDate: tradeDate ? new Date(tradeDate) : new Date(),
      } as any)

      // Update account balance
      const signedAmount = result === 'loss' ? -Math.abs(parseFloat(String(amount))) : Math.abs(parseFloat(String(amount)))
      const newBalance = parseFloat(String(account.balance)) + signedAmount
      let newDrawdown = parseFloat(String(account.drawdownUsed))
      let newHWM = parseFloat(String(account.highWaterMark))

      if (result === 'loss') {
        newDrawdown += Math.abs(parseFloat(String(amount)))
      } else {
        newDrawdown = Math.max(0, newDrawdown - Math.abs(parseFloat(String(amount))))
        if (newBalance > newHWM) newHWM = newBalance
      }

      await tradingAccountService.updateBalance(accountId, newBalance, newDrawdown, newHWM)

      return json(200, { trade, accountBalance: newBalance, drawdownUsed: newDrawdown, highWaterMark: newHWM })
    }

    if (event.httpMethod === 'DELETE') {
      const { id, reverseBalance } = JSON.parse(event.body || '{}')
      if (!id) return json(400, { error: 'id required' })

      // Deleting a trade used to drop the row and leave the account balance
      // holding its P&L forever. Reverse the effect unless the caller
      // explicitly opts out.
      if (reverseBalance !== false) {
        const existing = await tradeService.getById(id)
        if (existing && (existing as any).userId === user.id) {
          const acct = await tradingAccountService.getById((existing as any).accountId)
          if (acct) {
            const amt = parseFloat(String((existing as any).amount)) || 0
            const wasLoss = (existing as any).result === 'loss'
            const signed = wasLoss ? -Math.abs(amt) : Math.abs(amt)
            const newBalance = parseFloat(String(acct.balance)) - signed
            let newDrawdown = parseFloat(String(acct.drawdownUsed))
            newDrawdown = wasLoss
              ? Math.max(0, newDrawdown - Math.abs(amt))
              : newDrawdown + Math.abs(amt)
            // HWM is a high-water mark: never lower it on a delete, or a later
            // trailing-drawdown calculation silently gains headroom it never had.
            const hwm = parseFloat(String(acct.highWaterMark))
            await tradingAccountService.updateBalance(
              (existing as any).accountId, newBalance, newDrawdown, hwm)
          }
        }
      }

      await tradeService.delete(id)
      return json(204, {})
    }

    return json(405, { error: 'Method Not Allowed' })
  } catch (e) {
    console.error('db-trades error', e)
    return json(500, { error: 'Internal Server Error' })
  }
}
