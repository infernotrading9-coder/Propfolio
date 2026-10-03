import type { Handler } from '@netlify/functions'
import { json, getUserFromSession } from './_utils'
import {
  botNoteService, BOT_NOTE_MAX_KEY, BOT_NOTE_MAX_VALUE, BOT_NOTE_CATEGORIES,
} from '../../server/db/botNoteService'

/**
 * Ticksensei's own scratchpad — `bot_notes`.
 *
 * Daniel tells the bot a fact once ("the Capital One minimum is $35, due the
 * 12th"); the bot writes it here instead of trying to hold it in memory or bake
 * it into a skill. Every `getFullState` hands the notes back, so the bot has
 * them in front of it whenever it is reasoning about the accounts.
 *
 * Use it for things that CHANGE and must stay editable without a code change:
 * minimum payments, due days, priority orderings, standing instructions. Do NOT
 * use it for anything derivable from the data — balances, overdue flags and
 * goals are already in the state read.
 */
export const handler: Handler = async (event) => {
  try {
    const user = await getUserFromSession(event)
    if (!user) return json(401, { error: 'Unauthorized' })

    // ── READ ────────────────────────────────────────────────────────────────
    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {}
      if (params.key) {
        const note = await botNoteService.getByKey(user.id, params.key)
        return json(200, { note, known: note !== null })
      }
      const notes = await botNoteService.listByUser(user.id)
      return json(200, {
        notes,
        count: notes.length,
        // So the bot knows the vocabulary rather than inventing categories.
        categories: BOT_NOTE_CATEGORIES,
      })
    }

    if (event.httpMethod === 'POST') {
      const input = JSON.parse(event.body || '{}')
      const action = String(input.action || '')

      // Accept `key` on the body or as a query param, so a plain
      // `POST ?action=delete-note&key=...` works too.
      const keyArg = input.key ?? (event.queryStringParameters || {}).key

      const validate = (key: any, value: any): string | null => {
        if (typeof key !== 'string' || !key.trim()) return 'key required'
        if (key.trim().length > BOT_NOTE_MAX_KEY) return `key too long (max ${BOT_NOTE_MAX_KEY})`
        if (typeof value !== 'string' || !value.trim()) return 'value required'
        if (value.length > BOT_NOTE_MAX_VALUE) return `value too long (max ${BOT_NOTE_MAX_VALUE})`
        if (input.category != null && input.category !== '' && !(BOT_NOTE_CATEGORIES as readonly string[]).includes(String(input.category))) {
          return `category must be one of: ${BOT_NOTE_CATEGORIES.join(', ')}`
        }
        return null
      }

      // ── set one ───────────────────────────────────────────────────────────
      if (action === 'set-note') {
        const err = validate(input.key, input.value)
        if (err) return json(400, { error: err, code: 'bad_note' })
        const { note, created } = await botNoteService.setNote(user.id, input)
        return json(200, { note, created, message: `${created ? 'Noted' : 'Updated'}: ${note.key}` })
      }

      // ── set several at once ───────────────────────────────────────────────
      // Daniel often rattles off a list ("car is due the 9th, insurance the
      // 9th, water is past due"). One call beats N round-trips.
      if (action === 'set-notes') {
        if (!Array.isArray(input.notes) || input.notes.length === 0) {
          return json(400, { error: 'notes[] required', code: 'no_notes' })
        }
        if (input.notes.length > 50) {
          return json(400, { error: 'too many notes at once (max 50)', code: 'too_many' })
        }
        const results: any[] = []
        for (const n of input.notes) {
          const err = validate(n?.key, n?.value)
          if (err) {
            return json(400, { error: `${err} (on key "${String(n?.key ?? '?')}")`, code: 'bad_note' })
          }
        }
        for (const n of input.notes) {
          results.push(await botNoteService.setNote(user.id, {
            ...n,
            category: n.category ?? input.category,
          }))
        }
        return json(200, {
          saved: results.length,
          created: results.filter(r => r.created).length,
          updated: results.filter(r => !r.created).length,
          notes: results.map(r => r.note),
        })
      }

      // ── delete ────────────────────────────────────────────────────────────
      if (action === 'delete-note') {
        if (input.id) {
          const ok = await botNoteService.deleteById(user.id, String(input.id))
          if (!ok) return json(404, { error: 'Note not found', code: 'not_found' })
          return json(200, { deleted: true, id: String(input.id) })
        }
        if (!keyArg) return json(400, { error: 'key or id required', code: 'no_key' })
        const ok = await botNoteService.deleteByKey(user.id, String(keyArg))
        if (!ok) return json(404, { error: `No note with key "${keyArg}"`, code: 'not_found' })
        return json(200, { deleted: true, key: String(keyArg) })
      }

      return json(400, {
        error: 'Invalid action. Use: set-note, set-notes, delete-note',
      })
    }

    return json(405, { error: 'Method Not Allowed' })
  } catch (e) {
    console.error('db-bot-notes error', e)
    return json(500, { error: 'Internal Server Error' })
  }
}
