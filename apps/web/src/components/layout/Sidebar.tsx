import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Clock,
  CalendarCheck,
  CreditCard,
  CheckSquare,
  MessageSquare,
  Video,
  FileText,
  Award,
  BarChart3,
  Settings,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '@seyyon/shared';
import faviconImg from '../../assets/favicon.png';
import logoImg from '../../assets/logo.png';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

interface NavItem {
  name: string;
  path: string;
  icon: any;
  badge?: string;
  exact?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ collapsed, onToggleCollapse }) => {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === UserRole.PLATFORM_SUPER_ADMIN;

  const navigationItems: NavItem[] = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard, exact: true },
    { name: 'Employees', path: '/employees', icon: Users, badge: '5' },
    { name: 'Attendance & Shifts', path: '/attendance', icon: Clock },
    { name: 'Leave & Holidays', path: '/leave', icon: CalendarCheck, badge: '1' },
    { name: 'Payroll & Payslips', path: '/payroll', icon: CreditCard },
    { name: 'Tasks & Projects', path: '/tasks', icon: CheckSquare, badge: '4' },
    { name: 'Team Chat', path: '/chat', icon: MessageSquare, badge: '3' },
    { name: 'Meetings & Calendar', path: '/meetings', icon: Video },
    { name: 'Documents Vault', path: '/documents', icon: FileText },
    { name: 'Performance', path: '/performance', icon: Award },
    { name: 'Reports & Analytics', path: '/reports', icon: BarChart3 },
    { name: 'Settings & Policies', path: '/settings', icon: Settings },
  ];

  if (isSuperAdmin) {
    navigationItems.unshift({
      name: 'Platform SaaS Console',
      path: '/platform-admin',
      icon: ShieldAlert,
      badge: 'SuperAdmin',
      exact: true,
    });
  }

  return (
    <aside
      className={`relative flex flex-col h-screen transition-all duration-300 z-30 ${
        collapsed ? 'w-20' : 'w-64'
      } bg-[#0b132b] text-slate-300 border-r border-slate-800 select-none`}
    >
      {/* Brand Header */}
      <div className="flex items-center justify-between px-4 h-16 border-b border-slate-800">
        <div className={`flex items-center justify-center rounded-xl bg-white p-1 overflow-hidden ${collapsed ? 'h-10 w-10 shrink-0' : 'h-12 min-w-0 flex-1 mr-2'}`}>
          <img
            src={collapsed ? faviconImg : logoImg}
            alt="Seyyon People"
            className="h-full w-full object-contain"
          />
        </div>
        <button
          onClick={onToggleCollapse}
          className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Tenant Badge */}
      {!collapsed && user?.tenantName && (
        <div className="mx-3 mt-3 p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-between">
          <div className="truncate">
            <p className="text-xs font-semibold text-white truncate">{user.tenantName}</p>
            <p className="text-[10px] text-cyan-400 font-medium capitalize">
              {user.planTier?.toLowerCase()} Plan • Active
            </p>
          </div>
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
        </div>
      )}

      {/* Navigation List */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.exact}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25 font-semibold'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                }`
              }
            >
              <Icon size={19} className="shrink-0 transition-transform group-hover:scale-110" />
              {!collapsed && (
                <span className="truncate flex-1">{item.name}</span>
              )}
              {!collapsed && item.badge && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-slate-800 text-cyan-300 border border-cyan-500/20">
                  {item.badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer Tagline */}
      {!collapsed && (
        <div className="p-4 border-t border-slate-800/80 bg-slate-900/40">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Sparkles size={14} className="text-cyan-400" />
            <span className="italic font-medium">People First. Work Smarter.</span>
          </div>
        </div>
      )}
    </aside>
  );
};
