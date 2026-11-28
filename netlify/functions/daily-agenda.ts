import type { Handler } from '@netlify/functions'
import { json, getUserFromSession } from './_utils'
import { db } from '../../server/db/connection'
import { agendaOverrides, dailyAgenda } from '../../server/db/schema'
import { and, eq, gte, lte, or } from 'drizzle-orm'

/**
 * Today's calendar date in the trader's own timezone — DST-correct.
 *
 * These functions run on a UTC box, so `new Date().toISOString().slice(0,10)` is
 * only right until ~19:00/20:00 ET, after which it quietly returns TOMORROW and the
 * calendar opens on the wrong day. `en-CA` formats as YYYY-MM-DD, and Intl applies
 * the America/New_York offset for the actual date, so EDT/EST is handled for us.
 */
function etToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())
}

/**
 * Daily agenda — the day-by-day schedule Whispersonalbot pushes from Obsidian.
 *
 * GET  ?date=YYYY-MM-DD                     → { date, entries, overrides, updatedAt }
 * GET  ?from=YYYY-MM-DD&to=YYYY-MM-DD       → { from, to, days: [...], overrides: [...] }
 *
 * POST { date, entries }                    → REPLACES that date's entries  [the bot]
 * POST { action: 'override-entry',   ... }  → upsert Daniel's site-side edit  [the calendar]
 * POST { action: 'clear-overrides',  ... }  → drop overrides after reconciling
 *
 * ⚠️ THE TWO WRITE PATHS ARE NOT THE SAME THING, and that is deliberate.
 *
 * The bot's POST replaces a whole date's `entries`, so if the calendar UI edited
 * that array directly the bot's next push would SILENTLY REVERT Daniel's drag.
 * Instead a drag writes an `agenda_overrides` row, which the calendar applies ON
 * TOP of the stored entry — so his edit survives every re-push, and the bot can
 * read the overrides, fix the Obsidian file, then clear them.
 *
 * Overrides are keyed by (user_id, date, title), never by array index: the bot
 * rewrites the array wholesale, so an index would point at a different entry the
 * moment anything is added or removed.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{1,2}:\d{2}$/

const badDate = (v: unknown) => !v || !DATE_RE.test(String(v))

/** 'H:MM' → 'HH:MM'. null for null/blank, undefined when malformed. */
function normTime(v: unknown): string | null | undefined {
  if (v === null || v === undefined || v === '') return null
  const s = String(v).trim()
  if (!TIME_RE.test(s)) return undefined
  const [h, m] = s.split(':')
  return `${String(Number(h)).padStart(2, '0')}:${m}`
}

const shapeOverride = (r: any) => ({
  id: r.id,
  date: r.date,
  title: r.title,
  movedToDate: r.movedToDate ?? null,
  startTime: r.startTime ?? null,
  endTime: r.endTime ?? null,
  updatedAt: r.updatedAt,
})

/**
 * Overrides for a window. A cross-day drag stores the ORIGINAL date, so the row
 * is only found by `date`; it also has to be found by `movedToDate` or the entry
 * would vanish from the day it was dragged TO on any read that starts there.
 */
