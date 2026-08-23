export type PhaseName = 'phase1' | 'phase2' | 'phase3';

export interface PhaseStatus {
  completed: boolean;
  completedAt?: string; // ISO date when phase was passed
}

export interface PayoutEntry {
  id: string;
  amount: number;
  date: string; // ISO date when payout was received
  description?: string;
}

export type ChallengeStatus = 'active' | 'passed' | 'passed_inactive' | 'failed';
export type ChallengeMilestone = 'purchased' | 'phase1_passed' | 'phase2_passed' | 'phase3_passed' | 'funded' | 'payout_received' | 'failed_after_payout';
export type ChallengeOutcomeType = 'active' | 'awaiting_activation' | 'failed_pre_phase' | 'failed_after_phase1' | 'failed_after_phase2' | 'failed_after_phase3' | 'failed_after_funded' | 'payout_then_failed' | 'funded_active' | 'payout_received' | 'unknown';
export type ChallengeFailureReason = 'rule_break' | 'max_drawdown' | 'daily_loss' | 'tilt_revenge' | 'overtrading' | 'account_expired' | 'strategic_reset' | 'firm_platform_issue' | 'unknown';

export interface TradingRule {
  id: string;
  text: string;
  createdAt: string;
}

export interface Challenge {
  id: string;
  propFirmId: string;
  brokerName: string; // user-input broker name
  accountLast4?: string; // last 4 digits of account number, links to Focus Hub
  purchaseGroupId?: string;
  purchaseGroupLabel?: string;
  purchaseGroupSize?: number;
  purchaseGroupIndex?: number;
  accountSize: number; // e.g., 100000
  startDate: string; // ISO date when challenge purchased
  cost: number; // amount spent to buy challenge
  initialCost?: number; // original challenge fee before any activation fee is added
  hasActivationFee?: boolean;
  activationFeeAmount?: number; // actual activation fee paid after passing, if applicable
  strategy?: string; // trading strategy used
  firmType?: FirmType; // type of firm: futures or CFD (for analytics)
  evalType?: string; // program/eval type per firm (e.g. "Lucid Daily", "Rapid")
  liveAccount?: boolean; // true after user promotes a FUNDED (all-phases-done) account to a real live trading account
  monthlyPnL: Record<string, number>; // key: YYYY-MM, value: PnL
  weeklyPnL: Record<string, number>; // key: YYYY-WXX (e.g., 2024-W42), value: PnL
  phases: Record<PhaseName, PhaseStatus>;
  payouts: PayoutEntry[]; // array of payout entries with dates
  totalPhases: 1 | 2 | 3; // how many phases this challenge has
  status: ChallengeStatus; // current challenge status
  highestMilestone?: ChallengeMilestone | string;
  outcomeType?: ChallengeOutcomeType | string;
  failureReason?: ChallengeFailureReason | string;
  failureDate?: string;
  lifecycleNotes?: string;
  createdAt: string; // ISO timestamp when challenge was created
  rules?: TradingRule[]; // trading rules to follow for this challenge (deprecated - use phaseRules)
  phaseRules?: {
    phase1?: TradingRule[];
    phase2?: TradingRule[];
    phase3?: TradingRule[];
    live?: TradingRule[];
  }; // trading rules per phase
}

export type FirmType = 'futures' | 'cfd';

export interface PropFirm {
  id: string;
  name: string; // rememberable selectable firm name
  firmType?: FirmType; // type of firm: futures or CFD
  createdAt: string;
}

export interface AppState {
  firms: PropFirm[];
  challenges: Challenge[];
  selectedFirmId: string | null; // for filtering/quick selection
}

export interface StatsSummary {
  totalSpent: number;
  totalPayouts: number;
  roi: number; // (payouts - spent) / spent
  liveAccountsRate: number; // % of challenges that reached live trading
  phase1PassRate: number; // % of challenges where phase1 is complete
  phase2PassRate: number; // % of challenges where phase2 is complete
  phase3PassRate?: number; // % of challenges where phase3 is complete (if applicable)
  costPerLiveAccount: number; // total spent divided by number of live accounts
  averageTimeToLive: number; // average days from start to live account
  firstChallengeMonth?: string; // YYYY-MM
  
  // New metrics
  longestWinStreak: number;
  longestLoseStreak: number;
  currentStreak: { type: 'win' | 'lose' | 'none', count: number };
  accountSizePerformance: Record<string, {
    roi: number;
    successRate: number;
    count: number;
  }>;
  firmPerformance: Record<string, {
    name: string;
    roi: number;
    successRate: number;
    totalSpent: number;
    totalPayouts: number;
    liveAccounts: number;
    totalChallenges: number;
  }>;
}

export type NewFirmInput = { name: string; firmType?: FirmType };
export type NewChallengeInput = {
  propFirmId: string;
  brokerName: string;
  accountLast4?: string; // last 4 digits of account number, links to Focus Hub
  purchaseGroupId?: string;
  purchaseGroupLabel?: string;
  purchaseGroupSize?: number;
  purchaseGroupIndex?: number;
  accountQuantity?: number;
  accountSize: number;
  startDate: string;
  cost: number;
  initialCost?: number;
  hasActivationFee?: boolean;
  activationFeeAmount?: number;
  totalPhases: 1 | 2 | 3;
  status?: ChallengeStatus; // optional, defaults to 'active'
  highestMilestone?: ChallengeMilestone | string;
  outcomeType?: ChallengeOutcomeType | string;
  failureReason?: ChallengeFailureReason | string;
  failureDate?: string;
  lifecycleNotes?: string;
  strategy?: string;
  firmType?: FirmType; // type of firm: futures or CFD
  evalType?: string; // program/eval type per firm
  liveAccount?: boolean; // explicit live-account tier (applies once funded account is promoted to real trading)
};
