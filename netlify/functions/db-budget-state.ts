import type { Handler } from '@netlify/functions'
import { json, getUserFromSession } from './_utils'
import { budgetStateService } from '../../server/db/service'

/**
 * db-budget-state — full BudgetFlow state as a single JSONB document.
 *
 * The BudgetTab component takes `state` + `onChange` (localStorage semantics),
 * and its BudgetState shape (categories, savingsGoals, completedGoals, and
 * accounts with icons/colors/loan terms/subAccounts) does not fit the flat
 * budget_transactions/budget_accounts tables. So the whole state is stored
 * as one row per user.
 *
 *   GET  -> { state: BudgetState | null }
 *   PUT  -> { state: BudgetState }        (body: { state })
 */
export const handler: Handler = async (event) => {
  try {
    const user = await getUserFromSession(event)
    if (!user) return json(401, { error: 'Unauthorized' })

    if (event.httpMethod === 'GET') {
      const state = await budgetStateService.getByUserId(user.id)
      return json(200, { state: state ?? null })
    }

    if (event.httpMethod === 'PUT' || event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}')
      const incoming = body.state
      if (!incoming || typeof incoming !== 'object') {
        return json(400, { error: 'state object required' })
      }
      const saved = await budgetStateService.upsert(user.id, incoming)
      return json(200, { state: saved })
    }

    return json(405, { error: 'Method Not Allowed' })
  } catch (e) {
    console.error('db-budget-state error', e)
    return json(500, { error: 'Internal Server Error' })
  }
}
