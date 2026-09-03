import type { Handler } from '@netlify/functions'
import { json, getUserFromSession } from './_utils'
import { propFirmService, challengeService, userStateService, payoutService } from '../../server/db/service'
import { spawnAccountAndBudget } from '../../server/db/purchaseService'
import {
  buyEval, passEval, promoteToLive, failAccount, CascadeError,
} from '../../server/db/cascadeService'
import { db } from '../../server/db/connection'
import { sql } from 'drizzle-orm'
import { withIdempotency } from '../../server/db/stateService'

export const handler: Handler = async (event) => {
  try {
    const user = await getUserFromSession(event)
    if (!user) return json(401, { error: 'Unauthorized' })

    // ── GET ───────────────────────────────────────────────────────────────────
    // Previously this function was POST/PUT/DELETE only and a GET returned
    // "Method Not Allowed", which made the challenge data impossible to inspect
    // from a client or a debugging session. Returns the joined truth: each
    // challenge with the account card it is bound to.
    if (event.httpMethod === 'GET') {
      const result = await db.execute(sql`
        SELECT ch.id, ch.account_id, ch.lifecycle, ch.status, ch.eval_type,
               ch.account_size, ch.cost, ch.start_date, ch.account_last4,
               ch.payout_count, ch.went_live_at, ch.source_challenge_id,
               ch.highest_milestone, ch.outcome_type, ch.failure_reason, ch.failure_date,
               ch.total_phases, ch.phase1_completed, ch.live_account, ch.firm_id,
               ta.display_label, ta.firm, ta.balance, ta.phase AS card_phase,
               ta.status AS card_status, ta.max_drawdown, ta.daily_drawdown, ta.rules
          FROM challenges ch
          LEFT JOIN trading_accounts ta ON ta.id = ch.account_id
         WHERE ch.user_id = ${user.id}
         ORDER BY ch.created_at DESC
      `)
      return json(200, { challenges: result.rows })
    }

    if (event.httpMethod === 'POST') {
      const input = JSON.parse(event.body || '{}')

      // ── Cascade actions ─────────────────────────────────────────────────
      // One statement from Daniel → every linked surface, in one transaction.
      // The web UI and the Telegram CLI both route through these, so the two
      // can never drift apart.
      if (input.action) {
        try {
          switch (input.action) {
            case 'buy-eval': {
              const r = await withIdempotency(user.id, input.idempotencyKey, 'buy-eval',
                () => buyEval({ userId: user.id, ...input }))
              return json(200, r)
            }
            case 'pass-eval': {
              // Always lands on FUNDED. Live is a separate promotion.
              const r = await withIdempotency(user.id, input.idempotencyKey, 'pass-eval',
                () => passEval({ userId: user.id, ...input }))
              return json(200, r)
            }
            case 'promote-to-live': {
              // The ONLY path to live. Gated on >= 5 payouts, enforced by a
              // Postgres CHECK as well as by the service.
              const r = await promoteToLive({ userId: user.id, accountRef: input.accountRef })
              return json(200, r)
            }
            case 'fail-account': {
              const r = await withIdempotency(user.id, input.idempotencyKey, 'fail-account',
                () => failAccount({
                  userId: user.id,
                  accountRef: input.accountRef,
                  failureReason: input.failureReason,
                  failureDate: input.failureDate,
                }))
              return json(200, r)
            }
            default:
              return json(400, { error: `Unknown action "${input.action}"` })
          }
        } catch (e) {
          if (e instanceof CascadeError) {
            return json(400, { error: e.message, code: e.code })
          }
          throw e
        }
      }

      // Add challenge
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

      // Single-source purchase: when the app's "Buy Eval" flow creates a challenge,
      // also spawn the trading account card + budget expense.
      let spawnedAccountId: string | undefined
      if (input.spawnAccountCard) {
        try {
          const firmRow = await propFirmService.getById(firmId)
          const spawned = await spawnAccountAndBudget(user.id, {
            firmName: firmRow?.name || input.propFirmName || 'Prop Firm',
            accountSize: Number(accountSize) || 0,
            accountLast4: accountLast4 || null,
            cost: Number(cost) || 0,
            budgetAccountId: input.budgetAccountId,
            challengeId: row.id,
            maxDrawdown: input.maxDrawdown !== undefined ? Number(input.maxDrawdown) : 0,
            dailyDrawdown: input.dailyDrawdown !== undefined ? Number(input.dailyDrawdown) : 0,
            riskPerTrade: input.riskPerTrade !== undefined ? Number(input.riskPerTrade) : 0,
            rules: input.rules || [],
          })
          spawnedAccountId = spawned.accountId
        } catch (e) {
          console.error('spawnAccountAndBudget failed:', e)
        }
      }

      const challenge = {
        id: row.id,
        accountCardId: spawnedAccountId || undefined,
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

      // ── Keep `lifecycle` consistent with `status` ──────────────────────────
      //
      // This whitelist has no `lifecycle` field, deliberately: lifecycle is
      // owned by the cascade services. But the UI CAN move `status`, and when
      // it did, lifecycle silently stayed behind — the two sources of truth
      // drifted and the Dashboard counted a passed eval as a funded account.
      //
      // So when a UI edit changes status, carry the lifecycle to the matching
      // state WITHIN THE SAME STAGE. Stage transitions (eval -> funded -> live)
      // remain cascade-only; this just stops eval_active/eval_failed style
      // desync. Never touches funded/live rows.
      if (updates.status) {
        const existing = await challengeService.getById(id)
        const current = String((existing as any)?.lifecycle || '')
        const isEvalStage = current === '' || current.startsWith('eval')
        if (isEvalStage) {
          if (updates.status === 'failed') dbUpdates.lifecycle = 'eval_failed'
          else if (updates.status === 'active') dbUpdates.lifecycle = 'eval_active'
          // 'passed' / 'passed_inactive' intentionally NOT mapped: passing an
          // eval must go through passEval, which also spawns the funded account.
        }
      }
      
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
