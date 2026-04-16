import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const ResetPassword: React.FC = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const { completePasswordRecovery } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('recovery_token');
    const fromSession = sessionStorage.getItem('recoveryToken');
    const nextToken = fromHash || fromSession;
    if (nextToken) {
      setToken(nextToken);
      sessionStorage.setItem('recoveryToken', nextToken);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError('Missing recovery token. Please use the reset link from your email.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await completePasswordRecovery(token, password);
      sessionStorage.removeItem('recoveryToken');
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      setError(err?.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020408] relative">
      <div className="absolute top-6 left-6 z-10">
        <Link to="/" className="inline-block">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
            Propfolio
          </h1>
        </Link>
      </div>
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-[#0b0f17] border border-gray-800 rounded-2xl p-8 shadow-2xl">
          <h2 className="text-3xl font-bold text-white mb-2 text-center">Choose a new password</h2>
          <p className="text-gray-400 text-center mb-8">Set a new password for your account.</p>

          {error && <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded-lg mb-4">{error}</div>}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">New password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-[#111827] border border-gray-700 rounded-lg text-white"
                minLength={8}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Confirm password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 bg-[#111827] border border-gray-700 rounded-lg text-white"
                minLength={8}
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold py-3 px-4 rounded-lg disabled:opacity-50"
            >
              {loading ? 'Updating...' : 'Update password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
