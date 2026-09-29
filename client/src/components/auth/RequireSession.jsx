import { Navigate, useLocation } from 'react-router-dom';
import { getSession } from '../../lib/auth';

function RequireSession({ children, allowedRoles = null }) {
  const location = useLocation();
  const session = getSession();

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (allowedRoles && !allowedRoles.includes(session.user.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default RequireSession;
