import type { Handler } from '@netlify/functions'
import { json, getUserFromSession } from './_utils'
import { tradingAccountService, accountDailyOrderService } from '../../server/db/service'

export const handler: Handler = async (event) => {
  try {
    const user = await getUserFromSession(event)
    if (!user) return json(401, { error: 'Unauthorized' })

    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {}

      // Get daily order for a date
      if (params.action === 'daily-order') {
        const date = params.date || new Date().toISOString().slice(0, 10)
        const order = await accountDailyOrderService.getByDate(user.id, date)
        return json(200, { order })
      }

      // Get all daily orders
      if (params.action === 'daily-orders') {
        const orders = await accountDailyOrderService.getByUserId(user.id)
        return json(200, { orders })
      }

      // Get active trading accounts only
      const accounts = await tradingAccountService.getByUserId(user.id)
      const activeAccounts = accounts.filter((a: any) => a.status === 'active')
      return json(200, { accounts: activeAccounts })
    }

    if (event.httpMethod === 'POST') {
      const input = JSON.parse(event.body || '{}')

      // Create a new trading account
      if (input.action === 'create') {
        const { name, firm, accountNumberLast4, accountSize, balance, maxDrawdown, dailyDrawdown, riskPerTrade, rules, notes, status, phase, platform, groupName } = input
        if (!name || !firm) {
          return json(400, { error: 'name and firm are required' })
        }
        const account = await tradingAccountService.create(user.id, {
          name,
          firm,
          accountNumberLast4: accountNumberLast4 || null,
          accountSize: String(accountSize || '0'),
          balance: String(balance || accountSize || '0'),
          drawdownUsed: '0',
          highWaterMark: String(balance || accountSize || '0'),
          maxDrawdown: String(maxDrawdown || '0'),
          dailyDrawdown: String(dailyDrawdown || '0'),
          riskPerTrade: String(riskPerTrade || '0'),
          rules: rules || [],
          notes: notes || null,
          status: status || 'active',
          phase: phase || 'challenge',
          platform: platform || null,
          groupName: groupName || null,
        } as any)
        return json(200, { account })
      }

      // Set daily order
      if (input.action === 'set-daily-order') {
        const { orderDate, orderedAccountIds, notes: orderNotes } = input
        if (!orderDate || !Array.isArray(orderedAccountIds)) {
          return json(400, { error: 'orderDate and orderedAccountIds array are required' })
        }
        const order = await accountDailyOrderService.upsert(user.id, {
          orderDate,
          orderedAccountIds,
          notes: orderNotes,
        })
        return json(200, { order })
      }

      // Reorder accounts
      if (input.action === 'reorder') {
        const { orderedIds } = input
        if (!Array.isArray(orderedIds)) {
          return json(400, { error: 'orderedIds array required' })
        }
        await tradingAccountService.reorder(user.id, orderedIds)
        return json(200, { success: true })
      }

      return json(400, { error: 'Invalid action. Use: create, set-daily-order, or reorder' })
    }

    if (event.httpMethod === 'PUT') {
      const { id, updates } = JSON.parse(event.body || '{}')
      if (!id) return json(400, { error: 'id required' })

      const dbUpdates: any = {}
      if (updates.name !== undefined) dbUpdates.name = updates.name
      if (updates.firm !== undefined) dbUpdates.firm = updates.firm
      if (updates.accountNumberLast4 !== undefined) dbUpdates.accountNumberLast4 = updates.accountNumberLast4
      if (updates.accountSize !== undefined) dbUpdates.accountSize = String(updates.accountSize)
      if (updates.balance !== undefined) dbUpdates.balance = String(updates.balance)
      if (updates.drawdownUsed !== undefined) dbUpdates.drawdownUsed = String(updates.drawdownUsed)
      if (updates.highWaterMark !== undefined) dbUpdates.highWaterMark = String(updates.highWaterMark)
      if (updates.maxDrawdown !== undefined) dbUpdates.maxDrawdown = String(updates.maxDrawdown)
      if (updates.dailyDrawdown !== undefined) dbUpdates.dailyDrawdown = String(updates.dailyDrawdown)
      if (updates.riskPerTrade !== undefined) dbUpdates.riskPerTrade = String(updates.riskPerTrade)
      if (updates.rules !== undefined) dbUpdates.rules = updates.rules
      if (updates.notes !== undefined) dbUpdates.notes = updates.notes
      if (updates.status !== undefined) dbUpdates.status = updates.status
      if (updates.phase !== undefined) dbUpdates.phase = updates.phase
      if (updates.platform !== undefined) dbUpdates.platform = updates.platform
      if (updates.groupName !== undefined) dbUpdates.groupName = updates.groupName

      const updated = await tradingAccountService.update(id, dbUpdates)
      return json(200, { account: updated })
    }

    if (event.httpMethod === 'DELETE') {
      const { id } = JSON.parse(event.body || '{}')
      if (!id) return json(400, { error: 'id required' })
      await tradingAccountService.delete(id)
      return json(204, {})
    }

    return json(405, { error: 'Method Not Allowed' })
  } catch (e) {
    console.error('db-accounts error', e)
    return json(500, { error: 'Internal Server Error' })
  }
}
