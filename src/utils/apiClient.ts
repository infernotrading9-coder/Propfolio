import { AppState, Challenge, NewChallengeInput, NewFirmInput, PropFirm } from '../types';

// In Vite dev (5173), call Netlify Functions directly to ensure JSON
const DEV = typeof window !== 'undefined' && window.location && window.location.port === '5173';
const API_BASE_URL = DEV ? '/.netlify/functions' : '/api';
function mapEndpoint(endpoint: string): string {
  if (!DEV) return endpoint;
  switch (endpoint) {
    case '/auth/signup': return '/auth-signup';
    case '/auth/login': return '/auth-login';
    case '/auth/logout': return '/auth-login';
    case '/auth/session': return '/auth-login';
    case '/auth/google': return '/auth-google';
    case '/user/data': return '/db-state';
    case '/firms': return '/db-firms';
    case '/challenges': return '/db-challenges';
    case '/user/selected-firm': return '/db-user';
    case '/payouts': return '/db-payouts';
    case '/mark-phase': return '/db-phase';
    case '/challenges/bulk-status': return '/db-bulk';
    default: return endpoint;
  }
}
class ApiClient {
  private getAuthToken(): string | null { return null; }
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
    const token = this.getAuthToken();
    
    const config: RequestInit = {
      ...options,
      headers: {
'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...this.getUserHeaders(),
        ...options.headers,
      },
    };

const response = await fetch(`${API_BASE_URL}${mapEndpoint(endpoint)}`, { ...config, credentials: 'include' });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Network error' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    // Handle 204 No Content (no response body)
    if (response.status === 204) {
      return null;
    }

    return response.json();
  }

  // Load user data (replaces dbStorage.loadState)
  async loadState(_userId: string): Promise<AppState> {
    return this.makeRequest('/user/data');
  }

  // Add firm (replaces dbStorage.addFirm)
  async addFirm(_userId: string, input: NewFirmInput): Promise<{ firm: PropFirm }> {
    return this.makeRequest('/firms', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  // Add challenge (replaces dbStorage.addChallenge)
  async addChallenge(_userId: string, input: NewChallengeInput): Promise<{ challenge: Challenge }> {
    return this.makeRequest('/challenges', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  // Update challenge (replaces dbStorage.updateChallenge)
  async updateChallenge(challenge: Challenge): Promise<void> {
    await this.makeRequest(`/challenges`, {
      method: 'PUT',
      body: JSON.stringify({ id: challenge.id, updates: challenge }),
    });
  }

  // Remove challenge (replaces dbStorage.removeChallenge)
  async removeChallenge(challengeId: string): Promise<void> {
    await this.makeRequest(`/challenges`, {
      method: 'DELETE',
      body: JSON.stringify({ id: challengeId }),
    });
  }

  // Set selected firm (replaces dbStorage.setSelectedFirm)
  async setSelectedFirm(_userId: string, firmId: string | null): Promise<void> {
    await this.makeRequest('/user/selected-firm', {
      method: 'PUT',
      body: JSON.stringify({ firmId }),
    });
  }

  // Mark phase completion (replaces dbStorage.markPhase)
  async markPhase(challengeId: string, phase: 'phase1'|'phase2'|'phase3', completed: boolean, completedAt?: string): Promise<void> {
    await this.makeRequest('/mark-phase', {
      method: 'PUT',
      body: JSON.stringify({ challengeId, phase, completed, ...(completedAt ? { completedAt } : {}) }),
    });
  }

  async addPayout(challengeId: string, amount: number, date: string, description?: string) {
    return this.makeRequest('/payouts', { method: 'POST', body: JSON.stringify({ challengeId, amount, date, description }) })
  }
  async updatePayout(payoutId: string, amount: number, date: string) {
    return this.makeRequest('/payouts', { method: 'PUT', body: JSON.stringify({ payoutId, amount, date }) })
  }
  async removePayout(payoutId: string) {
    return this.makeRequest('/payouts', { method: 'DELETE', body: JSON.stringify({ payoutId }) })
  }
  async bulkUpdateStatus(ids: string[], status: string) {
    return this.makeRequest('/challenges/bulk-status', { method: 'POST', body: JSON.stringify({ ids, status }) })
  }
}

export const apiClient = new ApiClient();