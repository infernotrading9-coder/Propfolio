import { AppState, Challenge, NewChallengeInput, NewFirmInput, PropFirm, PayoutEntry } from '../types';
import { v4 as uuidv4 } from 'uuid';

// Temporary storage using localStorage for development
// This avoids the WebAssembly issues while we set up proper backend

const STORAGE_KEY = 'propfolio_data';

interface StorageData {
  [userId: string]: {
    firms: PropFirm[];
    challenges: Challenge[];
    selectedFirmId: string | null;
  };
}

function getStorageData(): StorageData {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch (error) {
    console.error('Error reading from localStorage:', error);
    return {};
  }
}

function setStorageData(data: StorageData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Error writing to localStorage:', error);
  }
}

export async function loadState(userId: string): Promise<AppState> {
  const data = getStorageData();
  const userData = data[userId];
  
  if (!userData) {
    return {
      firms: [],
      challenges: [],
      selectedFirmId: null,
    };
  }

  return userData;
}

export async function addFirm(userId: string, input: NewFirmInput): Promise<{ firm: PropFirm }> {
  const data = getStorageData();
  
  if (!data[userId]) {
    data[userId] = { firms: [], challenges: [], selectedFirmId: null };
  }

  // Check if firm already exists
  const existingFirm = data[userId].firms.find(f => f.name.toLowerCase() === input.name.toLowerCase().trim());
  if (existingFirm) {
    return { firm: existingFirm };
  }

  const newFirm: PropFirm = {
    id: uuidv4(),
    name: input.name.trim(),
    createdAt: new Date().toISOString(),
  };

  data[userId].firms.unshift(newFirm);
  setStorageData(data);

  return { firm: newFirm };
}

export async function addChallenge(userId: string, input: NewChallengeInput): Promise<{ challenge: Challenge }> {
  const data = getStorageData();
  
  if (!data[userId]) {
    data[userId] = { firms: [], challenges: [], selectedFirmId: null };
  }

  const newChallenge: Challenge = {
    id: uuidv4(),
    propFirmId: input.propFirmId,
    brokerName: input.brokerName.trim(),
    accountSize: input.accountSize,
    startDate: input.startDate,
    cost: input.cost,
    strategy: input.strategy?.trim(),
    totalPhases: input.totalPhases,
    status: 'active',
    monthlyPnL: {},
    weeklyPnL: {},
    payouts: [],
    createdAt: new Date().toISOString(),
    phases: {
      phase1: { completed: false },
      phase2: { completed: false },
      phase3: { completed: false },
    },
  };

  data[userId].challenges.unshift(newChallenge);
  setStorageData(data);

  return { challenge: newChallenge };
}

export async function updateChallenge(challenge: Challenge): Promise<void> {
  const user = localStorage.getItem('user');
  if (!user) return;
  
  const userData = JSON.parse(user);
  const userId = userData.id;
  
  const data = getStorageData();
  
  if (!data[userId]) return;

  const index = data[userId].challenges.findIndex(c => c.id === challenge.id);
  if (index !== -1) {
    data[userId].challenges[index] = challenge;
    setStorageData(data);
  }
}

export async function removeChallenge(challengeId: string): Promise<void> {
  const user = localStorage.getItem('user');
  if (!user) return;
  
  const userData = JSON.parse(user);
  const userId = userData.id;
  
  const data = getStorageData();
  
  if (!data[userId]) return;

  data[userId].challenges = data[userId].challenges.filter(c => c.id !== challengeId);
  setStorageData(data);
}

export async function setSelectedFirm(userId: string, firmId: string | null): Promise<void> {
  const data = getStorageData();
  
  if (!data[userId]) {
    data[userId] = { firms: [], challenges: [], selectedFirmId: null };
  }

  data[userId].selectedFirmId = firmId;
  setStorageData(data);
}

export async function markPhase(challengeId: string, phase: 'phase1' | 'phase2' | 'phase3', completed: boolean): Promise<void> {
  const user = localStorage.getItem('user');
  if (!user) return;
  
  const userData = JSON.parse(user);
  const userId = userData.id;
  
  const data = getStorageData();
  
  if (!data[userId]) return;

  const challenge = data[userId].challenges.find(c => c.id === challengeId);
  if (challenge) {
    challenge.phases[phase].completed = completed;
    if (completed) {
      challenge.phases[phase].completedAt = new Date().toISOString();
    } else {
      delete challenge.phases[phase].completedAt;
    }
    setStorageData(data);
  }
}

