import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { AuthProfile } from "@seyyon/shared";
import { refreshAuth, signIn, signOut, switchContext, getProfile, ApiError } from "@/lib/auth-api";

type AuthState = {
  profile: AuthProfile | null; loading: boolean;
  login: (input: unknown) => Promise<void>;
  logout: (all?: boolean) => Promise<void>;
  selectContext: (membershipId: string | null) => Promise<void>;
};
const AuthContext = createContext<AuthState | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const cache = useQueryClient();
  useEffect(() => {
    const clearSession = () => { cache.clear(); setProfile(null); };
    window.addEventListener("seyyon:session-ended", clearSession);
    return () => window.removeEventListener("seyyon:session-ended", clearSession);
  }, [cache]);
  useEffect(() => {
    let active = true;
    void refreshAuth().then((value) => { if (active) setProfile(value); }).catch(() => { if (active) setProfile(null); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!profile) return;
    const timer = window.setInterval(() => {
      void getProfile().then(setProfile).catch((error) => {
        if (error instanceof ApiError && [401, 403].includes(error.status)) { cache.clear(); setProfile(null); }
      });
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [profile?.sessionId, cache]);
  const value: AuthState = {
    profile, loading,
    login: async (input) => { const current = await signIn(input); cache.clear(); setProfile(current); },
    logout: async (all) => { await signOut(all); cache.clear(); setProfile(null); },
    selectContext: async (membershipId) => { const current = await switchContext(membershipId); cache.clear(); setProfile(current); },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("AuthProvider is required.");
  return auth;
}
export function ProtectedRoute({ platform = false, permission }: { platform?: boolean; permission?: string }) {
  const auth = useAuth();
  const location = useLocation();
  if (auth.loading) return <main className="p-12" role="status">Restoring your session…</main>;
  if (!auth.profile) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (auth.profile.platform !== platform) return <Navigate to={auth.profile.platform ? "/platform" : "/app"} replace />;
  if (permission && !auth.profile.permissions.includes(permission)) return <main className="p-12" role="alert">You don’t have permission to view this page.</main>;
  return <Outlet />;
}

