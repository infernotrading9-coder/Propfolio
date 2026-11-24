export type DailyBreach = 'soft' | 'hard';

/** Markets where a daily breach is fatal by default: continuous, no session to reset in. */
const HARD_BY_DEFAULT = ['cfd', 'forex'];

/**
 * Resolve the severity of a daily-DD breach.
 *
 * An explicit per-account `dailyBreach` always wins. Otherwise the firm's MARKET decides:
 * cfd/forex = hard (account gone), everything else = soft (locked out until the limit
 * resets, account survives) — which now includes perps, after Vest announced it.
 *
 * Unknown values fall through to the market default rather than guessing 'hard', so a typo
 * can never silently kill an account that is still alive.
 */
export function resolveDailyBreach(
  explicit?: string | null,
  firmType?: string | null,
): DailyBreach {
  const ex = String(explicit || '').toLowerCase();
  if (ex === 'soft' || ex === 'hard') return ex;
  const market = String(firmType || 'futures').toLowerCase();
  return HARD_BY_DEFAULT.includes(market) ? 'hard' : 'soft';
}
