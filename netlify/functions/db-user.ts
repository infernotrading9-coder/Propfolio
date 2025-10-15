import type { Handler } from '@netlify/functions'
import { json, getUserFromSession } from './_utils'
import { userStateService } from '../../server/db/service'

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'PUT') return json(405, { error: 'Method Not Allowed' })
    const user = await getUserFromSession(event)
    if (!user) return json(401, { error: 'Unauthorized' })

    const { firmId } = JSON.parse(event.body || '{}')
    await userStateService.upsert(user.id, { selectedFirmId: firmId } as any)
    return json(204, {})
  } catch (e) {
    console.error('db-user error', e)
    return json(500, { error: 'Internal Server Error' })
  }
}
