import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const AuthHashHandler: React.FC = () => {
  const navigate = useNavigate();
  const { confirmEmailToken } = useAuth();

  useEffect(() => {
    const hash = window.location.hash?.replace(/^#/, '');
    if (!hash) return;

    const params = new URLSearchParams(hash);
    const recoveryToken = params.get('recovery_token');
    const confirmationToken = params.get('confirmation_token');

    if (recoveryToken) {
      sessionStorage.setItem('recoveryToken', recoveryToken);
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      navigate('/reset-password', { replace: true });
      return;
    }

    if (confirmationToken) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      confirmEmailToken(confirmationToken)
        .then(() => navigate('/dashboard', { replace: true }))
        .catch(() => navigate('/login', { replace: true }));
    }
  }, [navigate, confirmEmailToken]);

  return null;
};

export default AuthHashHandler;
