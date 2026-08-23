import { AppState, Challenge, NewChallengeInput, NewFirmInput, PropFirm } from '../types';
import { v4 as uuidv4 } from 'uuid';

const STORAGE_KEY_PREFIX = 'trading_dashboard_prop_firm';

function getStorageKey(userId?: string): string {
  if (userId) {
    return `${STORAGE_KEY_PREFIX}_${userId}`;
  }
  return `${STORAGE_KEY_PREFIX}_v1`; // fallback
}


export function loadState(userId?: string): AppState {
  const key = getStorageKey(userId);
  const raw = localStorage.getItem(key);
  
  if (!raw) {
    // Create empty state - users add their own firms
    const defaultState = {
      firms: [],
      challenges: [],
      selectedFirmId: null
    };
    return defaultState;
  }
  
  try {
    const parsed = JSON.parse(raw) as AppState;
    
    // Validate and clean challenges data
    const validatedChallenges = (parsed.challenges ?? []).map(challenge => {
      // Ensure phases exist and are properly structured
      const phases = {
        phase1: { ...challenge.phases?.phase1, completed: challenge.phases?.phase1?.completed ?? false },
        phase2: { ...challenge.phases?.phase2, completed: challenge.phases?.phase2?.completed ?? false },
        phase3: { ...challenge.phases?.phase3, completed: challenge.phases?.phase3?.completed ?? false },
      };
      
      return {
        id: challenge.id || '',
        propFirmId: challenge.propFirmId || '',
        brokerName: challenge.brokerName || 'Trading Account',
        firmType: challenge.firmType,
        evalType: challenge.evalType,
        liveAccount: !!challenge.liveAccount,
        purchaseGroupId: challenge.purchaseGroupId,
        purchaseGroupLabel: challenge.purchaseGroupLabel,
        purchaseGroupSize: challenge.purchaseGroupSize,
        purchaseGroupIndex: challenge.purchaseGroupIndex,
        accountSize: typeof challenge.accountSize === 'number' ? challenge.accountSize : 100000,
        startDate: challenge.startDate || new Date().toISOString().slice(0, 10),
        cost: typeof challenge.cost === 'number' ? challenge.cost : 0,
        initialCost: typeof challenge.initialCost === 'number' ? challenge.initialCost : (typeof challenge.cost === 'number' ? challenge.cost : 0),
        hasActivationFee: !!challenge.hasActivationFee,
        activationFeeAmount: typeof challenge.activationFeeAmount === 'number' ? challenge.activationFeeAmount : undefined,
        strategy: challenge.strategy,
        monthlyPnL: challenge.monthlyPnL || {},
        weeklyPnL: challenge.weeklyPnL || {},
        phases,
        payouts: Array.isArray(challenge.payouts) ? challenge.payouts : [],
        totalPhases: [1, 2, 3].includes(challenge.totalPhases) ? challenge.totalPhases : 2,
        status: (['active', 'passed', 'passed_inactive', 'failed'].includes((challenge as any).status)) ? (challenge as any).status : 'active',
        createdAt: challenge.createdAt || new Date().toISOString(),
      };
    }).filter(challenge => challenge.id && challenge.propFirmId); // Remove invalid challenges
    
    // Backfill any missing fields if schema evolved
    const state = {
      firms: Array.isArray(parsed.firms) ? parsed.firms : [],
      challenges: validatedChallenges,
      selectedFirmId: parsed.selectedFirmId ?? null,
    };
    
    // Users will add their own firms as needed
    
    return state;
  } catch (error) {
    console.error('Error parsing localStorage data:', error);
    // Return empty state if data is corrupted
    const defaultState = {
      firms: [],
      challenges: [],
      selectedFirmId: null
    };
    return defaultState;
  }
}

export function saveState(state: AppState, userId?: string) {
  const key = getStorageKey(userId);
  localStorage.setItem(key, JSON.stringify(state));
}

