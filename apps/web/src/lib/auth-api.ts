import { loginResponseSchema, authProfileSchema } from "@seyyon/shared";

const base = import.meta.env.VITE_API_URL || "/api/v1";
let accessToken: string | null = null;
let refreshPromise: Promise<Awaited<ReturnType<typeof performRefresh>>> | null = null;
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
async function raw(path: string, options: RequestInit = {}, prefix = "/auth") {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", "Bearer " + accessToken);
  const response = await fetch(base + prefix + path, { ...options, credentials: "include", headers });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(response.status, body?.error?.message || "Unable to connect. Please try again.");
  }
  return response.status === 204 ? undefined : response.json();
}
async function performRefresh() {
  const data = loginResponseSchema.parse(await raw("/refresh", { method: "POST" }));
  accessToken = data.accessToken;
  return data.profile;
}
export function refreshAuth() {
  const serializedRefresh = async () => navigator.locks ? await navigator.locks.request("seyyon-auth-refresh", performRefresh) : await performRefresh();
  if (!refreshPromise) refreshPromise = serializedRefresh().catch((error) => {
    if (error instanceof ApiError && [401, 403].includes(error.status)) {
      accessToken = null;
      window.dispatchEvent(new Event("seyyon:session-ended"));
    }
    throw error;
  }).finally(() => { refreshPromise = null; });
  return refreshPromise;
}
async function authenticatedRequest(path: string, options: RequestInit, prefix: string) {
  try { return await raw(path, options, prefix); }
  catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    await refreshAuth();
    return raw(path, options, prefix);
  }
}
export const authRequest = (path: string, options: RequestInit = {}) => authenticatedRequest(path, options, "/auth");
export const apiRequest = <T>(path: string, options: RequestInit = {}): Promise<T> => authenticatedRequest(path, options, "");
export async function signIn(input: unknown) {
  const data = loginResponseSchema.parse(await raw("/login", { method: "POST", body: JSON.stringify(input) }));
  accessToken = data.accessToken;
  return data.profile;
}
export async function signOut(all = false) {
  await authRequest(all ? "/logout-all" : "/logout", { method: "POST" });
  accessToken = null;
}
export const getProfile = async () => authProfileSchema.parse(await authRequest("/me"));
export const switchContext = async (membershipId: string | null) => authProfileSchema.parse(await authRequest("/context", { method: "POST", body: JSON.stringify({ membershipId }) }));
export const forgotPassword = (email: string) => raw("/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
export const resetPassword = (token: string, password: string) => raw("/reset-password", { method: "POST", body: JSON.stringify({ token, password }) });