async function overridesInWindow(userId: string, from: string, to: string) {
  const rows = await db.select().from(agendaOverrides).where(and(
    eq(agendaOverrides.userId, userId),
    or(
      and(gte(agendaOverrides.date, from), lte(agendaOverrides.date, to)),
      and(gte(agendaOverrides.movedToDate, from), lte(agendaOverrides.movedToDate, to)),
    ),
  ))
  return rows.map(shapeOverride)
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

      // RANGE read — the Life calendar asks for a whole month in one request
      // (one call per day would be 30+ round trips). Only non-empty days come
      // back; a missing day means nothing was scheduled.
      if (q.from) {
        const from = q.from
        const to = q.to || from
        if (badDate(from)) return json(400, { error: 'from must be YYYY-MM-DD' }, headers)
        if (badDate(to)) return json(400, { error: 'to must be YYYY-MM-DD' }, headers)

        const rows = await db.select().from(dailyAgenda)
          .where(and(eq(dailyAgenda.userId, user.id), gte(dailyAgenda.date, from), lte(dailyAgenda.date, to)))
        return json(200, {
          from, to,
          days: rows
            .sort((a, b) => (a.date < b.date ? -1 : 1))
            .map((r) => ({ date: r.date, entries: JSON.parse(r.entries), updatedAt: r.updatedAt })),
          overrides: await overridesInWindow(user.id, from, to),
        }, headers)
      }

      // ⚠️ NOT `new Date().toISOString().slice(0,10)` — that converts to UTC first,
      // and these functions run on a UTC box, so after ~7pm ET "today" silently
      // becomes TOMORROW's date on the calendar. Format in the trader's own zone
      // instead; Intl handles the DST switch for us, so it stays right in summer.
      const date = q.date || etToday()
      if (badDate(date)) return json(400, { error: 'date must be YYYY-MM-DD' }, headers)
      const [row] = await db.select().from(dailyAgenda)
        .where(and(eq(dailyAgenda.userId, user.id), eq(dailyAgenda.date, date))).limit(1)
      return json(200, {
        date,
        entries: row ? JSON.parse(row.entries) : [],
        overrides: await overridesInWindow(user.id, date, date),
        updatedAt: row?.updatedAt ?? null,
      }, headers)
    }

    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' }, headers)

    const body = JSON.parse(event.body || '{}')

    // ── Daniel's edit to an entry, recorded as an override ───────────────────
    if (body.action === 'override-entry') {
      const date = String(body.date || '')
      const title = String(body.title || '').trim()
      if (badDate(date)) return json(400, { error: 'date must be YYYY-MM-DD' }, headers)
      if (!title) return json(400, { error: 'title is required' }, headers)

      const startTime = normTime(body.startTime)
      const endTime = normTime(body.endTime)
      if (startTime === undefined) return json(400, { error: 'startTime must be HH:MM' }, headers)
      if (endTime === undefined) return json(400, { error: 'endTime must be HH:MM' }, headers)

      const movedToDate = body.movedToDate ? String(body.movedToDate) : null
      if (movedToDate && badDate(movedToDate)) return json(400, { error: 'movedToDate must be YYYY-MM-DD' }, headers)

      const [row] = await db.insert(agendaOverrides)
        .values({ userId: user.id, date, title: title.slice(0, 300), movedToDate, startTime, endTime })
        .onConflictDoUpdate({
          target: [agendaOverrides.userId, agendaOverrides.date, agendaOverrides.title],
          set: { movedToDate, startTime, endTime, updatedAt: new Date() },
        })
        .returning()
      return json(200, { override: shapeOverride(row) }, headers)
    }

    // ── drop overrides once the Obsidian file matches again ──────────────────
    if (body.action === 'clear-overrides') {
      const keys = Array.isArray(body.keys) ? body.keys : null
      if (keys && keys.length) {
        let cleared = 0
        for (const k of keys.slice(0, 200)) {
          if (badDate(k?.date) || !k?.title) continue
          const done = await db.delete(agendaOverrides)
            .where(and(
              eq(agendaOverrides.userId, user.id),
              eq(agendaOverrides.date, String(k.date)),
              eq(agendaOverrides.title, String(k.title)),
            ))
            .returning()
          cleared += done.length
        }
        return json(200, { ok: true, cleared }, headers)
      }
      if (badDate(body.date)) return json(400, { error: 'pass keys[] or a date' }, headers)
      const done = await db.delete(agendaOverrides)
        .where(and(eq(agendaOverrides.userId, user.id), eq(agendaOverrides.date, String(body.date))))
        .returning()
      return json(200, { ok: true, cleared: done.length }, headers)
    }

    // ── legacy: whole-day replace (this is what the bot sends) ───────────────
    const { date, entries } = body
    if (!date || !entries) return json(400, { error: 'date and entries required' }, headers)
    if (badDate(date)) return json(400, { error: 'date must be YYYY-MM-DD' }, headers)

    const existing = await db.select().from(dailyAgenda)
      .where(and(eq(dailyAgenda.userId, user.id), eq(dailyAgenda.date, date))).limit(1)
    if (existing.length > 0) {
      await db.update(dailyAgenda).set({ entries: JSON.stringify(entries), updatedAt: new Date() }).where(eq(dailyAgenda.id, existing[0].id))
    } else {
      await db.insert(dailyAgenda).values({ userId: user.id, date, entries: JSON.stringify(entries) })
    }
    return json(200, { ok: true, date, entries }, headers)
  } catch (e: any) {
    console.error('daily-agenda error', e)
    return json(500, { error: e?.message || 'Internal Server Error' }, headers)
  }
}
