import type { Handler } from '@netlify/functions'
import { json, getUserFromSession } from './_utils'
import { propFirmService, challengeService, userStateService, payoutService } from '../../server/db/service'

export const handler: Handler = async (event) => {
  try {
    const user = await getUserFromSession(event)
    if (!user) return json(401, { error: 'Unauthorized' })

    // Add firm
    if (event.httpMethod === 'POST') {
      const { name } = JSON.parse(event.body || '{}')
      if (!name) return json(400, { error: 'Name required' })
      const firm = await propFirmService.create(user.id, { name } as any)
      return json(200, { firm: { id: firm.id, name: firm.name, createdAt: (firm as any).createdAt ? new Date((firm as any).createdAt).toISOString() : new Date().toISOString() } })
    }

    return json(405, { error: 'Method Not Allowed' })
  } catch (e) {
    console.error('db-firms error', e)
    return json(500, { error: 'Internal Server Error' })
  }
}
