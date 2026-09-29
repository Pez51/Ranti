import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getSession } from '../../lib/auth';

function RequireSession({ children, allowedRoles = null }) {
  const location = useLocation();
  const [session, setSession] = useState(getSession);

  useEffect(() => {
    const refreshSession = () => setSession(getSession());
    window.addEventListener('storage', refreshSession);
    window.addEventListener('ranti-auth-changed', refreshSession);

    return () => {
      window.removeEventListener('storage', refreshSession);
      window.removeEventListener('ranti-auth-changed', refreshSession);
    };
  }, []);

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (allowedRoles && !allowedRoles.includes(session.user.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default RequireSession;
