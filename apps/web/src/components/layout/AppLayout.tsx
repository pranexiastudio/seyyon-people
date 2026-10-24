import React, { useState } from 'react';
import { Outlet, useLocation, Link } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { NotificationsDrawer } from './NotificationsDrawer';
import { ShieldAlert, Info } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '@seyyon/shared';

export const AppLayout: React.FC = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const location = useLocation();
  const { user } = useAuth();

  // Simple path to breadcrumb label
  const pathSegments = location.pathname.split('/').filter(Boolean);
  const pageTitle = pathSegments.length === 0 ? 'Dashboard' : pathSegments[0].replace(/-/g, ' ');

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden font-sans">
      {/* Sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="bg-slate-900 text-white text-xs px-4 py-2">
          {user?.tenantName || 'Platform workspace'} | {user?.role?.replace(/_/g, ' ')}
        </div>

        {/* Top Header */}
        <Header
          onOpenNotifications={() => setNotificationsOpen(true)}
          unreadCount={2}
        />

        {/* Scrollable Body Content */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
          {/* Breadcrumb Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                <Link to="/" className="hover:text-blue-600 transition-colors">
                  Seyyon People
                </Link>
                {pathSegments.map((segment, idx) => (
                  <React.Fragment key={idx}>
                    <span>/</span>
                    <span className="capitalize text-slate-800 font-semibold">{segment.replace(/-/g, ' ')}</span>
                  </React.Fragment>
                ))}
              </div>
              <h1 className="text-2xl font-extrabold text-slate-900 capitalize tracking-tight mt-1">
                {pageTitle}
              </h1>
            </div>
          </div>

          {/* Child Page Content */}
          <Outlet />
        </main>
      </div>

      {/* Notifications Drawer */}
      <NotificationsDrawer
        isOpen={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
      />
    </div>
  );
};
