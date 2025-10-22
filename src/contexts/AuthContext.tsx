import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { decodeGoogleToken } from '../utils/googleAuth';

interface User {
  id: string;
  email: string;
  name?: string | null;
}

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  signup: (email: string, password: string, name?: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const API_BASE = (typeof window !== 'undefined' && window.location && window.location.port === '5173') ? '/.netlify/functions' : '/api';

  const signup = async (email: string, password: string, name?: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create account');
    setCurrentUser(data.user);
    localStorage.setItem('user', JSON.stringify(data.user));
  };

  const login = async (email: string, password: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    setCurrentUser(data.user);
    localStorage.setItem('user', JSON.stringify(data.user));
  };

  const loginWithGoogle = async (credential: string): Promise<void> => {
    const googleUser = decodeGoogleToken(credential);
    if (!googleUser) throw new Error('Failed to decode Google credential');
    const res = await fetch(`${API_BASE}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: googleUser.email, name: googleUser.name }),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Google authentication failed');
    setCurrentUser(data.user);
    localStorage.setItem('user', JSON.stringify(data.user));
  };

  const logout = async (): Promise<void> => {
    try {
      await fetch(`${API_BASE}/auth/logout`, { method: 'DELETE', credentials: 'include' });
    } catch {}
    if (currentUser?.id) {
      localStorage.removeItem(`challenges_${currentUser.id}`);
      localStorage.removeItem(`firms_${currentUser.id}`);
    }
    setCurrentUser(null);
    localStorage.removeItem('user');
  };

  useEffect(() => {
    const init = async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/session`, { credentials: 'include' });
        const data = await res.json();
        if (data?.user) {
          setCurrentUser(data.user);
          localStorage.setItem('user', JSON.stringify(data.user));
        } else {
          const storedUser = localStorage.getItem('user');
          if (storedUser) setCurrentUser(JSON.parse(storedUser));
        }
      } catch {
        const storedUser = localStorage.getItem('user');
        if (storedUser) setCurrentUser(JSON.parse(storedUser));
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  const value: AuthContextType = {
    currentUser,
    loading,
    signup,
    login,
    loginWithGoogle,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
