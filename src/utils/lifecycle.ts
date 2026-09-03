/**
 * The lifecycle vocabulary — one source of truth for every surface.
 * =================================================================
 *
 * REPLACES the old inference in challengeLifecycle.ts, which derived "is this
 * funded?" from `phase1_completed`. That flag only means "cleared the eval", so
 * every eval Daniel ever passed — including ones whose funded account later
 * blew up — was counted as a currently-funded account. The 2026 dashboard
 * reported 70 funded accounts against 3 real ones.
 *
 * THE THREE STAGES ARE DISTINCT. Do not collapse them:
 *
 *   eval    bought a challenge, trying to pass it
 *   funded  passed the eval and got a funded account. A pass ALWAYS lands here.
 *   live    the firm moved you onto real capital. Requires at least
 *           MIN_PAYOUTS_FOR_LIVE payouts on that funded account AND the firm's
 *           decision. It is never automatic and never implied by passing.
 *
 * `lifecycle` is now stored on the row and written only by the cascade service,
 * so the UI reads state instead of guessing at it.
 */

export const MIN_PAYOUTS_FOR_LIVE = 5;

export type Lifecycle =
  | 'eval_active' | 'eval_passed' | 'eval_failed'
  | 'funded_active' | 'funded_failed'
  | 'live_active' | 'live_failed';

export type Stage = 'eval' | 'funded' | 'live';

export const LIFECYCLE_LABELS: Record<Lifecycle, string> = {
  eval_active: 'Eval — In Progress',
  eval_passed: 'Eval — Passed',
  eval_failed: 'Eval — Failed',
  funded_active: 'Funded — Active',
  funded_failed: 'Funded — Failed',
  live_active: 'Live — Active',
  live_failed: 'Live — Failed',
};

const SHORT: Record<Lifecycle, string> = {
  eval_active: 'Eval',
  eval_passed: 'Passed',
  eval_failed: 'Failed',
  funded_active: 'Funded',
  funded_failed: 'Failed',
  live_active: 'Live',
  live_failed: 'Failed',
};

export interface LifecycleBearing {
  lifecycle?: Lifecycle | string | null;
  payoutCount?: number;
}

const KNOWN = new Set<string>([
  'eval_active', 'eval_passed', 'eval_failed',
  'funded_active', 'funded_failed', 'live_active', 'live_failed',
]);

/** Read the lifecycle off a row, defaulting safely for rows written before the migration. */
export function lifecycleOf(x: LifecycleBearing | null | undefined): Lifecycle {
  const v = String(x?.lifecycle || '');
  return (KNOWN.has(v) ? v : 'eval_active') as Lifecycle;
}

/** Which of the three stages this row is in. */
export function stageOf(x: LifecycleBearing | null | undefined): Stage {
  const lc = lifecycleOf(x);
  if (lc.startsWith('live')) return 'live';
  if (lc.startsWith('funded')) return 'funded';
  return 'eval';
}

/** Still being traded right now. */
export function isActive(x: LifecycleBearing | null | undefined): boolean {
  const lc = lifecycleOf(x);
  return lc === 'eval_active' || lc === 'funded_active' || lc === 'live_active';
}

export function isFailed(x: LifecycleBearing | null | undefined): boolean {
  return lifecycleOf(x).endsWith('_failed');
}

/**
 * A CURRENTLY funded account. Deliberately excludes:
 *   - passed evals that never got a funded account issued
 *   - funded accounts that later blew up
 *   - live accounts (they are counted separately — a live account is not a
 *     funded account, it is the stage after)
 */
export function isFundedNow(x: LifecycleBearing | null | undefined): boolean {
  return lifecycleOf(x) === 'funded_active';
}

/** A CURRENTLY live account. Rare and hard-won — never infer it. */
export function isLiveNow(x: LifecycleBearing | null | undefined): boolean {
  return lifecycleOf(x) === 'live_active';
}

/**
 * Did this eval ever produce a funded account? Used for pass-rate stats, where
 * a funded account that later failed still counts as a successful eval.
 */
export function everReachedFunded(x: LifecycleBearing | null | undefined): boolean {
  const lc = lifecycleOf(x);
  return lc !== 'eval_active' && lc !== 'eval_failed';
}

/** Has this funded account earned enough payouts to be considered for live? */
export function isEligibleForLive(x: LifecycleBearing | null | undefined): boolean {
  return lifecycleOf(x) === 'funded_active' && (x?.payoutCount ?? 0) >= MIN_PAYOUTS_FOR_LIVE;
}

export function lifecycleLabel(x: LifecycleBearing | null | undefined): string {
  return LIFECYCLE_LABELS[lifecycleOf(x)];
}

export function lifecycleShortLabel(x: LifecycleBearing | null | undefined): string {
  return SHORT[lifecycleOf(x)];
}

/** Badge colour per stage/state. */
export function lifecycleTone(
  x: LifecycleBearing | null | undefined,
): 'cyan' | 'amber' | 'emerald' | 'red' | 'gray' {
  const lc = lifecycleOf(x);
  if (lc === 'live_active') return 'emerald';
  if (lc === 'funded_active') return 'amber';
  if (lc === 'eval_active') return 'cyan';
  if (lc === 'eval_passed') return 'amber';
  return lc.endsWith('_failed') ? 'red' : 'gray';
}

export interface LifecycleCounts {
  evalActive: number;
  fundedActive: number;
  liveActive: number;
  evalFailed: number;
  fundedFailed: number;
  liveFailed: number;
  everFunded: number;
  totalEvalsBought: number;
}

/**
 * Count a set of challenges by lifecycle. This is what the Dashboard cards
 * render — no inference, no phase-flag arithmetic.
 */
export function countByLifecycle(rows: LifecycleBearing[]): LifecycleCounts {
  const c: LifecycleCounts = {
    evalActive: 0, fundedActive: 0, liveActive: 0,
    evalFailed: 0, fundedFailed: 0, liveFailed: 0,
    everFunded: 0, totalEvalsBought: 0,
  };
  for (const r of rows) {
    const lc = lifecycleOf(r);
    if (lc === 'eval_active') c.evalActive++;
    else if (lc === 'eval_failed') c.evalFailed++;
    else if (lc === 'funded_active') c.fundedActive++;
    else if (lc === 'funded_failed') c.fundedFailed++;
    else if (lc === 'live_active') c.liveActive++;
    else if (lc === 'live_failed') c.liveFailed++;
    if (everReachedFunded(r)) c.everFunded++;
    // A funded/live row spawned by passEval is not itself a purchase; only
    // rows that began life as an eval count toward "evals bought".
    if (lc.startsWith('eval')) c.totalEvalsBought++;
  }
  return c;
}
