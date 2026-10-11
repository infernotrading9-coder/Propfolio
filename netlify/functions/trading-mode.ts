import type { Handler } from '@netlify/functions'
import { json, getUserFromSession } from './_utils'
import { tradingModeStateService, personalTradeService } from '../../server/db/service'

/**
 * Trading Mode Cockpit — Stream Deck integration + cockpit state machine
 *
 * POST /trading-mode
 *   Stream Deck buttons and cockpit trigger this endpoint.
 *
 * State machine: pre_trade → in_trade → out_trade | sl_hit | tp_hit | ddl | breach
 *                sl_hit/tp_hit/ddl/breach → out_trade → pre_trade (fresh)
 *
 * Voice keys map to audio files in public/cockpit-voice/.
 */
const COCKPIT_STATES = ['pre_trade', 'in_trade', 'out_trade', 'sl_hit', 'tp_hit', 'ddl', 'breach'] as const;
type CockpitState = typeof COCKPIT_STATES[number];

/** Time window (minutes) to consider a strategy press as "same setup" */
const STRATEGY_GROUPING_MINUTES = 5;

// Voice messages — the text versions. Audio files to be recorded by Daniel.
export const VOICE_SCRIPTS: Record<string, string> = {
  pre_trade: 'Size correctly. $200 risk. 2RR. Be patient.',
  in_trade: "You're in a trade. Stop is set. Take profit at 2RR. Stay calm.",
  out_trade_win: 'Good. Next.',
  out_trade_loss: 'Explain that one.',
  sl_hit: 'Stop hit. Loss banked. Reset and refocus.',
  tp_hit: 'Take profit hit. Good. Bank the win.',
  ddl: 'Daily loss limit hit. Done for the day. Step away.',
  breach: 'Breach. Account at risk. Shut it down.',
  fresh_trade: 'Fresh setup. New pattern. Size correctly.',
  strategy_set: (s: string) => `${s} strategy. First try.`,
  strategy_reattempt: (s: string) => `${s} again. Attempt number`,
};

/** Determine the voice key and message for a state transition */
function voiceForState(state: CockpitState, prevState?: string, pnl?: number): { key: string; message: string } {
  if (state === 'out_trade' && prevState === 'in_trade') {
    if (pnl && pnl >= 0) return { key: 'out_trade_win', message: VOICE_SCRIPTS.out_trade_win };
    return { key: 'out_trade_loss', message: VOICE_SCRIPTS.out_trade_loss };
  }
  const key = state;
  return { key, message: VOICE_SCRIPTS[key] || '' };
}

export const handler: Handler = async (event) => {
  try {
    const user = await getUserFromSession(event);
    if (!user) return json(401, { error: 'Unauthorized' });

    if (event.httpMethod === 'GET') {
      // Cockpit polls this for current state + pending voice
      const state = await tradingModeStateService.get(user.id);
      const voiceKey = (state as any).last_voice_key || null;
      const freshVoice = (state as any).lastVoiceKey !== (state as any).last_voice_key;
      return json(200, {
        cockpitState: (state as any).cockpitState || 'pre_trade',
        voiceKey: freshVoice ? voiceKey : null,
        voiceMessage: voiceKey ? VOICE_SCRIPTS[voiceKey as string] || '' : '',
        currentStrategy: (state as any).currentStrategy,
        strategyAttempts: (state as any).strategyAttempts || 0,
        freshSetup: (state as any).freshSetup !== false,
        score: (state as any).score,
        mode: (state as any).mode,
      });
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const action = body.action || body.state;
      if (!action) return json(400, { error: 'action or state required' });

      const current = await tradingModeStateService.get(user.id);
      const prevState = (current as any).cockpitState || 'pre_trade';
      const now = new Date();

      let newState: CockpitState = prevState as CockpitState;
      let voiceKey = '';
      let responseExtra: Record<string, any> = {};

      // Handle state transitions
      switch (action) {
        case 'enter_cockpit':
        case 'pre_trade':
          newState = 'pre_trade';
          voiceKey = 'pre_trade';
          break;

        case 'in_trade':
          newState = 'in_trade';
          voiceKey = 'in_trade';
          break;

        case 'out_trade':
        case 'out_of_trade':
          newState = 'out_trade';
          // Check if we know the P&L for this session
          const pnlToCheck = action === 'out_trade' ? body.pnl : null;
          const voice = voiceForState('out_trade', prevState, pnlToCheck);
          voiceKey = voice.key;
          // Auto-reset after out_trade
          setTimeout(async () => {
            await tradingModeStateService.upsert(user.id, {
              cockpitState: 'pre_trade',
              freshSetup: true,
              currentStrategy: null,
              lastVoiceKey: null,
            });
          }, 0);
          break;

        case 'sl_hit':
          newState = 'sl_hit';
          voiceKey = 'sl_hit';
          break;

        case 'tp_hit':
          newState = 'tp_hit';
          voiceKey = 'tp_hit';
          break;

        case 'ddl':
          newState = 'ddl';
          voiceKey = 'ddl';
          break;

        case 'breach':
          newState = 'breach';
          voiceKey = 'breach';
          break;

        case 'fresh_trade':
          responseExtra = { freshSetup: true };
          voiceKey = 'fresh_trade';
          break;

        case 'strategy': {
          const strategy = body.strategy;
          if (!strategy) return json(400, { error: 'strategy required for strategy action' });

          // Time-based grouping: same strategy within STRATEGY_GROUPING_MINUTES = same setup
          const lastTime = (current as any).lastStrategyTime ? new Date((current as any).lastStrategyTime).getTime() : 0;
          const elapsed = lastTime > 0 ? (now.getTime() - lastTime) / 60000 : 999;
          const sameStrategy = (current as any).currentStrategy === strategy;
          const fresh = body.fresh !== false;

          let attempts = 1;
          if (fresh && sameStrategy && elapsed < STRATEGY_GROUPING_MINUTES) {
            // Re-entry of same strategy within window — increment attempt
            attempts = ((current as any).strategyAttempts || 0) + 1;
            voiceKey = 'strategy_reattempt';
            responseExtra.strategyAttempts = attempts;
          } else {
            // First entry for this strategy or fresh setup
            voiceKey = 'strategy_set';
            attempts = 1;
          }

          responseExtra.currentStrategy = strategy;
          await tradingModeStateService.upsert(user.id, {
            currentStrategy: strategy,
            strategyAttempts: attempts,
            lastStrategyTime: now,
            freshSetup: fresh,
            lastVoiceKey: voiceKey,
          });

          break;
        }

        default:
          return json(400, { error: `Unknown action: ${action}` });
      }

      // Update state (skip for strategy/fresh_trade which already upserted relevant fields)
      if (action !== 'strategy' && action !== 'fresh_trade') {
        await tradingModeStateService.upsert(user.id, {
          cockpitState: newState,
          freshSetup: action === 'enter_cockpit' || action === 'pre_trade',
          lastVoiceKey: voiceKey,
        });
      }

      // Get personal balance for cockpit display
      const balance = await personalTradeService.getBalance(user.id);

      return json(200, {
        ok: true,
        cockpitState: newState,
        voiceKey,
        voiceMessage: voiceKey ? VOICE_SCRIPTS[voiceKey as string] || '' : '',
        balance,
        ...responseExtra,
      });
    }

    return json(405, { error: 'Method Not Allowed' });
  } catch (e: any) {
    console.error('trading-mode error', e);
    return json(500, { error: 'Internal Server Error' });
  }
};