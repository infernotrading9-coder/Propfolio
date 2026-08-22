import { AppState, Challenge, NewChallengeInput, NewFirmInput, PropFirm } from '../types';
import netlifyIdentity from 'netlify-identity-widget';
import * as tempStorage from './tempStorage';

// Call Netlify Functions directly (skip redirects)
const API_BASE_URL = '/.netlify/functions';
// Map logical endpoints to function names
function mapEndpoint(endpoint: string): string {
  const map: Record<string, string> = {
    '/user/data': '/db-state',
    '/firms': '/db-firms',
    '/challenges': '/db-challenges',
    '/user/selected-firm': '/db-user',
    '/payouts': '/db-payouts',
    '/mark-phase': '/db-phase',
    '/challenges/bulk-status': '/db-bulk',
    '/calendar': '/db-calendar',
    // Auth (legacy email/password)
    '/auth/login': '/auth-login',
    '/auth/signup': '/auth-signup',
    '/auth/logout': '/auth-login',
    '/auth/session': '/auth-login',
    '/auth/google': '/auth-google',
  };
  const path = map[endpoint] || endpoint;
  const sep = path.includes('?') ? '&' : '?';
  // Cache-bust to avoid stale CDN HTML from earlier bad redirects
  return `${path}${sep}v=${Date.now()}`;
}

