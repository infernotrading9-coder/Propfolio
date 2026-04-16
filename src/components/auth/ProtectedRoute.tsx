import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { currentUser, loading } = useAuth();
  const storedUser = (() => {
    try {
      const raw = localStorage.getItem('user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })();
  const effectiveUser = currentUser || storedUser;
  const currentUserEmail = currentUser ? currentUser.email : null;
  const storedUserEmail = storedUser ? storedUser.email : null;
  const effectiveUserEmail = effectiveUser ? effectiveUser.email : null;

  React.useEffect(() => {
    try {
      window.dispatchEvent(new CustomEvent('authDebug', {
        detail: {
          type: 'protected-route:state',
          timestamp: new Date().toISOString(),
          loading,
          currentUserEmail,
          storedUserEmail,
          effectiveUserEmail,
        }
      }));
    } catch {}
  }, [loading, currentUserEmail, storedUserEmail, effectiveUserEmail]);

  if (loading) {
    // Show a loading spinner while checking authentication
    return (
      <div className="min-h-screen bg-[#020408] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-cyan-500 mx-auto mb-4"></div>
          <p className="text-white/70">Loading...</p>
        </div>
      </div>
    );
  }

  if (!effectiveUser) {
    try {
      window.dispatchEvent(new CustomEvent('authDebug', {
        detail: {
          type: 'protected-route:redirect-login',
          timestamp: new Date().toISOString(),
          loading,
          currentUserEmail,
          storedUserEmail,
        }
      }));
    } catch {}
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
