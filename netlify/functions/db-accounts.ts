import type { Handler } from '@netlify/functions'
import { json, getUserFromSession } from './_utils'
import { tradingAccountService, accountDailyOrderService } from '../../server/db/service'
import { spawnChallengeAndBudgetFromAccount } from '../../server/db/purchaseService'
import { settleAccount } from '../../server/db/drawdownModel'

export const handler: Handler = async (event) => {
  try {
    const user = await getUserFromSession(event)
    if (!user) return json(401, { error: 'Unauthorized' })

    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {}

      // Get daily order for a date
      if (params.action === 'daily-order') {
        const date = params.date || new Date().toISOString().slice(0, 10)
        const order = await accountDailyOrderService.getByDate(user.id, date)
        return json(200, { order })
      }

      // Get all daily orders
      if (params.action === 'daily-orders') {
        const orders = await accountDailyOrderService.getByUserId(user.id)
        return json(200, { orders })
      }

      // Get trading accounts. Default: active only (used by AccountsView and
      // the Trades form dropdown). Pass ?all=true to get every account so the
      // trade log can still resolve names/firms for lost/failed accounts.
      const accounts = await tradingAccountService.getByUserId(user.id)

      // Lazy 5pm-EST settle: the trading day rolls at 17:00 America/New_York.
      // Any read after the boundary snapshots day-start balance and freezes the
      // settled HWM, so max DD stops trailing intraday. Doing it here (rather
      // than on a cron) means a missed tick can never skip a rollover.
      for (const a of accounts) {
        if (a.status !== 'active') continue
        const s = settleAccount(a as any)
        if (!s) continue
        try {
          await tradingAccountService.update(a.id, s as any)
          Object.assign(a, s)
        } catch (e) {
          console.error('settle failed for account', a.id, e)
        }
      }

      const showAll = params.all === 'true'
      const activeAccounts = showAll ? accounts : accounts.filter((a: any) => a.status === 'active')
      return json(200, { accounts: activeAccounts })
    }

    if (event.httpMethod === 'POST') {
      const input = JSON.parse(event.body || '{}')

      // Create a new trading account
      if (input.action === 'create') {
        const { name, firm, accountNumberLast4, accountSize, balance, maxDrawdown, dailyDrawdown, lockedFloor, riskPerTrade, rules, notes, status, phase, platform, groupName } = input
        if (!name || !firm) {
          return json(400, { error: 'name and firm are required' })
        }
        const account = await tradingAccountService.create(user.id, {
          name,
          firm,
          accountNumberLast4: accountNumberLast4 || null,
          accountSize: String(accountSize || '0'),
          balance: String(balance || accountSize || '0'),
          drawdownUsed: '0',
          highWaterMark: String(balance || accountSize || '0'),
          maxDrawdown: String(maxDrawdown || '0'),
          dailyDrawdown: String(dailyDrawdown || '0'),
          lockedFloor: lockedFloor !== undefined && lockedFloor !== '' ? String(lockedFloor) : null,
          riskPerTrade: String(riskPerTrade || '0'),
          rules: rules || [],
          notes: notes || null,
          status: status || 'active',
          phase: phase || 'challenge',
          platform: platform || null,
          groupName: groupName || null,
        } as any)

        // Account-first direction: if this is a new eval account, spawn the
        // matching challenge + budget expense so everything stays connected.
        if (input.spawnChallengeAndBudget) {
          try {
            await spawnChallengeAndBudgetFromAccount(user.id, {
              firmName: firm,
              accountSize: Number(accountSize) || 0,
              accountLast4: accountNumberLast4 || null,
              cost: Number(input.cost) || 0,
              budgetAccountId: input.budgetAccountId,
              maxDrawdown: maxDrawdown !== undefined ? Number(maxDrawdown) : 0,
              dailyDrawdown: dailyDrawdown !== undefined ? Number(dailyDrawdown) : 0,
              riskPerTrade: riskPerTrade !== undefined ? Number(riskPerTrade) : 0,
              rules: rules || [],
              strategy: input.strategy,
              firmType: input.firmType,
            })
          } catch (e) {
            console.error('spawnChallengeAndBudgetFromAccount failed:', e)
          }
        }
        return json(200, { account })
      }

      // Set daily order
      if (input.action === 'set-account-number') {
        // Daniel supplies the first 4 AND last 4 characters of the real account
        // number. Account numbers are not always numeric, so first4 is text.
        // Once both are known the label becomes "FIRST-LAST", which is
        // unambiguous on its own — no more remembering which 0001 is -A vs -B.
        const { accountRef, first4, last4 } = input
        if (!accountRef) return json(400, { error: 'accountRef required', code: 'no_ref' })

        const f = first4 === null || first4 === '' ? null : String(first4).trim().toUpperCase()
        const l = last4 === null || last4 === '' ? null : String(last4).trim()
        if (f !== null && !/^[A-Za-z0-9]{4}$/.test(f)) {
          return json(400, { error: 'first4 must be exactly 4 letters or digits.', code: 'bad_first4' })
        }
        if (l !== null && !/^[A-Za-z0-9]{4}$/.test(l)) {
          return json(400, { error: 'last4 must be exactly 4 letters or digits.', code: 'bad_last4' })
        }

        const all = await tradingAccountService.getByUserId(user.id)
        const matches = all.filter((a: any) => a.status === 'active' && (
          String(a.nickname || '').toLowerCase() === accountRef.toLowerCase() ||
          a.displayLabel === accountRef ||
          a.accountNumberLast4 === accountRef ||
          String(a.accountFirst4 || '').toUpperCase() === accountRef.toUpperCase() ||
          `${String(a.accountFirst4 || '').toUpperCase()}-${a.accountNumberLast4}` === accountRef.toUpperCase()))
        if (matches.length === 0) return json(404, { error: `No active account "${accountRef}"`, code: 'not_found' })
        if (matches.length > 1) {
          return json(400, {
            error: `"${accountRef}" matches ${matches.length} accounts (${matches.map((m: any) => m.displayLabel).join(', ')}). Say which one.`,
            code: 'ambiguous',
          })
        }

        const target: any = matches[0]
        const newFirst = f ?? target.accountFirst4 ?? null
        const newLast = l ?? target.accountNumberLast4 ?? null

        if (newFirst && newLast) {
          const clash = all.find((a: any) => a.status === 'active' && a.id !== target.id
            && String(a.accountFirst4 || '').toUpperCase() === newFirst
            && a.accountNumberLast4 === newLast)
          if (clash) {
            return json(400, {
              error: `${newFirst}-${newLast} is already ${(clash as any).displayLabel}. Check the digits.`,
              code: 'duplicate_account_number',
            })
          }
        }

        // With both halves known the label needs no disambiguating suffix.
        const newLabel = newFirst && newLast ? `${newFirst}-${newLast}` : target.displayLabel
        const updated = await tradingAccountService.update(target.id, {
          accountFirst4: newFirst,
          accountNumberLast4: newLast,
          displayLabel: newLabel,
        } as any)

        return json(200, {
          account: updated,
          label: newLabel,
          previousLabel: target.displayLabel,
          message: `${target.displayLabel} is now ${newLabel}. Refer to it as "${newLabel}", "${newFirst}", or "${newLast}".`,
        })
      }

      if (input.action === 'set-nickname') {
        // Give an account a short unambiguous handle. Daniel's idea: two Lucid
        // Daily accounts both end 0001, and remembering which is -A vs -B is
        // exactly the sort of thing that causes a trade to be logged against
        // the wrong account. "LUCD" is unmistakable to him and to the bot.
        const { accountRef, nickname } = input
        if (!accountRef) return json(400, { error: 'accountRef required', code: 'no_ref' })

        const clean = nickname === null || nickname === '' ? null : String(nickname).trim()
        if (clean !== null && !/^[A-Za-z0-9-]{4,16}$/.test(clean)) {
          return json(400, {
            error: 'Nickname must be 4-16 characters, letters, digits or dashes only.',
            code: 'bad_nickname',
          })
        }

        const all = await tradingAccountService.getByUserId(user.id)
        const matches = all.filter((a: any) => a.status === 'active' && (
          String(a.nickname || '').toLowerCase() === accountRef.toLowerCase() ||
          a.displayLabel === accountRef ||
          a.accountNumberLast4 === accountRef))
        if (matches.length === 0) return json(404, { error: `No active account "${accountRef}"`, code: 'not_found' })
        if (matches.length > 1) {
          return json(400, {
            error: `"${accountRef}" matches ${matches.length} accounts (${matches.map((m: any) => m.displayLabel).join(', ')}). Say which one.`,
            code: 'ambiguous',
          })
        }

        if (clean) {
          const taken = all.find((a: any) => a.status === 'active'
            && a.id !== matches[0].id
            && String(a.nickname || '').toLowerCase() === clean.toLowerCase())
          if (taken) {
            return json(400, {
              error: `"${clean}" is already used by ${(taken as any).displayLabel}. Pick another.`,
              code: 'nickname_taken',
            })
          }
        }

        const updated = await tradingAccountService.update(matches[0].id, { nickname: clean } as any)
        return json(200, {
          account: updated,
          nickname: clean,
          label: (matches[0] as any).displayLabel,
          message: clean
            ? `${(matches[0] as any).displayLabel} can now be referred to as "${clean}".`
            : `Nickname cleared for ${(matches[0] as any).displayLabel}.`,
        })
      }

      if (input.action === 'set-daily-order') {
        const { orderDate, orderedAccountIds, notes: orderNotes } = input
        if (!orderDate || !Array.isArray(orderedAccountIds)) {
          return json(400, { error: 'orderDate and orderedAccountIds array are required' })
        }
        const order = await accountDailyOrderService.upsert(user.id, {
          orderDate,
          orderedAccountIds,
          notes: orderNotes,
        })
        return json(200, { order })
      }

      // Reorder accounts
      if (input.action === 'reorder') {
        const { orderedIds } = input
        if (!Array.isArray(orderedIds)) {
          return json(400, { error: 'orderedIds array required' })
        }
        await tradingAccountService.reorder(user.id, orderedIds)
        return json(200, { success: true })
      }

      return json(400, { error: 'Invalid action. Use: create, set-daily-order, or reorder' })
    }

    if (event.httpMethod === 'PUT') {
      const { id, updates } = JSON.parse(event.body || '{}')
      if (!id) return json(400, { error: 'id required' })

      const dbUpdates: any = {}
      if (updates.name !== undefined) dbUpdates.name = updates.name
      if (updates.firm !== undefined) dbUpdates.firm = updates.firm
      if (updates.accountNumberLast4 !== undefined) dbUpdates.accountNumberLast4 = updates.accountNumberLast4
      if (updates.accountSize !== undefined) dbUpdates.accountSize = String(updates.accountSize)
      if (updates.balance !== undefined) dbUpdates.balance = String(updates.balance)
      if (updates.drawdownUsed !== undefined) dbUpdates.drawdownUsed = String(updates.drawdownUsed)
      if (updates.highWaterMark !== undefined) dbUpdates.highWaterMark = String(updates.highWaterMark)
      if (updates.maxDrawdown !== undefined) dbUpdates.maxDrawdown = String(updates.maxDrawdown)
      if (updates.dailyDrawdown !== undefined) dbUpdates.dailyDrawdown = String(updates.dailyDrawdown)
      if (updates.lockedFloor !== undefined) dbUpdates.lockedFloor = updates.lockedFloor === null || updates.lockedFloor === '' ? null : String(updates.lockedFloor)
      if (updates.floorLockLevel !== undefined) dbUpdates.floorLockLevel = updates.floorLockLevel === null || updates.floorLockLevel === '' ? null : String(updates.floorLockLevel)
      if (updates.dayStartBalance !== undefined) dbUpdates.dayStartBalance = updates.dayStartBalance === null || updates.dayStartBalance === '' ? null : String(updates.dayStartBalance)
      if (updates.settledHighWaterMark !== undefined) dbUpdates.settledHighWaterMark = updates.settledHighWaterMark === null || updates.settledHighWaterMark === '' ? null : String(updates.settledHighWaterMark)
      if (updates.evalType !== undefined) dbUpdates.evalType = updates.evalType || null
      if (updates.firmType !== undefined) dbUpdates.firmType = updates.firmType || null
      if (updates.riskPerTrade !== undefined) dbUpdates.riskPerTrade = String(updates.riskPerTrade)
      if (updates.rules !== undefined) dbUpdates.rules = updates.rules
      if (updates.notes !== undefined) dbUpdates.notes = updates.notes
      if (updates.status !== undefined) dbUpdates.status = updates.status
      if (updates.phase !== undefined) dbUpdates.phase = updates.phase
      if (updates.platform !== undefined) dbUpdates.platform = updates.platform
      if (updates.groupName !== undefined) dbUpdates.groupName = updates.groupName

      const updated = await tradingAccountService.update(id, dbUpdates)
      return json(200, { account: updated })
    }

    if (event.httpMethod === 'DELETE') {
      const { id } = JSON.parse(event.body || '{}')
      if (!id) return json(400, { error: 'id required' })
      await tradingAccountService.delete(id)
      return json(204, {})
    }

    return json(405, { error: 'Method Not Allowed' })
  } catch (e) {
    console.error('db-accounts error', e)
    return json(500, { error: 'Internal Server Error' })
  }
}