function emitAuthDebug(type: string, detail: Record<string, unknown> = {}) {
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

class ApiClient {
  private useLocal(): boolean {
    return !!(import.meta as any).env?.DEV;
  }

  private hasMeaningfulState(state: AppState | null | undefined): boolean {
    if (!state) return false;
    return (state.firms?.length || 0) > 0 || (state.challenges?.length || 0) > 0 || state.selectedFirmId !== null;
  }

  private async readLegacyLocalState(userId: string): Promise<AppState | null> {
    try {
      const state = await tempStorage.loadState(userId);
      return this.hasMeaningfulState(state) ? state : null;
    } catch (error) {
      console.error('Failed to read legacy local state:', error);
      return null;
    }
  }

  private async importLegacyLocalState(legacyState: AppState): Promise<void> {
    const createdFirmIdByLegacyId = new Map<string, string>();
    const createdChallengeIdByLegacyId = new Map<string, string>();

    for (const firm of legacyState.firms) {
      const result = await this.makeRequest('/firms', {
        method: 'POST',
        body: JSON.stringify({
          name: firm.name,
          firmType: (firm as any).firmType,
        }),
      });
      if (result?.firm?.id) {
        createdFirmIdByLegacyId.set(firm.id, result.firm.id);
      }
    }

    const sortedChallenges = [...legacyState.challenges].sort((a, b) => {
      const aTime = new Date(a.createdAt || a.startDate || 0).getTime();
      const bTime = new Date(b.createdAt || b.startDate || 0).getTime();
      return aTime - bTime;
    });

    for (const challenge of sortedChallenges) {
      const mappedFirmId = createdFirmIdByLegacyId.get(challenge.propFirmId);
      const created = await this.makeRequest('/challenges', {
        method: 'POST',
        body: JSON.stringify({
          propFirmId: mappedFirmId,
          brokerName: challenge.brokerName,
          accountLast4: challenge.accountLast4,
          purchaseGroupId: challenge.purchaseGroupId,
          purchaseGroupLabel: challenge.purchaseGroupLabel,
          purchaseGroupSize: challenge.purchaseGroupSize,
          purchaseGroupIndex: challenge.purchaseGroupIndex,
          accountSize: challenge.accountSize,
          startDate: challenge.startDate,
          cost: challenge.cost,
          initialCost: challenge.initialCost,
          hasActivationFee: challenge.hasActivationFee,
          activationFeeAmount: challenge.activationFeeAmount,
          firmType: challenge.firmType,
          evalType: challenge.evalType,
          liveAccount: challenge.liveAccount,
          totalPhases: challenge.totalPhases,
          strategy: challenge.strategy,
          status: challenge.status,
        }),
      });

      const createdChallengeId = created?.challenge?.id;
      if (!createdChallengeId) continue;
      createdChallengeIdByLegacyId.set(challenge.id, createdChallengeId);

      const hasPhaseData =
        !!challenge.phases?.phase1 ||
        !!challenge.phases?.phase2 ||
        !!challenge.phases?.phase3;

      if (hasPhaseData) {
        await this.makeRequest('/challenges', {
          method: 'PUT',
          body: JSON.stringify({
            id: createdChallengeId,
            updates: {
              status: challenge.status,
              phases: challenge.phases,
            },
          }),
        });
      }

      for (const payout of challenge.payouts || []) {
        await this.makeRequest('/payouts', {
          method: 'POST',
          body: JSON.stringify({
            challengeId: createdChallengeId,
            amount: payout.amount,
            date: payout.date,
            description: payout.description,
          }),
        });
      }
    }

    if (legacyState.selectedFirmId) {
      const mappedSelectedFirmId = createdFirmIdByLegacyId.get(legacyState.selectedFirmId) || null;
      if (mappedSelectedFirmId) {
        await this.makeRequest('/user/selected-firm', {
          method: 'PUT',
          body: JSON.stringify({ firmId: mappedSelectedFirmId }),
        });
      }
    }
  }

  private async getAuthToken(): Promise<string | null> {
    try {
      const user = netlifyIdentity.currentUser();
      if (user && typeof user.jwt === 'function') {
        return await user.jwt();
      }
    } catch {}
    return null;
  }
  private getUserHeaders(): Record<string, string> {
    try {
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem('user');
        if (raw) {
          const u = JSON.parse(raw);
          const headers: Record<string, string> = {};
          if (u?.id) headers['X-User-Id'] = String(u.id);
          if (u?.email) headers['X-User-Email'] = String(u.email);
          if (u?.name) headers['X-User-Name'] = String(u.name);
          return headers;
        }
      }
    } catch {}
    return {};
  }

  private async makeRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
    const token = await this.getAuthToken();
    const userHeaders = this.getUserHeaders();
    const resolvedEndpoint = `${API_BASE_URL}${mapEndpoint(endpoint)}`;
    
    const config: RequestInit = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...userHeaders,
        ...(options.headers || {}),
      },
      cache: 'no-store',
    };

    emitAuthDebug('api:request', {
      endpoint,
      resolvedEndpoint,
      method: options.method || 'GET',
      hasAuthToken: !!token,
      headerUserId: userHeaders['X-User-Id'] || null,
      headerUserEmail: userHeaders['X-User-Email'] || null,
    });

    const response = await fetch(resolvedEndpoint, { ...config, credentials: 'include' });
    
    if (!response.ok) {
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        const error = await response.json().catch(() => ({ error: 'Network error' }));
        emitAuthDebug('api:error', {
          endpoint,
          resolvedEndpoint,
          method: options.method || 'GET',
          status: response.status,
          contentType,
          message: error.error || `HTTP ${response.status}`,
        });
        throw new Error(error.error || `HTTP ${response.status}`);
      } else {
        const text = await response.text();
        console.error('Non-JSON response:', response.status, text.substring(0, 200));
        emitAuthDebug('api:error', {
          endpoint,
          resolvedEndpoint,
          method: options.method || 'GET',
          status: response.status,
          contentType,
          message: `HTTP ${response.status}: Expected JSON but got ${contentType}`,
          responsePreview: text.substring(0, 200),
        });
        throw new Error(`HTTP ${response.status}: Expected JSON but got ${contentType}`);
      }
    }

    // Handle 204 No Content (no response body)
    if (response.status === 204) {
      emitAuthDebug('api:response', {
        endpoint,
        resolvedEndpoint,
        method: options.method || 'GET',
        status: response.status,
        contentType: response.headers.get('content-type'),
        body: null,
      });
      return null;
    }

    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      const text = await response.text();
      console.error('Expected JSON response but got:', contentType, text.substring(0, 200));
      emitAuthDebug('api:error', {
        endpoint,
        resolvedEndpoint,
        method: options.method || 'GET',
        status: response.status,
        contentType,
        message: `Expected JSON but got ${contentType}`,
        responsePreview: text.substring(0, 200),
      });
      throw new Error(`Expected JSON but got ${contentType}`);
    }

    const json = await response.json();
    emitAuthDebug('api:response', {
      endpoint,
      resolvedEndpoint,
      method: options.method || 'GET',
      status: response.status,
      contentType,
      bodySummary: {
        keys: json && typeof json === 'object' ? Object.keys(json) : [],
        firms: Array.isArray(json?.firms) ? json.firms.length : undefined,
        challenges: Array.isArray(json?.challenges) ? json.challenges.length : undefined,
        selectedFirmId: json?.selectedFirmId ?? undefined,
        error: json?.error ?? undefined,
      },
    });
    return json;
  }

  // Load user data (replaces dbStorage.loadState)
  async loadState(_userId: string): Promise<AppState> {
    if (this.useLocal()) {
      return await tempStorage.loadState(_userId);
    }
    const remoteState = await this.makeRequest('/user/data');
    emitAuthDebug('db-state:received', {
      source: 'remote',
      userId: _userId,
      firms: remoteState?.firms?.length || 0,
      challenges: remoteState?.challenges?.length || 0,
      selectedFirmId: remoteState?.selectedFirmId || null,
    });
    if (this.hasMeaningfulState(remoteState)) {
      return remoteState;
    }

    const legacyLocalState = await this.readLegacyLocalState(_userId);
    if (!legacyLocalState) {
      emitAuthDebug('db-state:empty', {
        source: 'remote',
        userId: _userId,
        legacyLocalAvailable: false,
      });
      return remoteState;
    }

    console.log('Found legacy local data for current user, attempting server import.');
    emitAuthDebug('db-state:legacy-found', {
      userId: _userId,
      firms: legacyLocalState.firms.length,
      challenges: legacyLocalState.challenges.length,
      selectedFirmId: legacyLocalState.selectedFirmId,
    });
    try {
      await this.importLegacyLocalState(legacyLocalState);
      const importedState = await this.makeRequest('/user/data');
      if (this.hasMeaningfulState(importedState)) {
        console.log('Legacy local data imported successfully.');
        emitAuthDebug('db-state:legacy-imported', {
          userId: _userId,
          firms: importedState?.firms?.length || 0,
          challenges: importedState?.challenges?.length || 0,
          selectedFirmId: importedState?.selectedFirmId || null,
        });
        return importedState;
      }
    } catch (error) {
      console.error('Legacy local data import failed:', error);
      emitAuthDebug('db-state:legacy-import-error', {
        userId: _userId,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    console.warn('Falling back to legacy local data because the server state is still empty.');
    emitAuthDebug('db-state:fallback-local', {
      userId: _userId,
      firms: legacyLocalState.firms.length,
      challenges: legacyLocalState.challenges.length,
      selectedFirmId: legacyLocalState.selectedFirmId,
    });
    return legacyLocalState;
  }

  // Add firm (replaces dbStorage.addFirm)
  async addFirm(_userId: string, input: NewFirmInput): Promise<{ firm: PropFirm }> {
    if (this.useLocal()) {
      return await tempStorage.addFirm(_userId, input);
    }
    return this.makeRequest('/firms', { method: 'POST', body: JSON.stringify(input) });
  }

  // Add challenge (replaces dbStorage.addChallenge)
  async addChallenge(_userId: string, input: NewChallengeInput): Promise<{ challenge: Challenge }> {
    if (this.useLocal()) {
      return await tempStorage.addChallenge(_userId, input);
    }
    return this.makeRequest('/challenges', { method: 'POST', body: JSON.stringify(input) });
  }

  // Update challenge (replaces dbStorage.updateChallenge)
  async updateChallenge(challenge: Challenge): Promise<void> {
    if (this.useLocal()) {
      await tempStorage.updateChallenge(challenge);
      return;
    }
    await this.makeRequest(`/challenges`, { method: 'PUT', body: JSON.stringify({ id: challenge.id, updates: challenge }) });
  }

  // Remove challenge (replaces dbStorage.removeChallenge)
  async removeChallenge(challengeId: string): Promise<void> {
    if (this.useLocal()) {
      await tempStorage.removeChallenge(challengeId);
      return;
    }
    await this.makeRequest(`/challenges`, { method: 'DELETE', body: JSON.stringify({ id: challengeId }) });
  }

  // Set selected firm (replaces dbStorage.setSelectedFirm)
  async setSelectedFirm(_userId: string, firmId: string | null): Promise<void> {
    if (this.useLocal()) {
      await tempStorage.setSelectedFirm(_userId, firmId);
      return;
    }
    await this.makeRequest('/user/selected-firm', { method: 'PUT', body: JSON.stringify({ firmId }) });
  }

  // Mark phase completion (replaces dbStorage.markPhase)
  async markPhase(challengeId: string, phase: 'phase1'|'phase2'|'phase3', completed: boolean, completedAt?: string): Promise<void> {
    if (this.useLocal()) {
      await tempStorage.markPhase(challengeId, phase, completed, completedAt);
      return;
    }
    await this.makeRequest('/mark-phase', { method: 'PUT', body: JSON.stringify({ challengeId, phase, completed, ...(completedAt ? { completedAt } : {}) }) });
  }

  async addPayout(challengeId: string, amount: number, date: string, description?: string) {
    if (this.useLocal()) {
      const payout = await tempStorage.addPayout(challengeId, amount, date, description);
      return { payout };
    }
    return this.makeRequest('/payouts', { method: 'POST', body: JSON.stringify({ challengeId, amount, date, description }) })
  }
  async updatePayout(payoutId: string, amount: number, date: string) {
    if (this.useLocal()) {
      await tempStorage.updatePayout(payoutId, amount, date);
      return;
    }
    return this.makeRequest('/payouts', { method: 'PUT', body: JSON.stringify({ payoutId, amount, date }) })
  }
  async removePayout(payoutId: string) {
    if (this.useLocal()) {
      await tempStorage.removePayout(payoutId);
      return;
    }
    return this.makeRequest('/payouts', { method: 'DELETE', body: JSON.stringify({ payoutId }) })
  }
  async bulkUpdateStatus(ids: string[], status: string) {
    if (this.useLocal()) {
      return;
    }
    return this.makeRequest('/challenges/bulk-status', { method: 'POST', body: JSON.stringify({ ids, status }) })
  }
  
  // Update challenge rules (deprecated - use updatePhaseRules)
  async updateChallengeRules(challengeId: string, rules: any[]) {
    return this.makeRequest('/challenges', { 
      method: 'PUT', 
      body: JSON.stringify({ id: challengeId, updates: { rules } }) 
    });
  }
  
  // Update rules for a specific phase (sends complete phaseRules object)
  async updatePhaseRules(challengeId: string, completePhaseRules: any) {
    return this.makeRequest('/challenges', { 
      method: 'PUT', 
      body: JSON.stringify({ 
        id: challengeId, 
        updates: { phaseRules: completePhaseRules } 
      }) 
    });
  }

  // Calendar accounts + entries (server-backed)
  async loadCalendarAccounts(): Promise<{
    accounts: Array<{ id: string; name: string; challengeId?: string; isActive: boolean; createdAt: string }>;
    entries: Record<string, Array<{ id: string; date: string; followedRules: boolean | null; ruleCompliance: Record<string, boolean> | null; notes?: string }>>;
  } | null> {
    if (this.useLocal()) return null;
    try {
      return await this.makeRequest('/calendar?action=all');
    } catch {
      return null;
    }
  }

  async createCalendarAccount(name: string, challengeId?: string): Promise<{ account: any } | null> {
    if (this.useLocal()) return null;
    try {
      return await this.makeRequest('/calendar', {
        method: 'POST',
        body: JSON.stringify({ action: 'create-account', name, challengeId }),
      });
    } catch {
      return null;
    }
  }

  async upsertCalendarEntry(calendarAccountId: string, date: string, followedRules: boolean | null, ruleCompliance?: Record<string, boolean> | null, notes?: string): Promise<void> {
    if (this.useLocal()) return;
    try {
      await this.makeRequest('/calendar', {
        method: 'POST',
        body: JSON.stringify({ action: 'upsert-entry', calendarAccountId, date, followedRules, ruleCompliance: ruleCompliance || null, notes: notes || null }),
      });
    } catch (e) {
      console.error('Failed to upsert calendar entry:', e);
    }
  }

  async deleteCalendarAccount(accountId: string): Promise<void> {
    if (this.useLocal()) return;
    try {
      await this.makeRequest('/calendar', {
        method: 'DELETE',
        body: JSON.stringify({ accountId }),
      });
    } catch (e) {
      console.error('Failed to delete calendar account:', e);
    }
  }
}

export const apiClient = new ApiClient();
