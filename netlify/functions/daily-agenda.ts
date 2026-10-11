import type { Handler } from '@netlify/functions'
import { json, getUserFromSession } from './_utils'
import { db } from '../../server/db/connection'
import { dailyAgenda } from '../../server/db/schema'
import { eq, and } from 'drizzle-orm'

export const handler: Handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type,X-User-Id,X-User-Email' }
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' }

  const user = await getUserFromSession(event)
  if (!user) return json(401, { error: 'Unauthorized — use X-User-Id and X-User-Email headers' })

  try {
    if (event.httpMethod === 'GET') {
      const date = event.queryStringParameters?.date || new Date().toISOString().slice(0, 10)
      const [row] = await db.select().from(dailyAgenda).where(and(eq(dailyAgenda.userId, user.id), eq(dailyAgenda.date, date))).limit(1)
      if (!row) return json(200, { date, entries: [] })
      return json(200, { date: row.date, entries: JSON.parse(row.entries), updatedAt: row.updatedAt })
    }

    if (event.httpMethod === 'POST') {
      const { date, entries } = JSON.parse(event.body || '{}')
      if (!date || !entries) return json(400, { error: 'date and entries required' })
      
      const existing = await db.select().from(dailyAgenda).where(and(eq(dailyAgenda.userId, user.id), eq(dailyAgenda.date, date))).limit(1)
      if (existing.length > 0) {
        await db.update(dailyAgenda).set({ entries: JSON.stringify(entries), updatedAt: new Date() }).where(eq(dailyAgenda.id, existing[0].id))
      } else {
        await db.insert(dailyAgenda).values({ userId: user.id, date, entries: JSON.stringify(entries) })
      }
      return json(200, { ok: true, date, entries })
    }

    return json(405, { error: 'Method not allowed' })
  } catch (e: any) {
    return json(500, { error: e.message })
  }
}