import { AppState, Challenge, NewChallengeInput, NewFirmInput, PropFirm, PayoutEntry } from '../types';
import { v4 as uuidv4 } from 'uuid';

// Temporary storage using localStorage for development
// This avoids the WebAssembly issues while we set up proper backend

const STORAGE_KEY = 'propfolio_data';
const STORAGE_ALIAS_KEY = 'propfolio_user_aliases';

interface StorageData {
  [userId: string]: {
    firms: PropFirm[];
    challenges: Challenge[];
    selectedFirmId: string | null;
    email?: string;
  };
}

interface StorageAliases {
  [normalizedEmail: string]: string;
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

function getStorageAliases(): StorageAliases {
  try {
    const data = localStorage.getItem(STORAGE_ALIAS_KEY);
    return data ? JSON.parse(data) : {};
  } catch (error) {
    console.error('Error reading storage aliases:', error);
    return {};
  }
}

function setStorageAliases(data: StorageAliases): void {
  try {
    localStorage.setItem(STORAGE_ALIAS_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Error writing storage aliases:', error);
  }
}

function normalizeEmail(email?: string | null): string | null {
  if (!email || typeof email !== 'string') return null;
  const value = email.trim().toLowerCase();
  return value || null;
}

function emitStorageDebug(type: string, detail: Record<string, unknown> = {}) {
  try {
    window.dispatchEvent(new CustomEvent('authDebug', {
      detail: {
        type,
        timestamp: new Date().toISOString(),
        ...detail,
      }
    }));
  } catch {}
}

function getCurrentStoredUser(): { id?: string; email?: string } | null {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function hasMeaningfulData(bucket?: StorageData[string]): boolean {
  if (!bucket) return false;
  return bucket.firms.length > 0 || bucket.challenges.length > 0 || bucket.selectedFirmId !== null;
}

function resolveStorageUserId(userId: string, explicitEmail?: string): string {
  const data = getStorageData();
  const aliases = getStorageAliases();
  const currentStoredUser = getCurrentStoredUser();
  const normalizedEmail = normalizeEmail(explicitEmail || currentStoredUser?.email);

  if (normalizedEmail) {
    const aliasedUserId = aliases[normalizedEmail];
    if (aliasedUserId && data[aliasedUserId]) {
      emitStorageDebug('storage:alias-hit', {
        email: normalizedEmail,
        requestedUserId: userId,
        resolvedUserId: aliasedUserId,
      });
      if (!data[aliasedUserId].email) {
        data[aliasedUserId].email = normalizedEmail;
        setStorageData(data);
      }
      return aliasedUserId;
    }

    const emailMatchEntry = Object.entries(data).find(([, bucket]) => normalizeEmail(bucket.email) === normalizedEmail);
    if (emailMatchEntry) {
      const [matchedUserId] = emailMatchEntry;
      aliases[normalizedEmail] = matchedUserId;
      setStorageAliases(aliases);
      emitStorageDebug('storage:email-bucket-match', {
        email: normalizedEmail,
        requestedUserId: userId,
        resolvedUserId: matchedUserId,
      });
      return matchedUserId;
    }
  }

  if (data[userId]) {
    if (normalizedEmail) {
      data[userId].email = normalizedEmail;
      aliases[normalizedEmail] = userId;
      setStorageData(data);
      setStorageAliases(aliases);
    }
    return userId;
  }

  if (normalizedEmail) {
    const meaningfulBuckets = Object.entries(data).filter(([existingUserId, bucket]) => existingUserId !== userId && hasMeaningfulData(bucket));
    if (meaningfulBuckets.length === 1) {
      const [matchedUserId, matchedBucket] = meaningfulBuckets[0];
      if (!matchedBucket.email || normalizeEmail(matchedBucket.email) === normalizedEmail) {
        aliases[normalizedEmail] = matchedUserId;
        if (!matchedBucket.email) {
          matchedBucket.email = normalizedEmail;
          setStorageData(data);
        }
        setStorageAliases(aliases);
        console.log(`Resolved storage alias for ${normalizedEmail} to existing bucket ${matchedUserId}`);
        emitStorageDebug('storage:single-meaningful-bucket-match', {
          email: normalizedEmail,
          requestedUserId: userId,
          resolvedUserId: matchedUserId,
        });
        return matchedUserId;
      }
    }
  }

  if (normalizedEmail) {
    aliases[normalizedEmail] = userId;
    setStorageAliases(aliases);
    emitStorageDebug('storage:new-alias-created', {
      email: normalizedEmail,
      requestedUserId: userId,
      resolvedUserId: userId,
    });
  }
  return userId;
}

function ensureUserBucket(data: StorageData, userId: string, explicitEmail?: string): string {
  const resolvedUserId = resolveStorageUserId(userId, explicitEmail);
  if (!data[resolvedUserId]) {
    data[resolvedUserId] = { firms: [], challenges: [], selectedFirmId: null, email: normalizeEmail(explicitEmail || getCurrentStoredUser()?.email) || undefined };
  } else if (explicitEmail) {
    data[resolvedUserId].email = normalizeEmail(explicitEmail) || data[resolvedUserId].email;
  }
  return resolvedUserId;
}

export async function loadState(userId: string): Promise<AppState> {
  const data = getStorageData();
  const resolvedUserId = ensureUserBucket(data, userId);
  const userData = data[resolvedUserId];
  
  if (!userData) {
    return {
      firms: [],
      challenges: [],
      selectedFirmId: null,
    };
  }

  // Normalize payouts: ensure each payout has an id
  let mutated = false;
  userData.challenges = (userData.challenges || []).map(ch => {
    const initialCost = typeof ch.initialCost === 'number' ? ch.initialCost : (typeof ch.cost === 'number' ? ch.cost : 0);
    const activationFeeAmount = typeof ch.activationFeeAmount === 'number' ? ch.activationFeeAmount : undefined;
    const normalizedCost = typeof ch.cost === 'number' ? ch.cost : Number(ch.cost || 0);
    if (Array.isArray(ch.payouts)) {
      const newPayouts = ch.payouts.map(p => {
        if (!p.id) {
          mutated = true;
          return { ...p, id: uuidv4() };
        }
        return p;
      });
      return {
        ...ch,
        cost: normalizedCost,
        initialCost,
        hasActivationFee: !!ch.hasActivationFee,
        activationFeeAmount,
        firmType: ch.firmType,
        evalType: ch.evalType,
        liveAccount: !!ch.liveAccount,
        strategy: ch.strategy,
        payouts: newPayouts
      };
    }
    return {
      ...ch,
      cost: normalizedCost,
      initialCost,
      hasActivationFee: !!ch.hasActivationFee,
      activationFeeAmount,
      firmType: ch.firmType,
      evalType: ch.evalType,
      liveAccount: !!ch.liveAccount,
      strategy: ch.strategy,
    };
  });
  if (mutated) {
    data[resolvedUserId] = userData;
    setStorageData(data);
  }
  return userData;
}

export async function addFirm(userId: string, input: NewFirmInput): Promise<{ firm: PropFirm }> {
  const data = getStorageData();
  const resolvedUserId = ensureUserBucket(data, userId);

  // Check if firm already exists
  const existingFirm = data[resolvedUserId].firms.find(f => f.name.toLowerCase() === input.name.toLowerCase().trim());
  if (existingFirm) {
    return { firm: existingFirm };
  }

  const newFirm: PropFirm = {
    id: uuidv4(),
    name: input.name.trim(),
    firmType: input.firmType,
    createdAt: new Date().toISOString(),
  };

  data[resolvedUserId].firms.unshift(newFirm);
  setStorageData(data);

  return { firm: newFirm };
}

export async function addChallenge(userId: string, input: NewChallengeInput): Promise<{ challenge: Challenge }> {
  const data = getStorageData();
  const resolvedUserId = ensureUserBucket(data, userId);

  const newChallenge: Challenge = {
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

  data[resolvedUserId].challenges.unshift(newChallenge);
  setStorageData(data);

  return { challenge: newChallenge };
}

export async function updateChallenge(challenge: Challenge): Promise<void> {
  const user = localStorage.getItem('user');
  if (!user) return;
  
  const userData = JSON.parse(user);
  const userId = resolveStorageUserId(userData.id, userData.email);
  
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
  const userId = resolveStorageUserId(userData.id, userData.email);
  
  const data = getStorageData();
  
  if (!data[userId]) return;

  const challenge = data[userId].challenges.find(c => c.id === challengeId);
  if (challenge?.status === 'failed') {
    throw new Error('Cannot delete failed challenge');
  }
  data[userId].challenges = data[userId].challenges.filter(c => c.id !== challengeId);
  setStorageData(data);
}

export async function setSelectedFirm(userId: string, firmId: string | null): Promise<void> {
  const data = getStorageData();
  const resolvedUserId = ensureUserBucket(data, userId);

  data[resolvedUserId].selectedFirmId = firmId;
  setStorageData(data);
}

export async function markPhase(
  challengeId: string,
  phase: 'phase1' | 'phase2' | 'phase3',
  completed: boolean,
  completedAt?: string
): Promise<void> {
  const user = localStorage.getItem('user');
  if (!user) return;
  
  const userData = JSON.parse(user);
  const userId = resolveStorageUserId(userData.id, userData.email);
  
  const data = getStorageData();
  
  if (!data[userId]) return;

  const challenge = data[userId].challenges.find(c => c.id === challengeId);
  if (challenge) {
    challenge.phases[phase].completed = completed;
    if (completed) {
      challenge.phases[phase].completedAt = completedAt || new Date().toISOString();
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
  const userId = resolveStorageUserId(userData.id, userData.email);
  
  const data = getStorageData();
  
  // Initialize user data if it doesn't exist
  ensureUserBucket(data, userId, userData.email);

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
  const data = getStorageData();
  
  // Find and remove the payout from any challenge (search across users for resilience)
  let found = false;
  for (const [, udata] of Object.entries(data)) {
    for (const challenge of udata.challenges) {
      if (Array.isArray(challenge.payouts)) {
        const index = challenge.payouts.findIndex(p => p.id === payoutId);
        if (index !== -1) {
          challenge.payouts.splice(index, 1);
          setStorageData(data);
          found = true;
          break;
        }
      }
    }
    if (found) break;
  }
  
  if (!found) throw new Error('Payout not found');
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
  const data = getStorageData();
  
  // Search across users to locate payout and update in-place
  for (const [, udata] of Object.entries(data)) {
    for (const challenge of udata.challenges) {
      if (Array.isArray(challenge.payouts)) {
        const idx = challenge.payouts.findIndex(p => p.id === payoutId);
        if (idx !== -1) {
          challenge.payouts[idx] = { ...challenge.payouts[idx], amount, date };
          setStorageData(data);
          return;
        }
      }
    }
  }
  
  throw new Error('Payout not found');
}