export function addFirm(state: AppState, input: NewFirmInput): { state: AppState; firm: PropFirm } {
  // If firm already exists (case-insensitive), reuse it
  const existing = state.firms.find(f => f.name.toLowerCase() === input.name.trim().toLowerCase());
  if (existing) return { state: { ...state, selectedFirmId: existing.id }, firm: existing };

  const firm: PropFirm = {
    id: uuidv4(),
    name: input.name.trim(),
    firmType: input.firmType,
    createdAt: new Date().toISOString(),
  };
  const next: AppState = { ...state, firms: [firm, ...state.firms], selectedFirmId: firm.id };
  return { state: next, firm };
}

export function addChallenge(state: AppState, input: NewChallengeInput): { state: AppState; challenge: Challenge } {
  const challenge: Challenge = {
    id: uuidv4(),
    propFirmId: input.propFirmId,
    brokerName: input.brokerName.trim(),
    accountLast4: input.accountLast4?.trim() || undefined,
    firmType: input.firmType,
    evalType: input.evalType,
    liveAccount: !!input.liveAccount,
    purchaseGroupId: input.purchaseGroupId,
    purchaseGroupLabel: input.purchaseGroupLabel,
    purchaseGroupSize: input.purchaseGroupSize,
    purchaseGroupIndex: input.purchaseGroupIndex,
    accountSize: input.accountSize,
    startDate: input.startDate,
    cost: input.cost,
    initialCost: input.initialCost ?? input.cost,
    hasActivationFee: !!input.hasActivationFee,
    activationFeeAmount: input.activationFeeAmount,
    strategy: input.strategy?.trim(),
    monthlyPnL: {},
    weeklyPnL: {},
    payouts: [],
    totalPhases: input.totalPhases,
    status: input.status || 'active',
    createdAt: new Date().toISOString(),
    phases: {
      phase1: { completed: false },
      phase2: { completed: false },
      phase3: { completed: false },
    },
  };
  const next: AppState = { ...state, challenges: [challenge, ...state.challenges] };
  return { state: next, challenge };
}

export function updateChallenge(state: AppState, updated: Challenge): AppState {
  return {
    ...state,
    challenges: state.challenges.map(c => (c.id === updated.id ? updated : c)),
  };
}

export function removeChallenge(state: AppState, id: string): AppState {
  return { ...state, challenges: state.challenges.filter(c => c.id !== id) };
}

export function setSelectedFirm(state: AppState, firmId: string | null): AppState {
  return { ...state, selectedFirmId: firmId };
}

export function upsertMonthlyPnL(challenge: Challenge, ym: string, amount: number): Challenge {
  return { ...challenge, monthlyPnL: { ...challenge.monthlyPnL, [ym]: amount } };
}

export function addPayout(challenge: Challenge, amount: number, date: string, description?: string): Challenge {
  const payout = {
    id: uuidv4(),
    amount,
    date,
    description: description?.trim() || undefined
  };
  return { ...challenge, payouts: [...challenge.payouts, payout] };
}

export function removePayout(challenge: Challenge, payoutId: string): Challenge {
  return { ...challenge, payouts: challenge.payouts.filter(p => p.id !== payoutId) };
}

export function getTotalPayouts(challenge: Challenge): number {
  return challenge.payouts.reduce((sum, p) => sum + p.amount, 0);
}

export function markPhase(challenge: Challenge, phase: 'phase1' | 'phase2' | 'phase3', completed: boolean, date?: string): Challenge {
  const now = new Date().toISOString();
  const completedAt = completed ? date ?? now : undefined;
  return {
    ...challenge,
    phases: {
      ...challenge.phases,
      [phase]: { completed, completedAt },
    },
  };
}

export function firstChallengeMonth(state: AppState): string | undefined {
  if (state.challenges.length === 0) return undefined;
  const first = state.challenges.reduce((min, c) => (c.startDate < min.startDate ? c : min), state.challenges[0]);
  return first.startDate.slice(0, 7); // YYYY-MM
}
