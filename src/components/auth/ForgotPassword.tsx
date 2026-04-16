import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const { requestPasswordReset } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await requestPasswordReset(email);
      setSuccess('If an account exists for that email, a reset link has been sent.');
    } catch (err: any) {
      setError(err?.message || 'Failed to send reset email');
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
          <h2 className="text-3xl font-bold text-white mb-2 text-center">Reset password</h2>
          <p className="text-gray-400 text-center mb-8">Enter your email and we’ll send you a reset link.</p>

          {error && <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded-lg mb-4">{error}</div>}
          {success && <div className="bg-green-900/40 border border-green-500 text-green-200 px-4 py-3 rounded-lg mb-4">{success}</div>}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-[#111827] border border-gray-700 rounded-lg text-white"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold py-3 px-4 rounded-lg disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Send reset email'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link to="/login" className="text-cyan-400 hover:text-cyan-300 text-sm font-medium">
              Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
