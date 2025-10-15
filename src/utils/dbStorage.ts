import * as tempStorage from './tempStorage';
import { AppState, Challenge, NewChallengeInput, NewFirmInput, PropFirm, PayoutEntry } from '../types';

export async function loadState(userId: string): Promise<AppState> {
  console.log('🔧 Using temporary localStorage (WebAssembly workaround)');
  return await tempStorage.loadState(userId);
}

export async function addFirm(userId: string, input: NewFirmInput): Promise<{ firm: PropFirm }> {
  return await tempStorage.addFirm(userId, input);
}

export async function addChallenge(userId: string, input: NewChallengeInput): Promise<{ challenge: Challenge }> {
  return await tempStorage.addChallenge(userId, input);
}

export async function updateChallenge(challenge: Challenge): Promise<void> {
  return await tempStorage.updateChallenge(challenge);
}

export async function removeChallenge(challengeId: string): Promise<void> {
  return await tempStorage.removeChallenge(challengeId);
}

export async function setSelectedFirm(userId: string, firmId: string | null): Promise<void> {
  return await tempStorage.setSelectedFirm(userId, firmId);
}

export async function markPhase(challengeId: string, phase: 'phase1' | 'phase2' | 'phase3', completed: boolean): Promise<void> {
  return await tempStorage.markPhase(challengeId, phase, completed);
}

export async function addPayout(challengeId: string, amount: number, date: string, description?: string): Promise<PayoutEntry> {
  return await tempStorage.addPayout(challengeId, amount, date, description);
}

export async function removePayout(payoutId: string): Promise<void> {
  return await tempStorage.removePayout(payoutId);
}

export async function upsertMonthlyPnL(_challengeId: string, _month: string, _amount: number): Promise<void> {
  console.log('upsertMonthlyPnL called - needs API implementation');
}

export async function firstChallengeMonth(_userId: string): Promise<string | undefined> {
  return undefined;
}

export async function bulkUpdateChallengeStatus(_challengeIds: string[], _newStatus: 'active' | 'passed' | 'failed'): Promise<void> {
  console.log('bulkUpdateChallengeStatus called - needs API implementation');
}
