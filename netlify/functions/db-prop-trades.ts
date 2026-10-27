import type { Handler } from '@netlify/functions'
import { json, getUserFromSession } from './_utils'
import { db } from '../../server/db/connection'
import { propTrades } from '../../server/db/schema'
import { eq, and, desc, sql } from 'drizzle-orm'

// Simple prop trade service inline
const propTradeService = {
  async getByUserId(userId: string, limit?: number) {
    const q = db.select().from(propTrades).where(eq(propTrades.userId, userId)).orderBy(desc(propTrades.createdAt))
    if (limit) q.limit(limit)
    return q
  },
  async create(userId: string, data: any) {
    const [row] = await db.insert(propTrades).values({ userId, ...data }).returning()
    return row
  },
  async update(id: string, userId: string, data: any) {
    const [row] = await db.update(propTrades).set({ ...data, updatedAt: new Date() }).where(and(eq(propTrades.id, id), eq(propTrades.userId, userId))).returning()
    return row
  },
  async delete(id: string) {
    await db.delete(propTrades).where(eq(propTrades.id, id))
  },
  /**
   * Stats are R-denominated, not dollar-denominated.
   *
   * R is the realized multiple the cockpit closes a trade with (SL = -1, a win =
   * whatever he got, e.g. 2.2 for "80% at 2R, 20% at 3R"). It's the only unit
   * that compares across account sizes and across changes in risk-per-trade, so
   * it's what every breakdown below aggregates. `pnl` is deliberately NOT used —
   * the cockpit never writes it.
   */
  async getStats(userId: string) {
    const all = await db.select().from(propTrades).where(eq(propTrades.userId, userId))
    const num = (v: any) => { const n = parseFloat(String(v ?? '')); return Number.isFinite(n) ? n : 0 }
    const R = (t: any) => num(t.riskReward)
    const closed = all.filter((t: any) => t.outcome != null)
    const wins = closed.filter((t: any) => t.outcome === 'win').length
    const losses = closed.filter((t: any) => t.outcome === 'loss').length
    const evens = closed.filter((t: any) => t.outcome === 'even').length
    const totalR = closed.reduce((s: number, t: any) => s + R(t), 0)

    /** Group closed trades by a field and summarise each bucket in R. */
    const group = (keyFn: (t: any) => string | null | undefined) => {
      const buckets: Record<string, any> = {}
      for (const t of closed) {
        const k = (keyFn(t) || '').trim() || '—'
        const b = (buckets[k] ||= { key: k, n: 0, wins: 0, losses: 0, evens: 0, totalR: 0 })
        b.n++
        b.totalR += R(t)
        if (t.outcome === 'win') b.wins++
        else if (t.outcome === 'loss') b.losses++
        else b.evens++
      }
      return Object.values(buckets)
        .map((b: any) => ({
          ...b,
          winRate: b.n ? +(b.wins / b.n * 100).toFixed(1) : 0,
          totalR: +b.totalR.toFixed(2),
          avgR: b.n ? +(b.totalR / b.n).toFixed(2) : 0,
        }))
        .sort((a: any, b: any) => b.n - a.n)
    }

    const phases = ['eval', 'funded', 'live']
    const byPhase: Record<string, any> = {}
    for (const p of phases) {
      const tx = closed.filter((t: any) => t.phase === p)
      const pR = tx.reduce((s: number, t: any) => s + R(t), 0)
      byPhase[p] = {
        n: tx.length,
        wins: tx.filter((t: any) => t.outcome === 'win').length,
        losses: tx.filter((t: any) => t.outcome === 'loss').length,
        totalR: +pR.toFixed(2),
        avgR: tx.length ? +(pR / tx.length).toFixed(2) : 0,
      }
    }

    return {
      totalTrades: all.length,
      closedCount: closed.length,
      open: all.length - closed.length,
      wins, losses, evens,
      winRate: closed.length ? +(wins / closed.length * 100).toFixed(1) : 0,
      totalR: +totalR.toFixed(2),
      avgR: closed.length ? +(totalR / closed.length).toFixed(2) : 0,
      bestR: closed.length ? Math.max(...closed.map(R)) : 0,
      worstR: closed.length ? Math.min(...closed.map(R)) : 0,
      byPhase,
      byStrategy: group((t: any) => t.strategy),
      byVariant: group((t: any) => t.variant),
      bySetupTf: group((t: any) => t.setupTf),
      byEntryTf: group((t: any) => t.entryTf),
      bySlPlacement: group((t: any) => t.slPlacement),
    }
  },
}

export const handler: Handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type,X-User-Id,X-User-Email' }
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' }

  const user = await getUserFromSession(event)
  if (!user) return json(401, { error: 'Unauthorized — use X-User-Id and X-User-Email headers' })

  try {
    if (event.httpMethod === 'GET') {
      const limit = event.queryStringParameters?.limit ? parseInt(event.queryStringParameters.limit) : undefined
      const trades = await propTradeService.getByUserId(user.id, limit)
      const stats = await propTradeService.getStats(user.id)
      return json(200, { trades, stats })
    }

    if (event.httpMethod === 'POST') {
      const input = JSON.parse(event.body || '{}')
      if (input.action === 'create') {
        const trade = await propTradeService.create(user.id, input)
        return json(200, { trade })
      }
      if (input.action === 'update') {
        if (!input.id) return json(400, { error: 'id required' })
        const trade = await propTradeService.update(input.id, user.id, input)
        return json(200, { trade })
      }
      if (input.action === 'delete') {
        if (!input.id) return json(400, { error: 'id required' })
        await propTradeService.delete(input.id)
        return json(200, { deleted: true })
      }
      if (input.action === 'stats') {
        const stats = await propTradeService.getStats(user.id)
        return json(200, { stats })
      }
      return json(400, { error: 'Unknown action' })
    }

    return json(405, { error: 'Method not allowed' })
  } catch (e: any) {
    return json(500, { error: e.message })
  }
}