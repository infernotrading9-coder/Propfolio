/**
 * Local-date helpers.
 *
 * Calendar dates in this app are plain `YYYY-MM-DD` strings representing a
 * LOCAL calendar day (the day Daniel actually traded), not an instant in time.
 * Two native JS behaviours quietly corrupt them:
 *
 *   1. `new Date('2026-08-25')` parses as UTC MIDNIGHT, so in any negative-offset
 *      timezone (all of the US) it renders as the 24th — every date shows a day behind.
 *   2. `new Date().toISOString().slice(0, 10)` converts to UTC first, so after
 *      ~5pm Pacific "today" rolls over to tomorrow's date.
 *
 * Always use these helpers instead of the raw calls.
 */

/** Format a Date as a local `YYYY-MM-DD` (never shifts across the UTC boundary). */
export function toLocalISODate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Today's local calendar date as `YYYY-MM-DD`. */
export function todayLocalISO(): string {
  return toLocalISODate(new Date());
}

/**
 * Parse a `YYYY-MM-DD` string into a Date at LOCAL midnight.
 * Safe for `.getDate()`, `.toLocaleDateString()`, and display formatting.
 */
export function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
