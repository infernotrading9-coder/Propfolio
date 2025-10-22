import type { Handler } from '@netlify/functions'
import { json, getUserFromSession } from './_utils'
import { challengeService } from '../../server/db/service'

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'PUT') return json(405, { error: 'Method Not Allowed' })
    const user = await getUserFromSession(event)
    if (!user) return json(401, { error: 'Unauthorized' })

    const { challengeId, phase, completed, completedAt } = JSON.parse(event.body || '{}')
    if (!challengeId || !phase) return json(400, { error: 'challengeId and phase required' })

    const when = completed ? (completedAt ? new Date(completedAt) : new Date()) : null
    const update: any = {}
    if (phase === 'phase1') { update.phase1Completed = !!completed; update.phase1CompletedAt = when }
    if (phase === 'phase2') { update.phase2Completed = !!completed; update.phase2CompletedAt = when }
    if (phase === 'phase3') { update.phase3Completed = !!completed; update.phase3CompletedAt = when }

    await challengeService.update(challengeId, update)
    return json(204, {})
  } catch (e) {
    console.error('db-phase error', e)
    return json(500, { error: 'Internal Server Error' })
  }
}
