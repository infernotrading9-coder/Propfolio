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
class ApiClient {
  private useLocal(): boolean {
    return !!(import.meta as any).env?.DEV;
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
    
    const config: RequestInit = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...this.getUserHeaders(),
        ...(options.headers || {}),
      },
      cache: 'no-store',
    };

    const response = await fetch(`${API_BASE_URL}${mapEndpoint(endpoint)}`, { ...config, credentials: 'include' });
    
    if (!response.ok) {
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        const error = await response.json().catch(() => ({ error: 'Network error' }));
        throw new Error(error.error || `HTTP ${response.status}`);
      } else {
        const text = await response.text();
        console.error('Non-JSON response:', response.status, text.substring(0, 200));
        throw new Error(`HTTP ${response.status}: Expected JSON but got ${contentType}`);
      }
    }

    // Handle 204 No Content (no response body)
    if (response.status === 204) {
      return null;
    }

    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      const text = await response.text();
      console.error('Expected JSON response but got:', contentType, text.substring(0, 200));
      throw new Error(`Expected JSON but got ${contentType}`);
    }

    return response.json();
  }

  // Load user data (replaces dbStorage.loadState)
  async loadState(_userId: string): Promise<AppState> {
    if (this.useLocal()) {
      return await tempStorage.loadState(_userId);
    }
    return this.makeRequest('/user/data');
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
}

export const apiClient = new ApiClient();
