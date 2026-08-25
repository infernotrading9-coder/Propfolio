/**
 * Session-aware drawdown model (Aug 25 2026)
 * ------------------------------------------
 * The prop-firm trading day rolls over at 17:00 America/New_York.
 *
 * Two rules were wrong before this module existed:
 *
 *  1. Max DD trailed on intraday profit. It must not. The max-DD floor is
 *     derived from the high-water mark as of the LAST 5pm settle, so a green
 *     day does not raise your stop-out until the day actually closes.
 *
 *  2. The card showed the static daily-DD *limit* ($1,000) instead of the live
 *     room to the floor. Room is what matters when you're deciding whether to
 *     take another trade.
 *
 * Both drawdowns are expressed as PRICE LEVELS (the balance at which the
 * account dies), not dollar amounts. "Don't go below 49,000" is actionable;
 * "you have $1,000 of daily DD" requires mental arithmetic mid-trade.
 *
 * The binding stop-out is whichever level is HIGHER — you hit that one first.
 */

export interface DrawdownInputs {
  balance: number;
  accountSize: number;
  maxDrawdown: number;
  dailyDrawdown: number;
  dayStartBalance?: number | null;
  settledHighWaterMark?: number | null;
  lockedFloor?: number | null;
  floorLockLevel?: number | null;
}

export interface DrawdownState {
  /** Balance at the last 5pm settle. Daily room is measured from here. */
  dayStart: number;
  /** HWM as of the last settle — does NOT include today's profit. */
  settledHwm: number;
  /** Level at which the trailing max-DD floor freezes permanently. */
  lockLevel: number;
  /** Price level that busts the account on max DD. */
  maxDDLevel: number;
  /** Price level that busts the account on daily DD. */
  dailyDDLevel: number;
  /** The one you'll hit first — the real stop-out. */
  stopOutLevel: number;
  /** Which rule is binding right now. */
  binding: 'max' | 'daily';
  /** Dollars from balance down to the stop-out. Negative = breached. */
  room: number;
  /** Distance to each level individually. */
  maxDDRoom: number;
  dailyDDRoom: number;
  /** True once the max-DD floor can no longer trail up. */
  floorLocked: boolean;
  /** Today's P&L relative to the settle. */
  dayPnL: number;
  breached: boolean;
  /** Where the max-DD floor will sit after the next 5pm settle. */
  projectedMaxDDLevelAtSettle: number;
  willLockAtSettle: boolean;
}

/** Most recent 17:00 America/New_York at or before `d`. */
export function sessionStart(d: Date = new Date()): Date {
  const offsetMs = (() => {
    const s = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      timeZoneName: 'shortOffset',
    }).format(d);
    const m = s.match(/GMT([+-]\d+)/);
    return (m ? parseInt(m[1], 10) : -5) * 3600_000;
  })();
  const ny = new Date(d.getTime() + offsetMs);
  const cut = new Date(Date.UTC(ny.getUTCFullYear(), ny.getUTCMonth(), ny.getUTCDate(), 17, 0, 0));
  const startNy = cut.getTime() <= ny.getTime() ? cut : new Date(cut.getTime() - 86_400_000);
  return new Date(startNy.getTime() - offsetMs);
}

/** True when `lastSettledAt` predates the current session and a rollover is due. */
export function needsSettle(lastSettledAt: Date | string | null | undefined, now = new Date()): boolean {
  if (!lastSettledAt) return true;
  const t = typeof lastSettledAt === 'string' ? new Date(lastSettledAt) : lastSettledAt;
  if (isNaN(t.getTime())) return true;
  return t.getTime() < sessionStart(now).getTime();
}

const n = (v: unknown, fallback = 0): number => {
  const x = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(x) ? x : fallback;
};

export function computeDrawdown(input: DrawdownInputs): DrawdownState {
  const balance = n(input.balance);
  const accountSize = n(input.accountSize);
  const maxDD = n(input.maxDrawdown);
  const dailyDD = n(input.dailyDrawdown);

  // Fall back to the live balance when the account has never been settled.
  const dayStart = input.dayStartBalance != null ? n(input.dayStartBalance) : balance;
  // The settled HWM can never be below the account's starting size.
  const settledHwm = Math.max(
    input.settledHighWaterMark != null ? n(input.settledHighWaterMark) : dayStart,
    accountSize,
  );

  const lockLevel = input.floorLockLevel != null ? n(input.floorLockLevel) : accountSize + 100;
  const explicitLock = input.lockedFloor != null ? n(input.lockedFloor) : null;

  // Max DD trails the SETTLED hwm and stops climbing at the lock level.
  const trailing = maxDD > 0 ? settledHwm - maxDD : 0;
  const maxDDLevel = explicitLock != null ? explicitLock : Math.min(trailing, lockLevel);
  const floorLocked = explicitLock != null || trailing >= lockLevel;

  // Daily DD is measured from the settle, so intraday profit widens the room.
  const dailyDDLevel = dailyDD > 0 ? dayStart - dailyDD : -Infinity;

  const stopOutLevel = Math.max(maxDDLevel, dailyDDLevel);
  const binding = dailyDDLevel > maxDDLevel ? 'daily' : 'max';

  // At the next settle the HWM catches up to today's high (approximated by the
  // current balance when it's a new high).
  const nextHwm = Math.max(settledHwm, balance);
  const projected = explicitLock != null ? explicitLock : Math.min(maxDD > 0 ? nextHwm - maxDD : 0, lockLevel);

  return {
    dayStart,
    settledHwm,
    lockLevel,
    maxDDLevel,
    dailyDDLevel,
    stopOutLevel,
    binding,
    room: balance - stopOutLevel,
    maxDDRoom: balance - maxDDLevel,
    dailyDDRoom: dailyDD > 0 ? balance - dailyDDLevel : Infinity,
    floorLocked,
    dayPnL: balance - dayStart,
    breached: balance <= stopOutLevel,
    projectedMaxDDLevelAtSettle: projected,
    willLockAtSettle: explicitLock == null && projected >= lockLevel,
  };
}

/**
 * Roll an account into the current session. Returns the fields to persist, or
 * null when the account is already settled for this session.
 */
export function settleAccount(acct: {
  balance: unknown;
  accountSize: unknown;
  highWaterMark: unknown;
  settledHighWaterMark?: unknown;
  lastSettledAt?: Date | string | null;
}, now = new Date()) {
  if (!needsSettle(acct.lastSettledAt as any, now)) return null;
  const balance = n(acct.balance);
  const settledHwm = Math.max(
    n(acct.settledHighWaterMark, 0),
    n(acct.highWaterMark, 0),
    balance,
    n(acct.accountSize, 0),
  );
  return {
    dayStartBalance: balance.toFixed(2),
    settledHighWaterMark: settledHwm.toFixed(2),
    lastSettledAt: sessionStart(now),
  };
}
