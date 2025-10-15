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

export type ChallengeStatus = 'active' | 'passed' | 'failed';

export interface Challenge {
  id: string;
  propFirmId: string;
  brokerName: string; // user-input broker name
  accountSize: number; // e.g., 100000
  startDate: string; // ISO date when challenge purchased
  cost: number; // amount spent to buy challenge
  strategy?: string; // trading strategy used
  monthlyPnL: Record<string, number>; // key: YYYY-MM, value: PnL
  weeklyPnL: Record<string, number>; // key: YYYY-WXX (e.g., 2024-W42), value: PnL
  phases: Record<PhaseName, PhaseStatus>;
  payouts: PayoutEntry[]; // array of payout entries with dates
  totalPhases: 1 | 2 | 3; // how many phases this challenge has
  status: ChallengeStatus; // overall challenge status
  createdAt: string; // ISO timestamp when challenge was created
}

export interface PropFirm {
  id: string;
  name: string; // rememberable selectable firm name
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

export type NewFirmInput = { name: string };
export type NewChallengeInput = {
  propFirmId: string;
  brokerName: string;
  accountSize: number;
  startDate: string;
  cost: number;
  totalPhases: 1 | 2 | 3;
  status?: ChallengeStatus; // optional, defaults to 'active'
  strategy?: string;
};
