/**
 * challengeLifecycle — DISPLAY HELPERS ONLY.
 * ==========================================
 *
 * This file used to INFER a challenge's stage from phase flags:
 *
 *     if (challenge.status === 'passed') return 'funded_active';
 *
 * That single line is why the Dashboard showed 3 funded accounts when Daniel
 * had 2. Passing an eval leaves the original eval row at status='passed'
 * (lifecycle 'eval_passed') while the cascade spawns a SEPARATE funded row.
 * The inference counted both.
 *
 * Worse, the inferred value was written back to the database from ~19 call
 * sites (payout add/edit/remove, bulk status change, fail flows), overwriting
 * whatever the cascade services had set.
 *
 * THE RULE NOW:
 *   `challenges.lifecycle` is the single source of truth, written ONLY by the
 *   cascade services (buyEval / passEval / promoteToLive / failAccount).
 *   Read it via src/utils/lifecycle.ts. Never infer it, never write it here.
 *
 * What remains below is presentation: labels, colours, and P&L arithmetic.
 * `inferOutcomeType` and `inferHighestMilestone` are kept ONLY as read-time
 * fallbacks for rows written before the lifecycle column existed, and are
 * deliberately NOT exported for writing.
 */

import { Challenge } from '../types';
import { lifecycleOf, type Lifecycle } from './lifecycle';

export const MILESTONE_LABELS: Record<string, string> = {
  purchased: 'Purchased',
  phase1_passed: 'Phase 1 Passed',
  phase2_passed: 'Phase 2 Passed',
  phase3_passed: 'Phase 3 Passed',
  funded: 'Funded',
  payout_received: 'Payout Received',
  failed_after_payout: 'Failed After Payout',
};

export const OUTCOME_LABELS: Record<string, string> = {
  active: 'Active',
  awaiting_activation: 'Awaiting Activation',
  failed_pre_phase: 'Failed Before Passing',
  failed_after_phase1: 'Failed After Phase 1',
  failed_after_phase2: 'Failed After Phase 2',
  failed_after_phase3: 'Failed After Phase 3',
  failed_after_funded: 'Failed After Funded',
  payout_then_failed: 'Payout Then Failed',
  funded_active: 'Funded Active',
  payout_received: 'Payout Received',
  unknown: 'Unknown',
};

export const FAILURE_REASON_LABELS: Record<string, string> = {
  rule_break: 'Rule Break',
  max_drawdown: 'Max Drawdown Hit',
  daily_loss: 'Daily Loss Hit',
  tilt_revenge: 'Tilt / Revenge',
  overtrading: 'Overtrading',
  account_expired: 'Account Expired',
  strategic_reset: 'Strategic Reset',
  firm_platform_issue: 'Firm / Platform Issue',
  unknown: 'Unknown',
};

export const getTotalPayouts = (challenge: Challenge): number =>
  (challenge.payouts || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

/**
 * Net money in/out for this challenge: payouts minus what it cost.
 * Activation fees count as cost — they are money Daniel actually paid.
 */
export const getNetLifecyclePnl = (challenge: Challenge): number => {
  const payouts = getTotalPayouts(challenge);
  const cost = Number(challenge.cost || 0);
  const activation = Number(challenge.activationFeeAmount || 0);
  return Math.round((payouts - cost - activation) * 100) / 100;
};

/**
 * Outcome label for DISPLAY.
 *
 * Prefers the stored `outcomeType`, then derives from the authoritative
 * lifecycle. Phase flags are only consulted for pre-migration rows that have
 * neither — and even then the result is never written back.
 */
export const getDisplayOutcome = (challenge: Challenge): string => {
  if (challenge.outcomeType) return challenge.outcomeType;

  const lc: Lifecycle = lifecycleOf(challenge as any);
  const payouts = getTotalPayouts(challenge);

  switch (lc) {
    case 'live_active':
    case 'funded_active':
      return payouts > 0 ? 'payout_received' : 'funded_active';
    case 'live_failed':
    case 'funded_failed':
      return payouts > 0 ? 'payout_then_failed' : 'failed_after_funded';
    case 'eval_failed':
      return 'failed_pre_phase';
    case 'eval_passed':
      return 'awaiting_activation';
    case 'eval_active':
    default:
      return 'active';
  }
};

/** Highest milestone for DISPLAY. Same rules: read-only, never written back. */
export const getDisplayMilestone = (challenge: Challenge): string => {
  if (challenge.highestMilestone) return challenge.highestMilestone;

  const lc: Lifecycle = lifecycleOf(challenge as any);
  const payouts = getTotalPayouts(challenge);

  if (payouts > 0) {
    return lc.endsWith('_failed') ? 'failed_after_payout' : 'payout_received';
  }
  if (lc.startsWith('live') || lc.startsWith('funded')) return 'funded';
  if (lc === 'eval_passed') return 'phase1_passed';
  return 'purchased';
};

export const getMilestoneLabel = (value?: string | null): string =>
  (value && MILESTONE_LABELS[value]) || 'Purchased';

export const getOutcomeLabel = (value?: string | null): string =>
  (value && OUTCOME_LABELS[value]) || 'Active';

export const getFailureReasonLabel = (value?: string | null): string =>
  (value && FAILURE_REASON_LABELS[value]) || 'Unknown';

/** Badge tone, derived from the authoritative lifecycle. */
export const getLifecycleTone = (
  challenge: Challenge,
): 'cyan' | 'amber' | 'emerald' | 'red' | 'gray' => {
  const lc = lifecycleOf(challenge as any);
  if (lc === 'live_active') return 'emerald';
  if (lc === 'funded_active') return 'amber';
  if (lc === 'eval_active') return 'cyan';
  if (lc === 'eval_passed') return 'amber';
  return lc.endsWith('_failed') ? 'red' : 'gray';
};
