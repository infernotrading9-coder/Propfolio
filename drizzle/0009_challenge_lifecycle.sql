-- Challenge lifecycle tracking: separates current status from the real journey/outcome
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS highest_milestone text;
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS outcome_type text;
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS failure_reason text;
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS failure_date text;
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS lifecycle_notes text;

-- Backfill based on phases, payouts, live_account, and status.
UPDATE public.challenges c
SET
  highest_milestone = CASE
    WHEN c.status = 'failed' AND EXISTS (SELECT 1 FROM public.payouts p WHERE p.challenge_id = c.id) THEN 'failed_after_payout'
    WHEN EXISTS (SELECT 1 FROM public.payouts p WHERE p.challenge_id = c.id) THEN 'payout_received'
    WHEN c.live_account = true THEN 'funded'
    WHEN c.total_phases = 1 AND c.phase1_completed = true THEN 'funded'
    WHEN c.total_phases = 2 AND c.phase1_completed = true AND c.phase2_completed = true THEN 'funded'
    WHEN c.total_phases >= 3 AND c.phase1_completed = true AND c.phase2_completed = true AND c.phase3_completed = true THEN 'funded'
    WHEN c.phase3_completed = true THEN 'phase3_passed'
    WHEN c.phase2_completed = true THEN 'phase2_passed'
    WHEN c.phase1_completed = true THEN 'phase1_passed'
    ELSE 'purchased'
  END,
  outcome_type = CASE
    WHEN c.status = 'active' AND EXISTS (SELECT 1 FROM public.payouts p WHERE p.challenge_id = c.id) THEN 'payout_received'
    WHEN c.status = 'active' AND c.live_account = true THEN 'funded_active'
    WHEN c.status = 'active' AND c.total_phases = 1 AND c.phase1_completed = true THEN 'funded_active'
    WHEN c.status = 'active' AND c.total_phases = 2 AND c.phase1_completed = true AND c.phase2_completed = true THEN 'funded_active'
    WHEN c.status = 'active' AND c.total_phases >= 3 AND c.phase1_completed = true AND c.phase2_completed = true AND c.phase3_completed = true THEN 'funded_active'
    WHEN c.status = 'active' THEN 'active'
    WHEN c.status = 'failed' AND EXISTS (SELECT 1 FROM public.payouts p WHERE p.challenge_id = c.id) THEN 'payout_then_failed'
    WHEN c.status = 'failed' AND c.live_account = true THEN 'failed_after_funded'
    WHEN c.status = 'failed' AND c.total_phases = 1 AND c.phase1_completed = true THEN 'failed_after_funded'
    WHEN c.status = 'failed' AND c.total_phases = 2 AND c.phase1_completed = true AND c.phase2_completed = true THEN 'failed_after_funded'
    WHEN c.status = 'failed' AND c.total_phases >= 3 AND c.phase1_completed = true AND c.phase2_completed = true AND c.phase3_completed = true THEN 'failed_after_funded'
    WHEN c.status = 'failed' AND c.phase3_completed = true THEN 'failed_after_phase3'
    WHEN c.status = 'failed' AND c.phase2_completed = true THEN 'failed_after_phase2'
    WHEN c.status = 'failed' AND c.phase1_completed = true THEN 'failed_after_phase1'
    WHEN c.status = 'failed' THEN 'failed_pre_phase'
    WHEN c.status = 'passed' THEN 'funded_active'
    ELSE 'unknown'
  END
WHERE c.highest_milestone IS NULL OR c.outcome_type IS NULL;
