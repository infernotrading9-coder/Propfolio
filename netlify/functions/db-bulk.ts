import type { Handler } from '@netlify/functions'
import { json, getUserFromSession } from './_utils'
import { challengeService } from '../../server/db/service'
import { db } from '../../server/db/connection'
import { sql } from 'drizzle-orm'

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' })
    const user = await getUserFromSession(event)
    if (!user) return json(401, { error: 'Unauthorized' })

    const { ids, status } = JSON.parse(event.body || '{}')
    if (!Array.isArray(ids) || !status) return json(400, { error: 'ids array and status required' })

    for (const id of ids) {
      await challengeService.update(id, { status } as any)
      // Keep the trading account card in sync (single source of truth):
      // failing a challenge also marks its account card as lost.
      if (status === 'failed') {
        const challenge = await challengeService.getById(id)
        const last4 = (challenge as any)?.accountLast4
        if (last4) {
          await db.execute(sql`
            UPDATE trading_accounts
            SET status = 'lost', updated_at = NOW()
            WHERE user_id = ${user.id} AND account_number_last4 = ${last4} AND status IN ('active','paused')
          `)
        }
        // Retire the Rule Calendar row too so the calendar only tracks live accounts.
        await db.execute(sql`
          UPDATE calendar_accounts
          SET is_active = false
          WHERE user_id = ${user.id} AND challenge_id = ${id}
        `)
      }
    }
    return json(204, {})
  } catch (e) {
    console.error('db-bulk error', e)
    return json(500, { error: 'Internal Server Error' })
  }
}
