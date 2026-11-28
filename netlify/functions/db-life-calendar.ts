import type { Handler } from '@netlify/functions'
import { json, getUserFromSession } from './_utils'
import { db } from '../../server/db/connection'
import { lifeCalendarItems } from '../../server/db/schema'
import { and, asc, eq, gte, lte, sql } from 'drizzle-orm'

/**
 * Life calendar API — the Life tab's own calendar (events + todos).
 *
 * ⚠️ NOT the trading rule calendar (`db-calendar` / `calendar_entries`) and not
 * the Whispersonalbot-pushed `daily_agenda`. This endpoint owns exactly one
 * table, `life_calendar_items`, and nothing else reads or writes it.
 *
 * GET  ?from=YYYY-MM-DD&to=YYYY-MM-DD   → { items: [] }   (to defaults to from)
 * POST { action: 'create' | 'update' | 'move' | 'toggle' | 'delete', ... }
 *
 * `toggle` FLIPS the stored `done`. The web UI deliberately does not use it for
 * ticking a todo off — it sends `update { done: <desired> }` instead, because a
 * flip is not idempotent and a stale tab would double-flip. `toggle` is kept for
 * scripted callers that genuinely mean "flip it".
 *
 * Every mutation is scoped by user_id in the WHERE clause, not checked before it,
 * so a leaked id from another user can only ever be a 404.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{1,2}:\d{2}$/
const KINDS = ['event', 'todo'] as const
/** Todo horizons. NULL is legal and means "unfiled" — see the 69 migration. */
const BUCKETS = ['soon', 'mid', 'long'] as const

const shape = (r: any) => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  notes: r.notes,
  date: r.date,
  startTime: r.startTime,
  endTime: r.endTime,
  category: r.category,
  bucket: r.bucket ?? null,
  color: r.color ?? null,
  done: !!r.done,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
})

/** 'H:MM' / '9:5' → 'HH:MM'. Returns null for null/blank, undefined when malformed. */
function normTime(v: unknown): string | null | undefined {
  if (v === null || v === undefined || v === '') return null
  const s = String(v).trim()
  if (!TIME_RE.test(s)) return undefined
  const [h, m] = s.split(':')
  return `${String(Number(h)).padStart(2, '0')}:${m}`
}

function cleanTitle(v: unknown): string | null {
  const s = String(v ?? '').trim()
  if (!s) return null
  return s.slice(0, 200)
}

