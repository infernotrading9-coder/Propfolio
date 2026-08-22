import type { Handler } from '@netlify/functions'
import { json, getUserFromSession } from './_utils'
import { tradeService, tradingAccountService } from '../../server/db/service'

export const handler: Handler = async (event) => {
  try {
    const user = await getUserFromSession(event)
    if (!user) return json(401, { error: 'Unauthorized' })

    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {}
      
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
