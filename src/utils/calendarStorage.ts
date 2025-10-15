export interface TradingAccount {
  id: string;
  name: string;
  createdAt: string; // ISO date
  isActive: boolean;
}

export interface DayEntry {
  date: string; // YYYY-MM-DD
  followedRules: boolean | null; // null = no trade
  notes?: string;
}

export interface ChallengePhase {
  id: string;
  challengeId: string;
  title: string;
  description: string;
  phase: 'initial' | 'phase1' | 'phase2' | 'phase3' | 'live';
  firmName: string;
  accountSize: number;
  challengeNumber: number;
  createdAt: string;
  isActive: boolean;
  archivedAt?: string;
}

export interface AccountData {
  accountId: string;
  entries: DayEntry[];
  challengePhases: ChallengePhase[];
}

export interface AppData {
  accounts: TradingAccount[];
  accountData: AccountData[];
  selectedAccountId: string | null;
}

const STORAGE_KEY = 'trading_dashboard_calendar_v1';

const defaultData: AppData = {
  accounts: [],
  accountData: [],
  selectedAccountId: null,
};

export const loadCalendar = (): AppData => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData;
    const parsed = JSON.parse(raw) as any;
    
    // Handle backwards compatibility - add challengePhases to existing accountData
    const accountData = (parsed.accountData ?? []).map((data: any) => ({
      accountId: data.accountId,
      entries: data.entries ?? [],
      challengePhases: data.challengePhases ?? [] // Add if missing
    }));
    
    return {
      accounts: parsed.accounts ?? [],
      accountData: accountData,
      selectedAccountId: parsed.selectedAccountId ?? null,
    };
  } catch (error) {
    console.warn('Failed to load calendar data, using defaults:', error);
    return defaultData;
  }
};

export const saveCalendar = (data: AppData) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

export const createAccount = (name: string): TradingAccount => ({
  id: crypto.randomUUID(),
  name,
  createdAt: new Date().toISOString(),
  isActive: true,
});

export const getAccountData = (accountId: string, all: AccountData[]): AccountData => {
  const existing = all.find(d => d.accountId === accountId);
  return existing ?? { accountId, entries: [], challengePhases: [] };
};

export const addChallengePhase = (accountData: AccountData, challengePhase: Omit<ChallengePhase, 'id' | 'createdAt' | 'isActive'>): ChallengePhase => {
  const newPhase: ChallengePhase = {
    ...challengePhase,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    isActive: true
  };
  
  accountData.challengePhases.push(newPhase);
  return newPhase;
};

export const archiveChallengePhase = (accountData: AccountData, phaseId: string): void => {
  const phase = accountData.challengePhases.find(p => p.id === phaseId);
  if (phase) {
    phase.isActive = false;
    phase.archivedAt = new Date().toISOString();
  }
};

export const archiveAllPhasesForChallenge = (accountData: AccountData, challengeId: string, excludePhase?: string): void => {
  accountData.challengePhases
    .filter(p => p.challengeId === challengeId && p.phase !== excludePhase)
    .forEach(p => {
      p.isActive = false;
      p.archivedAt = new Date().toISOString();
    });
};

export const getActiveChallengePhases = (accountData: AccountData): ChallengePhase[] => {
  return accountData.challengePhases.filter(p => p.isActive);
};

export const getArchivedChallengePhases = (accountData: AccountData): ChallengePhase[] => {
  return accountData.challengePhases.filter(p => !p.isActive);
};

export const archiveFailedChallenge = (accountData: AccountData, challengeId: string): void => {
  // Archive all phases for this challenge when it fails
  accountData.challengePhases
    .filter(p => p.challengeId === challengeId)
    .forEach(p => {
      p.isActive = false;
      p.archivedAt = new Date().toISOString();
    });
};

export const getChallengePhasesByChallenge = (accountData: AccountData, challengeId: string): ChallengePhase[] => {
  return accountData.challengePhases.filter(p => p.challengeId === challengeId);
};