export const handler: Handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-User-Id,X-User-Email,X-User-Name',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  }
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' }

  const user = await getUserFromSession(event)
  if (!user) return json(401, { error: 'Unauthorized — use X-User-Id and X-User-Email headers' }, headers)

  try {
    if (event.httpMethod === 'GET') {
      const q = event.queryStringParameters || {}
      const from = q.from || q.date
      const to = q.to || from
      if (!from || !DATE_RE.test(from)) return json(400, { error: 'from must be YYYY-MM-DD' }, headers)
      if (!to || !DATE_RE.test(to)) return json(400, { error: 'to must be YYYY-MM-DD' }, headers)

      const rows = await db.select().from(lifeCalendarItems)
        .where(and(
          eq(lifeCalendarItems.userId, user.id),
          gte(lifeCalendarItems.date, from),
          lte(lifeCalendarItems.date, to),
        ))
        // Events sort by time (all-day first), then by insertion so the order is stable.
        .orderBy(
          asc(lifeCalendarItems.date),
          sql`${lifeCalendarItems.startTime} NULLS FIRST`,
          asc(lifeCalendarItems.createdAt),
        )
      return json(200, { items: rows.map(shape) }, headers)
    }

    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' }, headers)

    const body = JSON.parse(event.body || '{}')
    const action = body.action

    // ── create ──────────────────────────────────────────────────────────────
    if (action === 'create') {
      const kind = String(body.kind || 'event')
      if (!KINDS.includes(kind as any)) return json(400, { error: "kind must be 'event' or 'todo'" }, headers)
      const title = cleanTitle(body.title)
      if (!title) return json(400, { error: 'title is required' }, headers)
      if (!DATE_RE.test(String(body.date || ''))) return json(400, { error: 'date must be YYYY-MM-DD' }, headers)

      // A todo has no clock time — the columns stay null whatever was sent.
      const isTodo = kind === 'todo'
      const startTime = isTodo ? null : normTime(body.startTime)
      const endTime = isTodo ? null : normTime(body.endTime)
      if (startTime === undefined) return json(400, { error: 'startTime must be HH:MM' }, headers)
      if (endTime === undefined) return json(400, { error: 'endTime must be HH:MM' }, headers)

      // Todos carry a horizon ('soon' | 'mid' | 'long'); events carry a palette
      // colour. Both are optional — NULL is legal and just means "not filed yet".
      const bucket = 'bucket' in body && body.bucket ? String(body.bucket) : null
      if (bucket && !BUCKETS.includes(bucket as any)) {
        return json(400, { error: "bucket must be 'soon', 'mid' or 'long'" }, headers)
      }
      const color = !isTodo && body.color ? String(body.color).slice(0, 24) : null

      const [row] = await db.insert(lifeCalendarItems).values({
        userId: user.id,
        kind,
        title,
        notes: body.notes ? String(body.notes).slice(0, 2000) : null,
        date: String(body.date),
        startTime,
        endTime,
        category: body.category ? String(body.category).slice(0, 40) : null,
        bucket: isTodo ? bucket : null,
        color,
        done: false,
      }).returning()
      return json(200, { item: shape(row) }, headers)
    }

    // Every remaining action needs a target id.
    const id = String(body.id || '')
    if (!id) return json(400, { error: 'id is required' }, headers)

    // ── move (drag & drop) ──────────────────────────────────────────────────
    // The whole point of the calendar, so it is its own action rather than a
    // general update: only the day (and optionally the time) can change.
    if (action === 'move') {
      if (!DATE_RE.test(String(body.date || ''))) return json(400, { error: 'date must be YYYY-MM-DD' }, headers)
      const patch: Record<string, any> = { date: String(body.date), updatedAt: new Date() }
      if ('startTime' in body) {
        const t = normTime(body.startTime)
        if (t === undefined) return json(400, { error: 'startTime must be HH:MM' }, headers)
        patch.startTime = t
      }
      if ('endTime' in body) {
        const t = normTime(body.endTime)
        if (t === undefined) return json(400, { error: 'endTime must be HH:MM' }, headers)
        patch.endTime = t
      }
      const [row] = await db.update(lifeCalendarItems).set(patch)
        .where(and(eq(lifeCalendarItems.id, id), eq(lifeCalendarItems.userId, user.id)))
        .returning()
      if (!row) return json(404, { error: 'Item not found' }, headers)
      return json(200, { item: shape(row) }, headers)
    }

    // ── update (edit fields) ────────────────────────────────────────────────
    if (action === 'update') {
      const patch: Record<string, any> = { updatedAt: new Date() }
      if ('title' in body) {
        const title = cleanTitle(body.title)
        if (!title) return json(400, { error: 'title cannot be empty' }, headers)
        patch.title = title
      }
      if ('notes' in body) patch.notes = body.notes ? String(body.notes).slice(0, 2000) : null
      if ('category' in body) patch.category = body.category ? String(body.category).slice(0, 40) : null
      if ('bucket' in body) {
        const b = body.bucket ? String(body.bucket) : null
        if (b && !BUCKETS.includes(b as any)) {
          return json(400, { error: "bucket must be 'soon', 'mid' or 'long'" }, headers)
        }
        patch.bucket = b
      }
      if ('color' in body) patch.color = body.color ? String(body.color).slice(0, 24) : null
      if ('date' in body) {
        if (!DATE_RE.test(String(body.date))) return json(400, { error: 'date must be YYYY-MM-DD' }, headers)
        patch.date = String(body.date)
      }
      if ('kind' in body) {
        if (!KINDS.includes(String(body.kind) as any)) return json(400, { error: "kind must be 'event' or 'todo'" }, headers)
        patch.kind = String(body.kind)
      }
      if ('startTime' in body) {
        const t = normTime(body.startTime)
        if (t === undefined) return json(400, { error: 'startTime must be HH:MM' }, headers)
        patch.startTime = t
      }
      if ('endTime' in body) {
        const t = normTime(body.endTime)
        if (t === undefined) return json(400, { error: 'endTime must be HH:MM' }, headers)
        patch.endTime = t
      }
      if ('done' in body) patch.done = !!body.done
      // A todo carries no clock time — switching kind to 'todo' clears them, so a
      // turned-into-todo item can never keep a stale time in the day panel.
      if (patch.kind === 'todo') { patch.startTime = null; patch.endTime = null }

      const [row] = await db.update(lifeCalendarItems).set(patch)
        .where(and(eq(lifeCalendarItems.id, id), eq(lifeCalendarItems.userId, user.id)))
        .returning()
      if (!row) return json(404, { error: 'Item not found' }, headers)
      return json(200, { item: shape(row) }, headers)
    }

    // ── toggle (todos) ──────────────────────────────────────────────────────
    if (action === 'toggle') {
      const [row] = await db.update(lifeCalendarItems)
        .set({ done: sql`NOT ${lifeCalendarItems.done}`, updatedAt: new Date() })
        .where(and(eq(lifeCalendarItems.id, id), eq(lifeCalendarItems.userId, user.id)))
        .returning()
      if (!row) return json(404, { error: 'Item not found' }, headers)
      return json(200, { item: shape(row) }, headers)
    }

    // ── delete ──────────────────────────────────────────────────────────────
    if (action === 'delete') {
      const [row] = await db.delete(lifeCalendarItems)
        .where(and(eq(lifeCalendarItems.id, id), eq(lifeCalendarItems.userId, user.id)))
        .returning()
      if (!row) return json(404, { error: 'Item not found' }, headers)
      return json(200, { ok: true, id }, headers)
    }

    return json(400, {
      error: `Unknown action "${action}". Use: create, update, move, toggle, delete`,
    }, headers)
  } catch (e: any) {
    console.error('db-life-calendar error', e)
    return json(500, { error: e?.message || 'Internal Server Error' }, headers)
  }
}
