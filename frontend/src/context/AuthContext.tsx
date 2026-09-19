'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { apiClient, UserProfile, CaseMembership, AuthStateResponse } from '../services/apiClient';

export interface DevAccount {
  role: string;
  display_name: string;
  email: string;
  badge: string;
  unit: string;
  defaultPass: string;
}

export const SEEDED_DEV_ACCOUNTS: Record<string, DevAccount> = {
  SYSTEM_ADMIN: {
    role: 'SYSTEM_ADMIN',
    display_name: 'System Administrator',
    email: 'admin@cyber.gov.in',
    badge: 'EMP-ADMIN-001',
    unit: 'CCID-HQ',
    defaultPass: 'Admin#Cyber2026!Secure'
  },
  SUPERINTENDENT: {
    role: 'SUPERINTENDENT',
    display_name: 'Superintendent of Police (SP)',
    email: 'sp.rao@cyber.gov.in',
    badge: 'EMP-SP-001',
    unit: 'Special Operations Wing',
    defaultPass: 'Officer#Cyber2026!SP'
  },
  IPS_OFFICER: {
    role: 'IPS_OFFICER',
    display_name: 'IPS Lead Investigator',
    email: 'ips.sen@cyber.gov.in',
    badge: 'EMP-IPS-002',
    unit: 'Financial Cybercrime Unit',
    defaultPass: 'Officer#Cyber2026!IPS'
  },
  INSPECTOR: {
    role: 'INSPECTOR',
    display_name: 'Police Inspector',
    email: 'insp.rathore@cyber.gov.in',
    badge: 'EMP-INSP-003',
    unit: 'Special Operations Wing',
    defaultPass: 'Officer#Cyber2026!INSP'
  },
  SUB_INSPECTOR: {
    role: 'SUB_INSPECTOR',
    display_name: 'Sub-Inspector (SI)',
    email: 'si.sharma@cyber.gov.in',
    badge: 'EMP-SI-004',
    unit: 'Special Operations Wing',
    defaultPass: 'Officer#Cyber2026!SI'
  },
  ANALYST: {
    role: 'ANALYST',
    display_name: 'Cybercrime Analyst',
    email: 'analyst.mehta@cyber.gov.in',
    badge: 'EMP-ANL-005',
    unit: 'Financial Cybercrime Unit',
    defaultPass: 'Officer#Cyber2026!ANL'
  },
  AUDITOR: {
    role: 'AUDITOR',
    display_name: 'Compliance Auditor',
    email: 'auditor.verma@cyber.gov.in',
    badge: 'EMP-AUD-006',
    unit: 'CCID-HQ',
    defaultPass: 'Officer#Cyber2026!AUD'
  }
};

