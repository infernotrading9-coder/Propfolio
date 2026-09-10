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

    const existing = await challengeService.getById(challengeId)
    if (!existing || (existing as any).userId !== user.id) return json(404, { error: 'Challenge not found', code: 'not_found' })
    const totalPhases = Number((existing as any).totalPhases || 3)
    const finalPhase = totalPhases <= 1 ? 'phase1' : totalPhases === 2 ? 'phase2' : 'phase3'
    if (completed && phase === finalPhase) {
      return json(400, {
        error: 'Passing the final eval phase must use pass-eval so Propfolio creates exactly one funded account and retires the eval card.',
        code: 'use_pass_eval',
      })
    }

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
