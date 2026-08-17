import { dashboardService, challengeService, propFirmService, userService, userStateService, payoutService } from './db/service';
import { testConnection } from '../lib/db/connection';
import type { AppState, Challenge } from '../types';

// Export test connection for debugging
export { testConnection };

// Resolve and cache a canonical user id for DB operations (handles mismatched local vs DB IDs)
const getCanonicalUserId = async (providedUserId: string): Promise<string> => {
  try {
    // 1) If provided ID exists in DB, use it
    const byId = await userService.getById(providedUserId);
    if (byId) return providedUserId;

    // 2) Otherwise, try to find user by email from localStorage
    const stored = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
    if (stored) {
      try {
        const u = JSON.parse(stored) as { id: string; email?: string; name?: string };
        if (u?.email) {
          const byEmail = await userService.getByEmail(u.email);
          if (byEmail) {
            // Cache a mapping so subsequent calls are fast
            if (typeof window !== 'undefined') {
              const mapRaw = localStorage.getItem('user_id_alias_map');
              const map = mapRaw ? JSON.parse(mapRaw) as Record<string, string> : {};
              map[providedUserId] = byEmail.id;
              localStorage.setItem('user_id_alias_map', JSON.stringify(map));
            }
            return byEmail.id;
          }
          // 3) No user by email either -> create user with provided id and email
          const created = await userService.create({ id: providedUserId, email: u.email, name: u.name });
          return created.id;
        }
      } catch {
        // ignore parse errors
      }
    }

    // 4) Last resort: create minimal user record with provided id
    const created = await userService.create({ id: providedUserId, email: `user-${providedUserId}@local.invalid`, name: null as any });
    return created.id;
  } catch (e: any) {
    // Handle duplicate email unique violation if creation raced
    if (e?.cause?.code === '23505' && String(e?.cause?.detail || '').includes('users_email_unique')) {
      // Fetch by email and return its id
      const stored = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
      if (stored) {
        try {
          const u = JSON.parse(stored);
          const byEmail = await userService.getByEmail(u.email);
          if (byEmail) return byEmail.id;
        } catch {}
      }
    }
    throw e;
  }
};

// Helper to read canonical id from cache quickly
const readCachedCanonicalUserId = (providedUserId: string): string | null => {
  if (typeof window === 'undefined') return null;
  const mapRaw = localStorage.getItem('user_id_alias_map');
  if (!mapRaw) return null;
  try {
    const map = JSON.parse(mapRaw) as Record<string, string>;
    return map[providedUserId] || null;
  } catch {
    return null;
  }
};

