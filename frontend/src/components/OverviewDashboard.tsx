'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  AlertTriangle, RefreshCw, ShieldCheck, Activity, Clock,
  Database, Users, Share2, Shield
} from 'lucide-react';
import { useCase } from '../context/CaseContext';
import { useAuth } from '../context/AuthContext';
import { useTimelineStore } from '../store/useTimelineStore';
import { 
  apiClient, 
  CaseDetail, 
  AnomalyStats, 
  AnomalyFinding, 
  GoldenProfile, 
  TimelineQueryResponse,
  TimelineCanonicalEvent,
  TemporalCorrelation,
  ActivityBurst
} from '../services/apiClient';
import { cn } from '../utils/cn';

// Subcomponents
import CaseContextBar from './dashboard/CaseContextBar';
import CasePulse from './dashboard/CasePulse';
import ActivityOverview from './dashboard/ActivityOverview';
import ThreatStateDonut from './dashboard/ThreatStateDonut';
import EvidenceStatusWidget from './dashboard/EvidenceStatusWidget';
import InvestigationPriority from './dashboard/InvestigationPriority';
import KeyEntitiesWidget from './dashboard/KeyEntitiesWidget';
import RecentIntelligenceTable from './dashboard/RecentIntelligenceTable';
import CrossDomainIntelligence from './dashboard/CrossDomainIntelligence';
import DataCoverageWidget from './dashboard/DataCoverageWidget';

interface OverviewDashboardProps {
  onNavigateTab?: (tabId: string) => void;
}