interface AuthContextType {
  user: UserProfile | null;
  role: string | null;
  permissions: string[];
  caseMemberships: CaseMembership[];
  isAuthenticated: boolean;
  isLoading: boolean;
  can: (permission: string) => boolean;
  hasCaseAccess: (caseId: string) => boolean;
  login: (identifier: string, password: string) => Promise<AuthStateResponse>;
  register: (payload: {
    employee_id: string;
    full_name: string;
    official_email: string;
    password: string;
    role_name?: string;
    unit_id?: string;
    phone_number?: string;
  }) => Promise<AuthStateResponse>;
  signup?: (payload: any) => Promise<AuthStateResponse>;
  verifyMfa: (challengeToken: string, code: string, isBackupCode?: boolean) => Promise<AuthStateResponse>;
  logout: () => Promise<void>;
  switchDevRole: (roleKey: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  isLoginModalOpen: boolean;
  setIsLoginModalOpen: (open: boolean) => void;
  isProfileModalOpen: boolean;
  setIsProfileModalOpen: (open: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [caseMemberships, setCaseMemberships] = useState<CaseMembership[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false);

  const refreshUser = useCallback(async () => {
    try {
      const data = await apiClient.getMe();
      if (data && data.user) {
        setUser(data.user);
        setPermissions(data.permissions || []);
        setCaseMemberships(data.case_memberships || []);
        setIsLoading(false);
        return;
      }
    } catch {
      // Not authenticated yet
    }

    try {
      const dev = SEEDED_DEV_ACCOUNTS.IPS_OFFICER;
      const resp = await apiClient.login({ identifier: dev.email, password: dev.defaultPass });
      if (resp && resp.user) {
        setUser(resp.user);
        setPermissions(resp.permissions || []);
        setCaseMemberships(resp.case_memberships || []);
      } else {
        setUser(null);
        setPermissions([]);
        setCaseMemberships([]);
      }
    } catch {
      setUser(null);
      setPermissions([]);
      setCaseMemberships([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (identifier: string, password: string): Promise<AuthStateResponse> => {
    setIsLoading(true);
    try {
      const resp = await apiClient.login({ identifier, password });
      if (resp.status === 'AUTHENTICATED' && resp.user) {
        setUser(resp.user);
        setPermissions(resp.permissions || []);
        setCaseMemberships(resp.case_memberships || []);
        setIsLoginModalOpen(false);
      }
      return resp;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (payload: {
    employee_id: string;
    full_name: string;
    official_email: string;
    password: string;
    role_name?: string;
    unit_id?: string;
    phone_number?: string;
  }): Promise<AuthStateResponse> => {
    setIsLoading(true);
    try {
      const resp = await apiClient.register(payload);
      if (resp.status === 'AUTHENTICATED' && resp.user) {
        setUser(resp.user);
        setPermissions(resp.permissions || []);
        setCaseMemberships(resp.case_memberships || []);
        setIsLoginModalOpen(false);
      }
      return resp;
    } finally {
      setIsLoading(false);
    }
  };

  const verifyMfa = async (challengeToken: string, code: string, isBackupCode?: boolean): Promise<AuthStateResponse> => {
    setIsLoading(true);
    try {
      const resp = await apiClient.verifyMfa({ challenge_token: challengeToken, code, is_backup_code: isBackupCode });
      if (resp.status === 'AUTHENTICATED' && resp.user) {
        setUser(resp.user);
        setPermissions(resp.permissions || []);
        setCaseMemberships(resp.case_memberships || []);
        setIsLoginModalOpen(false);
      }
      return resp;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await apiClient.logout();
    } catch (e) {
      console.warn('Logout warning:', e);
    } finally {
      setUser(null);
      setPermissions([]);
      setCaseMemberships([]);
      setIsLoading(false);
      setIsLoginModalOpen(true);
    }
  };

  // Dev switcher to instantly login as any of the 7 canonical law-enforcement test roles
  const switchDevRole = async (roleKey: string) => {
    const acc = SEEDED_DEV_ACCOUNTS[roleKey];
    if (!acc) return;
    try {
      await login(acc.email, acc.defaultPass);
    } catch (err: any) {
      console.error(`Failed to switch dev role to ${roleKey}:`, err);
    }
  };

  const can = useCallback((permission: string): boolean => {
    if (!user) return false;
    if (user.role === 'SYSTEM_ADMIN') {
      return true;
    }
    return permissions.includes(permission);
  }, [user, permissions]);

  const hasCaseAccess = useCallback((caseId: string): boolean => {
    if (!user) return false;
    if (user.role === 'SYSTEM_ADMIN' || user.role === 'SUPERINTENDENT' || user.role === 'AUDITOR' || user.role === 'IPS_OFFICER') {
      return true;
    }
    return caseMemberships.some(m => m.case_id === caseId);
  }, [user, caseMemberships]);

  const signup = async (payload: any): Promise<AuthStateResponse> => {
    return register({
      employee_id: payload.employee_id || `EMP-${Date.now().toString().slice(-6)}`,
      full_name: payload.full_name,
      official_email: payload.official_email,
      password: payload.password,
      role_name: payload.role_name,
      unit_id: payload.unit_id || payload.unit_code,
      phone_number: payload.phone_number
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user?.role || null,
        permissions,
        caseMemberships,
        isAuthenticated: !!user,
        isLoading,
        can,
        hasCaseAccess,
        login,
        register,
        signup,
        verifyMfa,
        logout,
        switchDevRole,
        refreshUser,
        isLoginModalOpen,
        setIsLoginModalOpen,
        isProfileModalOpen,
        setIsProfileModalOpen
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
