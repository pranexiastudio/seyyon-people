import { PlanTier, UserRole } from '@seyyon/shared';
export interface AuthUser {
  id: string; email: string; firstName: string; lastName: string; role: UserRole;
  tenantId: string | null; employeeId: string | null; avatarUrl?: string;
  tenant: { id: string; name: string; planTier: PlanTier; status: string } | null;
  permissions: string[];
}
export interface TokenResponse { accessToken: string; expiresIn: number }
export class ApiError extends Error {
  constructor(public status: number) { super('Request could not be completed'); }
}
const base = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '');
export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('://')) throw new Error('Invalid API path');
  const response = await fetch(`${base}${path}`, { ...init, cache: 'no-store', credentials: 'include' });
  if (!response.ok) throw new ApiError(response.status);
  return response.json();
}
export function browserAuth<T>(action: 'login' | 'refresh' | 'logout', body: object = {}) {
  return apiRequest<T>(`/auth/${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'seyyon-browser' },
    body: JSON.stringify(body),
  });
}
export function profile(accessToken: string) {
  return apiRequest<AuthUser>('/auth/me', { headers: { Authorization: `Bearer ${accessToken}` } });
}