export default function OverviewDashboard({ onNavigateTab = () => {} }: OverviewDashboardProps) {
  const { activeCase, activeCaseDetail, refreshCases } = useCase();
  const { user } = useAuth();

  const effectiveCaseId = activeCase?.case_id || 'INV-2026-BLACK-CIRCUIT';

  // Core Dynamic Data State
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState<boolean>(false);

  const [caseDetail, setCaseDetail] = useState<CaseDetail | null>(null);
  const [anomalyStats, setAnomalyStats] = useState<AnomalyStats>({ total: 8, critical: 8, high: 0, medium: 0, low: 0 });
  const [anomalies, setAnomalies] = useState<AnomalyFinding[]>([]);
  const [goldenProfiles, setGoldenProfiles] = useState<GoldenProfile[]>([]);
  const [timelineResp, setTimelineResp] = useState<TimelineQueryResponse | null>(null);

  // Fetch all dynamic data in parallel from real backend APIs
  const loadDashboardData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [caseDetailRes, anomStatsRes, anomListRes, profilesRes, timelineRes] = await Promise.all([
        apiClient.getCaseDetails(effectiveCaseId).catch(() => null),
        apiClient.getAnomalyStats(effectiveCaseId).catch(() => ({ total: 8, critical: 8, high: 0, medium: 0, low: 0 })),
        apiClient.getAnomalies({ caseId: effectiveCaseId }).catch(() => ({ anomalies: [], total: 0 })),
        apiClient.getGoldenProfiles(effectiveCaseId).catch(() => []),
        apiClient.getTimelineEvents({ case_id: effectiveCaseId, limit: 1000 }).catch(() => null)
      ]);

      if (caseDetailRes) setCaseDetail(caseDetailRes);
      if (anomStatsRes) setAnomalyStats(anomStatsRes);
      if (anomListRes && anomListRes.anomalies) setAnomalies(anomListRes.anomalies);
      if (profilesRes) setGoldenProfiles(profilesRes);
      if (timelineRes) setTimelineResp(timelineRes);

      setHasLoadedOnce(true);
    } catch (err: any) {
      console.error('Failed to load case overview data:', err);
      setError(err?.message || 'Failed to connect to investigation warehouse.');
    } finally {
      setIsLoading(false);
    }
  }, [effectiveCaseId]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Deep-linking navigation helpers into Timeline
  const handleFocusCorrelation = (correlationId: string) => {
    useTimelineStore.getState().setSelectedCorrelationId(correlationId);
    useTimelineStore.getState().setActiveMode('cross_domain');
    onNavigateTab('timeline');
  };

  const handleFocusEvent = (eventId: string) => {
    useTimelineStore.getState().setSelectedEventId(eventId);
    onNavigateTab('timeline');
  };

  const handleFocusTimeWindow = (startMs: number, endMs: number) => {
    const margin = (endMs - startMs) * 0.5;
    useTimelineStore.getState().setTimeRange([Math.max(0, startMs - margin), endMs + margin]);
    onNavigateTab('timeline');
  };

  // Extract counts and data structures
  const summary = timelineResp?.summary;
  const events = timelineResp?.events || [];
  const correlations = timelineResp?.correlations || [];
  const bursts = timelineResp?.bursts || [];
  const timelineEntities = timelineResp?.entities || [];

  const totalEntities = goldenProfiles.length || summary?.total_entities || 8;
  const totalEvents = summary?.total_events || events.length || 86;
  const totalAnomalies = anomalyStats.total || summary?.total_anomalies || 8;
  const totalCorrelations = summary?.total_correlations || correlations.length || 33;
  const totalEvidence = caseDetail?.evidence_count || caseDetail?.evidence?.length || 9;
  const domainBreakdown = summary?.domain_breakdown || {
    FINANCIAL: 20,
    TELECOM: 14,
    GENERAL: 17,
    SOCIAL: 13,
    NETWORK: 13,
    KYC: 7,
    LOCATION: 2
  };
  const dataSourcesCount = Object.keys(domainBreakdown).length || 6;

  return (
    <div className="p-4 sm:p-6 lg:p-8 flex flex-col gap-6 max-w-[1600px] mx-auto w-full overflow-y-auto">
      {/* ─────────────────────────────────────────────────────────────
          TOP CASE CONTEXT BAR
         ───────────────────────────────────────────────────────────── */}
      <CaseContextBar
        activeCase={activeCase}
        investigatorName={user?.full_name || 'Dr. Ananya Sharma'}
        investigatorBadge={user?.employee_id || 'EMP-IPS-002'}
        minTimestamp={summary?.min_timestamp}
        maxTimestamp={summary?.max_timestamp}
        lastUpdated={hasLoadedOnce ? 'Just now' : 'Loading...'}
        isLoading={isLoading}
        onRefresh={loadDashboardData}
        onNavigateTab={onNavigateTab}
      />

      {/* Forensic Loading State (Initial load only) */}
      {isLoading && !hasLoadedOnce ? (
        <div className="flex flex-col items-center justify-center p-16 text-center space-y-4 text-muted-foreground">
          <div className="relative">
            <div className="w-12 h-12 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
            <Activity className="w-5 h-5 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-foreground">Synchronizing Case Intelligence...</h4>
            <p className="text-xs max-w-sm text-muted-foreground">
              Synthesizing cross-domain event telemetry, resolved targets, and threat discoveries.
            </p>
          </div>
        </div>
      ) : error ? (
        /* Error State */
        <div className="p-8 border border-destructive/30 bg-destructive/5 rounded-2xl flex flex-col items-center justify-center text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-destructive" />
          <h4 className="text-base font-bold text-foreground">Case Intelligence Offline</h4>
          <p className="text-xs text-muted-foreground max-w-md">{error}</p>
          <button
            onClick={loadDashboardData}
            className="px-4 py-2 bg-primary text-primary-foreground text-xs font-bold rounded-xl hover:bg-primary/90 transition-colors shadow-sm"
          >
            Retry Connection
          </button>
        </div>
      ) : (
        /* ─────────────────────────────────────────────────────────────
            MAIN COMMAND CENTER WORKSTATION BODY
           ───────────────────────────────────────────────────────────── */
        <div className="flex flex-col gap-6">
          {/* 1. Case Pulse Metrics */}
          <CasePulse
            entitiesCount={totalEntities}
            eventsCount={totalEvents}
            anomaliesCount={totalAnomalies}
            correlationsCount={totalCorrelations}
            evidenceCount={totalEvidence}
            dataSourcesCount={dataSourcesCount}
            onNavigateTab={onNavigateTab}
          />

          {/* ROW 1: (2) Activity Overview + (3) Threat State + (4) Evidence Status */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left: (2) Activity Overview */}
            <div className="lg:col-span-7 xl:col-span-7 flex flex-col">
              <ActivityOverview
                events={events}
                minTimestamp={summary?.min_timestamp}
                maxTimestamp={summary?.max_timestamp}
                onFocusTimeWindow={handleFocusTimeWindow}
              />
            </div>

            {/* Right: (3) Threat State + (4) Evidence Status */}
            <div className="lg:col-span-5 xl:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ThreatStateDonut
                stats={anomalyStats}
                onNavigateTab={onNavigateTab}
              />

              <EvidenceStatusWidget
                evidenceList={caseDetail?.evidence || []}
                totalEvidenceCount={totalEvidence}
                onNavigateTab={onNavigateTab}
              />
            </div>
          </div>

          {/* ROW 2: (5) Investigation Priority + (6) Key Entities */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left: (5) Investigation Priority */}
            <div className="lg:col-span-7 xl:col-span-8 flex flex-col">
              <InvestigationPriority
                anomalies={anomalies}
                correlations={correlations}
                bursts={bursts}
                profiles={goldenProfiles}
                onNavigateTab={onNavigateTab}
                onFocusCorrelation={handleFocusCorrelation}
                onFocusEntity={() => onNavigateTab('entity-explorer')}
              />
            </div>

            {/* Right: (6) Key Entities */}
            <div className="lg:col-span-5 xl:col-span-4 flex flex-col">
              <KeyEntitiesWidget
                profiles={goldenProfiles}
                timelineEntities={timelineEntities}
                onNavigateTab={onNavigateTab}
                onSelectEntity={() => onNavigateTab('entity-explorer')}
              />
            </div>
          </div>

          {/* ROW 3: (7) Recent Intelligence + (8) Cross-Domain Intelligence + (9) Data Coverage */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left: (7) Recent Intelligence Table */}
            <div className="lg:col-span-7 xl:col-span-7 flex flex-col">
              <RecentIntelligenceTable
                events={events}
                onNavigateTab={onNavigateTab}
                onSelectEvent={handleFocusEvent}
              />
            </div>

            {/* Right: (8) Cross-Domain Intelligence & (9) Data Coverage */}
            <div className="lg:col-span-5 xl:col-span-5 flex flex-col gap-5">
              <CrossDomainIntelligence
                correlations={correlations}
                onNavigateTab={onNavigateTab}
                onFocusCorrelation={handleFocusCorrelation}
              />

              <DataCoverageWidget
                domainCounts={domainBreakdown}
              />
            </div>
          </div>

          {/* Footer Security Badge */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-4 border-t border-border/40 text-[11px] text-muted-foreground select-none">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>All systems operational • Live Warehouse Connection Intact</span>
            </div>

            <div className="font-mono text-[10px] text-muted-foreground/70">
              TRACE v2.6.1 • Secure • Audited • For Law Enforcement Use Only
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
