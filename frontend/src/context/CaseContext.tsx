'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { apiClient, Case, CaseCreatePayload, CaseDetail } from '../services/apiClient';

interface CaseContextType {
  cases: Case[];
  activeCase: Case | null;
  activeCaseDetail: CaseDetail | null;
  isLoading: boolean;
  error: string | null;
  setActiveCaseId: (id: string) => void;
  refreshCases: () => Promise<void>;
  refreshActiveCaseDetail: () => Promise<void>;
  createCase: (payload: CaseCreatePayload) => Promise<Case>;
  updateCase: (id: string, payload: { title?: string; description?: string; status?: string; case_reference?: string }) => Promise<Case>;
  deleteCase: (id: string) => Promise<void>;
  deleteAllCases: () => Promise<void>;
}

const CaseContext = createContext<CaseContextType | undefined>(undefined);

const FALLBACK_CASES: Case[] = [
  {
    case_id: 'INV-2026-BLACK-CIRCUIT',
    case_reference: 'INV-2026-BLACK-CIRCUIT',
    title: 'Operation Black Circuit',
    description: 'High-velocity cybercrime syndicate operating across Chandigarh, Mohali, and Zirakpur.',
    status: 'ACTIVE',
    created_at: '2026-09-06T00:00:00Z',
    created_by: 'SYSTEM'
  },
  {
    case_id: 'INV-2026-IRON-LOTUS',
    case_reference: 'INV-2026-IRON-LOTUS',
    title: 'Operation Iron Lotus',
    description: 'Cross-jurisdictional syndicate tracking across Chandigarh, Mohali, and Panchkula.',
    status: 'ACTIVE',
    created_at: '2026-09-06T00:00:00Z',
    created_by: 'SYSTEM'
  },
  {
    case_id: 'INV-2026-NIGHT-LEDGER',
    case_reference: 'INV-2026-NIGHT-LEDGER',
    title: 'Operation Night Ledger',
    description: 'Financial layering, hawala networks, and ATM cash extractions in Delhi NCR.',
    status: 'ACTIVE',
    created_at: '2026-09-06T00:00:00Z',
    created_by: 'SYSTEM'
  },
  {
    case_id: 'INV-2026-RED-HAVEN',
    case_reference: 'INV-2026-RED-HAVEN',
    title: 'Operation Red Haven',
    description: 'Physical convergence and incident scene tracking in South Delhi.',
    status: 'ACTIVE',
    created_at: '2026-09-06T00:00:00Z',
    created_by: 'SYSTEM'
  }
];

export function CaseProvider({ children }: { children: ReactNode }) {
  const [cases, setCases] = useState<Case[]>(FALLBACK_CASES);
  const [activeCaseId, setActiveCaseIdState] = useState<string | null>('INV-2026-BLACK-CIRCUIT');
  const [activeCaseDetail, setActiveCaseDetail] = useState<CaseDetail | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCases = useCallback(async () => {
    try {
      const data = await apiClient.listCases();
      if (data && data.length > 0) {
        setCases(data);
        setActiveCaseIdState((prev) => (prev && data.some(c => c.case_id === prev) ? prev : data[0].case_id));
      } else {
        setCases(FALLBACK_CASES);
        setActiveCaseIdState(prev => prev || FALLBACK_CASES[0].case_id);
      }
    } catch (err: any) {
      console.warn('Backend cases fetch warning, using standard benchmark cases:', err);
      setCases(FALLBACK_CASES);
      setActiveCaseIdState(prev => prev || FALLBACK_CASES[0].case_id);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  const refreshActiveCaseDetail = useCallback(async () => {
    if (!activeCaseId) {
      setActiveCaseDetail(null);
      return;
    }
    try {
      const detail = await apiClient.getCaseDetails(activeCaseId);
      setActiveCaseDetail(detail);
    } catch (err) {
      console.warn(`Could not load details for case ${activeCaseId}:`, err);
    }
  }, [activeCaseId]);

  // Load detailed case info whenever activeCaseId changes
  useEffect(() => {
    refreshActiveCaseDetail();
  }, [activeCaseId, refreshActiveCaseDetail]);

  const refreshAll = useCallback(async () => {
    await fetchCases();
    await refreshActiveCaseDetail();
  }, [fetchCases, refreshActiveCaseDetail]);

  const setActiveCaseId = useCallback((id: string) => {
    setActiveCaseIdState(id);
  }, []);

  const createCase = useCallback(async (payload: CaseCreatePayload): Promise<Case> => {
    const newCase = await apiClient.createCase(payload);
    await fetchCases();
    setActiveCaseIdState(newCase.case_id);
    return newCase;
  }, [fetchCases]);

  const updateCase = useCallback(async (id: string, payload: { title?: string; description?: string; status?: string; case_reference?: string }): Promise<Case> => {
    const updated = await apiClient.updateCase(id, payload);
    await fetchCases();
    if (activeCaseId === id) {
      try {
        const detail = await apiClient.getCaseDetails(id);
        setActiveCaseDetail(detail);
      } catch (err) {}
    }
    return updated;
  }, [fetchCases, activeCaseId]);

  const deleteCase = useCallback(async (id: string): Promise<void> => {
    await apiClient.deleteCase(id);
    await fetchCases();
  }, [fetchCases]);

  const deleteAllCases = useCallback(async (): Promise<void> => {
    await apiClient.deleteAllCases();
    await fetchCases();
  }, [fetchCases]);

  const activeCase = cases.find(c => c.case_id === activeCaseId) || null;

  return (
    <CaseContext.Provider
      value={{
        cases,
        activeCase,
        activeCaseDetail,
        isLoading,
        error,
        setActiveCaseId,
        refreshCases: refreshAll,
        refreshActiveCaseDetail,
        createCase,
        updateCase,
        deleteCase,
        deleteAllCases,
      }}
    >
      {children}
    </CaseContext.Provider>
  );
}

export function useCase() {
  const context = useContext(CaseContext);
  if (!context) {
    throw new Error('useCase must be used within a CaseProvider');
  }
  return context;
}