// Load complete application state for a user
export const loadState = async (userId: string): Promise<AppState> => {
  try {
    const canonicalId = readCachedCanonicalUserId(userId) || await getCanonicalUserId(userId);
    console.log('🔍 Loading state for user (canonical):', canonicalId, '(provided:', userId, ')');
    const data = await dashboardService.getUserData(canonicalId);
    console.log('📊 Raw database data:', data);
    
    // Convert database types to app types
    const firms = data.firms.map(firm => ({
      id: firm.id,
      name: firm.name,
      firmType: (firm as any).firmType || undefined,
      createdAt: (firm as any).createdAt ? new Date((firm as any).createdAt as any).toISOString() : new Date().toISOString(),
    }));

    const challenges: Challenge[] = data.challenges.map((challenge): Challenge => ({
      id: challenge.id,
      propFirmId: challenge.firmId,
      brokerName: challenge.brokerName || 'Trading Account',
      purchaseGroupId: (challenge as any).purchaseGroupId || undefined,
      purchaseGroupLabel: (challenge as any).purchaseGroupLabel || undefined,
      purchaseGroupSize: (challenge as any).purchaseGroupSize || undefined,
      purchaseGroupIndex: (challenge as any).purchaseGroupIndex || undefined,
      accountSize: challenge.accountSize || 0,
      startDate: challenge.startDate || new Date().toISOString().slice(0, 10),
      cost: challenge.cost ? parseFloat(challenge.cost.toString()) : 0,
      initialCost: challenge.initialCost ? parseFloat(challenge.initialCost.toString()) : (challenge.cost ? parseFloat(challenge.cost.toString()) : 0),
      hasActivationFee: !!challenge.hasActivationFee,
      activationFeeAmount: challenge.activationFeeAmount ? parseFloat(challenge.activationFeeAmount.toString()) : undefined,
      firmType: (challenge as any).firmType || undefined,
      evalType: (challenge as any).evalType || undefined,
      totalPhases: ((challenge.totalPhases as any) || 3) as 1 | 2 | 3,
      strategy: challenge.strategy || '',
      status: (challenge.status as Challenge['status']) || 'active',
      phases: {
        phase1: { completed: challenge.phase1Completed || false, completedAt: challenge.phase1CompletedAt?.toISOString() },
        phase2: { completed: challenge.phase2Completed || false, completedAt: challenge.phase2CompletedAt?.toISOString() },
        phase3: { completed: challenge.phase3Completed || false, completedAt: challenge.phase3CompletedAt?.toISOString() }
      },
      monthlyPnL: {},
      weeklyPnL: {},
      payouts: [],
      createdAt: challenge.createdAt?.toISOString() || new Date().toISOString(),
    }));

    // Attach payouts from DB
    const payoutsFromDb = await payoutService.getByUserId(canonicalId);
    const byId: Record<string, any> = Object.fromEntries(challenges.map(c => [c.id, c]));
    payoutsFromDb.forEach(p => {
      const ch = byId[p.challengeId];
      if (ch) {
        (ch.payouts ||= []).push({
          id: p.id,
          amount: typeof p.amount === 'string' ? parseFloat(p.amount) : (p.amount as unknown as number),
          date: p.date as string,
          description: p.description || undefined,
        });
      }
    });

    const result = {
      firms,
      challenges,
      selectedFirmId: data.selectedFirmId,
    };
    
    console.log('✅ Final converted data:', result);
    console.log(`🏢 Found ${firms.length} firms, ${challenges.length} challenges`);
    
    return result;
  } catch (error) {
    console.error('Error loading state:', error);
    return {
      firms: [],
      challenges: [],
      selectedFirmId: null,
    };
  }
};

