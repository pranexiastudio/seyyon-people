import React from 'react';
import {
  Users,
  Clock,
  CalendarCheck,
  CreditCard,
  ArrowUpRight,
  TrendingUp,
  Video,
  CheckCircle2,
  AlertCircle,
  FileText,
  UserPlus,
  Send,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '@seyyon/shared';
import { Link } from 'react-router-dom';

const ATTENDANCE_TREND_DATA = [
  { day: 'Mon', present: 4, late: 1, absent: 0 },
  { day: 'Tue', present: 5, late: 0, absent: 0 },
  { day: 'Wed', present: 3, late: 1, absent: 1 },
  { day: 'Thu', present: 4, late: 0, absent: 1 },
  { day: 'Fri (Today)', present: 4, late: 1, absent: 0 },
];

const DEPARTMENT_DATA = [
  { name: 'Engineering', employees: 3 },
  { name: 'People / HR', employees: 1 },
  { name: 'Product & Design', employees: 1 },
];

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === UserRole.PLATFORM_SUPER_ADMIN;
  const isHrOrAdmin = [UserRole.COMPANY_ADMIN, UserRole.HR_ADMIN].includes(user?.role as UserRole);

  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-navy-900 via-blue-900 to-indigo-950 rounded-2xl p-6 md:p-8 text-white relative overflow-hidden shadow-xl border border-blue-900/50">
        <div className="relative z-10 max-w-2xl">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-300 text-xs font-semibold mb-3 border border-cyan-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
            {user?.tenantName || 'Seyyon People Platform'}
          </span>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">
            Welcome back, {user?.firstName}! 👋
          </h2>
          <p className="text-sm text-slate-300 mt-2 leading-relaxed">
            Here is your workforce operational pulse for <span className="font-semibold text-white">{currentDate}</span>. All modules are synchronized in real time.
          </p>

          <div className="flex flex-wrap items-center gap-3 mt-5">
            <Link
              to="/leave"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-blue-600/30 transition-all hover:scale-105"
            >
              <CalendarCheck size={15} />
              Apply Leave
            </Link>
            <Link
              to="/tasks"
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800/80 hover:bg-slate-700/80 text-cyan-200 border border-slate-700 rounded-lg text-xs font-semibold transition-all"
            >
              <CheckCircle2 size={15} className="text-cyan-400" />
              View Assigned Tasks
            </Link>
            <Link
              to="/payroll"
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800/80 hover:bg-slate-700/80 text-cyan-200 border border-slate-700 rounded-lg text-xs font-semibold transition-all"
            >
              <FileText size={15} className="text-cyan-400" />
              Latest Payslip
            </Link>
          </div>
        </div>

        {/* Decorative background shapes */}
        <div className="absolute right-0 bottom-0 translate-x-10 translate-y-10 w-80 h-80 rounded-full bg-gradient-to-tr from-cyan-500/10 to-blue-500/20 blur-3xl pointer-events-none" />
        <div className="absolute top-0 right-1/4 -translate-y-12 w-64 h-64 rounded-full bg-blue-600/10 blur-2xl pointer-events-none" />
      </div>

      {/* Primary KPI Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Total Employees */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Total Workforce
            </span>
            <div className="p-2.5 rounded-lg bg-blue-50 text-blue-600">
              <Users size={18} />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">5</span>
            <span className="text-xs text-slate-500 ml-2">/ 150 Seats</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs pt-3 border-t border-slate-100">
            <span className="text-emerald-600 font-semibold flex items-center gap-1">
              <TrendingUp size={13} /> 5 Active
            </span>
            <span className="text-slate-400 font-medium">3 Departments</span>
          </div>
        </div>

        {/* Today's Attendance */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Today's Attendance
            </span>
            <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600">
              <Clock size={18} />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-extrabold text-emerald-600 tracking-tight">80%</span>
            <span className="text-xs text-slate-500 ml-2">Checked In</span>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs pt-3 border-t border-slate-100">
            <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold text-[11px]">
              4 Present
            </span>
            <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-bold text-[11px]">
              1 Late
            </span>
            <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 font-bold text-[11px]">
              1 Leave
            </span>
          </div>
        </div>

        {/* Pending Approvals */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Pending Approvals
            </span>
            <div className="p-2.5 rounded-lg bg-amber-50 text-amber-600">
              <CalendarCheck size={18} />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-extrabold text-amber-600 tracking-tight">2</span>
            <span className="text-xs text-slate-500 ml-2">Require Action</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs pt-3 border-t border-slate-100">
            <span className="text-slate-600 font-medium">1 Leave • 1 Punch Fix</span>
            <Link to="/leave" className="text-blue-600 hover:text-blue-800 font-semibold flex items-center">
              Review <ArrowUpRight size={13} />
            </Link>
          </div>
        </div>

        {/* Monthly Payroll */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              October 2026 Payroll
            </span>
            <div className="p-2.5 rounded-lg bg-purple-50 text-purple-600">
              <CreditCard size={18} />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-extrabold text-slate-900 tracking-tight">
              {isHrOrAdmin ? '₹4,85,000' : '₹81,042'}
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold ml-2">
              REVIEW
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs pt-3 border-t border-slate-100">
            <span className="text-slate-500 font-medium">5 Employees Processed</span>
            <Link to="/payroll" className="text-purple-600 hover:text-purple-800 font-semibold flex items-center">
              Register <ArrowUpRight size={13} />
            </Link>
          </div>
        </div>
      </div>

      {/* Analytics Charts & Live Schedules Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Attendance Trend Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Weekly Attendance Trends</h3>
              <p className="text-xs text-slate-500">Punctuality and presence across Acme Technologies</p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-md">
              Oct 11 - Oct 15
            </span>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={ATTENDANCE_TREND_DATA} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPresent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0b132b', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                />
                <Area type="monotone" dataKey="present" stroke="#2563eb" strokeWidth={2.5} fillOpacity={1} fill="url(#colorPresent)" name="Present" />
                <Area type="monotone" dataKey="late" stroke="#f59e0b" strokeWidth={2} fillOpacity={0} name="Late" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Upcoming Meetings & Syncs */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-900 text-base">Upcoming Meetings</h3>
            <Link to="/meetings" className="text-xs font-semibold text-blue-600 hover:text-blue-800">
              View Calendar
            </Link>
          </div>

          <div className="space-y-3.5 flex-1">
            <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/70 hover:bg-slate-50 transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-900">Weekly Engineering Sync</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Tomorrow, 11:00 AM - 12:00 PM</p>
                </div>
                <span className="p-1.5 rounded-lg bg-blue-100 text-blue-700">
                  <Video size={14} />
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[11px] text-slate-400 font-medium">Organizer: David Chen</span>
                <a
                  href="https://meet.google.com/sey-tech-sync"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800 bg-white px-2.5 py-1 rounded border border-slate-200 shadow-xs"
                >
                  Join Meet
                </a>
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/70 hover:bg-slate-50 transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-900">Sprint 24 Retrospective</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Friday, 03:30 PM - 04:30 PM</p>
                </div>
                <span className="p-1.5 rounded-lg bg-purple-100 text-purple-700">
                  <Video size={14} />
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[11px] text-slate-400 font-medium">Room Alpha</span>
                <span className="text-[11px] font-semibold text-emerald-600">Accepted</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Department Distribution & Quick Workspaces */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Department Distribution */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-900 text-base mb-1">Department Distribution</h3>
          <p className="text-xs text-slate-500 mb-4">Headcount breakdown across units</p>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={DEPARTMENT_DATA} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: '#334155' }} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#0b132b', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '11px' }} />
                <Bar dataKey="employees" fill="#0891b2" radius={[0, 4, 4, 0]} name="Headcount" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Work in Progress Tasks */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Current Sprint Work Items</h3>
              <p className="text-xs text-slate-500">Live priority tasks across active projects</p>
            </div>
            <Link to="/tasks" className="text-xs font-semibold text-blue-600 hover:text-blue-800">
              Open Board
            </Link>
          </div>

          <div className="space-y-3">
            <div className="p-3 rounded-lg border border-slate-100 flex items-center justify-between hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-3">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                <div>
                  <p className="text-xs font-bold text-slate-900">Implement FaceID & Biometric Authentication Flow</p>
                  <p className="text-[11px] text-slate-500">Seyyon Mobile App v2 • Due Oct 25</p>
                </div>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                IN PROGRESS
              </span>
            </div>

            <div className="p-3 rounded-lg border border-slate-100 flex items-center justify-between hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-3">
                <span className="h-2 w-2 rounded-full bg-rose-500" />
                <div>
                  <p className="text-xs font-bold text-slate-900">Push Notification Channel Integration</p>
                  <p className="text-[11px] text-slate-500">Seyyon Mobile App v2 • Due Oct 30</p>
                </div>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800">
                URGENT
              </span>
            </div>

            <div className="p-3 rounded-lg border border-slate-100 flex items-center justify-between hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-3">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <div>
                  <p className="text-xs font-bold text-slate-900">Design Dark Mode Design Tokens & Mobile Components</p>
                  <p className="text-[11px] text-slate-500">Seyyon Mobile App v2 • Completed</p>
                </div>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                COMPLETED
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
