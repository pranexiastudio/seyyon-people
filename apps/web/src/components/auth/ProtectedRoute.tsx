import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { UserRole } from '@seyyon/shared';
import { useAuth } from '../../context/AuthContext';
export const ProtectedRoute: React.FC<{ children: React.ReactNode; role?: UserRole }> = ({ children, role }) => {
  const { status, user, retry } = useAuth();
  const location = useLocation();
  if (status === 'restoring') return <p role="status">Verifying your session…</p>;
  if (status === 'unavailable') return <div role="alert">Unable to verify your session. <button onClick={() => void retry()}>Retry</button></div>;
  if (status !== 'authenticated' || !user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (role && user.role !== role) return <p role="alert">You do not have access to this page.</p>;
  return <>{children}</>;
};
