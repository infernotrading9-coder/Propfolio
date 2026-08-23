import { Challenge } from '../types';

export const LIFECYCLE_MILESTONE_LABELS: Record<string, string> = {
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
  awaiting_activation: 'Passed · Awaiting Activation',
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

export const getTotalPayouts = (challenge: Pick<Challenge, 'payouts'>): number => {
  if (!Array.isArray(challenge.payouts)) return 0;
  return challenge.payouts.reduce((sum, payout) => sum + (Number(payout.amount) || 0), 0);
};

export const getLifecycleCost = (challenge: Pick<Challenge, 'cost' | 'initialCost' | 'activationFeeAmount'>): number => {
  const cost = Number(challenge.cost ?? challenge.initialCost ?? 0) || 0;
  return cost;
};

export const getNetLifecyclePnl = (challenge: Challenge): number => {
  return getTotalPayouts(challenge) - getLifecycleCost(challenge);
};

export const inferHighestMilestone = (challenge: Challenge): string => {
  const payouts = getTotalPayouts(challenge);
  if (challenge.status === 'failed' && payouts > 0) return 'failed_after_payout';
  if (payouts > 0) return 'payout_received';
  if (challenge.liveAccount) return 'funded';
  const total = challenge.totalPhases || 3;
  const funded = total === 1
    ? !!challenge.phases?.phase1?.completed
    : total === 2
      ? !!challenge.phases?.phase1?.completed && !!challenge.phases?.phase2?.completed
      : !!challenge.phases?.phase1?.completed && !!challenge.phases?.phase2?.completed && !!challenge.phases?.phase3?.completed;
  if (funded) return 'funded';
  if (challenge.phases?.phase3?.completed) return 'phase3_passed';
  if (challenge.phases?.phase2?.completed) return 'phase2_passed';
  if (challenge.phases?.phase1?.completed) return 'phase1_passed';
  return 'purchased';
};

export const inferOutcomeType = (challenge: Challenge): string => {
  const payouts = getTotalPayouts(challenge);
  const total = challenge.totalPhases || 3;
  const funded = total === 1
    ? !!challenge.phases?.phase1?.completed
    : total === 2
      ? !!challenge.phases?.phase1?.completed && !!challenge.phases?.phase2?.completed
      : !!challenge.phases?.phase1?.completed && !!challenge.phases?.phase2?.completed && !!challenge.phases?.phase3?.completed;

  if (challenge.status === 'active') {
    if (payouts > 0) return 'payout_received';
    if (challenge.liveAccount || funded) return 'funded_active';
    return 'active';
  }
  if (challenge.status === 'failed') {
    if (payouts > 0) return 'payout_then_failed';
    if (challenge.liveAccount || funded) return 'failed_after_funded';
    if (challenge.phases?.phase3?.completed) return 'failed_after_phase3';
    if (challenge.phases?.phase2?.completed) return 'failed_after_phase2';
    if (challenge.phases?.phase1?.completed) return 'failed_after_phase1';
    return 'failed_pre_phase';
  }
  if (challenge.status === 'passed_inactive') return 'awaiting_activation';
  if (challenge.status === 'passed') return 'funded_active';
  return 'unknown';
};

export const getDisplayMilestone = (challenge: Challenge): string => {
  return challenge.highestMilestone || inferHighestMilestone(challenge);
};

export const getDisplayOutcome = (challenge: Challenge): string => {
  return challenge.outcomeType || inferOutcomeType(challenge);
};

export const getMilestoneLabel = (value?: string | null): string => {
  if (!value) return '—';
  return LIFECYCLE_MILESTONE_LABELS[value] || value.replace(/_/g, ' ');
};

export const getOutcomeLabel = (value?: string | null): string => {
  if (!value) return '—';
  return OUTCOME_LABELS[value] || value.replace(/_/g, ' ');
};

export const getFailureReasonLabel = (value?: string | null): string => {
  if (!value) return '—';
  return FAILURE_REASON_LABELS[value] || value.replace(/_/g, ' ');
};

export const getLifecycleTone = (challenge: Challenge): 'emerald' | 'amber' | 'red' | 'cyan' => {
  const outcome = getDisplayOutcome(challenge);
  if (outcome === 'payout_then_failed' || outcome === 'payout_received') return 'emerald';
  if (outcome === 'awaiting_activation') return 'amber';
  if (outcome.includes('failed')) return 'red';
  if (outcome.includes('funded')) return 'amber';
  return 'cyan';
};
