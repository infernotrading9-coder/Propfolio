import type { Handler } from '@netlify/functions'
import { json, getUserFromSession } from './_utils'
import { budgetStateService } from '../../server/db/service'
import {
  logExpense, listBudgetAccounts, transferBetweenAccounts, CascadeError,
} from '../../server/db/cascadeService'

/**
 * db-budget-state — the Budget tab's state, plus the budget cascade actions.
 *
 * TWO DIFFERENT CLIENTS, TWO DIFFERENT DOORS:
 *
 *   The WEB UI (BudgetTab.tsx) is a full state editor — it reorders categories,
 *   edits loan terms, renames accounts, restructures sub-accounts. It genuinely
 *   needs to PUT the whole document, and it always sends state it just read.
 *
 *   The BOT is not an editor. It appends one transaction at a time. Letting it
 *   PUT a whole document means every write is a read-modify-write race against
 *   whatever Daniel is doing in the browser, and one stale read silently
 *   reverts real edits. It must use the `action` endpoints below, which mutate
 *   a single thing inside one Postgres transaction with a row lock.
 *
 * The PUT path therefore requires an explicit `X-Client: propfolio-web` header,
 * which apiClient.ts sends on every request. This is a GUARDRAIL, not a security
 * boundary — the bot is cooperative, and the point is to make the wrong door
 * obviously wrong rather than to defend against a forged header.
 *
 * Deliberately NOT used as the discriminator: the session cookie. The SPA also
 * authenticates by X-User-Id/X-User-Email headers (see _utils.ts fallback 3),
 * the same ones the bot sends, so a cookie check would reject the real UI
 * whenever the cookie is absent and break the Budget tab.
 *
 *   GET                      -> { state }
 *   GET  ?action=accounts    -> { accounts }  (valid budgetAccountId values)
 *   POST { action: 'log-expense' | 'log-income' | 'transfer' }
 *   PUT  { state }           -> requires X-Client: propfolio-web
 */

const WEB_CLIENT = 'propfolio-web'

function isWebClient(event: any): boolean {
  const h = event.headers || {}
  const v = h['x-client'] || h['X-Client'] || ''
  return String(v).toLowerCase() === WEB_CLIENT
}

export const handler: Handler = async (event) => {
  try {
    const user = await getUserFromSession(event)
    if (!user) return json(401, { error: 'Unauthorized' })

    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {}

      // The bot calls this to pick a valid funding source instead of guessing
      // an id. An unrecognised budgetAccountId books the expense against
      // nothing, so this list is the contract.
      if (params.action === 'accounts') {
        const accounts = await listBudgetAccounts(user.id)
        return json(200, { accounts })
      }

      const state = await budgetStateService.getByUserId(user.id)
      return json(200, { state: state ?? null })
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}')

      // ── Cascade actions: one targeted mutation, row-locked ───────────────
      if (body.action) {
        try {
          switch (body.action) {
            case 'log-expense':
            case 'log-income': {
              if (!body.name) return json(400, { error: 'name required', code: 'missing_name' })
              if (!body.budgetAccountId) {
                return json(400, {
                  error: 'budgetAccountId required — which account did the money come from? ' +
                         'Call GET ?action=accounts for valid ids.',
                  code: 'no_funding_source',
                })
              }
              const amount = Number(body.amount)
              if (!Number.isFinite(amount) || amount <= 0) {
                return json(400, { error: 'amount must be a positive number', code: 'bad_amount' })
              }
              await logExpense({
                userId: user.id,
                name: body.name,
                amount,
                budgetAccountId: body.budgetAccountId,
                date: body.date,
                categoryId: body.categoryId,
                type: body.action === 'log-income' ? 'income' : 'expense',
              })
              const accounts = await listBudgetAccounts(user.id)
              const touched = accounts.find(a => a.id === body.budgetAccountId)
              return json(200, { ok: true, account: touched })
            }

            case 'transfer': {
              const r = await transferBetweenAccounts({
                userId: user.id,
                fromAccountId: body.fromAccountId,
                toAccountId: body.toAccountId,
                amount: Number(body.amount),
                name: body.name,
                date: body.date,
              })
              return json(200, r)
            }

            case 'reconcile-balances': {
              // "Here's what my accounts actually say" — for when Daniel hasn't
              // logged in days, or made too many small transactions to itemise.
              // Sets each balance and writes ONE balancing adjustment per
              // account so the ledger still explains every dollar.
              //
              // Eval purchases are never absorbed this way; they must go
              // through buy-eval with a real cost and funding source.
              const r = await reconcileBalances({
                userId: user.id,
                balances: body.balances,
                date: body.date,
                note: body.note,
                dryRun: body.dryRun === true,
              })
              return json(200, r)
            }

            default:
              return json(400, { error: `Unknown action "${body.action}"` })
          }
        } catch (e) {
          if (e instanceof CascadeError) return json(400, { error: e.message, code: e.code })
          throw e
        }
      }

      // A POST without an action used to be an alias for the whole-state PUT.
      // Keeping that alias would leave the exact hole this change closes.
      return json(400, {
        error: 'POST requires an "action" (log-expense, log-income, transfer). ' +
               'Whole-state writes are PUT, and browser-only.',
        code: 'action_required',
      })
    }

    if (event.httpMethod === 'PUT') {
      if (!isWebClient(event)) {
        return json(403, {
          error: 'Whole-state writes are reserved for the web UI. Use POST with an ' +
                 'action: log-expense, log-income, or transfer.',
          code: 'use_cascade_action',
        })
      }
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
