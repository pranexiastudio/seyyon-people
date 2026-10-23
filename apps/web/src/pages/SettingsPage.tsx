import React, { useState } from 'react';
import { Building2, CreditCard, Shield, Clock, CheckCircle2, History } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const SettingsPage: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'subscription' | 'audit'>('profile');
  const [feedback, setFeedback] = useState<string | null>(null);

  const [orgData, setOrgData] = useState({
    name: 'Acme Technologies Pvt Ltd',
    slug: 'acme-tech',
    domain: 'acmetech.com',
    currency: 'INR (₹)',
    timezone: 'Asia/Kolkata (IST)',
    address: 'Prestige Tech Cloud, 4th Floor, Whitefield, Bengaluru, Karnataka 560066',
  });

  const auditLogs = [
    {
      id: 'log-1',
      action: 'LOGIN',
      actor: 'Alex Morgan (admin@acmetech.com)',
      ip: '127.0.0.1',
      time: '15 mins ago',
      details: 'Successful portal login via password authentication',
    },
    {
      id: 'log-2',
      action: 'PAYROLL_REVIEW',
      actor: 'Priya Sharma (hr@acmetech.com)',
      ip: '192.168.1.42',
      time: '2 hours ago',
      details: 'Triggered October 2026 payroll calculation with Indian statutory rules',
    },
    {
      id: 'log-3',
      action: 'LEAVE_APPLICATION',
      actor: 'Sara Jenkins (employee@acmetech.com)',
      ip: '192.168.1.18',
      time: '4 hours ago',
      details: 'Applied for 2 days Casual Leave (Oct 20 - Oct 21)',
    },
    {
      id: 'log-4',
      action: 'BIOMETRIC_SYNC',
      actor: 'System Daemon (Cron Job)',
      ip: '192.168.1.105',
      time: '10:00 AM Today',
      details: 'Ingested 18 punch records from LOBBY_BIO_01 terminal',
    },
  ];

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback('Organization profile settings saved successfully.');
    setTimeout(() => setFeedback(null), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setActiveTab('profile')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'profile'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Building2 size={15} />
          <span>Organization Profile</span>
        </button>
        <button
          onClick={() => setActiveTab('subscription')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'subscription'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <CreditCard size={15} />
          <span>Subscription & Plan</span>
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'audit'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <History size={15} />
          <span>Security Audit Trail</span>
        </button>
      </div>

      {feedback && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold rounded-xl animate-in fade-in">
          {feedback}
        </div>
      )}

      {/* Tab 1: Organization Profile Form */}
      {activeTab === 'profile' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm max-w-2xl">
          <h3 className="font-extrabold text-slate-900 text-sm mb-1">Company Details</h3>
          <p className="text-xs text-slate-500 mb-6">Manage global company metadata and work location</p>

          <form onSubmit={handleSave} className="space-y-4 text-xs">
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Company Legal Name</label>
              <input
                type="text"
                value={orgData.name}
                onChange={(e) => setOrgData({ ...orgData, name: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Tenant Slug (Immutable)</label>
                <input
                  type="text"
                  disabled
                  value={orgData.slug}
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-500 cursor-not-allowed font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Corporate Domain</label>
                <input
                  type="text"
                  value={orgData.domain}
                  onChange={(e) => setOrgData({ ...orgData, domain: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Default Currency</label>
                <input
                  type="text"
                  value={orgData.currency}
                  onChange={(e) => setOrgData({ ...orgData, currency: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Default Timezone</label>
                <input
                  type="text"
                  value={orgData.timezone}
                  onChange={(e) => setOrgData({ ...orgData, timezone: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Registered Address</label>
              <textarea
                rows={3}
                value={orgData.address}
                onChange={(e) => setOrgData({ ...orgData, address: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
              />
            </div>

            <div className="pt-3 flex justify-end">
              <button
                type="submit"
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs shadow-md shadow-blue-600/20"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab 2: Subscription & Plan Tier */}
      {activeTab === 'subscription' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm max-w-2xl space-y-6">
          <div className="flex items-center justify-between p-5 bg-gradient-to-r from-blue-900 to-navy-900 rounded-xl text-white">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-cyan-300">Current Plan</span>
              <h3 className="text-xl font-black mt-1">Professional Plan</h3>
              <p className="text-xs text-slate-300 mt-1">Renews on Jan 01, 2027 • ₹79,990 / year</p>
            </div>
            <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/30">
              Active Status
            </span>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-bold text-slate-700">Seat Consumption</span>
              <span className="font-semibold text-slate-500">5 of 150 Seats Used (3.3%)</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
              <div className="bg-blue-600 h-2.5 rounded-full w-[3.3%]" />
            </div>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2 text-xs">
            <h4 className="font-bold text-slate-900 text-xs">Included Entitlements:</h4>
            <ul className="space-y-1.5 text-slate-600">
              <li className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-600" />
                <span>Multi-tenant Indian Statutory Payroll (EPF, ESI, PT, TDS)</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-600" />
                <span>Vendor-Agnostic Biometric Attendance Device Bridge</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-600" />
                <span>Real-Time WebSocket Team Chat & Channels</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-600" />
                <span>100 GB Encrypted S3 Document Vault</span>
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* Tab 3: Security Audit Trail */}
      {activeTab === 'audit' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Organizational Audit Logs</h3>
              <p className="text-xs text-slate-400">Non-repudiable audit events for administrative and security actions</p>
            </div>
            <span className="text-xs text-slate-500 font-mono">Tenant Scoped: acme-tech</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                  <th className="py-3.5 px-6">Event</th>
                  <th className="py-3.5 px-4">Actor</th>
                  <th className="py-3.5 px-4">IP Address</th>
                  <th className="py-3.5 px-4">Details</th>
                  <th className="py-3.5 px-6 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="py-3.5 px-6 font-mono font-bold text-blue-700">{log.action}</td>
                    <td className="py-3.5 px-4 font-semibold text-slate-800">{log.actor}</td>
                    <td className="py-3.5 px-4 font-mono text-slate-500">{log.ip}</td>
                    <td className="py-3.5 px-4 text-slate-600">{log.details}</td>
                    <td className="py-3.5 px-6 text-right text-slate-400">{log.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