// Add a new challenge
export const addChallenge = async (userId: string, challengeData: any) => {
  try {
    const canonicalId = readCachedCanonicalUserId(userId) || await getCanonicalUserId(userId);
    console.log('🚀 Adding challenge with data for user:', canonicalId, challengeData);
    let propFirmId = challengeData.propFirmId;

    // If propFirmId is empty but we have a propFirmName, create a new firm
    if (!propFirmId && challengeData.propFirmName) {
      console.log('🏢 Creating new firm:', challengeData.propFirmName);
      const newFirm = await propFirmService.create(canonicalId, {
        name: challengeData.propFirmName,
      });
      
      if (!newFirm || !newFirm.id) {
        throw new Error('Failed to create new firm - no ID returned');
      }
      
      propFirmId = newFirm.id;
      console.log('✅ Created firm with ID:', propFirmId);
    }

    if (!propFirmId) {
      throw new Error('No prop firm selected or created');
    }

    console.log('📊 Creating challenge in database with firm ID:', propFirmId);
    const row = await challengeService.create(canonicalId, {
      firmId: propFirmId,
      brokerName: challengeData.brokerName || 'Trading Account',
      purchaseGroupId: challengeData.purchaseGroupId || null,
      purchaseGroupLabel: challengeData.purchaseGroupLabel || null,
      purchaseGroupSize: challengeData.purchaseGroupSize ?? null,
      purchaseGroupIndex: challengeData.purchaseGroupIndex ?? null,
      accountSize: challengeData.accountSize || 0,
      startDate: challengeData.startDate || new Date().toISOString().slice(0, 10),
      cost: challengeData.cost?.toString() || '0',
      initialCost: challengeData.initialCost?.toString() || challengeData.cost?.toString() || '0',
      hasActivationFee: !!challengeData.hasActivationFee,
      activationFeeAmount: challengeData.activationFeeAmount === undefined ? null : challengeData.activationFeeAmount.toString(),
      firmType: challengeData.firmType || null,
      evalType: challengeData.evalType || null,
      totalPhases: challengeData.totalPhases || 3,
      strategy: challengeData.strategy || '',
      status: challengeData.status || 'active',
    });

    if (!row || !row.id) {
      throw new Error('Failed to create challenge - no data returned from database');
    }

    const challenge: Challenge = {
      id: row.id,
      propFirmId: row.firmId,
      brokerName: row.brokerName || 'Trading Account',
      purchaseGroupId: (row as any).purchaseGroupId || undefined,
      purchaseGroupLabel: (row as any).purchaseGroupLabel || undefined,
      purchaseGroupSize: (row as any).purchaseGroupSize || undefined,
      purchaseGroupIndex: (row as any).purchaseGroupIndex || undefined,
      accountSize: row.accountSize || 0,
      startDate: row.startDate || new Date().toISOString().slice(0,10),
      cost: row.cost ? parseFloat(row.cost as any) : 0,
      initialCost: row.initialCost ? parseFloat(row.initialCost as any) : (row.cost ? parseFloat(row.cost as any) : 0),
      hasActivationFee: !!row.hasActivationFee,
      activationFeeAmount: row.activationFeeAmount ? parseFloat(row.activationFeeAmount as any) : undefined,
      firmType: (row as any).firmType || undefined,
      evalType: (row as any).evalType || undefined,
      totalPhases: ((row.totalPhases as any) || 3) as 1 | 2 | 3,
      strategy: (row.strategy as any) || '',
      status: (row.status as any) || 'active',
      monthlyPnL: {},
      weeklyPnL: {},
      phases: {
        phase1: { completed: !!row.phase1Completed, completedAt: row.phase1CompletedAt ? new Date(row.phase1CompletedAt as any).toISOString() : undefined },
        phase2: { completed: !!row.phase2Completed, completedAt: row.phase2CompletedAt ? new Date(row.phase2CompletedAt as any).toISOString() : undefined },
        phase3: { completed: !!row.phase3Completed, completedAt: row.phase3CompletedAt ? new Date(row.phase3CompletedAt as any).toISOString() : undefined },
      },
      payouts: [],
      createdAt: row.createdAt ? new Date(row.createdAt as any).toISOString() : new Date().toISOString(),
    };

    console.log('✅ Challenge created successfully:', row.id);
    return { challenge };
  } catch (error) {
    console.error('Error adding challenge:', error);
    throw error;
  }
};

