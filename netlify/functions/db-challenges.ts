import type { Handler } from '@netlify/functions'
import { json, getUserFromSession } from './_utils'
import { propFirmService, challengeService, userStateService, payoutService } from '../../server/db/service'

export const handler: Handler = async (event) => {
  try {
    const user = await getUserFromSession(event)
    if (!user) return json(401, { error: 'Unauthorized' })

    if (event.httpMethod === 'POST') {
      // Add challenge
      const input = JSON.parse(event.body || '{}')
      const {
        propFirmId,
        propFirmName,
        brokerName,
        purchaseGroupId,
        purchaseGroupLabel,
        purchaseGroupSize,
        purchaseGroupIndex,
        accountSize,
        startDate,
        cost,
        initialCost,
        hasActivationFee,
        activationFeeAmount,
        firmType,
        evalType,
        liveAccount,
        totalPhases,
        strategy,
        status,
        highestMilestone,
        outcomeType,
        failureReason,
        failureDate,
        lifecycleNotes,
        accountLast4
      } = input

      let firmId = propFirmId
      if (!firmId && propFirmName) {
        const firm = await propFirmService.create(user.id, { name: propFirmName, firmType } as any)
        firmId = firm.id
      }
      if (!firmId) return json(400, { error: 'propFirmId or propFirmName required' })

      const row = await challengeService.create(user.id, {
        firmId,
        brokerName: brokerName || 'Trading Account',
        purchaseGroupId: purchaseGroupId || null,
        purchaseGroupLabel: purchaseGroupLabel || null,
        purchaseGroupSize: purchaseGroupSize === undefined ? null : Number(purchaseGroupSize),
        purchaseGroupIndex: purchaseGroupIndex === undefined ? null : Number(purchaseGroupIndex),
        accountSize: Number(accountSize) || 0,
        startDate: startDate || new Date().toISOString().slice(0,10),
        cost: String(cost ?? '0'),
        initialCost: String(initialCost ?? cost ?? '0'),
        hasActivationFee: !!hasActivationFee,
        activationFeeAmount: activationFeeAmount === undefined || activationFeeAmount === null ? null : String(activationFeeAmount),
        firmType: firmType || null,
        evalType: evalType || null,
        liveAccount: !!liveAccount,
        totalPhases: Number(totalPhases) || 3,
        strategy: strategy || '',
        status: status || 'active',
        highestMilestone: highestMilestone || null,
        outcomeType: outcomeType || null,
        failureReason: failureReason || null,
        failureDate: failureDate || null,
        lifecycleNotes: lifecycleNotes || null,
        accountLast4: accountLast4 || null,
      } as any)

      const challenge = {
        id: row.id,
        propFirmId: row.firmId,
        brokerName: row.brokerName || 'Trading Account',
        accountLast4: (row as any).accountLast4 || undefined,
        purchaseGroupId: row.purchaseGroupId || undefined,
        purchaseGroupLabel: row.purchaseGroupLabel || undefined,
        purchaseGroupSize: row.purchaseGroupSize || undefined,
        purchaseGroupIndex: row.purchaseGroupIndex || undefined,
        accountSize: row.accountSize || 0,
        startDate: row.startDate || new Date().toISOString().slice(0,10),
        cost: row.cost ? parseFloat(String(row.cost)) : 0,
        initialCost: row.initialCost ? parseFloat(String(row.initialCost)) : (row.cost ? parseFloat(String(row.cost)) : 0),
        hasActivationFee: !!row.hasActivationFee,
        activationFeeAmount: row.activationFeeAmount ? parseFloat(String(row.activationFeeAmount)) : undefined,
        firmType: row.firmType || undefined,
        evalType: (row as any).evalType || undefined,
        liveAccount: !!(row as any).liveAccount,
        totalPhases: (row.totalPhases || 3) as 1 | 2 | 3,
        strategy: row.strategy || '',
        status: (row.status as any) || 'active',
        highestMilestone: (row as any).highestMilestone || undefined,
        outcomeType: (row as any).outcomeType || undefined,
        failureReason: (row as any).failureReason || undefined,
        failureDate: (row as any).failureDate || undefined,
        lifecycleNotes: (row as any).lifecycleNotes || undefined,
        phases: {
          phase1: { completed: !!row.phase1Completed, completedAt: row.phase1CompletedAt ? new Date(row.phase1CompletedAt).toISOString() : undefined },
          phase2: { completed: !!row.phase2Completed, completedAt: row.phase2CompletedAt ? new Date(row.phase2CompletedAt).toISOString() : undefined },
          phase3: { completed: !!row.phase3Completed, completedAt: row.phase3CompletedAt ? new Date(row.phase3CompletedAt).toISOString() : undefined },
        },
        monthlyPnL: {},
        weeklyPnL: {},
        payouts: [],
        createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
      }
      return json(200, { challenge })
    }

    if (event.httpMethod === 'PUT') {
      const { id, updates } = JSON.parse(event.body || '{}')
      if (!id) return json(400, { error: 'id required' })
      
      // Convert ISO string timestamps to Date objects for the database
      const dbUpdates: any = {}
      if (updates.propFirmId) dbUpdates.firmId = updates.propFirmId
      if (updates.brokerName) dbUpdates.brokerName = updates.brokerName
      if (updates.purchaseGroupId !== undefined) dbUpdates.purchaseGroupId = updates.purchaseGroupId || null
      if (updates.purchaseGroupLabel !== undefined) dbUpdates.purchaseGroupLabel = updates.purchaseGroupLabel || null
      if (updates.purchaseGroupSize !== undefined) dbUpdates.purchaseGroupSize = updates.purchaseGroupSize ?? null
      if (updates.purchaseGroupIndex !== undefined) dbUpdates.purchaseGroupIndex = updates.purchaseGroupIndex ?? null
      if (updates.accountSize !== undefined) dbUpdates.accountSize = updates.accountSize
      if (updates.startDate) dbUpdates.startDate = updates.startDate
      if (updates.cost !== undefined) dbUpdates.cost = String(updates.cost)
      if (updates.initialCost !== undefined) dbUpdates.initialCost = String(updates.initialCost)
      if (updates.hasActivationFee !== undefined) dbUpdates.hasActivationFee = !!updates.hasActivationFee
      if (updates.activationFeeAmount !== undefined) {
        dbUpdates.activationFeeAmount = updates.activationFeeAmount === null ? null : String(updates.activationFeeAmount)
      }
      if (updates.firmType !== undefined) dbUpdates.firmType = updates.firmType || null
      if (updates.evalType !== undefined) dbUpdates.evalType = updates.evalType || null
      if (updates.liveAccount !== undefined) dbUpdates.liveAccount = !!updates.liveAccount
      if (updates.totalPhases !== undefined) dbUpdates.totalPhases = updates.totalPhases
      if (updates.strategy !== undefined) dbUpdates.strategy = updates.strategy
      if (updates.accountLast4 !== undefined) dbUpdates.accountLast4 = updates.accountLast4 || null
      if (updates.status) dbUpdates.status = updates.status
      if (updates.highestMilestone !== undefined) dbUpdates.highestMilestone = updates.highestMilestone || null
      if (updates.outcomeType !== undefined) dbUpdates.outcomeType = updates.outcomeType || null
      if (updates.failureReason !== undefined) dbUpdates.failureReason = updates.failureReason || null
      if (updates.failureDate !== undefined) dbUpdates.failureDate = updates.failureDate || null
      if (updates.lifecycleNotes !== undefined) dbUpdates.lifecycleNotes = updates.lifecycleNotes || null
      
      // Handle phase fields - convert ISO strings to Date objects
      if (updates.phases) {
        if (updates.phases.phase1) {
          if (typeof updates.phases.phase1.completed === 'boolean') {
            dbUpdates.phase1Completed = updates.phases.phase1.completed
          }
          if ('completedAt' in updates.phases.phase1) {
            dbUpdates.phase1CompletedAt = updates.phases.phase1.completedAt ? new Date(updates.phases.phase1.completedAt) : null
          }
        }
        if (updates.phases.phase2) {
          if (typeof updates.phases.phase2.completed === 'boolean') {
            dbUpdates.phase2Completed = updates.phases.phase2.completed
          }
          if ('completedAt' in updates.phases.phase2) {
            dbUpdates.phase2CompletedAt = updates.phases.phase2.completedAt ? new Date(updates.phases.phase2.completedAt) : null
          }
        }
        if (updates.phases.phase3) {
          if (typeof updates.phases.phase3.completed === 'boolean') {
            dbUpdates.phase3Completed = updates.phases.phase3.completed
          }
          if ('completedAt' in updates.phases.phase3) {
            dbUpdates.phase3CompletedAt = updates.phases.phase3.completedAt ? new Date(updates.phases.phase3.completedAt) : null
          }
        }
      }
      
      await challengeService.update(id, dbUpdates)
      return json(204, {})
    }

    if (event.httpMethod === 'DELETE') {
      const { id } = JSON.parse(event.body || '{}')
      if (!id) return json(400, { error: 'id required' })
      await challengeService.delete(id)
      return json(204, {})
    }

    return json(405, { error: 'Method Not Allowed' })
  } catch (e) {
    console.error('db-challenges error', e)
    return json(500, { error: 'Internal Server Error' })
  }
}
