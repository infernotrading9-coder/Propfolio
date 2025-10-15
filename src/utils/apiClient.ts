import { AppState, Challenge, NewChallengeInput, NewFirmInput, PropFirm } from '../types';

// Use relative base; Netlify redirects map /api/* to functions
const API_BASE_URL = '/api';

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

    const response = await fetch(`${API_BASE_URL}${endpoint}`, { ...config, credentials: 'include' });
    
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
  async markPhase(challengeId: string, phase: 'phase1'|'phase2'|'phase3', completed: boolean): Promise<void> {
    await this.makeRequest('/mark-phase', {
      method: 'PUT',
      body: JSON.stringify({ challengeId, phase, completed }),
    });
  }

  async addPayout(challengeId: string, amount: number, date: string, description?: string) {
    return this.makeRequest('/payouts', { method: 'POST', body: JSON.stringify({ challengeId, amount, date, description }) })
  }
  async removePayout(payoutId: string) {
    return this.makeRequest('/payouts', { method: 'DELETE', body: JSON.stringify({ payoutId }) })
  }
  async bulkUpdateStatus(ids: string[], status: string) {
    return this.makeRequest('/challenges/bulk-status', { method: 'POST', body: JSON.stringify({ ids, status }) })
  }
}

export const apiClient = new ApiClient();