export async function addPayout(challengeId: string, amount: number, date: string, description?: string): Promise<PayoutEntry> {
  const user = localStorage.getItem('user');
  if (!user) throw new Error('User not authenticated');
  
  const userData = JSON.parse(user);
  const userId = userData.id;
  
  const data = getStorageData();
  
  // Initialize user data if it doesn't exist
  if (!data[userId]) {
    data[userId] = { firms: [], challenges: [], selectedFirmId: null };
  }

  let challenge = data[userId].challenges.find(c => c.id === challengeId);
  let actualUserId = userId;
  
  // If not found in current user, search across all users (data migration issue)
  if (!challenge) {
    for (const [uid, userData] of Object.entries(data)) {
      const foundChallenge = userData.challenges.find(c => c.id === challengeId);
      if (foundChallenge) {
        challenge = foundChallenge;
        actualUserId = uid;
        console.log(`Found challenge in different user account: ${uid}`);
        break;
      }
    }
  }
  
  if (!challenge) {
    // Send debug info to DebugWindow
    const allChallenges: any[] = [];
    Object.entries(data).forEach(([uid, userData]) => {
      userData.challenges.forEach(c => {
        allChallenges.push({ id: c.id, brokerName: c.brokerName, userId: uid });
      });
    });
    
    const debugEvent = new CustomEvent('payoutDebug', {
      detail: {
        type: 'challenge_not_found',
        challengeId,
        availableChallenges: data[userId].challenges.map(c => ({ id: c.id, brokerName: c.brokerName })),
        allChallengesAcrossUsers: allChallenges,
        userId,
        storageKeys: Object.keys(data)
      }
    });
    window.dispatchEvent(debugEvent);
    throw new Error('Challenge not found');
  }

  const newPayout: PayoutEntry = {
    id: uuidv4(),
    amount,
    date,
    description,
    // createdAt: new Date().toISOString(),
  };

  if (!Array.isArray(challenge.payouts)) {
    challenge.payouts = [];
  }
  
  challenge.payouts.push(newPayout);
  
  // Update the correct user's data
  if (actualUserId !== userId) {
    console.log(`Updating challenge data for user: ${actualUserId}`);
  }
  
  setStorageData(data);

  return newPayout;
}

export async function removePayout(payoutId: string): Promise<void> {
  const user = localStorage.getItem('user');
  if (!user) throw new Error('User not authenticated');
  
  const userData = JSON.parse(user);
  const userId = userData.id;
  
  const data = getStorageData();
  
  // Initialize user data if it doesn't exist
  if (!data[userId]) {
    data[userId] = { firms: [], challenges: [], selectedFirmId: null };
  }

  // Find and remove the payout from any challenge
  for (const challenge of data[userId].challenges) {
    if (Array.isArray(challenge.payouts)) {
      const index = challenge.payouts.findIndex(p => p.id === payoutId);
      if (index !== -1) {
        challenge.payouts.splice(index, 1);
        setStorageData(data);
        return;
      }
    }
  }
  
  throw new Error('Payout not found');
}

export async function upsertMonthlyPnL(): Promise<void> {
  // Placeholder - will implement later
}

export async function firstChallengeMonth(): Promise<string | undefined> {
  return undefined;
}

export async function bulkUpdateChallengeStatus(): Promise<void> {
  // Placeholder - will implement later
}

export async function updatePayout(payoutId: string, amount: number, date: string): Promise<void> {
  const user = localStorage.getItem('user');
  if (!user) throw new Error('User not authenticated');
  
  const userData = JSON.parse(user);
  const userId = userData.id;
  
  const data = getStorageData();
  
  if (!data[userId]) {
    data[userId] = { firms: [], challenges: [], selectedFirmId: null };
  }
  
  for (const challenge of data[userId].challenges) {
    if (Array.isArray(challenge.payouts)) {
      const idx = challenge.payouts.findIndex(p => p.id === payoutId);
      if (idx !== -1) {
        challenge.payouts[idx] = { ...challenge.payouts[idx], amount, date };
        setStorageData(data);
        return;
      }
    }
  }
  
  throw new Error('Payout not found');
}
