import type { Handler } from '@netlify/functions'
import { json, getUserFromSession } from './_utils'
import { payoutService, challengeService, sessionService } from '../../server/db/service'

export const handler: Handler = async (event) => {
  try {
    const user = await getUserFromSession(event)
    if (!user) return json(401, { error: 'Unauthorized' })

    if (event.httpMethod === 'POST') {
      const { challengeId, amount, date, description } = JSON.parse(event.body || '{}')
      if (!challengeId || !amount || !date) return json(400, { error: 'challengeId, amount, date required' })
      const created = await payoutService.create(user.id, { challengeId, amount: String(amount), date, description } as any)
      return json(200, { payout: { id: created.id, amount: Number(amount), date, description } })
    }

    if (event.httpMethod === 'DELETE') {
      const { payoutId } = JSON.parse(event.body || '{}')
      if (!payoutId) return json(400, { error: 'payoutId required' })
      await payoutService.delete(payoutId)
      return json(204, {})
    }

    return json(405, { error: 'Method Not Allowed' })
  } catch (e) {
    console.error('db-payouts error', e)
    return json(500, { error: 'Internal Server Error' })
  }
}
