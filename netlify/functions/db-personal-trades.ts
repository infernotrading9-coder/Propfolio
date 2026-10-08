import type { Handler } from '@netlify/functions';
import { json, getUserFromSession } from './_utils';
import { personalTradeService } from '../../server/db/service';

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
        const updated = await personalTradeService.update(input.id, user.id, {
          strategy: input.strategy ?? null,
          slType: input.slType ?? null,
          tpMethod: input.tpMethod ?? null,
          tryCounter: input.tryCounter != null ? Number(input.tryCounter) : null,
          stuckToSize: input.stuckToSize ?? null,
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
