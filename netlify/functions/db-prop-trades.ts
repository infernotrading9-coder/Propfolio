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
  async getStats(userId: string) {
    const all = await db.select().from(propTrades).where(eq(propTrades.userId, userId))
    const wins = all.filter(t => parseFloat(String(t.pnl || 0)) > 0)
    const losses = all.filter(t => parseFloat(String(t.pnl || 0)) < 0)
    const totalPnL = all.reduce((s, t) => s + parseFloat(String(t.pnl || 0)), 0)
    const phases = ['eval', 'funded', 'live']
    const byPhase: Record<string, { totalPnL: number; wins: number; losses: number }> = {}
    for (const p of phases) {
      const tx = all.filter(t => t.phase === p)
      byPhase[p] = {
        totalPnL: tx.reduce((s, t) => s + parseFloat(String(t.pnl || 0)), 0),
        wins: tx.filter(t => parseFloat(String(t.pnl || 0)) > 0).length,
        losses: tx.filter(t => parseFloat(String(t.pnl || 0)) < 0).length,
      }
    }
    return {
      totalTrades: all.length,
      wins: wins.length,
      losses: losses.length,
      winRate: all.length > 0 ? ((wins.length / all.length) * 100).toFixed(1) : '0',
      totalPnL,
      avgPnL: all.length > 0 ? (totalPnL / all.length).toFixed(2) : '0',
      byPhase,
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