'use client';

import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, Filter, Search, ShieldAlert, FileText, ChevronRight, 
  Play, Loader2, RefreshCw, Layers, CheckCircle2, ShieldCheck, Sparkles,
  SlidersHorizontal, X, Activity, Radio, Cpu, Hash, ArrowRight, User,
  Zap, Bell
} from 'lucide-react';
import { useCase } from '../context/CaseContext';
import { apiClient, AnomalyFinding, AnomalyStats, DetectorEngineMeta, CEPAlert } from '../services/apiClient';
import { AlertTriageCard } from './AlertTriageCard';
import { cn } from '../utils/cn';

interface AnomaliesTabProps {
  onAnomalySelect: (anomaly: AnomalyFinding) => void;
  onPivotToGraph?: (entityId: string) => void;
}

export default function AnomaliesTab({ onAnomalySelect, onPivotToGraph }: AnomaliesTabProps) {
  const { activeCase } = useCase();
  const [stats, setStats] = useState<AnomalyStats>({ total: 0, critical: 0, high: 0, medium: 0, low: 0 });
  const [engines, setEngines] = useState<DetectorEngineMeta[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyFinding[]>([]);
  const [signals, setSignals] = useState<any[]>([]);
  const [caseSummary, setCaseSummary] = useState<string | null>(null);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStatusMessage, setAnalysisStatusMessage] = useState<string | null>(null);

  // View Mode: 'findings' (default) vs 'signals' vs 'alerts' (Feature 8)
  const [viewMode, setViewMode] = useState<'findings' | 'signals' | 'alerts'>('findings');

  // CEP Alerts state (Feature 8)
  const [alerts, setAlerts] = useState<CEPAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [selectedAlertStatus, setSelectedAlertStatus] = useState<string>('ALL');
  const [isEvaluatingAlerts, setIsEvaluatingAlerts] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');
  const [selectedPriority, setSelectedPriority] = useState<string>('ALL');
  const [selectedDomain, setSelectedDomain] = useState<string>('ALL');
  const [selectedEngine, setSelectedEngine] = useState<string>('ALL');

  const fetchStats = async () => {
    try {
      const data = await apiClient.getAnomalyStats(activeCase?.case_id);
      setStats(data || { total: 0, critical: 0, high: 0, medium: 0, low: 0 });
    } catch (err) {
      console.error('Failed to fetch anomaly stats:', err);
    }
  };

  const fetchHealth = async () => {
    try {
      const data = await apiClient.getDetectorHealth();
      setEngines(data.engines || []);
    } catch (err) {
      console.error('Failed to fetch detector health:', err);
    }
  };

  const fetchSummary = async () => {
    if (!activeCase?.case_id) return;
    try {
      const res = await apiClient.getCaseSummary(activeCase.case_id);
      if (res?.summary_text) {
        setCaseSummary(res.summary_text);
      }
      if (res?.what_happened || res?.suspects_involved) {
        setSummaryData(res);
      }
    } catch (err) {
      // Fallback
    }
  };

  const fetchAnomalies = async () => {
    setLoading(true);
    try {
      const data = await apiClient.getAnomalies({
        search: search.trim() || undefined,
        limit: 100,
        caseId: activeCase?.case_id
      });
      setAnomalies(data.anomalies || []);
    } catch (err) {
      console.error('Failed to fetch anomalies:', err);
      setAnomalies([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchSignals = async () => {
    if (!activeCase?.case_id) return;
    try {
      const data = await apiClient.getCaseSignals(activeCase.case_id);
      setSignals(data.signals || []);
    } catch (err) {
      setSignals([]);
    }
  };

  const fetchAlerts = async () => {
    if (!activeCase?.case_id) return;
    setAlertsLoading(true);
    try {
      const res = await apiClient.getAlerts(activeCase.case_id, selectedAlertStatus);
      setAlerts(res.alerts || []);
    } catch (err) {
      console.error('Failed to fetch alerts:', err);
    } finally {
      setAlertsLoading(false);
    }
  };

  const handleEvaluateAlerts = async () => {
    if (!activeCase?.case_id) return;
    setIsEvaluatingAlerts(true);
    try {
      const res = await apiClient.evaluateAlerts(activeCase.case_id);
      setAlerts(res.alerts || []);
      setAnalysisStatusMessage(`CEP Engine evaluated ${res.alerts?.length || 0} cross-domain trigger patterns.`);
      setTimeout(() => setAnalysisStatusMessage(null), 8000);
    } catch (err: any) {
      setAnalysisStatusMessage(`CEP Evaluation error: ${err.message}`);
    } finally {
      setIsEvaluatingAlerts(false);
    }
  };

  const handleTriageAlert = async (alertId: string, status: 'INVESTIGATING' | 'ASSIGNED' | 'DISMISSED') => {
    try {
      await apiClient.triageAlert(alertId, status);
      setAlerts(prev => prev.map(a => a.alert_id === alertId ? { ...a, status } : a));
    } catch (err) {
      console.error('Failed to triage alert:', err);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchHealth();
  }, []);

  useEffect(() => {
    fetchStats();
    fetchAnomalies();
    fetchSummary();
    if (viewMode === 'signals') {
      fetchSignals();
    }
    if (viewMode === 'alerts') {
      fetchAlerts();
    }
  }, [search, activeCase?.case_id, viewMode, selectedAlertStatus]);

  const handleRunAnalysis = async () => {
    setIsAnalyzing(true);
    setAnalysisStatusMessage(null);
    try {
      const res = await apiClient.runAnomalyAnalysis(activeCase?.case_id);
      const s = res.result?.summary;
      setAnalysisStatusMessage(
        `Investigative analysis complete in ${s?.duration_seconds || 0}s: ${s?.total_findings || 0} findings promoted from ${s?.total_signals_generated || 0} detection signals across ${res.result?.detectors_executed?.length || 0} engines.`
      );
      await fetchStats();
      await fetchAnomalies();
      await fetchSummary();
      if (viewMode === 'signals') {
        await fetchSignals();
      }
      setTimeout(() => setAnalysisStatusMessage(null), 10000);
    } catch (err: any) {
      setAnalysisStatusMessage(`Analysis failed: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const filteredAnomalies = anomalies.filter((a) => {
    if (selectedSeverity !== 'ALL' && a.severity !== selectedSeverity) return false;
    if (selectedPriority !== 'ALL' && a.investigativePriority !== selectedPriority) return false;
    if (selectedDomain !== 'ALL' && a.domain !== selectedDomain && a.category !== selectedDomain) return false;
    if (selectedEngine !== 'ALL') {
      const dets = a.contributingDetectors || a.detectors || [];
      if (!dets.includes(selectedEngine)) return false;
    }
    return true;
  });

  const filteredSignals = signals.filter((s) => {
    if (selectedDomain !== 'ALL' && s.domain !== selectedDomain) return false;
    if (selectedEngine !== 'ALL' && s.detector_id !== selectedEngine) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        s.detector_id.toLowerCase().includes(q) ||
        s.pattern_type.toLowerCase().includes(q) ||
        JSON.stringify(s.observations).toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case 'CRITICAL':
        return 'bg-destructive/15 text-destructive border-destructive/30';
      case 'HIGH':
        return 'bg-orange-500/15 text-orange-500 border-orange-500/30';
      case 'MEDIUM':
        return 'bg-amber-500/15 text-amber-500 border-amber-500/30';
      default:
        return 'bg-blue-500/15 text-blue-500 border-blue-500/30';
    }
  };

  const getPriorityBadge = (prio: string) => {
    switch (prio) {
      case 'CRITICAL':
        return 'bg-destructive text-destructive-foreground font-black';
      case 'HIGH':
        return 'bg-orange-500/15 text-orange-500 border-orange-500/30 font-bold';
      case 'MEDIUM':
        return 'bg-amber-500/15 text-amber-500 border-amber-500/30 font-bold';
      default:
        return 'bg-secondary text-muted-foreground font-medium';
    }
  };

  return (
    <div className="flex flex-col h-full bg-background p-6 md:p-8 max-w-7xl mx-auto w-full overflow-y-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
              {activeCase?.case_reference || 'ACTIVE CASE'}
            </span>
            <span className="text-xs text-muted-foreground">• Investigative Intelligence Subsystem</span>
            {caseSummary && (
              <span className="text-xs font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                {caseSummary}
              </span>
            )}
          </div>
          <h2 className="text-2xl font-black text-foreground flex items-center gap-2.5">
            <ShieldAlert className="w-6 h-6 text-destructive" />
            Investigative Findings & Anomaly Radar
          </h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-3xl leading-relaxed">
            Multi-lens intelligence transforming 21 algorithmic detectors into coherent, evidence-backed findings for law enforcement and fraud intelligence officers.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Mode Switcher */}
          <div className="flex items-center bg-secondary p-1 rounded-lg border border-border text-xs font-semibold">
            <button
              onClick={() => setViewMode('findings')}
              className={cn(
                "px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5",
                viewMode === 'findings'
                  ? "bg-card text-foreground shadow-sm font-bold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <FileText className="w-3.5 h-3.5 text-primary" />
              Findings ({anomalies.length})
            </button>
            <button
              onClick={() => {
                setViewMode('alerts');
                fetchAlerts();
              }}
              className={cn(
                "px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5",
                viewMode === 'alerts'
                  ? "bg-card text-rose-500 shadow-sm font-bold"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title="Automated Complex Event Processing (CEP) cross-domain alerts"
            >
              <Zap className="w-3.5 h-3.5 text-rose-500" />
              Automated CEP Alerts ({alerts.length})
            </button>
            <button
              onClick={() => {
                setViewMode('signals');
                fetchSignals();
              }}
              className={cn(
                "px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5",
                viewMode === 'signals'
                  ? "bg-card text-foreground shadow-sm font-bold"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title="Raw machine-generated signals stream for audit & debugging"
            >
              <Radio className="w-3.5 h-3.5 text-amber-500" />
              Signals Stream
            </button>
          </div>

          <button
            onClick={() => {
              if (viewMode === 'alerts') fetchAlerts();
              else if (viewMode === 'signals') fetchSignals();
              else fetchAnomalies();
            }}
            disabled={loading || alertsLoading}
            className="p-2 text-muted-foreground hover:text-foreground bg-secondary border border-border rounded-lg hover:bg-secondary/80 transition-colors"
            title="Refresh View"
          >
            <RefreshCw className={cn("w-4 h-4", (loading || alertsLoading) && "animate-spin")} />
          </button>

          {viewMode === 'alerts' ? (
            <button
              onClick={handleEvaluateAlerts}
              disabled={isEvaluatingAlerts}
              className="px-4 py-2 bg-rose-600 text-white text-xs font-bold rounded-lg hover:bg-rose-700 transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {isEvaluatingAlerts ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Evaluating CEP Triggers...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  Evaluate CEP Triggers
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleRunAnalysis}
              disabled={isAnalyzing}
              className="px-4 py-2 bg-destructive text-destructive-foreground text-xs font-bold rounded-lg hover:bg-destructive/90 transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Executing Pipeline...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Run Intelligence Analysis
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {analysisStatusMessage && (
        <div className="mb-6 p-4 bg-primary/10 border border-primary/20 rounded-xl text-xs text-primary flex items-center gap-2 shadow-sm animate-in fade-in">
          <Sparkles className="w-4 h-4 flex-shrink-0" />
          <span>{analysisStatusMessage}</span>
        </div>
      )}

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
        <div 
          onClick={() => setSelectedSeverity('ALL')}
          className={cn(
            "bg-card border p-4 rounded-xl shadow-sm text-center cursor-pointer transition-all hover:border-primary/50",
            selectedSeverity === 'ALL' ? "border-primary ring-1 ring-primary" : "border-border"
          )}
        >
          <div className="text-2xl font-black text-foreground mb-1">{stats.total}</div>
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Findings Total</div>
        </div>

        <div 
          onClick={() => setSelectedSeverity('CRITICAL')}
          className={cn(
            "bg-destructive/5 border p-4 rounded-xl shadow-sm text-center cursor-pointer transition-all hover:border-destructive/50",
            selectedSeverity === 'CRITICAL' ? "border-destructive ring-1 ring-destructive" : "border-destructive/20"
          )}
        >
          <div className="text-2xl font-black text-destructive mb-1">{stats.critical}</div>
          <div className="text-[10px] font-bold text-destructive uppercase tracking-widest">Critical</div>
        </div>

        <div 
          onClick={() => setSelectedSeverity('HIGH')}
          className={cn(
            "bg-orange-500/5 border p-4 rounded-xl shadow-sm text-center cursor-pointer transition-all hover:border-orange-500/50",
            selectedSeverity === 'HIGH' ? "border-orange-500 ring-1 ring-orange-500" : "border-orange-500/20"
          )}
        >
          <div className="text-2xl font-black text-orange-500 mb-1">{stats.high}</div>
          <div className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">High</div>
        </div>

        <div 
          onClick={() => setSelectedSeverity('MEDIUM')}
          className={cn(
            "bg-amber-500/5 border p-4 rounded-xl shadow-sm text-center cursor-pointer transition-all hover:border-amber-500/50",
            selectedSeverity === 'MEDIUM' ? "border-amber-500 ring-1 ring-amber-500" : "border-amber-500/20"
          )}
        >
          <div className="text-2xl font-black text-amber-500 mb-1">{stats.medium}</div>
          <div className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">Medium</div>
        </div>

        <div 
          onClick={() => setSelectedSeverity('LOW')}
          className={cn(
            "bg-blue-500/5 border p-4 rounded-xl shadow-sm text-center cursor-pointer transition-all hover:border-blue-500/50",
            selectedSeverity === 'LOW' ? "border-blue-500 ring-1 ring-blue-500" : "border-blue-500/20"
          )}
        >
          <div className="text-2xl font-black text-blue-500 mb-1">{stats.low}</div>
          <div className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Low</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-card border border-border rounded-xl p-4 mb-6 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Severity Dropdown */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className="font-bold">Severity:</span>
            <select
              value={selectedSeverity}
              onChange={e => setSelectedSeverity(e.target.value)}
              className="bg-secondary border border-border rounded-md px-2.5 py-1 text-xs text-foreground font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="ALL">All Severities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>

          {/* Priority Dropdown */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className="font-bold">Priority:</span>
            <select
              value={selectedPriority}
              onChange={e => setSelectedPriority(e.target.value)}
              className="bg-secondary border border-border rounded-md px-2.5 py-1 text-xs text-foreground font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="ALL">All Priorities</option>
              <option value="CRITICAL">Critical Priority</option>
              <option value="HIGH">High Priority</option>
              <option value="MEDIUM">Medium Priority</option>
              <option value="LOW">Low Priority</option>
            </select>
          </div>

          {/* Domain Dropdown */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className="font-bold">Domain:</span>
            <select
              value={selectedDomain}
              onChange={e => setSelectedDomain(e.target.value)}
              className="bg-secondary border border-border rounded-md px-2.5 py-1 text-xs text-foreground font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="ALL">All Domains</option>
              <option value="FINANCIAL">Financial / Banking</option>
              <option value="CROSS_DOMAIN">Cross Domain</option>
              <option value="SPATIAL_TEMPORAL">Spatio-Temporal</option>
              <option value="SOCIAL_COORDINATION">Social / Coordination</option>
              <option value="NETWORK_OPSEC">Network / OPSEC</option>
              <option value="GRAPH_TOPOLOGY">Graph Topology</option>
              <option value="IDENTITY">Identity Discrepancy</option>
              <option value="BEHAVIORAL">Behavioral</option>
            </select>
          </div>

          {(selectedSeverity !== 'ALL' || selectedPriority !== 'ALL' || selectedDomain !== 'ALL' || selectedEngine !== 'ALL') && (
            <button
              onClick={() => {
                setSelectedSeverity('ALL');
                setSelectedPriority('ALL');
                setSelectedDomain('ALL');
                setSelectedEngine('ALL');
              }}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded bg-secondary"
            >
              <X className="w-3 h-3" /> Reset
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search findings, entities, or narratives..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-secondary border border-border outline-none text-xs text-foreground pl-9 pr-4 py-2 rounded-lg focus:border-primary transition-colors"
          />
        </div>
      </div>

      {/* Main Content: Findings vs Signals */}
      {viewMode === 'findings' ? (
        /* FINDINGS-FIRST VIEW */
        <div className="flex-1 space-y-4">

          {/* Executive AI Intelligence Briefing */}
          {summaryData && summaryData.what_happened && !loading && filteredAnomalies.length > 0 && (
            <div className="bg-card border border-primary/30 rounded-xl shadow-sm overflow-hidden">
              <div className="bg-primary/5 border-b border-primary/20 px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span className="text-sm font-black text-foreground">Executive AI Intelligence Briefing</span>
                </div>
                <span className="text-[10px] font-bold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full border border-primary/20 flex items-center gap-1">
                  <Cpu className="w-3 h-3" />
                  {summaryData.source === 'qwen2.5-local' ? 'Qwen 2.5 Local AI Reasoning' : 'Dynamic Intelligence Engine'}
                </span>
              </div>

              <div className="p-5 space-y-4">
                {/* Summary */}
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Case Synopsis</div>
                  <p className="text-sm text-foreground leading-relaxed font-medium">
                    {summaryData.summary_text}
                  </p>
                </div>

                {/* What Happened */}
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">What Happened</div>
                  <p className="text-xs text-foreground/90 leading-relaxed bg-secondary/30 border border-border/50 rounded-lg p-3">
                    {summaryData.what_happened}
                  </p>
                </div>

                {/* Suspects & Evidence side-by-side */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Suspects */}
                  {summaryData.suspects_involved && summaryData.suspects_involved.length > 0 && (
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-destructive" />
                        Suspects Identified ({summaryData.suspects_involved.length})
                      </div>
                      <div className="space-y-1.5">
                        {summaryData.suspects_involved.slice(0, 6).map((s: any, i: number) => (
                          <div key={i} className="flex items-start gap-2 bg-destructive/5 border border-destructive/15 rounded-lg p-2.5 text-xs">
                            <ShieldAlert className="w-3.5 h-3.5 text-destructive flex-shrink-0 mt-0.5" />
                            <div>
                              <div className="font-bold text-foreground">{s.name}</div>
                              <div className="text-muted-foreground text-[11px]">{s.role}</div>
                              {s.details && <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{s.details}</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Evidence & Actions */}
                  <div className="space-y-3">
                    {summaryData.key_evidence_proof && summaryData.key_evidence_proof.length > 0 && (
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          Key Evidence & Proof
                        </div>
                        <ul className="space-y-1">
                          {summaryData.key_evidence_proof.slice(0, 4).map((ev: string, i: number) => (
                            <li key={i} className="text-[11px] text-foreground/80 flex items-start gap-1.5">
                              <span className="text-emerald-500 font-bold mt-0.5">✓</span>
                              <span>{ev}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {summaryData.recommended_actions && summaryData.recommended_actions.length > 0 && (
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
                          <ArrowRight className="w-3.5 h-3.5 text-primary" />
                          Recommended Next Steps
                        </div>
                        <ol className="space-y-1">
                          {summaryData.recommended_actions.slice(0, 3).map((act: string, i: number) => (
                            <li key={i} className="text-[11px] text-foreground/80 flex items-start gap-1.5">
                              <span className="text-primary font-black">{i + 1}.</span>
                              <span>{act}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="p-16 text-center text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-primary" />
              Loading verified investigative findings...
            </div>
          ) : filteredAnomalies.length === 0 ? (
            <div className="p-16 border-2 border-dashed border-border rounded-xl text-center space-y-4 bg-card">
              <ShieldAlert className="w-12 h-12 text-muted-foreground mx-auto" />
              <h3 className="text-lg font-bold text-foreground">No Investigative Findings</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                {stats.total === 0 
                  ? 'No analysis run recorded for this case. Click "Run Intelligence Analysis" to synthesize findings.'
                  : 'No findings match the current filters.'}
              </p>
              {stats.total === 0 && (
                <button
                  onClick={handleRunAnalysis}
                  disabled={isAnalyzing}
                  className="px-4 py-2 bg-destructive text-destructive-foreground text-xs font-bold rounded-lg hover:bg-destructive/90 transition-colors inline-flex items-center gap-2"
                >
                  <Play className="w-4 h-4" /> Run Intelligence Analysis
                </button>
              )}
            </div>
          ) : (
            filteredAnomalies.map((a) => {
              const detectorList = a.contributingDetectors || a.detectors || [a.type];
              const whatHappened = a.whatHappened || a.reasons?.[0] || 'Pattern identified across analytical lenses.';
              const prio = a.investigativePriority || 'MEDIUM';
              const caseRel = a.caseRelevance || 'HIGH';

              return (
                <div
                  key={a.id}
                  onClick={() => onAnomalySelect(a)}
                  className="bg-card border border-border p-6 rounded-xl hover:border-primary/50 transition-all cursor-pointer shadow-sm relative group flex flex-col md:flex-row md:items-start justify-between gap-6"
                >
                  <div className="space-y-3.5 flex-1 min-w-0">
                    {/* Badges Row */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn(
                        "text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full border flex items-center gap-1.5",
                        getSeverityBadge(a.severity)
                      )}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                        {a.severity}
                      </span>

                      <span className={cn(
                        "text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border border-border",
                        getPriorityBadge(prio)
                      )}>
                        Priority: {prio}
                      </span>

                      {caseRel && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-secondary text-muted-foreground border border-border">
                          Case Relevance: {caseRel}
                        </span>
                      )}

                      {/* All Involved Suspects & Co-Conspirators */}
                      {(() => {
                        const allEntities: Array<{ id: string; name: string; role?: string; isPrimary: boolean; aliases?: string[] }> = [];
                        const seenIds = new Set<string>();

                        (a.primaryEntities || []).forEach(e => {
                          const id = e.entity_id || a.entityId;
                          if (id && !seenIds.has(id)) {
                            seenIds.add(id);
                            allEntities.push({
                              id,
                              name: e.display_name || id,
                              role: e.role,
                              isPrimary: true,
                              aliases: e.aliases
                            });
                          }
                        });

                        if (allEntities.length === 0 && a.entityId) {
                          seenIds.add(a.entityId);
                          allEntities.push({ id: a.entityId, name: a.entityId, isPrimary: true });
                        }

                        (a.relatedEntities || []).forEach(e => {
                          const id = e.entity_id;
                          if (id && !seenIds.has(id)) {
                            seenIds.add(id);
                            allEntities.push({
                              id,
                              name: e.display_name || id,
                              role: e.role,
                              isPrimary: false,
                              aliases: e.aliases
                            });
                          }
                        });

                        return allEntities.map((ent, idx) => (
                          <span
                            key={idx}
                            className={cn(
                              "text-xs font-bold px-2.5 py-0.5 rounded border flex items-center gap-1.5",
                              ent.isPrimary
                                ? "text-primary bg-primary/10 border-primary/25"
                                : "text-amber-500 bg-amber-500/10 border-amber-500/25"
                            )}
                            title={`${ent.isPrimary ? 'Primary Target' : 'Co-Conspirator / Associated'}: ${ent.name} (${ent.id})`}
                          >
                            <User className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>{ent.name}</span>
                            {ent.name !== ent.id && (
                              <span className="text-[10px] font-mono opacity-70">({ent.id})</span>
                            )}
                            {ent.role && (
                              <span className="text-[9px] uppercase tracking-wider px-1 bg-background/60 rounded font-semibold text-muted-foreground">
                                {ent.role}
                              </span>
                            )}
                            {ent.aliases && ent.aliases.length > 0 && (
                              <span className="text-[10px] italic opacity-80">
                                &quot;{ent.aliases[0]}&quot;
                              </span>
                            )}
                          </span>
                        ));
                      })()}
                    </div>

                    {/* Factual Headline */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                          {a.type ? a.type.replace(/_/g, ' ') : 'INVESTIGATIVE ANOMALY'}
                        </span>
                        <span className="text-xs text-muted-foreground font-mono">ID: {a.id}</span>
                      </div>
                      <h3 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors leading-snug">
                        {a.title || `${a.type} Anomaly Detected`}
                      </h3>
                    </div>

                    {/* Layer 1: What Happened (Multi-paragraph plain English) */}
                    <div className="text-xs text-foreground/90 leading-relaxed font-medium bg-secondary/30 p-3.5 rounded-lg border border-border/50 whitespace-pre-line space-y-2">
                      <div>
                        <span className="font-bold text-primary mr-1.5 uppercase text-[10px] tracking-wider bg-primary/10 px-1.5 py-0.5 rounded">
                          What Happened
                        </span>
                      </div>
                      <div className="leading-relaxed">
                        {whatHappened}
                      </div>
                    </div>

                    {/* Inter-Entity Activities & Links Strip */}
                    {a.entityInteractions && a.entityInteractions.length > 0 && (
                      <div className="bg-primary/5 rounded-lg p-2.5 border border-primary/15 space-y-1.5">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                          <Activity className="w-3 h-3" />
                          <span>Detected Inter-Entity Activities & Transfers ({a.entityInteractions.length})</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {a.entityInteractions.slice(0, 3).map((act, idx) => (
                            <div
                              key={idx}
                              className="text-[11px] bg-card px-2.5 py-1 rounded border border-border flex items-center gap-1.5 shadow-2xs"
                            >
                              <span className="font-semibold text-foreground">{act.source_entity}</span>
                              <span className="text-primary font-bold">➔</span>
                              <span className="text-muted-foreground text-[10px] bg-secondary px-1.5 py-0.5 rounded">
                                {act.description || act.interaction_type}
                              </span>
                              <span className="text-primary font-bold">➔</span>
                              <span className="font-semibold text-foreground">{act.target_entity}</span>
                              {act.amount_inr && (
                                <span className="text-[10px] font-mono text-emerald-500 font-bold ml-1">
                                  ₹{act.amount_inr.toLocaleString()}
                                </span>
                              )}
                            </div>
                          ))}
                          {a.entityInteractions.length > 3 && (
                            <span className="text-[10px] font-semibold text-muted-foreground self-center">
                              +{a.entityInteractions.length - 3} more activity link(s)
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Layer 2: Why Unusual & Why Relevant */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                      {a.whyUnusual && (
                        <div className="bg-secondary/20 p-2 rounded border border-border/40">
                          <span className="font-bold text-foreground">Why Unusual: </span>
                          <span className="whitespace-pre-line">{a.whyUnusual}</span>
                        </div>
                      )}
                      {a.whyRelevant && (
                        <div className="bg-secondary/20 p-2 rounded border border-border/40">
                          <span className="font-bold text-foreground">Why Relevant: </span>
                          <span className="whitespace-pre-line">{a.whyRelevant}</span>
                        </div>
                      )}
                    </div>

                    {/* Supporting Evidence Strip */}
                    <div className="flex flex-wrap items-center gap-4 pt-1 text-[11px] text-muted-foreground border-t border-border/40">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold uppercase text-muted-foreground">Lenses:</span>
                        {detectorList.slice(0, 4).map((det, i) => (
                          <span
                            key={i}
                            className="font-mono bg-secondary px-2 py-0.5 rounded border border-border text-foreground font-semibold"
                          >
                            {det.replace('DET-', '')}
                          </span>
                        ))}
                        {detectorList.length > 4 && (
                          <span className="font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                            +{detectorList.length - 4}
                          </span>
                        )}
                      </div>

                      {a.supportingEvents && a.supportingEvents.length > 0 && (
                        <div className="flex items-center gap-1 text-emerald-500 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{a.supportingEvents.length} Verified Events</span>
                        </div>
                      )}

                      {a.evidence_refs && a.evidence_refs.length > 0 && (
                        <div className="flex items-center gap-1 font-mono text-muted-foreground">
                          <Hash className="w-3 h-3 text-primary" />
                          <span>{a.evidence_refs.length} Evidence Hash(es)</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Score & Deep Action */}
                  <div className="flex items-center gap-5 border-t md:border-t-0 md:border-l border-border pt-4 md:pt-0 md:pl-6 justify-between md:justify-end flex-shrink-0">
                    <div className="text-right">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Anomaly Score
                      </div>
                      <div className={cn(
                        "text-3xl font-black",
                        a.severity === 'CRITICAL' ? 'text-destructive' :
                        a.severity === 'HIGH' ? 'text-orange-500' :
                        a.severity === 'MEDIUM' ? 'text-amber-500' : 'text-blue-500'
                      )}>
                        {a.score?.toFixed(0) || '0'}
                        <span className="text-xs font-bold text-muted-foreground">/100</span>
                      </div>
                      {a.confidence && (
                        <div className="text-[10px] font-mono text-muted-foreground">
                          Conf: {(a.confidence * 100).toFixed(0)}%
                        </div>
                      )}
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAnomalySelect(a);
                      }}
                      className="px-3.5 py-2.5 bg-primary text-primary-foreground text-xs font-bold rounded-xl hover:bg-primary/90 transition-all shadow-sm flex items-center gap-1.5"
                      title="Open Deep Investigation Finding"
                    >
                      <span>Investigate</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : viewMode === 'signals' ? (
        /* RAW SIGNALS STREAM VIEW (For Auditing & Model Inspection) */
        <div className="flex-1 space-y-3">
          <div className="p-3 bg-secondary/50 rounded-xl border border-border text-xs text-muted-foreground flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-amber-500 animate-pulse" />
              <span>Diagnostic Raw Signals Stream: Inspect uncalibrated machine observations emitted by detection lenses.</span>
            </div>
            <span className="font-mono font-bold text-foreground">{filteredSignals.length} signals</span>
          </div>

          {filteredSignals.length === 0 ? (
            <div className="p-12 text-center text-xs text-muted-foreground border-2 border-dashed border-border rounded-xl">
              No raw signals recorded for this case. Run analysis to populate the stream.
            </div>
          ) : (
            filteredSignals.map((s, idx) => (
              <div key={idx} className="bg-card border border-border p-4 rounded-xl text-xs space-y-2 font-mono">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-foreground bg-secondary px-2 py-0.5 rounded">
                      {s.detector_id}
                    </span>
                    <span className="text-primary font-bold">
                      {s.pattern_type}
                    </span>
                    <span className="text-muted-foreground">
                      Domain: {s.domain}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">
                      Norm Score: <strong className="text-foreground">{s.normalized_score}</strong>
                    </span>
                    <span className="text-muted-foreground">
                      Conf: <strong className="text-emerald-500">{(s.confidence * 100).toFixed(0)}%</strong>
                    </span>
                    <span className="text-[10px] uppercase font-bold bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">
                      {s.status}
                    </span>
                  </div>
                </div>

                <div className="text-[11px] text-muted-foreground bg-secondary/30 p-2 rounded">
                  <span className="font-bold text-foreground">Observations: </span>
                  {JSON.stringify(s.observations)}
                </div>

                <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                  <span>Entities: {s.entity_refs?.join(', ') || 'N/A'}</span>
                  <span>Events: {s.event_refs?.length || 0}</span>
                  <span>Evidence: {s.evidence_refs?.length || 0}</span>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* AUTOMATED CEP ALERTS VIEW (Feature 8) */
        <div className="flex-1 space-y-4">
          {/* Status Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-card border border-border rounded-xl shadow-xs">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Status:</span>
              <div className="flex items-center gap-1 bg-secondary/70 p-0.5 rounded-lg border border-border">
                {['ALL', 'PENDING', 'INVESTIGATING', 'ASSIGNED', 'DISMISSED'].map(st => (
                  <button
                    key={st}
                    onClick={() => setSelectedAlertStatus(st)}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer",
                      selectedAlertStatus === st
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-bold text-foreground">{alerts.length}</span> Active Alerts in Case
            </div>
          </div>

          {/* Alerts List */}
          {alertsLoading ? (
            <div className="p-12 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span>Querying CEP sliding-window triggers...</span>
            </div>
          ) : alerts.length === 0 ? (
            <div className="p-12 text-center space-y-3 bg-secondary/20 border-2 border-dashed border-border rounded-2xl">
              <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-500 mx-auto flex items-center justify-center">
                <Zap className="w-6 h-6" />
              </div>
              <div className="text-sm font-bold text-foreground">No Automated CEP Alerts Active</div>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                No cross-domain burst collisions or spatio-temporal jumps are currently flagged under status '{selectedAlertStatus}'.
              </p>
              <button
                type="button"
                onClick={handleEvaluateAlerts}
                disabled={isEvaluatingAlerts}
                className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer"
              >
                Run Multi-Source CEP Evaluation
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {alerts.map(a => (
                <AlertTriageCard
                  key={a.alert_id}
                  alert={a}
                  onTriage={handleTriageAlert}
                  onPivotToGraph={onPivotToGraph}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export { AnomaliesTab };
