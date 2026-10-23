import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserRole, PlanTier } from '@seyyon/shared';
import { INITIAL_DEMO_USERS } from '../services/api';

export interface UserSession {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  tenantId: string | null;
  tenantName: string;
  planTier: PlanTier;
  employeeId: string | null;
  avatarUrl?: string;
}

interface AuthContextType {
  user: UserSession | null;
  isAuthenticated: boolean;
  login: (email: string, password?: string) => Promise<boolean>;
  logout: () => void;
  switchRole: (email: string) => void;
  availableRoles: Array<{ email: string; label: string; role: UserRole; subtitle: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Default to Company Admin for full exploratory experience
  const [user, setUser] = useState<UserSession | null>(() => {
    const saved = localStorage.getItem('seyyon_active_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return INITIAL_DEMO_USERS['admin@acmetech.com'];
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem('seyyon_active_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('seyyon_active_user');
    }
  }, [user]);

  const login = async (email: string): Promise<boolean> => {
    const demo = INITIAL_DEMO_USERS[email.toLowerCase().trim()];
    if (demo) {
      setUser(demo);
      return true;
    }
    // Generic fallback for any email
    setUser({
      id: 'custom-user',
      email,
      firstName: email.split('@')[0],
      lastName: 'Member',
      role: UserRole.EMPLOYEE,
      tenantId: 'tenant-acme',
      tenantName: 'Acme Technologies',
      planTier: PlanTier.PROFESSIONAL,
      employeeId: 'emp-004',
      avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
    });
    return true;
  };

  const logout = () => {
    setUser(null);
  };

  const switchRole = (email: string) => {
    const target = INITIAL_DEMO_USERS[email];
    if (target) {
      setUser(target);
    }
  };

  const availableRoles = [
    { email: 'admin@acmetech.com', label: 'Company Admin (Alex Morgan)', role: UserRole.COMPANY_ADMIN, subtitle: 'Full organization & policy control' },
    { email: 'hr@acmetech.com', label: 'HR Admin (Priya Sharma)', role: UserRole.HR_ADMIN, subtitle: 'Lifecycle, payroll & leave approval' },
    { email: 'manager@acmetech.com', label: 'Manager / Lead (David Chen)', role: UserRole.MANAGER, subtitle: 'Team tasks, reviews & approvals' },
    { email: 'employee@acmetech.com', label: 'Employee (Sara Jenkins)', role: UserRole.EMPLOYEE, subtitle: 'Self-service, punch, tasks & leave' },
    { email: 'superadmin@seyyonpeople.com', label: 'Platform SuperAdmin', role: UserRole.PLATFORM_SUPER_ADMIN, subtitle: 'Multi-tenant console & subscriptions' },
  ];

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        login,
        logout,
        switchRole,
        availableRoles,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
