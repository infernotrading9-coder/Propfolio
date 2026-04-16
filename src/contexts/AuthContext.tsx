import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import netlifyIdentity from 'netlify-identity-widget';
import { createUser, findUserByEmail, validatePassword } from '../utils/tempAuth';
import { EMAIL_PASSWORD_USE_NETLIFY_IDENTITY, FREE_ACCESS_MODE } from '../lib/appFlags';

interface User {
  id: string;
  email: string;
  name?: string | null;
  provider?: string | null;
}

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  pendingVerificationEmail: string | null;
  signup: (email: string, password: string, name?: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (credential?: string) => Promise<void>;
  logout: () => Promise<void>;
  clearPendingVerification: () => void;
  requestPasswordReset: (email: string) => Promise<void>;
  completePasswordRecovery: (token: string, newPassword: string) => Promise<void>;
  confirmEmailToken: (token: string) => Promise<void>;
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

function deriveEmail(u: any): string {
  return (
    u?.email ||
    u?.user_metadata?.email ||
    u?.profile?.email ||
    u?.token?.email ||
    u?.tokenResponse?.email ||
    ''
  );
}

function deriveName(u: any, email: string): string | null {
  const explicit =
    u?.user_metadata?.full_name ||
    u?.user_metadata?.name ||
    u?.full_name ||
    u?.profile?.name ||
    u?.profile?.full_name ||
    u?.app_metadata?.full_name ||
    null;

  if (explicit) return explicit;
  if (email) return email.split('@')[0];
  return null;
}

function deriveProvider(u: any): string | null {
  return (
    u?.app_metadata?.provider ||
    u?.user_metadata?.provider ||
    u?.profile?.provider ||
    null
  );
}

function mapIdentityUser(u: any): User {
  const email = deriveEmail(u);
  return {
    id: u?.id || u?.sub,
    email,
    name: deriveName(u, email),
    provider: deriveProvider(u),
  } as User;
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

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);

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
    if (EMAIL_PASSWORD_USE_NETLIFY_IDENTITY) {
      const normalizedEmail = _email.trim().toLowerCase();
      const normalizedName = (_name || '').trim();
      emitAuthDebug('signup:start', {
        mode: 'netlify-identity',
        email: normalizedEmail,
        nameLength: normalizedName.length,
        passwordLength: _password.length,
      });
      try {
        const gotrue = (netlifyIdentity as any).gotrue;
        if (!gotrue?.signup) {
          throw new Error('Netlify Identity signup is not available');
        }
        await gotrue.signup(normalizedEmail, _password, {
          full_name: normalizedName,
          name: normalizedName,
        });
        setPendingVerificationEmail(normalizedEmail);
        localStorage.setItem('pendingVerificationEmail', normalizedEmail);
        emitAuthDebug('signup:confirmation-sent', {
          email: normalizedEmail,
        });
        return;
      } catch (error: any) {
        emitAuthDebug('signup:error', {
          message: error?.message || String(error),
          stack: error?.stack || null,
          email: normalizedEmail,
        });
        throw error;
      }
    }
    if (FREE_ACCESS_MODE) {
      const normalizedEmail = _email.trim().toLowerCase();
      const normalizedName = (_name || '').trim();
      emitAuthDebug('signup:start', {
        mode: 'free-local',
        email: normalizedEmail,
        nameLength: normalizedName.length,
        passwordLength: _password.length,
      });
      try {
        const created = await createUser(normalizedEmail, _password, normalizedName);
        emitAuthDebug('signup:user-created', {
          userId: created.id,
          email: created.email,
        });
        setCurrentUser(created);
        localStorage.setItem('user', JSON.stringify(created));
        emitAuthDebug('signup:success', {
          userId: created.id,
          storedUser: true,
        });
        return;
      } catch (error: any) {
        emitAuthDebug('signup:error', {
          message: error?.message || String(error),
          stack: error?.stack || null,
          email: normalizedEmail,
        });
        throw error;
      }
    }
    netlifyIdentity.open('signup');
    await awaitLoginViaIdentity();
  };

  const login = async (_email: string, _password: string): Promise<void> => {
    if (EMAIL_PASSWORD_USE_NETLIFY_IDENTITY) {
      const normalizedEmail = _email.trim().toLowerCase();
      emitAuthDebug('login:start', {
        mode: 'netlify-identity',
        email: normalizedEmail,
        passwordLength: _password.length,
      });
      try {
        const gotrue = (netlifyIdentity as any).gotrue;
        if (!gotrue?.login) {
          throw new Error('Netlify Identity login is not available');
        }
        const user = await gotrue.login(normalizedEmail, _password, true);
        const mapped = mapIdentityUser(user);
        setCurrentUser(mapped);
        localStorage.setItem('user', JSON.stringify(mapped));
        setPendingVerificationEmail(null);
        localStorage.removeItem('pendingVerificationEmail');
        emitAuthDebug('login:success', {
          userId: mapped.id,
          email: mapped.email,
        });
        return;
      } catch (error: any) {
        const message = error?.message || String(error);
        if (/confirm|verified|verification/i.test(message)) {
          setPendingVerificationEmail(normalizedEmail);
          localStorage.setItem('pendingVerificationEmail', normalizedEmail);
        }
        emitAuthDebug('login:error', {
          message,
          stack: error?.stack || null,
          email: normalizedEmail,
        });
        throw error;
      }
    }
    if (FREE_ACCESS_MODE) {
      const normalizedEmail = _email.trim().toLowerCase();
      emitAuthDebug('login:start', {
        mode: 'free-local',
        email: normalizedEmail,
        passwordLength: _password.length,
      });
      try {
        const user = await findUserByEmail(normalizedEmail);
        if (!user) throw new Error('No account found for that email');
        emitAuthDebug('login:user-found', {
          userId: user.id,
          email: user.email,
        });
        const valid = await validatePassword(user as any, _password);
        if (!valid) throw new Error('Incorrect password');
        const mapped = {
          id: user.id,
          email: user.email,
          name: user.name ?? null,
        };
        setCurrentUser(mapped);
        localStorage.setItem('user', JSON.stringify(mapped));
        emitAuthDebug('login:success', {
          userId: mapped.id,
          storedUser: true,
        });
        return;
      } catch (error: any) {
        emitAuthDebug('login:error', {
          message: error?.message || String(error),
          stack: error?.stack || null,
          email: normalizedEmail,
        });
        throw error;
      }
    }
    netlifyIdentity.open('login');
    await awaitLoginViaIdentity();
  };

  const loginWithGoogle = async (): Promise<void> => {
    // Assume the Identity modal was already used; just sync the current user
    const u = netlifyIdentity.currentUser();
    if (!u) throw new Error('Not logged in');
    const mapped = mapIdentityUser(u);
    emitAuthDebug('google:login-success', {
      userId: mapped.id,
      email: mapped.email,
      name: mapped.name,
      provider: mapped.provider,
      rawKeys: Object.keys(u || {}),
      rawUserMetadata: u?.user_metadata || null,
      rawAppMetadata: u?.app_metadata || null,
    });
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

  const clearPendingVerification = () => {
    setPendingVerificationEmail(null);
    localStorage.removeItem('pendingVerificationEmail');
  };

  const requestPasswordReset = async (email: string): Promise<void> => {
    const normalizedEmail = email.trim().toLowerCase();
    const gotrue = (netlifyIdentity as any).gotrue;
    if (!gotrue?.requestPasswordRecovery) {
      throw new Error('Password recovery is not available');
    }
    emitAuthDebug('password-reset:request-start', { email: normalizedEmail });
    try {
      await gotrue.requestPasswordRecovery(normalizedEmail);
      emitAuthDebug('password-reset:request-success', { email: normalizedEmail });
    } catch (error: any) {
      emitAuthDebug('password-reset:request-error', {
        email: normalizedEmail,
        message: error?.message || String(error),
      });
      throw error;
    }
  };

  const completePasswordRecovery = async (token: string, newPassword: string): Promise<void> => {
    const gotrue = (netlifyIdentity as any).gotrue;
    if (!gotrue?.recover) {
      throw new Error('Password recovery is not available');
    }
    emitAuthDebug('password-reset:complete-start', { tokenPresent: !!token, passwordLength: newPassword.length });
    try {
      const user = await gotrue.recover(token, true);
      if (!user?.update) {
        throw new Error('Recovered user session is not available');
      }
      await user.update({ password: newPassword });
      const mapped = mapIdentityUser(user);
      setCurrentUser(mapped);
      localStorage.setItem('user', JSON.stringify(mapped));
      emitAuthDebug('password-reset:complete-success', { userId: mapped.id, email: mapped.email });
    } catch (error: any) {
      emitAuthDebug('password-reset:complete-error', {
        message: error?.message || String(error),
      });
      throw error;
    }
  };

  const confirmEmailToken = async (token: string): Promise<void> => {
    const gotrue = (netlifyIdentity as any).gotrue;
    if (!gotrue?.confirm) {
      throw new Error('Email confirmation is not available');
    }
    emitAuthDebug('confirmation:start', { tokenPresent: !!token });
    try {
      const user = await gotrue.confirm(token, true);
      const mapped = mapIdentityUser(user);
      setCurrentUser(mapped);
      localStorage.setItem('user', JSON.stringify(mapped));
      setPendingVerificationEmail(null);
      localStorage.removeItem('pendingVerificationEmail');
      emitAuthDebug('confirmation:success', { userId: mapped.id, email: mapped.email });
    } catch (error: any) {
      emitAuthDebug('confirmation:error', {
        message: error?.message || String(error),
      });
      throw error;
    }
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
        emitAuthDebug('identity:init-user', {
          userId: mapped.id,
          email: mapped.email,
          name: mapped.name,
          provider: mapped.provider,
          rawKeys: Object.keys(user || {}),
          rawUserMetadata: user?.user_metadata || null,
          rawAppMetadata: user?.app_metadata || null,
        });
        setCurrentUser(mapped);
        localStorage.setItem('user', JSON.stringify(mapped));
        setPendingVerificationEmail(null);
        localStorage.removeItem('pendingVerificationEmail');
      } else {
        const storedUser = localStorage.getItem('user');
        if (storedUser) setCurrentUser(JSON.parse(storedUser));
        const pendingEmail = localStorage.getItem('pendingVerificationEmail');
        if (pendingEmail) setPendingVerificationEmail(pendingEmail);
      }
      setLoading(false);
    };
    const onLogin = (user: any) => {
      const mapped = mapIdentityUser(user);
      emitAuthDebug('identity:on-login', {
        userId: mapped.id,
        email: mapped.email,
        name: mapped.name,
        provider: mapped.provider,
        rawKeys: Object.keys(user || {}),
        rawUserMetadata: user?.user_metadata || null,
        rawAppMetadata: user?.app_metadata || null,
      });
      setCurrentUser(mapped);
      localStorage.setItem('user', JSON.stringify(mapped));
      setPendingVerificationEmail(null);
      localStorage.removeItem('pendingVerificationEmail');
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
    pendingVerificationEmail,
    signup,
    login,
    loginWithGoogle,
    logout,
    clearPendingVerification,
    requestPasswordReset,
    completePasswordRecovery,
    confirmEmailToken,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
