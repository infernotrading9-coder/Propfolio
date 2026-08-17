import type { Handler } from '@netlify/functions'
import { json, getUserFromSession } from './_utils'
import { dashboardService, payoutService } from '../../server/db/service'

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') return json(405, { error: 'Method Not Allowed' })
    const user = await getUserFromSession(event)
    if (!user) return json(401, { error: 'Unauthorized' })

    const data = await dashboardService.getUserData(user.id)

    // Map to AppState
    const firms = data.firms.map((f: any) => ({
      id: f.id,
      name: f.name,
      firmType: f.firmType || undefined,
      createdAt: f.createdAt ? new Date(f.createdAt).toISOString() : new Date().toISOString(),
    }))

    // Load payouts for all challenges
    const allPayouts = await payoutService.getByUserId(user.id)
    const payoutsByChallenge = allPayouts.reduce((acc: any, p: any) => {
      if (!acc[p.challengeId]) acc[p.challengeId] = []
      acc[p.challengeId].push({
        id: p.id,
        amount: parseFloat(String(p.amount)),
        date: p.date,
        description: p.description || '',
      })
      return acc
    }, {})

    // challenges will be attached in the client via existing loader, but we can pass raw
    // We'll follow the same mapping logic as databaseStorage.loadState did
    const challenges = data.challenges.map((c: any) => ({
      id: c.id,
      propFirmId: c.firmId,
      brokerName: c.brokerName || 'Trading Account',
      purchaseGroupId: c.purchaseGroupId || undefined,
      purchaseGroupLabel: c.purchaseGroupLabel || undefined,
      purchaseGroupSize: c.purchaseGroupSize || undefined,
      purchaseGroupIndex: c.purchaseGroupIndex || undefined,
      accountSize: c.accountSize || 0,
      startDate: c.startDate || new Date().toISOString().slice(0,10),
      cost: c.cost ? parseFloat(String(c.cost)) : 0,
      initialCost: c.initialCost ? parseFloat(String(c.initialCost)) : (c.cost ? parseFloat(String(c.cost)) : 0),
      hasActivationFee: !!c.hasActivationFee,
      activationFeeAmount: c.activationFeeAmount ? parseFloat(String(c.activationFeeAmount)) : undefined,
      firmType: c.firmType || undefined,
      evalType: c.evalType || undefined,
      totalPhases: (c.totalPhases || 3) as 1 | 2 | 3,
      strategy: c.strategy || '',
      status: (c.status as any) || 'active',
      phases: {
        phase1: { completed: !!c.phase1Completed, completedAt: c.phase1CompletedAt ? new Date(c.phase1CompletedAt).toISOString() : undefined },
        phase2: { completed: !!c.phase2Completed, completedAt: c.phase2CompletedAt ? new Date(c.phase2CompletedAt).toISOString() : undefined },
        phase3: { completed: !!c.phase3Completed, completedAt: c.phase3CompletedAt ? new Date(c.phase3CompletedAt).toISOString() : undefined },
      },
      monthlyPnL: {},
      weeklyPnL: {},
      payouts: payoutsByChallenge[c.id] || [],
      createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : new Date().toISOString(),
    }))

    return json(200, {
      firms,
      challenges,
      selectedFirmId: data.selectedFirmId || null,
    })
  } catch (e) {
    console.error('db-state error', e)
    return json(500, { error: 'Internal Server Error' })
  }
}
