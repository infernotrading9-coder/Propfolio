import type { Handler } from '@netlify/functions'
import { json, getUserFromSession } from './_utils'
import { getFullState, listRecentActions, undoAction, withIdempotency } from '../../server/db/stateService'
import { CascadeError } from '../../server/db/cascadeService'

/**
 * db-state-full — one read for everything the bot needs, plus undo.
 *
 * The bot used to assemble its picture from several calls (accounts, then
 * challenges, then budget), which is slow over Telegram and lets it act on a
 * half-stale view. This returns the whole thing in one shot, including the
 * consistency maths Daniel otherwise does by hand.
 *
 *   GET                    -> full state
 *   GET  ?action=history   -> recent reversible actions
 *   POST { action: 'undo' } -> reverse the last action (or a specific id)
 */
export const handler: Handler = async (event) => {
  try {
    const user = await getUserFromSession(event)
    if (!user) return json(401, { error: 'Unauthorized' })

    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {}

      if (params.action === 'history') {
        const actions = await listRecentActions(user.id, Number(params.limit) || 5)
        return json(200, { actions })
      }

      const state = await getFullState(user.id)
      return json(200, state)
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}')

      if (body.action === 'undo') {
        try {
          // Undo is itself idempotent: a retried undo must not reverse the
          // action twice (which would re-apply it).
          const r = await withIdempotency(user.id, body.idempotencyKey, 'undo',
            () => undoAction(user.id, body.actionId))
          return json(200, r)
        } catch (e) {
          if (e instanceof CascadeError) return json(400, { error: e.message, code: e.code })
          throw e
        }
      }

      return json(400, { error: 'Unknown action', code: 'unknown_action' })
    }

    return json(405, { error: 'Method Not Allowed' })
  } catch (e) {
    console.error('db-state-full error', e)
    return json(500, { error: 'Internal Server Error' })
  }
}
