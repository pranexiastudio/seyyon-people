import React, { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PlanTier } from '@seyyon/shared';
import { AuthSession, SessionState } from '../services/auth-session';
import { AuthUser } from '../services/auth-api';

export type UserSession = AuthUser & { tenantName: string; planTier?: PlanTier };
interface AuthContextType extends Omit<SessionState, 'user'> {
  user: UserSession | null; isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>; retry: () => Promise<void>;
  request: AuthSession['request'];
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const [session] = useState(() => new AuthSession(() => {
    void queryClient.cancelQueries(); queryClient.clear();
  }));
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const cleanupTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(cleanupTimer.current);
    session.start();
    // React StrictMode replays effects; dispose only after a real unmount.
    return () => { cleanupTimer.current = setTimeout(() => session.dispose(), 0); };
  }, [session]);
  const user = state.user ? { ...state.user, tenantName: state.user.tenant?.name || '', planTier: state.user.tenant?.planTier } : null;
  return <AuthContext.Provider value={{ ...state, user, isAuthenticated: state.status === 'authenticated',
    login: session.login, logout: session.logout, retry: session.restore, request: session.request }}>{children}</AuthContext.Provider>;
};
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
