import type { Handler } from '@netlify/functions';
import { and, eq, sql, desc } from 'drizzle-orm';
import { json, getUserFromSession } from './_utils';
import { personalTradeService, strategyLog, strategyPromptOptions } from '../../server/db/service';
import { db } from '../../server/db/connection';

export const handler: Handler = async (event) => {
  try {
    const user = await getUserFromSession(event);
    if (!user) return json(401, { error: 'Unauthorized' });

    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};

      // Get stats
      if (params.action === 'stats') {
        const stats = await personalTradeService.getStats(user.id);
        return json(200, { stats });
      }

      // Get trades (optionally limited)
      const limit = params.limit ? parseInt(params.limit) : undefined;
      const trades = await personalTradeService.getByUserId(user.id, limit);
      return json(200, { trades });
    }

    if (event.httpMethod === 'POST') {
      const input = JSON.parse(event.body || '{}');

      // Log a trade
      if (input.action === 'log-trade') {
        // Dedup by externalId if provided
        if (input.externalId) {
          const existing = await personalTradeService.getByExternalId(user.id, input.externalId);
          if (existing) {
            return json(200, { trade: existing, deduplicated: true });
          }
        }

        const trade = await personalTradeService.create(user.id, {
          broker: input.broker || 'NinjaTrader',
          instrument: input.instrument || null,
          direction: input.direction || null,
          entryPrice: input.entryPrice ? String(input.entryPrice) : null,
          exitPrice: input.exitPrice ? String(input.exitPrice) : null,
          quantity: input.quantity ? String(input.quantity) : null,
          amount: String(input.amount),
          result: input.result,
          fees: input.fees ? String(input.fees) : '0',
          riskReward: input.riskReward ? String(input.riskReward) : null,
          marginCallFees: input.marginCallFees ? String(input.marginCallFees) : '0',
          notes: input.notes || null,
          tradeDate: input.tradeDate ? new Date(input.tradeDate) : new Date(),
          externalId: input.externalId || null,
          accountName: input.accountName || 'NinjaTrader',
        } as any);
        return json(200, { trade });
      }

      // Delete a trade
      if (input.action === 'delete-trade') {
        if (!input.id) return json(400, { error: 'id required' });
        await personalTradeService.delete(input.id);
        return json(200, { deleted: true });
      }

      // Update trade metadata (strategy, SL type, TP method, etc.)
      if (input.action === 'update-trade') {
        if (!input.id) return json(400, { error: 'id required' });
        const trade = await personalTradeService.getById(user.id, input.id);
        if (!trade) return json(404, { error: 'Trade not found' });
        const updated = await personalTradeService.update(user.id, input.id, {
          strategy: input.strategy ?? null,
          slType: input.slType ?? null,
          tpMethod: input.tpMethod ?? null,
          tryCounter: input.tryCounter != null ? Number(input.tryCounter) : null,
          stuckToSize: input.stuckToSize ?? null,
          fees: input.fees != null ? String(input.fees) : null,
          notes: input.notes ?? null,
        });
        return json(200, { trade: updated });
      }

      // List distinct strategies for autocomplete
      if (input.action === 'strategies') {
        const strategies = await personalTradeService.getStrategies(user.id);
        return json(200, { strategies });
      }

      // Update the live account balance (trade monitor bot pushes from Tradovate)
      if (input.action === 'update-balance') {
        const balance = input.balance;
        if (balance === undefined || balance === null || balance === '') {
          return json(400, { error: 'balance required' });
        }
        const rows = await personalTradeService.upsertBalance(user.id, String(balance));
        return json(200, { balance: rows[0] ?? null });
      }

      // Get prompt options for cockpit
      if (input.action === 'prompt-options') {
        const rows = await db.select().from(strategyPromptOptions).orderBy(strategyPromptOptions.sortOrder);
        const options: Record<string, Array<{value: string; label: string}>> = {};
        for (const r of rows) {
          if (!options[r.field]) options[r.field] = [];
          options[r.field].push({ value: r.value, label: r.label || r.value });
        }
        return json(200, { options });
      }

      // Get variant history for autocomplete
      if (input.action === 'variant-history') {
        const rows = await db.select({ variant: strategyLog.variant }).from(strategyLog)
          .where(and(eq(strategyLog.userId, user.id), sql`variant IS NOT NULL AND variant != ''`))
          .groupBy(strategyLog.variant)
          .orderBy(desc(sql`max(${strategyLog.createdAt})`))
          .limit(50);
        return json(200, { variants: rows.map(r => r.variant).filter(Boolean) as string[] });
      }

      // Log a strategy press with full details (from cockpit)
      if (input.action === 'log-strategy') {
        const { strategy, setupTf, entryTf, slPlacement, variant } = input;
        if (!strategy) return json(400, { error: 'strategy required' });
        await db.insert(strategyLog).values({ userId: user.id, strategy, setupTf: setupTf || null, entryTf: entryTf || null, slPlacement: slPlacement || null, variant: variant || null });
        return json(200, { ok: true });
      }

      // ─── Ticksensei management actions ────────────────────────────────

      // Add a new prompt option
      if (input.action === 'add-prompt-option') {
        const { field, value, label, sortOrder } = input;
        if (!field || !value) return json(400, { error: 'field and value required' });
        const [row] = await db.insert(strategyPromptOptions).values({ field, value, label: label || null, sortOrder: sortOrder ?? 0 }).returning();
        return json(200, { option: row });
      }

      // Remove a prompt option
      if (input.action === 'remove-prompt-option') {
        const { id } = input;
        if (!id) return json(400, { error: 'id required' });
        await db.delete(strategyPromptOptions).where(eq(strategyPromptOptions.id, id));
        return json(200, { deleted: true });
      }

      // Get strategy stats (for Ticksensei analysis)
      if (input.action === 'strategy-stats') {
        const strategies = await db.select({ strategy: strategyLog.strategy }).from(strategyLog)
          .where(and(eq(strategyLog.userId, user.id), sql`strategy IS NOT NULL`))
          .groupBy(strategyLog.strategy)
          .orderBy(desc(sql`COUNT(*)`));
        const result: any[] = [];
        for (const { strategy } of strategies) {
          const rows = await db.select().from(strategyLog).where(and(eq(strategyLog.userId, user.id), eq(strategyLog.strategy, strategy)));
          const wins = rows.filter(r => r.result === 'win').length;
          const losses = rows.filter(r => r.result === 'loss').length;
          result.push({ strategy, total: rows.length, wins, losses, winRate: rows.length > 0 ? ((wins / rows.length) * 100).toFixed(1) : '0' });
        }
        return json(200, { strategies: result });
      }

      return json(400, { error: 'Unknown action' });
    }

    if (event.httpMethod === 'DELETE') {
      const { id } = JSON.parse(event.body || '{}');
      if (!id) return json(400, { error: 'id required' });
      await personalTradeService.delete(id);
      return json(200, { deleted: true });
    }

    return json(405, { error: 'Method Not Allowed' });
  } catch (e) {
    console.error('db-personal-trades error', e);
    return json(500, { error: 'Internal Server Error' });
  }
};
