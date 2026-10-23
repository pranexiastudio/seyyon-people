import React, { useState } from 'react';
import { Search, Bell, Clock, ChevronDown, LogOut, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '@seyyon/shared';

interface HeaderProps {
  onOpenNotifications: () => void;
  unreadCount?: number;
}

export const Header: React.FC<HeaderProps> = ({ onOpenNotifications, unreadCount = 3 }) => {
  const { user, logout, switchRole, availableRoles } = useAuth();
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [clockedIn, setClockedIn] = useState(false);
  const [punchFeedback, setPunchFeedback] = useState<string | null>(null);

  const handlePunch = () => {
    if (!clockedIn) {
      setClockedIn(true);
      setPunchFeedback('✅ Clocked in successfully at ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } else {
      setClockedIn(false);
      setPunchFeedback('✅ Clocked out successfully. Timesheet updated.');
    }
    setTimeout(() => setPunchFeedback(null), 3500);
  };

  const getRoleBadgeColor = (role?: UserRole) => {
    switch (role) {
      case UserRole.PLATFORM_SUPER_ADMIN:
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case UserRole.COMPANY_ADMIN:
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case UserRole.HR_ADMIN:
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case UserRole.MANAGER:
        return 'bg-amber-100 text-amber-800 border-amber-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 z-20 shadow-sm relative">
      {/* Search Input */}
      <div className="flex items-center gap-3 w-96">
        <div className="relative w-full">
          <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search employees, tasks, documents, channels (Ctrl + K)..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        {/* Quick Punch Button */}
        {user?.role !== UserRole.PLATFORM_SUPER_ADMIN && (
          <div className="relative">
            <button
              onClick={handlePunch}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all border shadow-sm ${
                clockedIn
                  ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                  : 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
              }`}
            >
              <Clock size={14} className={clockedIn ? 'animate-pulse text-amber-600' : ''} />
              <span>{clockedIn ? 'Clock Out' : 'Clock In (Web)'}</span>
            </button>
            {punchFeedback && (
              <div className="absolute right-0 top-10 whitespace-nowrap bg-slate-900 text-white text-xs px-3 py-1.5 rounded shadow-lg z-50 animate-in fade-in slide-in-from-top-1">
                {punchFeedback}
              </div>
            )}
          </div>
        )}

        {/* Role Switcher Dropdown (Interactive Pair Programming Testing Utility) */}
        <div className="relative">
          <button
            onClick={() => setRoleMenuOpen(!roleMenuOpen)}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-50/80 hover:bg-blue-100/80 text-blue-900 border border-blue-200/80 rounded-lg text-xs font-semibold transition-all"
            title="Switch demo role to inspect role-tailored permissions and screens"
          >
            <ShieldCheck size={15} className="text-blue-600" />
            <span className="hidden sm:inline">Role: {user?.role?.replace(/_/g, ' ')}</span>
            <ChevronDown size={14} className="text-blue-600" />
          </button>

          {roleMenuOpen && (
            <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in slide-in-from-top-2">
              <div className="px-3 py-1.5 border-b border-slate-100">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Switch Active Role Persona
                </p>
                <p className="text-[10px] text-slate-400">
                  Simulates multi-tenant RBAC permissions across all modules
                </p>
              </div>
              <div className="max-h-64 overflow-y-auto py-1">
                {availableRoles.map((r) => {
                  const isActive = user?.email === r.email;
                  return (
                    <button
                      key={r.email}
                      onClick={() => {
                        switchRole(r.email);
                        setRoleMenuOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 flex items-start gap-2.5 transition-colors ${
                        isActive ? 'bg-blue-50/80 text-blue-900' : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="pt-0.5">
                        {isActive ? (
                          <CheckCircle2 size={15} className="text-blue-600" />
                        ) : (
                          <div className="h-3.5 w-3.5 rounded-full border border-slate-300 mt-0.5" />
                        )}
                      </div>
                      <div className="flex-1 truncate">
                        <p className="text-xs font-semibold truncate leading-tight">{r.label}</p>
                        <p className="text-[10px] text-slate-400 truncate">{r.subtitle}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Notifications Bell */}
        <button
          onClick={onOpenNotifications}
          className="relative p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          title="Notifications"
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white"></span>
          )}
        </button>

        {/* Profile Menu */}
        <div className="relative">
          <button
            onClick={() => setProfileMenuOpen(!profileMenuOpen)}
            className="flex items-center gap-2.5 pl-2 py-1 pr-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <img
              src={user?.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150'}
              alt={user?.firstName}
              className="h-8 w-8 rounded-full object-cover ring-2 ring-blue-500/20"
            />
            <div className="text-left hidden md:block">
              <p className="text-xs font-bold text-slate-800 leading-tight">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-[10px] font-medium text-slate-400 capitalize">
                {user?.role?.toLowerCase().replace(/_/g, ' ')}
              </p>
            </div>
            <ChevronDown size={14} className="text-slate-400" />
          </button>

          {profileMenuOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50">
              <div className="px-4 py-2 border-b border-slate-100">
                <p className="text-xs font-bold text-slate-900">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-[11px] text-slate-500 truncate">{user?.email}</p>
                <span
                  className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full font-bold border ${getRoleBadgeColor(
                    user?.role
                  )}`}
                >
                  {user?.role?.replace(/_/g, ' ')}
                </span>
              </div>
              <button
                onClick={() => {
                  setProfileMenuOpen(false);
                  logout();
                }}
                className="w-full text-left px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2"
              >
                <LogOut size={14} />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
