import type { Handler } from '@netlify/functions'
import { json, getUserFromSession } from './_utils'
import { challengeService } from '../../server/db/service'

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' })
    const user = await getUserFromSession(event)
    if (!user) return json(401, { error: 'Unauthorized' })

    const { ids, status } = JSON.parse(event.body || '{}')
    if (!Array.isArray(ids) || !status) return json(400, { error: 'ids array and status required' })

    for (const id of ids) {
      await challengeService.update(id, { status } as any)
    }
    return json(204, {})
  } catch (e) {
    console.error('db-bulk error', e)
    return json(500, { error: 'Internal Server Error' })
  }
}
