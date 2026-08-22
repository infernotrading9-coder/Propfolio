import type { Handler } from '@netlify/functions'
import { json, getUserFromSession } from './_utils'
import { calendarAccountService, calendarEntryService } from '../../server/db/service'

export const handler: Handler = async (event) => {
  try {
    const user = await getUserFromSession(event)
    if (!user) return json(401, { error: 'Unauthorized' })

    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {}

      // Get all calendar accounts + entries for this user
      if (params.action === 'all') {
        const accounts = await calendarAccountService.getByUserId(user.id)
        const entries: Record<string, any[]> = {}
        for (const acct of accounts) {
          const acctEntries = await calendarEntryService.getByAccountId(acct.id)
          entries[acct.id] = acctEntries.map((e: any) => ({
            id: e.id,
            date: e.date,
            followedRules: e.followedRules,
            ruleCompliance: e.ruleCompliance ? JSON.parse(e.ruleCompliance) : null,
            notes: e.notes,
          }))
        }
        return json(200, { accounts: accounts.map((a: any) => ({
          id: a.id,
          name: a.name,
          challengeId: a.challengeId,
          isActive: a.isActive,
          createdAt: a.createdAt,
        })), entries })
      }

      // Get entries for a specific calendar account
      if (params.accountId) {
        const entries = await calendarEntryService.getByAccountId(params.accountId)
        return json(200, { entries: entries.map((e: any) => ({
          id: e.id,
          date: e.date,
          followedRules: e.followedRules,
          ruleCompliance: e.ruleCompliance ? JSON.parse(e.ruleCompliance) : null,
          notes: e.notes,
        })) })
      }

      return json(400, { error: 'Use action=all or accountId param' })
    }

    if (event.httpMethod === 'POST') {
      const input = JSON.parse(event.body || '{}')

      // Create a new calendar account
      if (input.action === 'create-account') {
        const { name, challengeId } = input
        if (!name) return json(400, { error: 'name is required' })
        const account = await calendarAccountService.create(user.id, { name, challengeId })
        return json(200, { account })
      }

      // Upsert a calendar entry (create or update by date)
      if (input.action === 'upsert-entry') {
        const { calendarAccountId, date, followedRules, ruleCompliance, notes } = input
        if (!calendarAccountId || !date) {
          return json(400, { error: 'calendarAccountId and date are required' })
        }
        // Verify ownership
        const acct = await calendarAccountService.getById(calendarAccountId)
        if (!acct || acct.userId !== user.id) {
          return json(403, { error: 'Calendar account not found or not owned by user' })
        }
        const entry = await calendarEntryService.upsert(calendarAccountId, {
          date,
          followedRules: followedRules ?? null,
          ruleCompliance: ruleCompliance || null,
          notes: notes || null,
        })
        return json(200, { entry: {
          id: entry.id,
          date: entry.date,
          followedRules: entry.followedRules,
          ruleCompliance: entry.ruleCompliance ? JSON.parse(entry.ruleCompliance) : null,
          notes: entry.notes,
        } })
      }

      return json(400, { error: 'Invalid action. Use: create-account or upsert-entry' })
    }

    if (event.httpMethod === 'DELETE') {
      const input = JSON.parse(event.body || '{}')
      const { accountId } = input
      if (!accountId) return json(400, { error: 'accountId required' })
      // Verify ownership
      const acct = await calendarAccountService.getById(accountId)
      if (!acct || acct.userId !== user.id) {
        return json(403, { error: 'Not owned by user' })
      }
      await calendarAccountService.delete(accountId)
      return json(204, {})
    }

    return json(405, { error: 'Method Not Allowed' })
  } catch (e) {
    console.error('db-calendar error', e)
    return json(500, { error: 'Internal Server Error' })
  }
}
