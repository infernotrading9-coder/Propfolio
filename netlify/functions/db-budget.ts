import type { Handler } from '@netlify/functions'
import { json, getUserFromSession } from './_utils'
import { budgetTransactionService, budgetAccountService } from '../../server/db/service'

export const handler: Handler = async (event) => {
  try {
    const user = await getUserFromSession(event)
    if (!user) return json(401, { error: 'Unauthorized' })

    // GET — fetch all budget transactions and accounts for the user
    if (event.httpMethod === 'GET') {
      const [transactions, accounts] = await Promise.all([
        budgetTransactionService.getByUserId(user.id),
        budgetAccountService.getByUserId(user.id),
      ])

      const serializedTransactions = transactions.map((t) => ({
        id: t.id,
        date: t.date,
        description: t.description || '',
        amount: t.amount ? parseFloat(String(t.amount)) : 0,
        category: t.category || '',
        subcategory: t.subcategory || '',
        accountName: t.accountName || '',
        type: t.type || 'expense',
        expenseGroup: t.expenseGroup || '',
        excluded: !!t.excluded,
        createdAt: t.createdAt ? new Date(t.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: t.updatedAt ? new Date(t.updatedAt).toISOString() : new Date().toISOString(),
      }))

      const serializedAccounts = accounts.map((a) => ({
        id: a.id,
        name: a.name,
        balance: a.balance ? parseFloat(String(a.balance)) : 0,
        type: a.type || '',
        debt: !!a.debt,
        createdAt: a.createdAt ? new Date(a.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: a.updatedAt ? new Date(a.updatedAt).toISOString() : new Date().toISOString(),
      }))

      return json(200, { transactions: serializedTransactions, accounts: serializedAccounts })
    }

    // POST — create a transaction or account
    if (event.httpMethod === 'POST') {
      const input = JSON.parse(event.body || '{}')
      const { kind } = input

      if (kind === 'transaction') {
        const {
          date,
          description,
          amount,
          category,
          subcategory,
          accountName,
          type,
          expenseGroup,
          excluded,
        } = input

        if (!date) return json(400, { error: 'date required' })

        const row = await budgetTransactionService.create(user.id, {
          date,
          description: description || null,
          amount: String(amount ?? '0'),
          category: category || null,
          subcategory: subcategory || null,
          accountName: accountName || null,
          type: type || 'expense',
          expenseGroup: expenseGroup || null,
          excluded: !!excluded,
        } as any)

        const transaction = {
          id: row.id,
          date: row.date,
          description: row.description || '',
          amount: row.amount ? parseFloat(String(row.amount)) : 0,
          category: row.category || '',
          subcategory: row.subcategory || '',
          accountName: row.accountName || '',
          type: row.type || 'expense',
          expenseGroup: row.expenseGroup || '',
          excluded: !!row.excluded,
          createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
          updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : new Date().toISOString(),
        }
        return json(200, { transaction })
      }

      if (kind === 'account') {
        const { name, balance, type, debt } = input
        if (!name) return json(400, { error: 'name required' })

        const row = await budgetAccountService.create(user.id, {
          name,
          balance: String(balance ?? '0'),
          type: type || null,
          debt: !!debt,
        } as any)

        const account = {
          id: row.id,
          name: row.name,
          balance: row.balance ? parseFloat(String(row.balance)) : 0,
          type: row.type || '',
          debt: !!row.debt,
          createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
          updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : new Date().toISOString(),
        }
        return json(200, { account })
      }

      return json(400, { error: 'kind must be "transaction" or "account"' })
    }

    // PUT — update a transaction or account
    if (event.httpMethod === 'PUT') {
      const { id, kind, updates } = JSON.parse(event.body || '{}')
      if (!id) return json(400, { error: 'id required' })
      if (!kind) return json(400, { error: 'kind required' })

      if (kind === 'transaction') {
        const dbUpdates: any = {}
        if (updates.date !== undefined) dbUpdates.date = updates.date
        if (updates.description !== undefined) dbUpdates.description = updates.description || null
        if (updates.amount !== undefined) dbUpdates.amount = String(updates.amount)
        if (updates.category !== undefined) dbUpdates.category = updates.category || null
        if (updates.subcategory !== undefined) dbUpdates.subcategory = updates.subcategory || null
        if (updates.accountName !== undefined) dbUpdates.accountName = updates.accountName || null
        if (updates.type !== undefined) dbUpdates.type = updates.type
        if (updates.expenseGroup !== undefined) dbUpdates.expenseGroup = updates.expenseGroup || null
        if (updates.excluded !== undefined) dbUpdates.excluded = !!updates.excluded

        await budgetTransactionService.update(id, dbUpdates)
        return json(204, {})
      }

      if (kind === 'account') {
        const dbUpdates: any = {}
        if (updates.name !== undefined) dbUpdates.name = updates.name
        if (updates.balance !== undefined) dbUpdates.balance = String(updates.balance)
        if (updates.type !== undefined) dbUpdates.type = updates.type || null
        if (updates.debt !== undefined) dbUpdates.debt = !!updates.debt

        await budgetAccountService.update(id, dbUpdates)
        return json(204, {})
      }

      return json(400, { error: 'kind must be "transaction" or "account"' })
    }

    // DELETE — delete a transaction or account
    if (event.httpMethod === 'DELETE') {
      const { id, kind } = JSON.parse(event.body || '{}')
      if (!id) return json(400, { error: 'id required' })
      if (!kind) return json(400, { error: 'kind required' })

      if (kind === 'transaction') {
        await budgetTransactionService.delete(id)
        return json(204, {})
      }

      if (kind === 'account') {
        await budgetAccountService.delete(id)
        return json(204, {})
      }

      return json(400, { error: 'kind must be "transaction" or "account"' })
    }

    return json(405, { error: 'Method Not Allowed' })
  } catch (e) {
    console.error('db-budget error', e)
    return json(500, { error: 'Internal Server Error' })
  }
}
