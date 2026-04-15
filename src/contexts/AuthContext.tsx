import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import netlifyIdentity from 'netlify-identity-widget';
import { createUser, findUserByEmail, validatePassword } from '../utils/tempAuth';
import { FREE_ACCESS_MODE } from '../lib/appFlags';

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
  loginWithGoogle: (credential?: string) => Promise<void>;
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

function mapIdentityUser(u: any): User {
  return {
    id: u?.id || u?.sub,
    email: u?.email,
    name: u?.user_metadata?.full_name || u?.user_metadata?.name || u?.full_name || null,
  } as User;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const awaitLoginViaIdentity = (): Promise<any> => {
    return new Promise((resolve, reject) => {
      const onLogin = (user: any) => {
        try {
          const mapped = mapIdentityUser(user);
          setCurrentUser(mapped);
          localStorage.setItem('user', JSON.stringify(mapped));
        } finally {
          netlifyIdentity.close();
          netlifyIdentity.off('login', onLogin as any);
          netlifyIdentity.off('error', onError as any);
        }
        resolve(user);
      };
      const onError = (err: any) => {
        netlifyIdentity.off('login', onLogin as any);
        netlifyIdentity.off('error', onError as any);
        reject(err || new Error('Identity error'));
      };
      netlifyIdentity.on('login', onLogin as any);
      netlifyIdentity.on('error', onError as any);
    });
  };

  const signup = async (_email: string, _password: string, _name?: string): Promise<void> => {
    if (FREE_ACCESS_MODE) {
      const created = await createUser(_email.trim().toLowerCase(), _password, (_name || '').trim());
      setCurrentUser(created);
      localStorage.setItem('user', JSON.stringify(created));
      return;
    }
    netlifyIdentity.open('signup');
    await awaitLoginViaIdentity();
  };

  const login = async (_email: string, _password: string): Promise<void> => {
    if (FREE_ACCESS_MODE) {
      const normalizedEmail = _email.trim().toLowerCase();
      const user = await findUserByEmail(normalizedEmail);
      if (!user) throw new Error('No account found for that email');
      const valid = await validatePassword(user as any, _password);
      if (!valid) throw new Error('Incorrect password');
      const mapped = {
        id: user.id,
        email: user.email,
        name: user.name ?? null,
      };
      setCurrentUser(mapped);
      localStorage.setItem('user', JSON.stringify(mapped));
      return;
    }
    netlifyIdentity.open('login');
    await awaitLoginViaIdentity();
  };

  const loginWithGoogle = async (): Promise<void> => {
    // Assume the Identity modal was already used; just sync the current user
    const u = netlifyIdentity.currentUser();
    if (!u) throw new Error('Not logged in');
    const mapped = mapIdentityUser(u);
    setCurrentUser(mapped);
    localStorage.setItem('user', JSON.stringify(mapped));
  };

  const logout = async (): Promise<void> => {
    try {
      await netlifyIdentity.logout();
    } catch {}
    if (currentUser?.id) {
      localStorage.removeItem(`challenges_${currentUser.id}`);
      localStorage.removeItem(`firms_${currentUser.id}`);
    }
    setCurrentUser(null);
    localStorage.removeItem('user');
  };

  useEffect(() => {
    const apiUrl = (import.meta as any).env?.VITE_IDENTITY_API_URL;
    const config: any = {};
    if (apiUrl) {
      config.APIUrl = apiUrl;
    }
    // Don't set APIUrl in production - let it auto-detect from site URL
    netlifyIdentity.init(config);
    const onInit = (user: any) => {
      if (user) {
        const mapped = mapIdentityUser(user);
        setCurrentUser(mapped);
        localStorage.setItem('user', JSON.stringify(mapped));
      } else {
        const storedUser = localStorage.getItem('user');
        if (storedUser) setCurrentUser(JSON.parse(storedUser));
      }
      setLoading(false);
    };
    const onLogin = (user: any) => {
      const mapped = mapIdentityUser(user);
      setCurrentUser(mapped);
      localStorage.setItem('user', JSON.stringify(mapped));
    };
    const onLogout = () => {
      setCurrentUser(null);
      localStorage.removeItem('user');
    };
    netlifyIdentity.on('init', onInit as any);
    netlifyIdentity.on('login', onLogin as any);
    netlifyIdentity.on('logout', onLogout as any);
    // Trigger init immediately
    (netlifyIdentity as any).init(config);
    return () => {
      netlifyIdentity.off('init', onInit as any);
      netlifyIdentity.off('login', onLogin as any);
      netlifyIdentity.off('logout', onLogout as any);
    };
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
