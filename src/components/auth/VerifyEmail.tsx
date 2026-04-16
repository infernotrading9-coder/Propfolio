import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const VerifyEmail: React.FC = () => {
  const { currentUser, pendingVerificationEmail, clearPendingVerification } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (currentUser) {
      clearPendingVerification();
      navigate('/dashboard', { replace: true });
    }
  }, [currentUser, clearPendingVerification, navigate]);

  return (
    <div className="min-h-screen bg-[#020408] relative">
      <div className="absolute top-6 left-6 z-10">
        <Link to="/" className="inline-block">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent hover:from-cyan-300 hover:to-blue-300 transition-all duration-300 cursor-pointer">
            Propfolio
          </h1>
        </Link>
      </div>

      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-[#0b0f17] border border-gray-800 rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-white mb-2">Check your email</h2>
            <p className="text-gray-400">
              We sent a confirmation link to:
            </p>
            <p className="text-cyan-300 font-medium mt-2 break-all">
              {pendingVerificationEmail || 'your email address'}
            </p>
          </div>

          <div className="space-y-4 text-sm text-gray-300 mb-8">
            <p>
              You need to confirm your email before you can use the dashboard.
            </p>
            <p>
              After you click the link in your inbox, come back and sign in.
            </p>
            <p className="text-gray-500">
              Google signups skip this step automatically.
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => navigate('/login')}
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200"
            >
              Go to Sign In
            </button>

            <button
              onClick={() => window.location.reload()}
              className="w-full border border-gray-700 hover:border-cyan-500/50 text-gray-200 font-medium py-3 px-4 rounded-lg transition-all duration-200 hover:bg-white/5"
            >
              I already confirmed
            </button>
          </div>

          <div className="mt-6 text-center">
            <Link to="/signup" className="text-cyan-400 hover:text-cyan-300 text-sm font-medium">
              Use a different email
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VerifyEmail;
