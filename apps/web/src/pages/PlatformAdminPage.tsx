import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '@seyyon/shared';
import { ApiError } from '../services/auth-api';

interface TenantRow { id: string; name: string; slug: string; planTier: string; status: string; maxEmployees: number; _count: { employees: number } }
export const PlatformAdminPage: React.FC = () => {
  const { request, user } = useAuth();
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (user?.role !== UserRole.PLATFORM_SUPER_ADMIN) return;
    let active = true;
    request<TenantRow[]>('/tenants/platform/all').then(rows => { if (active) setTenants(rows); })
      .catch(error => { if (active) setError(error instanceof ApiError && error.status === 403 ? 'Access denied by the server.' : 'Unable to load the tenant registry.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [request, user?.id, user?.role]);
  if (user?.role !== UserRole.PLATFORM_SUPER_ADMIN) return <p role="alert">Access denied.</p>;
  return <section className="rounded-xl bg-white p-6 shadow-sm">
    <h2 className="text-xl font-bold">Platform tenant registry</h2>
    {loading && <p role="status">Loading tenants…</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && !error && <table className="w-full mt-4 text-left text-sm"><thead><tr><th>Organization</th><th>Plan</th><th>Employees</th><th>Status</th><th>Action</th></tr></thead>
      <tbody>{tenants.map(tenant => <tr key={tenant.id}><td className="py-3">{tenant.name}</td><td>{tenant.planTier}</td><td>{tenant._count.employees} / {tenant.maxEmployees}</td><td>{tenant.status}</td><td><button disabled title="Tenant status changes are outside this phase">Status changes unavailable</button></td></tr>)}</tbody></table>}
  </section>;
};
