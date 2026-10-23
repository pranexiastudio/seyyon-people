import React, { useState } from 'react';
import { ShieldAlert, Building2, Users, CreditCard, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { PlanTier, SubscriptionStatus } from '@seyyon/shared';

export const PlatformAdminPage: React.FC = () => {
  const [tenants, setTenants] = useState([
    {
      id: 'tenant-acme',
      name: 'Acme Technologies Pvt Ltd',
      slug: 'acme-tech',
      domain: 'acmetech.com',
      plan: PlanTier.PROFESSIONAL,
      status: SubscriptionStatus.ACTIVE,
      employees: 5,
      maxEmployees: 150,
      createdAt: '2026-01-10',
    },
    {
      id: 'tenant-starlight',
      name: 'Starlight Healthcare Network',
      slug: 'starlight-health',
      domain: 'starlight.com',
      plan: PlanTier.ENTERPRISE,
      status: SubscriptionStatus.ACTIVE,
      employees: 1,
      maxEmployees: 500,
      createdAt: '2026-04-01',
    },
  ]);

  const toggleTenantStatus = (id: string) => {
    setTenants((prev) =>
      prev.map((t) => {
        if (t.id === id) {
          const next =
            t.status === SubscriptionStatus.ACTIVE
              ? SubscriptionStatus.SUSPENDED
              : SubscriptionStatus.ACTIVE;
          return { ...t, status: next };
        }
        return t;
      })
    );
  };

  return (
    <div className="space-y-6">
      {/* SuperAdmin Banner */}
      <div className="bg-gradient-to-r from-purple-950 via-slate-900 to-navy-900 p-6 rounded-2xl text-white border border-purple-900/60 shadow-xl flex items-center justify-between">
        <div>
          <span className="px-2.5 py-1 rounded-full bg-purple-500/20 text-purple-300 text-xs font-bold border border-purple-500/30">
            Platform Operator Console
          </span>
          <h2 className="text-xl font-black mt-2">Pranexia Studio SaaS Tenant Registry</h2>
          <p className="text-xs text-slate-300 mt-1">
            Oversee tenant organizations, plan limits, subscription state, and global security enforcement.
          </p>
        </div>
        <div className="p-3.5 bg-purple-500/10 rounded-2xl border border-purple-500/30 text-purple-300">
          <ShieldAlert size={28} />
        </div>
      </div>

      {/* Tenants Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-extrabold text-slate-900 text-sm">Customer Organization Tenants</h3>
          <span className="text-xs text-slate-400">Total: {tenants.length} Tenants</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                <th className="py-3.5 px-6">Organization</th>
                <th className="py-3.5 px-4">Domain</th>
                <th className="py-3.5 px-4">Plan Tier</th>
                <th className="py-3.5 px-4">Seats Utilized</th>
                <th className="py-3.5 px-4">Account Status</th>
                <th className="py-3.5 px-6 text-right">Administrative Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tenants.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="py-3.5 px-6">
                    <p className="font-bold text-slate-900">{t.name}</p>
                    <p className="font-mono text-[11px] text-slate-400">{t.slug}</p>
                  </td>
                  <td className="py-3.5 px-4 text-slate-600">{t.domain}</td>
                  <td className="py-3.5 px-4">
                    <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-blue-100 text-blue-800">
                      {t.plan}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-mono">
                    {t.employees} / {t.maxEmployees} seats
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                        t.status === SubscriptionStatus.ACTIVE
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {t.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-6 text-right">
                    <button
                      onClick={() => toggleTenantStatus(t.id)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                        t.status === SubscriptionStatus.ACTIVE
                          ? 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                          : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      }`}
                    >
                      {t.status === SubscriptionStatus.ACTIVE ? 'Suspend Tenant' : 'Reactivate Tenant'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
