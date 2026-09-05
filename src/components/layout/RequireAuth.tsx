import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LoadingScreen } from '../StatusScreens';

export function RequireAuth() {
  const { loading, configured, operator } = useAuth();
  if (loading) return <LoadingScreen message="Checking session…" />;
  if (configured && !operator) return <Navigate to="/login" replace />;
  return <Outlet />;
}