// Update a challenge
export const updateChallenge = async (challengeId: string, updates: Partial<Challenge>) => {
  try {
    const mapped: any = {};
    if (typeof updates.propFirmId === 'string') mapped.firmId = updates.propFirmId;
    if (typeof updates.brokerName === 'string') mapped.brokerName = updates.brokerName;
    if (updates.purchaseGroupId !== undefined) mapped.purchaseGroupId = updates.purchaseGroupId || null;
    if (updates.purchaseGroupLabel !== undefined) mapped.purchaseGroupLabel = updates.purchaseGroupLabel || null;
    if (updates.purchaseGroupSize !== undefined) mapped.purchaseGroupSize = updates.purchaseGroupSize ?? null;
    if (updates.purchaseGroupIndex !== undefined) mapped.purchaseGroupIndex = updates.purchaseGroupIndex ?? null;
    if (typeof updates.accountSize === 'number') mapped.accountSize = updates.accountSize;
    if (typeof updates.startDate === 'string') mapped.startDate = updates.startDate;
    if (typeof updates.cost === 'number') mapped.cost = updates.cost.toString();
    if (typeof updates.initialCost === 'number') mapped.initialCost = updates.initialCost.toString();
    if (typeof updates.hasActivationFee === 'boolean') mapped.hasActivationFee = updates.hasActivationFee;
    if (typeof updates.activationFeeAmount === 'number') mapped.activationFeeAmount = updates.activationFeeAmount.toString();
    if (typeof updates.totalPhases !== 'undefined') mapped.totalPhases = updates.totalPhases;
    if (typeof updates.strategy === 'string') mapped.strategy = updates.strategy;
    if (typeof updates.firmType === 'string') mapped.firmType = updates.firmType;
    if (typeof updates.evalType === 'string') mapped.evalType = updates.evalType;
    if (typeof updates.evalType === 'undefined' && 'evalType' in updates) mapped.evalType = updates.evalType || null;
    if (typeof updates.status === 'string') mapped.status = updates.status;

    // Phase fields (if present in updates.phases, map to DB columns)
    if (updates.phases) {
      const p = updates.phases as any;
      if (p.phase1) {
        if (typeof p.phase1.completed === 'boolean') mapped.phase1Completed = p.phase1.completed;
        if ('completedAt' in p.phase1) mapped.phase1CompletedAt = p.phase1.completedAt ? new Date(p.phase1.completedAt) : null;
      }
      if (p.phase2) {
        if (typeof p.phase2.completed === 'boolean') mapped.phase2Completed = p.phase2.completed;
        if ('completedAt' in p.phase2) mapped.phase2CompletedAt = p.phase2.completedAt ? new Date(p.phase2.completedAt) : null;
      }
      if (p.phase3) {
        if (typeof p.phase3.completed === 'boolean') mapped.phase3Completed = p.phase3.completed;
        if ('completedAt' in p.phase3) mapped.phase3CompletedAt = p.phase3.completedAt ? new Date(p.phase3.completedAt) : null;
      }
    }

    const challenge = await challengeService.update(challengeId, mapped);
    return challenge;
  } catch (error) {
    console.error('Error updating challenge:', error);
    throw error;
  }
};

// Remove a challenge
export const removeChallenge = async (challengeId: string) => {
  try {
    await challengeService.delete(challengeId);
  } catch (error) {
    console.error('Error removing challenge:', error);
    throw error;
  }
};

// Add a new prop firm
export const addFirm = async (userId: string, firmData: { name: string }) => {
  try {
    const canonicalId = readCachedCanonicalUserId(userId) || await getCanonicalUserId(userId);
    // Ensure user exists before creating firm
    console.log('🏢 Ensuring user exists before creating firm...');
    await userService.getById(canonicalId).then(user => {
      if (!user) {
        throw new Error(`User ${userId} does not exist in database. Please refresh the page and try again.`);
      }
      console.log('✅ User verified before firm creation:', user.email);
    });

    const firm = await propFirmService.create(canonicalId, {
      name: firmData.name,
    });

    return {
      firm: {
        id: firm.id,
        name: firm.name,
        createdAt: (firm as any).createdAt ? new Date((firm as any).createdAt as any).toISOString() : new Date().toISOString(),
      }
    };
  } catch (error) {
    console.error('❌ Error adding firm:', error);
    const err: any = error;
    
    // Check if it's a foreign key constraint error - auto-create user
    if (err?.cause?.code === '23503' && String(err?.cause?.detail || '').includes('not present in table "users"')) {
      console.log('🔄 Foreign key error detected, attempting to create missing user...');
      
      try {
        // Get current user info from localStorage (should be available)
        const storedUser = localStorage.getItem('user');
        if (!storedUser) {
          throw new Error('No user information available for auto-creation');
        }
        
        const userData = JSON.parse(storedUser);
        console.log('👤 Creating missing user:', userData);
        
        // Create the user
        await userService.create({
          id: userData.id,
          email: userData.email,
          name: userData.name,
        });
        
        console.log('✅ User created successfully, retrying firm creation...');
        
        // Retry the firm creation
        const firm = await propFirmService.create(userData.id, {
          name: firmData.name,
        });

        return {
          firm: {
            id: firm.id,
            name: firm.name,
            createdAt: (firm as any).createdAt ? new Date((firm as any).createdAt as any).toISOString() : new Date().toISOString(),
          }
        };
      } catch (retryError) {
        console.error('❌ Failed to auto-create user:', retryError);
        throw new Error('Could not create user account. Please refresh the page and try logging in again.');
      }
    }
    
    throw error;
  }
};

