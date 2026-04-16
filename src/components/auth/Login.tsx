import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { GoogleOAuthButton } from '../GoogleOAuthButton';
import { EMAIL_PASSWORD_USE_NETLIFY_IDENTITY } from '../../lib/appFlags';

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

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, loginWithGoogle, currentUser } = useAuth();
  const navigate = useNavigate();

  // Redirect to dashboard if already logged in
  useEffect(() => {
    if (currentUser) {
      emitAuthDebug('login:effect-navigate-dashboard', {
        email: currentUser.email,
      });
      navigate('/dashboard', { replace: true });
    }
  }, [currentUser, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setError('');
      setLoading(true);
      emitAuthDebug('login:submit', {
        email: email.trim().toLowerCase(),
        passwordLength: password.length,
      });
      await login(email, password);
      emitAuthDebug('login:navigate-dashboard', {
        email: email.trim().toLowerCase(),
      });
      navigate('/dashboard', { replace: true });
      setTimeout(() => {
        if (window.location.pathname !== '/dashboard') {
          emitAuthDebug('login:fallback-hard-redirect', {
            currentPath: window.location.pathname,
          });
          window.location.assign('/dashboard');
        }
      }, 150);
    } catch (err: any) {
      const message = err?.message || 'Unknown error';
      emitAuthDebug('login:catch', {
        email: email.trim().toLowerCase(),
        message,
      });
      if (EMAIL_PASSWORD_USE_NETLIFY_IDENTITY && /confirm|verified|verification/i.test(message)) {
        setError(`Failed to log in: ${message}. Please check your email and confirm your account first.`);
      } else {
        setError('Failed to log in: ' + message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credential: string) => {
    try {
      setError('');
      setLoading(true);
      await loginWithGoogle(credential);
      // Navigate after state is updated
      setTimeout(() => {
        navigate('/dashboard', { replace: true });
      }, 150);
    } catch (err: any) {
      setError('Google authentication failed: ' + err.message);
      setLoading(false);
    }
  };

  const handleGoogleError = () => {
    setError('Google authentication failed. Please try again.');
  };

  return (
    <div className="min-h-screen bg-[#020408] relative">
      {/* Logo in top left */}
      <div className="absolute top-6 left-6 z-10">
        <Link to="/" className="inline-block">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent hover:from-cyan-300 hover:to-blue-300 transition-all duration-300 cursor-pointer">
            Propfolio
          </h1>
        </Link>
      </div>
      
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full">
        <div className="bg-[#0b0f17] border border-gray-800 rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-white mb-2">Welcome Back</h2>
            <p className="text-gray-400">Sign in to your trading dashboard</p>
          </div>

          {error && (
            <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-3 bg-[#1a1f2e] border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                placeholder="Enter your email"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                Password
              </label>
              <input
                type="password"
                id="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-3 bg-[#1a1f2e] border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                placeholder="Enter your password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing In...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <Link to="/forgot-password" className="text-cyan-400 hover:text-cyan-300 text-sm font-medium">
              Forgot your password?
            </Link>
          </div>

          {/* Divider */}
          <div className="mt-6 mb-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-700"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-[#0b0f17] text-gray-400">Or continue with</span>
              </div>
            </div>
          </div>

          {/* Google OAuth Button */}
          <GoogleOAuthButton
            onSuccess={handleGoogleSuccess}
            onError={handleGoogleError}
            disabled={loading}
            text="Sign in with Google"
          />

          {import.meta.env.DEV && (
            <div className="mt-4">
              <button
                onClick={() => {
                  try {
                    const devUser = { id: 'dev-user', email: 'dev@example.com', name: 'Dev User' };
                    localStorage.setItem('user', JSON.stringify(devUser));
                    window.location.href = '/dashboard';
                  } catch {}
                }}
                className="w-full px-4 py-3 border border-cyan-400/40 rounded-lg text-cyan-200 hover:text-white hover:bg-cyan-500/10 transition-all duration-300 font-medium"
              >
                Continue in Dev Mode
              </button>
            </div>
          )}

          <div className="mt-6 text-center">
            <p className="text-gray-400">
              Don't have an account?{' '}
              <Link to="/signup" className="text-cyan-400 hover:text-cyan-300 font-medium">
                Sign up
              </Link>
            </p>
            {EMAIL_PASSWORD_USE_NETLIFY_IDENTITY && (
              <p className="text-gray-500 text-sm mt-3">
                Email/password accounts require email confirmation before sign in.
              </p>
            )}
          </div>

          <div className="mt-4 text-center">
            <Link 
              to="/about" 
              className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
            >
              About Us
            </Link>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
};

export default Login;
