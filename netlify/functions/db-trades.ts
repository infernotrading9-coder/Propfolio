import type { Handler } from '@netlify/functions'
import { json, getUserFromSession } from './_utils'
import { getPlanRule, listPlanRules, upsertPlanRule } from '../../server/db/tradeService'
import { CascadeError } from '../../server/db/cascadeService'
import { recordPayoutWithAllocation, proposeAllocation } from '../../server/db/payoutService'
import { withIdempotency } from '../../server/db/stateService'

/**
 * TRADE LOGGING IS RETIRED (Oct 2026).
 *
 * Daniel does not log trades. The `trades` table has been dropped, so every
 * endpoint that used to read or write a trade row now answers 410 Gone instead
 * of throwing "relation trades does not exist" (which surfaced as an opaque 500).
 *
 * Balances move through `POST db-accounts { action: 'set-balance' }` — see the
 * bot guide §5.11. Green days, payout progress and best day all read the balance
 * and the recorded daily P&L, so nothing here is needed to keep them current.
 *
 * STILL LIVE on this endpoint: plan-rules (the plan catalogue), set-plan-rule,
 * record-payout and propose-allocation. Payouts are a separate table and feed
 * the dashboard stats — do not remove them.
 */
const RETIRED = {
  error: 'Trade logging was retired — the trade journal no longer exists. ' +
         'Push the account balance with POST db-accounts { action: "set-balance", accountRef, balance } instead.',
  code: 'trade_logging_retired',
}

export const handler: Handler = async (event) => {
  try {
    const user = await getUserFromSession(event)
    if (!user) return json(401, { error: 'Unauthorized' })

    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {}

      // Everything Propfolio has learned about plan rules. The bot consults
      // this BEFORE buying an eval, so it only asks Daniel about plans that
      // are genuinely new — and never re-asks about ones already confirmed.
      if (params.action === 'plan-rules') {
        if (params.firm && params.evalType) {
          // Consistency differs between eval and funded, so the stage must be
          // explicit. Defaults to 'eval' — the safer side to be wrong on, since
          // an eval rule is usually the stricter one.
          const stage = params.stage === 'funded' ? 'funded' : 'eval'
          const size = params.accountSize ? Number(params.accountSize) : null
          const rule = await getPlanRule(user.id, params.firm, params.evalType, size, stage)
          return json(200, {
            rule,
            known: !!rule,
            stage,
            consistencyKnown: rule ? rule.consistencyPct !== null : false,
          })
        }
        const rules = await listPlanRules(user.id)
        return json(200, { rules })
      }

      // stats / account trades / all trades were all built from the trade
      // journal. Gone with the table.
      return json(410, RETIRED)
    }

    if (event.httpMethod === 'POST') {
      const input = JSON.parse(event.body || '{}')

      try {
        if (input.action === 'propose-allocation') {
          // Dry run: what would the split look like? Writes nothing.
          const proposal = await proposeAllocation(user.id, Number(input.amount))
          return json(200, { proposal })
        }

        if (input.action === 'set-plan-rule') {
          // Teach Propfolio a plan's rules, or correct them after a firm
          // changes them. Applies to active accounts on that plan too.
          //
          // NOTE: accountSize + stage are passed through deliberately — rules
          // vary by size (a 25K and 50K of the same plan have different green-day
          // minimums and payout minimums) and the catalogue is keyed on them.
          // Dropping these made per-size rules impossible to create via the API.
          const r = await upsertPlanRule(user.id, {
            firmName: input.firmName,
            evalType: input.evalType,
            accountSize: input.accountSize,
            stage: input.stage,
            drawdownStyle: input.drawdownStyle,
            consistencyPct: input.consistencyPct,
            profitSplitPct: input.profitSplitPct,
            payoutMin: input.payoutMin,
            winningDayMin: input.winningDayMin,
            winningDaysReq: input.winningDaysReq,
            dailyLossLimit: input.dailyLossLimit,
            hasDailyLoss: input.hasDailyLoss,
            maxDrawdown: input.maxDrawdown,
            profitTarget: input.profitTarget,
            payoutTarget: input.payoutTarget,
            payoutInterval: input.payoutInterval,
            payoutBuffer: input.payoutBuffer,
            payoutCapPct: input.payoutCapPct,
            notes: input.notes,
            applyToActive: input.applyToActive,
          })
          return json(200, r)
        }

        if (input.action === 'record-payout') {
          // A payout is INCOME, not just a stat. Without `allocations` this
          // returns a suggested split and writes nothing; send the confirmed
          // allocations back to apply it.
          const r = await withIdempotency(user.id, input.idempotencyKey, 'record-payout',
            () => recordPayoutWithAllocation({
              userId: user.id,
              accountRef: input.accountRef,
              amount: input.amount,
              date: input.date,
              description: input.description,
              allocations: input.allocations,
            }))
          return json(200, r)
        }
      } catch (e) {
        if (e instanceof CascadeError) return json(400, { error: e.message, code: e.code })
        throw e
      }

      // log-trade, correct-trade, and the legacy bare create-trade path.
      return json(410, RETIRED)
    }

    if (event.httpMethod === 'DELETE') {
      return json(410, RETIRED)
    }

    return json(405, { error: 'Method Not Allowed' })
  } catch (e) {
    console.error('db-trades error', e)
    return json(500, { error: 'Internal Server Error' })
  }
}