// Mark a phase complete/incomplete and set/unset completedAt
export const markPhase = async (
  challengeId: string,
  phase: 'phase1' | 'phase2' | 'phase3',
  completed: boolean
): Promise<void> => {
  try {
    const now = new Date();
    const update: any = {};
    if (phase === 'phase1') {
      update.phase1Completed = completed;
      update.phase1CompletedAt = completed ? now : null;
    } else if (phase === 'phase2') {
      update.phase2Completed = completed;
      update.phase2CompletedAt = completed ? now : null;
    } else if (phase === 'phase3') {
      update.phase3Completed = completed;
      update.phase3CompletedAt = completed ? now : null;
    }
    await challengeService.update(challengeId, update);
  } catch (error) {
    console.error('Error marking phase:', error);
    throw error;
  }
};

// Payouts
export const addPayout = async (challengeId: string, amount: number, date: string, description?: string) => {
  try {
    // Determine the userId from the challenge
    const challenge = await challengeService.getById(challengeId);
    if (!challenge) throw new Error('Challenge not found');
    const userId = challenge.userId;
    const created = await payoutService.create(userId, {
      challengeId,
      amount: amount.toString(),
      date,
      description,
    } as any);
    return {
      id: created.id,
      amount,
      date,
      description,
    };
  } catch (error) {
    console.error('Error adding payout:', error);
    throw error;
  }
};

export const removePayout = async (payoutId: string): Promise<void> => {
  try {
    await payoutService.delete(payoutId);
  } catch (error) {
    console.error('Error removing payout:', error);
    throw error;
  }
};

// Bulk update challenge status
export const bulkUpdateChallengeStatus = async (
  challengeIds: string[],
  newStatus: 'active' | 'passed' | 'failed'
): Promise<void> => {
  try {
    for (const id of challengeIds) {
      await challengeService.update(id, { status: newStatus } as any);
    }
  } catch (error) {
    console.error('Error bulk updating challenge status:', error);
    throw error;
  }
};

// Set selected firm
export const setSelectedFirm = async (userId: string, firmId: string | null) => {
  try {
    const canonicalId = readCachedCanonicalUserId(userId) || await getCanonicalUserId(userId);
    await userStateService.upsert(canonicalId, { selectedFirmId: firmId });
  } catch (error) {
    console.error('Error setting selected firm:', error);
    throw error;
  }
};

// Initialize user account (ensure user exists in database)
export const initializeUser = async (userId: string, email: string, name?: string) => {
  try {
    console.log('🔍 Resolving canonical user id for:', userId, email);
    // If there's an existing user with this email, prefer its ID
    let user = await userService.getByEmail(email);
    if (user) {
      if (user.id !== userId) {
        // Cache alias mapping so calls using provided id route to canonical id
        if (typeof window !== 'undefined') {
          const mapRaw = localStorage.getItem('user_id_alias_map');
          const map = mapRaw ? JSON.parse(mapRaw) as Record<string, string> : {};
          map[userId] = user.id;
          localStorage.setItem('user_id_alias_map', JSON.stringify(map));
        }
        console.log('🔁 Using existing DB user id for email:', email, '->', user.id);
      } else {
        console.log('✅ User already exists with matching id:', userId);
      }
      return user;
    }

    // No user with this email, create with provided id
    console.log('👤 Creating new user with provided id:', { userId, email, name });
    user = await userService.create({ id: userId, email, name });
    console.log('✅ User created successfully:', user);
    return user;
  } catch (error) {
    console.error('❌ Error initializing user:', error);
    console.error('Full error details:', JSON.stringify(error, null, 2));
    throw error;
  }
};
