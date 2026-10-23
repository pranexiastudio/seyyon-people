import React, { useState } from 'react';
import {
  CalendarCheck,
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Calendar,
  X,
} from 'lucide-react';
import { INITIAL_LEAVE_BALANCES } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { LeaveStatus, UserRole } from '@seyyon/shared';

export const LeavePage: React.FC = () => {
  const { user } = useAuth();
  const isApprover = [UserRole.COMPANY_ADMIN, UserRole.HR_ADMIN, UserRole.MANAGER].includes(
    user?.role as UserRole
  );

  const [balances, setBalances] = useState(INITIAL_LEAVE_BALANCES);
  const [activeTab, setActiveTab] = useState<'my' | 'approvals' | 'holidays'>('my');
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);

  // Leave Requests state
  const [requests, setRequests] = useState([
    {
      id: 'req-1',
      employee: 'Sara Jenkins',
      employeeCode: 'EMP-004',
      type: 'Casual Leave',
      dates: 'Oct 20, 2026 - Oct 21, 2026',
      days: 2,
      reason: 'Attending family wedding ceremony',
      status: LeaveStatus.PENDING,
      appliedAt: 'Today, 10:15 AM',
    },
    {
      id: 'req-2',
      employee: 'Rahul Verma',
      employeeCode: 'EMP-005',
      type: 'Sick Leave',
      dates: 'Oct 05, 2026',
      days: 1,
      reason: 'Viral fever and medical consultation',
      status: LeaveStatus.APPROVED,
      appliedAt: 'Oct 04, 2026',
    },
  ]);

  // Apply Form State
  const [formType, setFormType] = useState('Casual Leave');
  const [formStart, setFormStart] = useState('2026-10-22');
  const [formEnd, setFormEnd] = useState('2026-10-23');
  const [formDays, setFormDays] = useState(2);
  const [formReason, setFormReason] = useState('');

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    const newReq = {
      id: `req-${Date.now()}`,
      employee: `${user?.firstName} ${user?.lastName}`,
      employeeCode: user?.employeeId || 'EMP-004',
      type: formType,
      dates: `${formStart} - ${formEnd}`,
      days: Number(formDays),
      reason: formReason,
      status: LeaveStatus.PENDING,
      appliedAt: 'Just now',
    };

    setRequests([newReq, ...requests]);
    setIsApplyModalOpen(false);
    setFormReason('');
  };

  const handleApproval = (id: string, newStatus: LeaveStatus) => {
    setRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: newStatus } : r))
    );
  };

  const holidays = [
    { name: 'Republic Day', date: 'Jan 26, 2026', day: 'Monday' },
    { name: 'May Day', date: 'May 01, 2026', day: 'Friday' },
    { name: 'Independence Day', date: 'Aug 15, 2026', day: 'Saturday' },
    { name: 'Gandhi Jayanti', date: 'Oct 02, 2026', day: 'Friday' },
    { name: 'Diwali Festival', date: 'Nov 08, 2026', day: 'Sunday' },
    { name: 'Christmas Day', date: 'Dec 25, 2026', day: 'Friday' },
  ];

  return (
    <div className="space-y-6">
      {/* Leave Balances Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {balances.map((b) => (
          <div key={b.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                {b.type}
              </span>
              <span className={`h-2.5 w-2.5 rounded-full ${b.color}`} />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-extrabold text-slate-900">{b.remaining}</span>
              <span className="text-xs text-slate-400">/ {b.allocated} Days Left</span>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs pt-3 border-t border-slate-100 text-slate-500">
              <span>Used: {b.used}d</span>
              <span>Pending: {b.pending}d</span>
            </div>
          </div>
        ))}
      </div>

      {/* Main Tabs & Content */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Tabs */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('my')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'my'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              My Applications
            </button>
            {isApprover && (
              <button
                onClick={() => setActiveTab('approvals')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'approvals'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span>Pending Approvals</span>
                <span className="px-1.5 py-0.2 bg-amber-500 text-white text-[10px] rounded-full">
                  {requests.filter((r) => r.status === LeaveStatus.PENDING).length}
                </span>
              </button>
            )}
            <button
              onClick={() => setActiveTab('holidays')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'holidays'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Holiday Calendar 2026
            </button>
          </div>

          <button
            onClick={() => setIsApplyModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-blue-600/20"
          >
            <Plus size={14} />
            <span>Apply For Leave</span>
          </button>
        </div>

        {/* Tab 1: My Applications */}
        {activeTab === 'my' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-200/80 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                  <th className="py-3.5 px-6">Leave Category</th>
                  <th className="py-3.5 px-4">Duration & Dates</th>
                  <th className="py-3.5 px-4">Days</th>
                  <th className="py-3.5 px-4">Reason</th>
                  <th className="py-3.5 px-6 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requests.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-50/80">
                    <td className="py-3.5 px-6 font-bold text-slate-800">{req.type}</td>
                    <td className="py-3.5 px-4 text-slate-700">{req.dates}</td>
                    <td className="py-3.5 px-4 font-semibold text-slate-800">{req.days} Day(s)</td>
                    <td className="py-3.5 px-4 text-slate-600 max-w-xs truncate">{req.reason}</td>
                    <td className="py-3.5 px-6 text-right">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          req.status === LeaveStatus.APPROVED
                            ? 'bg-emerald-100 text-emerald-800'
                            : req.status === LeaveStatus.PENDING
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {req.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 2: Pending Approvals (Manager / HR view) */}
        {activeTab === 'approvals' && (
          <div className="p-6 space-y-4">
            {requests
              .filter((r) => r.status === LeaveStatus.PENDING)
              .map((r) => (
                <div
                  key={r.id}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-slate-900 text-sm">{r.employee}</span>
                      <span className="text-xs text-slate-400 font-mono">({r.employeeCode})</span>
                      <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-bold">
                        {r.type}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">
                      Dates: <span className="font-semibold text-slate-800">{r.dates}</span> ({r.days} Days)
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5 italic">"{r.reason}"</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleApproval(r.id, LeaveStatus.REJECTED)}
                      className="px-3.5 py-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold transition-colors"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => handleApproval(r.id, LeaveStatus.APPROVED)}
                      className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-sm"
                    >
                      Approve
                    </button>
                  </div>
                </div>
              ))}
            {requests.filter((r) => r.status === LeaveStatus.PENDING).length === 0 && (
              <div className="text-center py-8 text-slate-400 text-xs">
                ✨ No pending leave applications requiring approval.
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Holidays */}
        {activeTab === 'holidays' && (
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {holidays.map((h, idx) => (
              <div key={idx} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
                <div>
                  <p className="font-bold text-slate-900 text-xs">{h.name}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{h.day}</p>
                </div>
                <span className="px-2.5 py-1 bg-white border border-slate-200 rounded-md font-mono text-xs font-semibold text-blue-600">
                  {h.date}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Apply Modal */}
      {isApplyModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-extrabold text-slate-900 text-sm">Apply for Leave</h3>
              <button onClick={() => setIsApplyModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleApply} className="space-y-4 mt-4 text-xs">
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Leave Type</label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                >
                  <option value="Casual Leave">Casual Leave (8 days remaining)</option>
                  <option value="Sick Leave">Sick Leave (11 days remaining)</option>
                  <option value="Earned / Privilege">Earned / Privilege (15 days remaining)</option>
                  <option value="Compensatory Off">Compensatory Off (5 days remaining)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Start Date</label>
                  <input
                    type="date"
                    required
                    value={formStart}
                    onChange={(e) => setFormStart(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">End Date</label>
                  <input
                    type="date"
                    required
                    value={formEnd}
                    onChange={(e) => setFormEnd(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Total Days</label>
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={formDays}
                  onChange={(e) => setFormDays(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Reason</label>
                <textarea
                  required
                  rows={3}
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  placeholder="Provide context for manager approval..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsApplyModalOpen(false)}
                  className="px-3.5 py-1.5 text-slate-600 font-semibold hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-sm"
                >
                  Submit Application
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
