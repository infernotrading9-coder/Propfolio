import type { Handler } from '@netlify/functions'
import { json, getUserFromSession } from './_utils'
import { tradeService, tradingAccountService } from '../../server/db/service'
import { logTrade, recordPayout, getPlanRule, listPlanRules, upsertPlanRule } from '../../server/db/tradeService'
import { CascadeError } from '../../server/db/cascadeService'

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
          const rule = await getPlanRule(user.id, params.firm, params.evalType)
          return json(200, { rule, known: !!rule })
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
          || input.action === 'set-plan-rule') {
        try {
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
            const r = await logTrade({ userId: user.id, ...input })
            return json(200, r)
          }
          const r = await recordPayout({
            userId: user.id,
            accountRef: input.accountRef,
            amount: input.amount,
            date: input.date,
            description: input.description,
          })
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
      const { id } = JSON.parse(event.body || '{}')
      if (!id) return json(400, { error: 'id required' })
      await tradeService.delete(id)
      return json(204, {})
    }

    return json(405, { error: 'Method Not Allowed' })
  } catch (e) {
    console.error('db-trades error', e)
    return json(500, { error: 'Internal Server Error' })
  }
}
