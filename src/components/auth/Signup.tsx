import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { GoogleOAuthButton } from '../GoogleOAuthButton';
import { EMAIL_PASSWORD_USE_NETLIFY_IDENTITY, FREE_ACCESS_MODE } from '../../lib/appFlags';

const Signup: React.FC = () => {
  const [formData, setFormData] = useState({
    displayName: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [authDebugEvents, setAuthDebugEvents] = useState<any[]>([]);
  const { signup, loginWithGoogle, currentUser } = useAuth();
  const navigate = useNavigate();

  // Redirect to dashboard if already logged in
  useEffect(() => {
    if (currentUser) {
      navigate('/dashboard', { replace: true });
    }
  }, [currentUser, navigate]);

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent;
      setAuthDebugEvents(prev => [custom.detail, ...prev].slice(0, 8));
    };
    window.addEventListener('authDebug', handler as EventListener);
    return () => window.removeEventListener('authDebug', handler as EventListener);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      return setError('Passwords do not match');
    }

    if (formData.password.length < 6) {
      return setError('Password must be at least 6 characters long');
    }

    try {
      setError('');
      setLoading(true);
      setAuthDebugEvents(prev => [{
        type: 'signup:submit',
        timestamp: new Date().toISOString(),
        email: formData.email.trim().toLowerCase(),
        displayNameLength: formData.displayName.trim().length,
        passwordLength: formData.password.length,
        mode: FREE_ACCESS_MODE ? 'free-local' : 'identity',
      }, ...prev].slice(0, 8));
      await signup(formData.email, formData.password, formData.displayName);
      if (EMAIL_PASSWORD_USE_NETLIFY_IDENTITY) {
        setAuthDebugEvents(prev => [{
          type: 'signup:navigate-verify-email',
          timestamp: new Date().toISOString(),
        }, ...prev].slice(0, 8));
        navigate('/verify-email', { replace: true });
      } else {
        setAuthDebugEvents(prev => [{
          type: 'signup:navigate-dashboard',
          timestamp: new Date().toISOString(),
        }, ...prev].slice(0, 8));
        navigate('/dashboard', { replace: true });
        setTimeout(() => {
          if (window.location.pathname !== '/dashboard') {
            window.location.assign('/dashboard');
          }
        }, 150);
      }
    } catch (err: any) {
      setError('Failed to create an account: ' + err.message);
      setAuthDebugEvents(prev => [{
        type: 'signup:catch',
        timestamp: new Date().toISOString(),
        message: err?.message || String(err),
        stack: err?.stack || null,
      }, ...prev].slice(0, 8));
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
            <h2 className="text-3xl font-bold text-white mb-2">Create Account</h2>
            <p className="text-gray-400">Start tracking your trading journey</p>
          </div>

          {error && (
            <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          {import.meta.env.DEV && (
            <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-amber-200">Auth Debug</h3>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      navigator.clipboard.writeText(JSON.stringify(authDebugEvents, null, 2));
                    } catch {}
                  }}
                  className="text-xs px-2 py-1 rounded border border-amber-300/30 text-amber-100 hover:bg-amber-500/10"
                >
                  Copy
                </button>
              </div>
              <div className="space-y-2 text-xs text-amber-50/90 max-h-48 overflow-auto">
                <div>Mode: <span className="text-cyan-200">{EMAIL_PASSWORD_USE_NETLIFY_IDENTITY ? 'netlify-identity' : FREE_ACCESS_MODE ? 'free-local' : 'identity'}</span></div>
                <div>Current User: <span className="text-cyan-200">{currentUser ? currentUser.email : 'none'}</span></div>
                <div>Stored User: <span className="text-cyan-200">{localStorage.getItem('user') || 'none'}</span></div>
                {authDebugEvents.length === 0 ? (
                  <div className="text-white/50">No auth events yet. Try creating an account.</div>
                ) : (
                  authDebugEvents.map((event, index) => (
                    <pre key={index} className="whitespace-pre-wrap break-all rounded-lg bg-black/20 p-2 border border-white/10">
                      {JSON.stringify(event, null, 2)}
                    </pre>
                  ))
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="displayName" className="block text-sm font-medium text-gray-300 mb-2">
                Full Name
              </label>
              <input
                type="text"
                id="displayName"
                name="displayName"
                required
                value={formData.displayName}
                onChange={handleChange}
                className="w-full px-3 py-3 bg-[#1a1f2e] border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                placeholder="Enter your full name"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                name="email"
                required
                value={formData.email}
                onChange={handleChange}
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
                name="password"
                required
                value={formData.password}
                onChange={handleChange}
                className="w-full px-3 py-3 bg-[#1a1f2e] border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                placeholder="Create a password"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-2">
                Confirm Password
              </label>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                required
                value={formData.confirmPassword}
                onChange={handleChange}
                className="w-full px-3 py-3 bg-[#1a1f2e] border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                placeholder="Confirm your password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>

          <div className="my-6 flex items-center">
            <div className="flex-1 border-t border-gray-700"></div>
            <span className="px-3 text-gray-500 text-sm">or</span>
            <div className="flex-1 border-t border-gray-700"></div>
          </div>

          <GoogleOAuthButton
            onSuccess={handleGoogleSuccess}
            onError={handleGoogleError}
            disabled={loading}
            text="Sign up with Google"
          />

          <div className="mt-6 text-center">
            <p className="text-gray-400">
              Already have an account?{' '}
              <Link to="/login" className="text-cyan-400 hover:text-cyan-300 font-medium">
                Sign in
              </Link>
            </p>
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

export default Signup;
