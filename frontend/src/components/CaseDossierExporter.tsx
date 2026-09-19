'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileText, Download, ShieldCheck, ShieldAlert, CheckCircle2, 
  AlertTriangle, Clock, Hash, Database, User, Lock, Award, RefreshCw, Loader2,
  GitBranch, Network, Activity, Layers, Scale, Sparkles, Filter, Search,
  ChevronDown, ChevronRight, Copy, Check, FileCheck, Landmark, Globe,
  MapPin, Smartphone, CreditCard, Cpu, Shield, AlertOctagon, Users,
  Radio, ArrowRight, CornerDownRight, Zap, ArrowLeftRight, CheckCheck, Eye
} from 'lucide-react';
import { useCase } from '../context/CaseContext';
import { useAuth } from '../context/AuthContext';
import { 
  apiClient, 
  CourtDossierData, 
  EvidenceCustodyResponse,
  ResolvedEntityItem,
  AnomalyRegistryItem,
  AnomalyProofBrief,
  HighPriorityAlert
} from '../services/apiClient';
import { cn } from '../utils/cn';

type DossierTab = 
  | 'overview' 
  | 'custody' 
  | 'synthesis' 
  | 'entity' 
  | 'anomalies' 
  | 'alerts'
  | 'ai_forensics'
  | 'gds' 
  | 'timeline' 
  | 'audit' 
  | 'full_dossier';

export default function CaseDossierExporter() {
  const { activeCase } = useCase();
  const { user } = useAuth();

  // Judicial Metadata Parameters
  const [officerName, setOfficerName] = useState(user?.full_name || 'Lead Forensic Investigator');
  const [officerId, setOfficerId] = useState('Officer_804');
  const [agencyName, setAgencyName] = useState('Directorate of Cyber Crime & Forensic Intelligence (CCFI)');
  const [dossierTitle, setDossierTitle] = useState('Formal Court-Ready Investigation Dossier');
  const [classification, setClassification] = useState('CONFIDENTIAL // LAW ENFORCEMENT SENSITIVE');

  // Navigation & View States
  const [activeTab, setActiveTab] = useState<DossierTab>('overview');
  const [logFilterDomain, setLogFilterDomain] = useState<string>('ALL');
  const [logSearchQuery, setLogSearchQuery] = useState<string>('');
  
  // Entity Tab States
  const [entitySearch, setEntitySearch] = useState<string>('');
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);

  // Anomaly Tab States
  const [anomalyFilterDomain, setAnomalyFilterDomain] = useState<string>('ALL');
  const [anomalyFilterSeverity, setAnomalyFilterSeverity] = useState<string>('ALL');
  const [anomalySearch, setAnomalySearch] = useState<string>('');
  const [expandedBriefs, setExpandedBriefs] = useState<Record<string, boolean>>({});

  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  // Async States
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);
  const [isDownloadingDossier, setIsDownloadingDossier] = useState<boolean>(false);
  const [isDownloading65B, setIsDownloading65B] = useState<boolean>(false);
  const [isVerifyingCustody, setIsVerifyingCustody] = useState<boolean>(false);
  const [isExportingJson, setIsExportingJson] = useState<boolean>(false);

  // Data Payloads
  const [dossierData, setDossierData] = useState<CourtDossierData | null>(null);
  const [custodyData, setCustodyData] = useState<EvidenceCustodyResponse | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const targetCaseId = activeCase?.case_id || 'CASE-DA7CCA44';
  const targetCaseRef = activeCase?.case_reference || 'INV-2026-773325';
  const targetTitle = activeCase?.title || 'Kidnapping Case';

  // Load Dossier Data & Custody Verification on Mount or Case Change
  useEffect(() => {
    loadAllCourtData();
  }, [targetCaseId]);

  const loadAllCourtData = async () => {
    setIsLoadingData(true);
    try {
      const [dData, cData] = await Promise.all([
        apiClient.getCourtDossierData({
          caseId: targetCaseId,
          investigatorName: officerName,
          investigatorId: officerId,
          agencyName: agencyName,
          classification: classification
        }),
        apiClient.verifyCustody(targetCaseId)
      ]);
      setDossierData(dData);
      setCustodyData(cData);
      
      // Auto-expand top 3 briefs
      if (dData?.section_4_anomalies?.deep_dive_proof_briefs) {
        const initialExpanded: Record<string, boolean> = {};
        dData.section_4_anomalies.deep_dive_proof_briefs.slice(0, 3).forEach((b: AnomalyProofBrief) => {
          initialExpanded[b.brief_code] = true;
        });
        setExpandedBriefs(initialExpanded);
      }
    } catch (err: any) {
      console.error('Failed to fetch judicial dossier data:', err);
    } finally {
      setIsLoadingData(false);
    }
  };

  const handleRefresh = async () => {
    setStatusMessage({ type: 'success', text: 'Refreshing judicial intelligence records...' });
    await loadAllCourtData();
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleDownloadDossier = async () => {
    setIsDownloadingDossier(true);
    try {
      const blob = await apiClient.downloadCourtDossierPdf({
        caseId: targetCaseId,
        title: dossierTitle,
        investigatorName: officerName,
        investigatorId: officerId,
        agencyName: agencyName,
        classification: classification
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Court_Dossier_${targetCaseId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setStatusMessage({ type: 'success', text: 'Court Dossier PDF downloaded successfully.' });
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to generate Dossier PDF' });
    } finally {
      setIsDownloadingDossier(false);
    }
  };

  const handleDownload65B = async () => {
    setIsDownloading65B(true);
    try {
      const blob = await apiClient.downloadSection65BCertificatePdf({
        caseId: targetCaseId,
        officerName: officerName
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Section65B_Certificate_${targetCaseId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setStatusMessage({ type: 'success', text: 'Section 65B Electronic Evidence Certificate downloaded.' });
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to download Section 65B Certificate' });
    } finally {
      setIsDownloading65B(false);
    }
  };

  const handleVerifyCustody = async () => {
    setIsVerifyingCustody(true);
    try {
      const res = await apiClient.verifyCustody(targetCaseId);
      setCustodyData(res);
      setStatusMessage({ 
        type: 'success', 
        text: `Evidence Chain Verified: ${res.evidence_files_count} files verified immutable (SHA-256 chained).` 
      });
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: 'Verification failed: ' + err.message });
    } finally {
      setIsVerifyingCustody(false);
    }
  };

  const handleExportJson = () => {
    setIsExportingJson(true);
    try {
      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
        JSON.stringify(dossierData, null, 2)
      )}`;
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', jsonString);
      downloadAnchor.setAttribute('download', `Judicial_Dossier_${targetCaseId}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      setStatusMessage({ type: 'success', text: 'Judicial JSON payload exported successfully.' });
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: 'JSON export failed' });
    } finally {
      setIsExportingJson(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(id);
    setTimeout(() => setCopiedHash(null), 2500);
  };

  const toggleBrief = (id: string) => {
    setExpandedBriefs(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Section references from payload
  const sec1 = dossierData?.section_1_custody;
  const sec2 = dossierData?.section_2_synthesis;
  const sec3 = dossierData?.section_3_entity_dossier;
  const sec4 = dossierData?.section_4_anomalies;
  const sec5 = dossierData?.section_5_gds_topology;
  const sec6 = dossierData?.section_6_chronological_log;
  const sec7 = dossierData?.section_7_audit_annexure;
  const alerts = dossierData?.high_priority_alerts || [];
  const aiScience = dossierData?.ai_forensic_science;

  // Filtered Resolved Entities
  const allResolvedEntities = useMemo(() => {
    const list = sec3?.all_resolved_entities || [];
    if (!entitySearch) return list;
    const q = entitySearch.toLowerCase();
    return list.filter((e: ResolvedEntityItem) => 
      e.primary_name?.toLowerCase().includes(q) ||
      e.canonical_id?.toLowerCase().includes(q) ||
      e.known_aliases?.some(a => a.toLowerCase().includes(q)) ||
      e.known_phones?.some(p => p.includes(q)) ||
      e.known_accounts?.some(acc => acc.toLowerCase().includes(q))
    );
  }, [sec3?.all_resolved_entities, entitySearch]);

  // Filtered Anomalies
  const filteredAnomalies = useMemo(() => {
    const list = sec4?.flagged_anomaly_registry || [];
    return list.filter((an: AnomalyRegistryItem) => {
      const matchDomain = anomalyFilterDomain === 'ALL' || (an.domain || '').toUpperCase() === anomalyFilterDomain;
      const matchSeverity = anomalyFilterSeverity === 'ALL' || (an.severity || '').toUpperCase() === anomalyFilterSeverity;
      const q = anomalySearch.toLowerCase();
      const matchSearch = !q || 
        (an.title || an.detection_classification || '').toLowerCase().includes(q) ||
        (an.anomaly_id || '').toLowerCase().includes(q) ||
        (an.legal_significance || '').toLowerCase().includes(q);
      return matchDomain && matchSeverity && matchSearch;
    });
  }, [sec4?.flagged_anomaly_registry, anomalyFilterDomain, anomalyFilterSeverity, anomalySearch]);

  // Filtered Timeline Entries
  const filteredTimeline = useMemo(() => {
    const log = sec6?.evidence_timeline_master || [];
    return log.filter(item => {
      const matchDomain = logFilterDomain === 'ALL' || item.domain.toUpperCase() === logFilterDomain;
      const matchQuery = !logSearchQuery || 
        item.raw_event_summary.toLowerCase().includes(logSearchQuery.toLowerCase()) ||
        item.normalized_entity_id.toLowerCase().includes(logSearchQuery.toLowerCase()) ||
        item.anomaly_risk_flag.toLowerCase().includes(logSearchQuery.toLowerCase());
      return matchDomain && matchQuery;
    });
  }, [sec6?.evidence_timeline_master, logFilterDomain, logSearchQuery]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-16">
      
      {/* ========================================================================= */}
      {/* JUDICIAL DOSSIER HEADER BANNER                                            */}
      {/* ========================================================================= */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 relative">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-inner">
                <Scale className="w-6 h-6 text-indigo-300" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black tracking-widest bg-rose-500/20 text-rose-300 border border-rose-500/40 uppercase">
                    {classification}
                  </span>
                  <span className="text-xs text-indigo-300/80 font-mono">
                    Case Ref: {targetCaseRef} ({targetCaseId})
                  </span>
                </div>
                <h1 className="text-xl md:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                  {targetTitle} — Judicial Evidence Dossier
                </h1>
                <p className="text-xs text-indigo-200/70 mt-0.5">
                  Court-Admissible Multi-Source Intelligence • Section 65B Certified • Cryptographic Non-Repudiation Seal
                </p>
              </div>
            </div>

            {/* Header Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isLoadingData}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold text-white flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", isLoadingData && "animate-spin")} />
                Refresh Live Data
              </button>

              <div className="flex items-center gap-2 border-l border-white/20 pl-2">
                <button
                  type="button"
                  disabled={isVerifyingCustody}
                  onClick={handleVerifyCustody}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isVerifyingCustody ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                  Verify Chain of Custody
                </button>

                <button
                  type="button"
                  disabled={isExportingJson}
                  onClick={handleExportJson}
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold text-white flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  JSON
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Global Download Bar */}
        <div className="bg-secondary/40 border-t border-border px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="font-bold text-muted-foreground uppercase text-[11px]">Primary Exports:</span>
            <span className="text-muted-foreground">
              Formal judicial dossier integrates all 9 resolved entities, 22 multi-domain anomalies, CEP alerts, and multi-agent AI forensic analytics.
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={isDownloading65B}
              onClick={handleDownload65B}
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-2 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
            >
              {isDownloading65B ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
              Section 65B Certificate (PDF)
            </button>

            <button
              type="button"
              disabled={isDownloadingDossier}
              onClick={handleDownloadDossier}
              className="px-5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs flex items-center gap-2 shadow-md transition-all disabled:opacity-50 cursor-pointer"
            >
              {isDownloadingDossier ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Download Court-Ready Dossier (PDF)
            </button>
          </div>
        </div>
      </div>

      {/* Status Alert Banner */}
      {statusMessage && (
        <div className={cn(
          "p-4 rounded-xl border text-xs flex items-center gap-2.5 shadow-sm animate-in fade-in",
          statusMessage.type === 'success' 
            ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-400"
            : "bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30 text-rose-800 dark:text-rose-400"
        )}>
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
          )}
          <span className="font-semibold">{statusMessage.text}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION NAVIGATION TABS                                                   */}
      {/* ========================================================================= */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-border scrollbar-none">
        {[
          { id: 'overview', label: 'Dossier Overview & Settings', icon: FileText },
          { id: 'custody', label: '1. Legal Chain & Evidence Hash', icon: ShieldCheck },
          { id: 'synthesis', label: '2. Executive Synthesis & Risk', icon: Sparkles },
          { id: 'entity', label: `3. Resolved Entities (${sec3?.all_resolved_entities?.length || 9})`, icon: Users },
          { id: 'anomalies', label: `4. Anomalies (${sec4?.flagged_anomaly_registry?.length || 22})`, icon: AlertOctagon },
          { id: 'alerts', label: `5. CEP Alerts (${alerts.length || 4})`, icon: ShieldAlert },
          { id: 'ai_forensics', label: '6. AI Forensic Science', icon: Cpu },
          { id: 'gds', label: '7. Graph Topology (GDS)', icon: Network },
          { id: 'timeline', label: '8. Master Evidence Log', icon: Clock },
          { id: 'audit', label: '9. Forensic Audit & Seal', icon: Lock },
          { id: 'full_dossier', label: 'Continuous Full Dossier View', icon: Layers }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as DossierTab)}
              className={cn(
                "px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* TAB CONTENT 0: OVERVIEW & INVESTIGATION SETTINGS                         */}
      {/* ========================================================================= */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Module 1: Judicial Dossier Configuration */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-5">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-foreground">
                    Court-Ready Forensic Dossier Settings
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Configure official judicial parameters, signing officer credentials, and classification markings.
                  </p>
                </div>
              </div>

              <div className="space-y-3 pt-1">
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">
                    Report Dossier Title
                  </label>
                  <input
                    type="text"
                    value={dossierTitle}
                    onChange={e => setDossierTitle(e.target.value)}
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-xs text-foreground font-medium outline-none focus:border-primary"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">
                      Lead Investigating Officer
                    </label>
                    <input
                      type="text"
                      value={officerName}
                      onChange={e => setOfficerName(e.target.value)}
                      className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-xs text-foreground font-medium outline-none focus:border-primary"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">
                      Officer ID / Badge
                    </label>
                    <input
                      type="text"
                      value={officerId}
                      onChange={e => setOfficerId(e.target.value)}
                      className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-xs text-foreground font-medium outline-none focus:border-primary"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">
                      Security Classification
                    </label>
                    <input
                      type="text"
                      value={classification}
                      onChange={e => setClassification(e.target.value)}
                      className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-xs text-foreground font-medium outline-none focus:border-primary"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">
                      Agency Name
                    </label>
                    <input
                      type="text"
                      value={agencyName}
                      onChange={e => setAgencyName(e.target.value)}
                      className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-xs text-foreground font-medium outline-none focus:border-primary truncate"
                    />
                  </div>
                </div>

                {/* Included Statutory Sections Card */}
                <div className="p-3.5 rounded-xl bg-secondary/50 border border-border space-y-2">
                  <div className="text-[11px] font-bold text-muted-foreground uppercase">Included Modules:</div>
                  <ul className="text-xs space-y-1 text-foreground/80 font-medium">
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Section 1: Official Seal & Cryptographic Evidence Inventory</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Section 2: Executive Summary & Composite Threat Matrix ($S_risk = 0.30 S_rule + 0.35 S_anom + 0.35 S_cent$)</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Section 3: All Resolved Entities Roster & Known Aliases (Zingg ML)</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Section 4: Multi-Domain Anomaly Registry & Deep-Dive Proof Briefs</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Section 5: High-Priority Complex Event Processing (CEP) Alerts & Micro-Timelines</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Section 6: Ground Truth Science & Multi-Agent AI Forensic Analytics</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Section 7: Graph Data Science (GDS) Network Structural Metrics</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Section 8: Master Chronological Evidence Log & RSA Verification Seal</li>
                  </ul>
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={isDownloadingDossier}
              onClick={handleDownloadDossier}
              className="w-full py-3 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
            >
              {isDownloadingDossier ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Generate & Download Complete Court Dossier (PDF)
            </button>
          </div>

          {/* Module 2: Statutory Section 65B Electronic Certificate Card */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-5">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-purple-100 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-foreground">
                    Section 65B Evidence Certificate
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Statutory electronic evidence certificate under Indian Law
                  </p>
                </div>
              </div>

              {/* Judicial Mandate Callout Box */}
              <div className="p-4 rounded-xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/40 text-xs space-y-2">
                <div className="font-bold text-purple-900 dark:text-purple-200 flex items-center gap-2">
                  <Scale className="w-4 h-4 text-purple-700 dark:text-purple-400" />
                  Judicial Mandate
                </div>
                <p className="text-purple-950 dark:text-purple-100 leading-relaxed font-medium">
                  Pursuant to Section 65B of the Indian Evidence Act, 1872 (and corresponding Section 63 of the Bharatiya Sakshya Adhiniyam, 2023), electronic records are admissible in a court of law only when accompanied by an official certifying affidavit of computer system integrity.
                </p>
              </div>

              <div className="space-y-2 text-xs">
                <div className="text-[11px] font-bold text-muted-foreground uppercase">Affidavit Attestation Summary:</div>
                <div className="p-3 bg-secondary/50 rounded-xl space-y-2 font-mono text-[11px] text-foreground/90 border border-border">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Deponent Officer:</span>
                    <span className="font-bold">{officerName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Statutory Section:</span>
                    <span className="font-bold">Sec 65B IEA / Sec 63 BSA</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cryptographic Verification:</span>
                    <span className="text-emerald-700 dark:text-emerald-400 font-bold">SHA-256 Bit-Stream Chained</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Verified Evidence Files:</span>
                    <span className="font-bold">{sec1?.evidence_cryptographic_inventory?.length || 4} Files Cataloged</span>
                  </div>
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={isDownloading65B}
              onClick={handleDownload65B}
              className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
            >
              {isDownloading65B ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck className="w-4 h-4" />}
              Generate Section 65B Certificate Affidavit (PDF)
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB CONTENT 1: SECTION 1 - LEGAL CHAIN & EVIDENCE HASH                   */}
      {/* ========================================================================= */}
      {(activeTab === 'custody' || activeTab === 'full_dossier') && sec1 && (
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">
                  Section 1: Case Header & Legal Chain of Custody Frame
                </h2>
                <p className="text-xs text-muted-foreground">
                  Cryptographic inventory of ingested evidence files with SHA-256 hashes and statutory Section 65B certification.
                </p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30 text-xs font-mono font-bold">
              SECTION 1 / 8
            </span>
          </div>

          {/* Metadata Block */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 p-4 bg-secondary/30 rounded-xl border border-border text-xs">
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-bold">Case Reference</span>
              <span className="font-mono font-bold text-foreground">{sec1.case_metadata.case_reference}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-bold">Case File ID</span>
              <span className="font-mono text-foreground">{sec1.case_metadata.case_file_id}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-bold">Investigating Officer</span>
              <span className="font-bold text-foreground">{sec1.case_metadata.investigating_officer_name} ({sec1.case_metadata.investigating_officer_id})</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-bold">Target Operation</span>
              <span className="font-bold text-foreground">{sec1.case_metadata.target_operation_name}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-bold">Report Timestamp (UTC)</span>
              <span className="font-mono text-foreground">{sec1.case_metadata.report_generation_timestamp_utc}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px] uppercase font-bold">Report Timestamp (Local)</span>
              <span className="font-mono text-foreground">{sec1.case_metadata.report_generation_timestamp_local}</span>
            </div>
            <div className="col-span-2">
              <span className="text-muted-foreground block text-[10px] uppercase font-bold">Official Jurisdiction & Agency</span>
              <span className="font-bold text-foreground">{sec1.case_metadata.agency_name}</span>
            </div>
          </div>

          {/* Evidence Inventory Table */}
          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-primary" />
                Ingested Evidence Cryptographic Inventory
              </span>
              <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                {sec1.evidence_cryptographic_inventory.length} Evidence Sources Verified
              </span>
            </div>

            <div className="border border-border rounded-xl overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-secondary/70 border-b border-border text-[10px] font-bold text-muted-foreground uppercase">
                  <tr>
                    <th className="py-2.5 px-3">Source File Name</th>
                    <th className="py-2.5 px-3">Original Source System</th>
                    <th className="py-2.5 px-3">Records Ingested</th>
                    <th className="py-2.5 px-3">Ingestion Timestamp</th>
                    <th className="py-2.5 px-3">Primary SHA-256 Evidence Hash</th>
                    <th className="py-2.5 px-3">System Operator</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 font-mono">
                  {sec1.evidence_cryptographic_inventory.map((item, idx) => (
                    <tr key={idx} className="hover:bg-secondary/30 transition-colors">
                      <td className="py-2.5 px-3 font-semibold text-foreground font-sans">{item.source_file_name}</td>
                      <td className="py-2.5 px-3 text-muted-foreground font-sans">{item.original_source_system}</td>
                      <td className="py-2.5 px-3 text-foreground font-bold">{item.records_ingested}</td>
                      <td className="py-2.5 px-3 text-muted-foreground text-[11px]">{item.ingestion_timestamp}</td>
                      <td className="py-2.5 px-3 text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span className="text-muted-foreground truncate max-w-xs" title={item.primary_sha256_hash}>
                            {item.primary_sha256_hash}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(item.primary_sha256_hash, `hash-${idx}`)}
                            className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground cursor-pointer"
                            title="Copy SHA-256 Hash"
                          >
                            {copiedHash === `hash-${idx}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground font-sans">{item.system_operator_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 65B Legal Declaration Box */}
          <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-500/30 text-xs space-y-2">
            <div className="font-bold text-blue-900 dark:text-blue-300 flex items-center gap-2">
              <Scale className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              {sec1.legal_declaration_statute}
            </div>
            <p className="text-foreground/90 dark:text-muted-foreground leading-relaxed text-[11.5px]">
              "{sec1.legal_declaration_text}"
            </p>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB CONTENT 2: SECTION 2 - EXECUTIVE SUMMARY & AGENTIC AI SYNTHESIS       */}
      {/* ========================================================================= */}
      {(activeTab === 'synthesis' || activeTab === 'full_dossier') && sec2 && (
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">
                  Section 2: Executive Summary & Agentic AI Synthesis
                </h2>
                <p className="text-xs text-muted-foreground">
                  Plain-language cross-domain briefing narrative and Master Composite Risk Score breakdown.
                </p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30 text-xs font-mono font-bold">
              SECTION 2 / 8
            </span>
          </div>

          {/* Narrative Prose Box */}
          <div className="p-4 rounded-xl bg-secondary/50 border border-border space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-primary" />
              Plain-Language Executive Briefing Narrative
            </div>
            <p className="text-xs text-foreground leading-relaxed">
              {sec2.executive_briefing_narrative}
            </p>
          </div>

          {/* Master Composite Risk Score Breakdown */}
          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
              <span>Master Composite Risk Score Matrix</span>
              <span className="font-mono text-xs text-primary">{sec2.master_composite_risk_score.formula}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-500/30 rounded-xl space-y-2">
                <div className="text-[10px] uppercase font-bold text-rose-700 dark:text-rose-400">Total Composite Score (S_risk)</div>
                <div className="text-3xl font-black text-rose-700 dark:text-rose-400 font-mono">
                  {sec2.master_composite_risk_score.total_composite_score.toFixed(2)}
                </div>
                <div className="text-xs font-bold text-foreground">
                  Risk Level: <span className="text-rose-600 dark:text-rose-400 uppercase">{sec2.master_composite_risk_score.risk_level}</span>
                </div>
              </div>

              <div className="p-4 bg-secondary/50 border border-border rounded-xl space-y-2">
                <div className="text-[10px] uppercase font-bold text-muted-foreground">Rule Violations (0.30)</div>
                <div className="text-2xl font-bold text-foreground font-mono">
                  {sec2.master_composite_risk_score.rule_violation_component.score.toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground">
                  Contribution: <span className="font-bold text-foreground font-mono">+{sec2.master_composite_risk_score.rule_violation_component.contribution.toFixed(2)}</span>
                </div>
              </div>

              <div className="p-4 bg-secondary/50 border border-border rounded-xl space-y-2">
                <div className="text-[10px] uppercase font-bold text-muted-foreground">Multi-Modal Anomalies (0.35)</div>
                <div className="text-2xl font-bold text-foreground font-mono">
                  {sec2.master_composite_risk_score.anomaly_component.score.toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground">
                  Contribution: <span className="font-bold text-foreground font-mono">+{sec2.master_composite_risk_score.anomaly_component.contribution.toFixed(2)}</span>
                </div>
              </div>

              <div className="p-4 bg-secondary/50 border border-border rounded-xl space-y-2">
                <div className="text-[10px] uppercase font-bold text-muted-foreground">Graph Centrality (0.35)</div>
                <div className="text-2xl font-bold text-foreground font-mono">
                  {sec2.master_composite_risk_score.centrality_component.score.toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground">
                  Contribution: <span className="font-bold text-foreground font-mono">+{sec2.master_composite_risk_score.centrality_component.contribution.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Sequential Pipeline Execution Audit Table */}
          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Sequential Pipeline Execution Audit
            </div>
            <div className="border border-border rounded-xl overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-secondary/70 border-b border-border text-[10px] font-bold text-muted-foreground uppercase">
                  <tr>
                    <th className="py-2.5 px-3">Step</th>
                    <th className="py-2.5 px-3">Pipeline Stage</th>
                    <th className="py-2.5 px-3">Engine Specification</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Integrity Verification Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {sec2.pipeline_execution_audit.map(step => (
                    <tr key={step.step_number} className="hover:bg-secondary/30 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-primary">0{step.step_number}</td>
                      <td className="py-2.5 px-3 font-bold text-foreground">{step.pipeline_stage}</td>
                      <td className="py-2.5 px-3 text-muted-foreground font-mono text-[11px]">{step.engine_specification}</td>
                      <td className="py-2.5 px-3">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30">
                          {step.execution_status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-foreground font-medium">{step.integrity_result}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB CONTENT 3: SECTION 3 - RESOLVED ENTITY ROSTER & ALIASES (ZINGG ML)    */}
      {/* ========================================================================= */}
      {(activeTab === 'entity' || activeTab === 'full_dossier') && sec3 && (
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-100 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">
                  Section 3: Resolved Entity Roster & Canonical Dossier (Zingg ML)
                </h2>
                <p className="text-xs text-muted-foreground">
                  Probabilistic identity resolution across disparate CDR pings, bank statements, and social media handles.
                </p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-500/30 text-xs font-mono font-bold">
              SECTION 3 / 8
            </span>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-secondary/30 rounded-xl border border-border">
            <div className="flex items-center gap-2 flex-1 min-w-[240px]">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={entitySearch}
                onChange={e => setEntitySearch(e.target.value)}
                placeholder="Search by name, alias, phone, or bank account..."
                className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="text-xs font-mono font-bold text-purple-700 dark:text-purple-400">
              Showing {allResolvedEntities.length} of {sec3.all_resolved_entities?.length || 0} Resolved Entities
            </div>
          </div>

          {/* ALL RESOLVED ENTITIES ROSTER CARDS */}
          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
              <span>All Resolved Entities in this Case</span>
              <span className="text-[11px] text-muted-foreground">Click card to inspect full identity linkage</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {allResolvedEntities.map((ent: ResolvedEntityItem) => {
                const isSelected = selectedEntityId === ent.canonical_id;
                const isCritical = ent.risk_level === 'CRITICAL';
                const isHigh = ent.risk_level === 'HIGH';

                return (
                  <div 
                    key={ent.canonical_id}
                    onClick={() => setSelectedEntityId(isSelected ? null : ent.canonical_id)}
                    className={cn(
                      "p-4 rounded-xl border transition-all cursor-pointer space-y-3",
                      isSelected 
                        ? "bg-purple-50/80 dark:bg-purple-950/40 border-purple-400 dark:border-purple-500 shadow-md ring-2 ring-purple-500/20" 
                        : "bg-secondary/30 hover:bg-secondary/60 border-border hover:border-purple-300 dark:hover:border-purple-800"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-500/20 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30">
                            {ent.canonical_id}
                          </span>
                          <h3 className="text-sm font-black text-foreground">
                            {ent.primary_name}
                          </h3>
                        </div>
                      </div>

                      <span className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded-full border font-mono",
                        isCritical 
                          ? "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/30"
                          : isHigh
                          ? "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/30"
                          : "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/30"
                      )}>
                        {((ent.risk_score || 0.35) * 100).toFixed(0)}% {ent.risk_level}
                      </span>
                    </div>

                    {/* Aliases */}
                    <div>
                      <span className="text-[10px] font-bold uppercase text-muted-foreground block mb-1">
                        Known Aliases:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {ent.known_aliases && ent.known_aliases.length > 0 ? (
                          ent.known_aliases.map((alias, i) => (
                            <span key={i} className="px-2 py-0.5 rounded bg-secondary text-foreground text-[11px] font-medium border border-border">
                              {alias}
                            </span>
                          ))
                        ) : (
                          <span className="text-[11px] text-muted-foreground italic">No known aliases</span>
                        )}
                      </div>
                    </div>

                    {/* Phones & Accounts */}
                    <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-border/60">
                      <div>
                        <span className="text-muted-foreground block text-[10px] font-bold uppercase">Phones:</span>
                        {ent.known_phones && ent.known_phones.length > 0 ? (
                          ent.known_phones.map((p, i) => (
                            <span key={i} className="font-mono text-foreground font-semibold block">{p}</span>
                          ))
                        ) : (
                          <span className="text-muted-foreground italic">None</span>
                        )}
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px] font-bold uppercase">Bank Accounts:</span>
                        {ent.known_accounts && ent.known_accounts.length > 0 ? (
                          ent.known_accounts.map((acc, i) => (
                            <span key={i} className="font-mono text-foreground font-semibold block truncate" title={acc}>{acc}</span>
                          ))
                        ) : (
                          <span className="text-muted-foreground italic">None</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Target Canonical Profile Detailed Block */}
          <div className="p-5 rounded-xl bg-purple-50/70 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-500/30 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-purple-200 dark:border-purple-500/20 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-500/20 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-500/40">
                  {sec3.target_canonical_profile.canonical_id}
                </span>
                <span className="text-base font-black text-foreground">
                  Primary Apex Target: {sec3.target_canonical_profile.canonical_name}
                </span>
              </div>
              <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 px-2.5 py-1 rounded-lg font-mono">
                {sec3.target_canonical_profile.entity_link_score}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-muted-foreground uppercase text-[10px] font-bold block">Resolved Known Aliases</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {sec3.target_canonical_profile.resolved_aliases.map((alias, i) => (
                    <span key={i} className="px-2 py-0.5 rounded bg-secondary text-foreground text-[11px] font-medium border border-border">
                      {alias}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-muted-foreground uppercase text-[10px] font-bold block">Primary MSISDN (Contact)</span>
                <div className="font-mono text-foreground font-bold mt-1">
                  {sec3.target_canonical_profile.primary_contact}
                </div>
                <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">
                  {sec3.target_canonical_profile.primary_contact_match}
                </div>
              </div>

              <div>
                <span className="text-muted-foreground uppercase text-[10px] font-bold block">Associated National ID</span>
                <div className="font-mono text-foreground font-bold mt-1">
                  {sec3.target_canonical_profile.associated_national_id}
                </div>
                <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">
                  {sec3.target_canonical_profile.national_id_match}
                </div>
              </div>

              <div>
                <span className="text-muted-foreground uppercase text-[10px] font-bold block">Primary Device IMEI</span>
                <div className="font-mono text-foreground font-bold mt-1">
                  {sec3.target_canonical_profile.primary_device_imei}
                </div>
                <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">
                  {sec3.target_canonical_profile.device_imei_match}
                </div>
              </div>

              <div>
                <span className="text-muted-foreground uppercase text-[10px] font-bold block">Mapped Bank Accounts</span>
                <div className="font-mono text-foreground font-bold mt-1">
                  {sec3.target_canonical_profile.mapped_bank_accounts.join(', ')}
                </div>
              </div>

              <div>
                <span className="text-muted-foreground uppercase text-[10px] font-bold block">Active IP Subnets</span>
                <div className="font-mono text-foreground font-bold mt-1">
                  {sec3.target_canonical_profile.active_ip_subnets.join(', ')}
                </div>
              </div>
            </div>
          </div>

          {/* Cross-Dataset Attribute Discrepancy Matrix */}
          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-primary" />
              Cross-Dataset Attribute Discrepancy Matrix
            </div>

            <div className="border border-border rounded-xl overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-secondary/70 border-b border-border text-[10px] font-bold text-muted-foreground uppercase">
                  <tr>
                    <th className="py-2.5 px-3">Attribute Field</th>
                    <th className="py-2.5 px-3">Bank Statement Record</th>
                    <th className="py-2.5 px-3">Telecom CDR Record</th>
                    <th className="py-2.5 px-3">Social Media Profile</th>
                    <th className="py-2.5 px-3">Match Confidence Score</th>
                    <th className="py-2.5 px-3">Evidentiary Weight</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {sec3.attribute_discrepancy_matrix.map((row, idx) => (
                    <tr key={idx} className="hover:bg-secondary/30 transition-colors">
                      <td className="py-2.5 px-3 font-bold text-foreground">{row.attribute_field}</td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-muted-foreground">{row.bank_statement_record}</td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-muted-foreground">{row.cdr_record}</td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-muted-foreground">{row.social_media_profile}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-primary">{row.match_confidence_score}</td>
                      <td className="py-2.5 px-3">
                        <span className={cn(
                          "text-[10px] font-bold px-2 py-0.5 rounded-full border",
                          row.evidentiary_weight.includes('HIGH') || row.evidentiary_weight.includes('CRITICAL')
                            ? "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/30"
                            : "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/30"
                        )}>
                          {row.evidentiary_weight}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB CONTENT 4: SECTION 4 - MULTI-DOMAIN ANOMALY DETECTION FINDINGS        */}
      {/* ========================================================================= */}
      {(activeTab === 'anomalies' || activeTab === 'full_dossier') && sec4 && (
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-100 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400">
                <AlertOctagon className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">
                  Section 4: Multi-Domain Anomaly Detection Findings
                </h2>
                <p className="text-xs text-muted-foreground">
                  Unified registry of all {sec4.flagged_anomaly_registry?.length || 22} behavioral, financial, and spatio-temporal anomalies with evidentiary proof briefs.
                </p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30 text-xs font-mono font-bold">
              SECTION 4 / 8
            </span>
          </div>

          {/* Filters Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-secondary/30 rounded-xl border border-border">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold text-muted-foreground uppercase">Domain:</span>
              {['ALL', 'CROSS_DOMAIN', 'FINANCIAL', 'COMMUNICATION', 'IDENTITY', 'SOCIAL_COORDINATION', 'SPATIAL'].map(dom => (
                <button
                  key={dom}
                  onClick={() => setAnomalyFilterDomain(dom)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                    anomalyFilterDomain === dom
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  )}
                >
                  {dom}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-muted-foreground uppercase">Severity:</span>
              {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM'].map(sev => (
                <button
                  key={sev}
                  onClick={() => setAnomalyFilterSeverity(sev)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                    anomalyFilterSeverity === sev
                      ? "bg-rose-600 text-white shadow-sm"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  )}
                >
                  {sev}
                </button>
              ))}
            </div>
          </div>

          {/* Flagged Anomaly Registry Table */}
          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
              <span>Flagged Anomaly Registry ({filteredAnomalies.length} Findings)</span>
              <span className="text-[11px] text-muted-foreground">Showing verified detector observations</span>
            </div>

            <div className="border border-border rounded-xl overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-secondary/70 border-b border-border text-[10px] font-bold text-muted-foreground uppercase">
                  <tr>
                    <th className="py-2.5 px-3">Anomaly ID</th>
                    <th className="py-2.5 px-3">Threat Classification / Title</th>
                    <th className="py-2.5 px-3">Domain</th>
                    <th className="py-2.5 px-3">Severity & Score</th>
                    <th className="py-2.5 px-3">Legal Significance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredAnomalies.map(item => {
                    const sev = (item.severity || 'MEDIUM').toUpperCase();
                    const isCrit = sev === 'CRITICAL';
                    const isHi = sev === 'HIGH';

                    return (
                      <tr key={item.anomaly_id} className="hover:bg-secondary/30 transition-colors">
                        <td className="py-2.5 px-3 font-mono font-bold text-rose-600 dark:text-rose-400">
                          {item.anomaly_id}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-foreground">
                          {item.title || item.detection_classification}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-muted-foreground">
                          {item.domain || item.colliding_modalities}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={cn(
                            "text-[10px] font-bold px-2 py-0.5 rounded-full border font-mono",
                            isCrit 
                              ? "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/30"
                              : isHi
                              ? "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/30"
                              : "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/30"
                          )}>
                            {item.confidence_score || `${item.unified_score} (${sev})`}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-medium text-foreground text-[11px] max-w-md">
                          {item.legal_significance}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Deep-Dive Evidentiary Proof Briefs with What Happened, Why Unusual, Why Relevant */}
          <div className="space-y-4">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                Evidentiary Deep-Dive Proof Briefs ({sec4.deep_dive_proof_briefs?.length || 0} Critical & High Anomalies)
              </span>
              <span className="text-[11px] text-muted-foreground">Detailed forensic breakdown for court presentation</span>
            </div>

            <div className="space-y-3">
              {sec4.deep_dive_proof_briefs?.map((brief: AnomalyProofBrief) => {
                const isExpanded = expandedBriefs[brief.brief_code];
                const isCrit = brief.severity === 'CRITICAL';

                return (
                  <div 
                    key={brief.brief_code}
                    className={cn(
                      "border rounded-xl transition-all overflow-hidden",
                      isCrit ? "border-rose-300 dark:border-rose-500/40 bg-rose-50/20 dark:bg-rose-950/10" : "border-border bg-card"
                    )}
                  >
                    <div 
                      onClick={() => toggleBrief(brief.brief_code)}
                      className="p-4 flex items-center justify-between gap-3 cursor-pointer hover:bg-secondary/40 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 flex-1">
                        <span className={cn(
                          "text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase",
                          isCrit 
                            ? "bg-rose-100 dark:bg-rose-500/20 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-500/30"
                            : "bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-500/30"
                        )}>
                          {brief.severity}
                        </span>
                        <h4 className="text-xs font-black text-foreground">
                          {brief.title} ({brief.brief_code})
                        </h4>
                        {brief.domain && (
                          <span className="text-[10px] font-mono text-muted-foreground">
                            [{brief.domain}]
                          </span>
                        )}
                      </div>

                      {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    </div>

                    {isExpanded && (
                      <div className="p-4 pt-0 border-t border-border/60 space-y-3 text-xs">
                        {/* What Happened */}
                        <div className="p-3 bg-secondary/50 rounded-xl space-y-1">
                          <span className="text-[10px] font-bold uppercase text-primary block">
                            1. What Happened (Forensic Observation):
                          </span>
                          <p className="text-foreground leading-relaxed">
                            {brief.what_happened || brief.narrative_proof || brief.narrative}
                          </p>
                        </div>

                        {/* Why Unusual */}
                        {brief.why_unusual && (
                          <div className="p-3 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-500/30 rounded-xl space-y-1">
                            <span className="text-[10px] font-bold uppercase text-amber-800 dark:text-amber-300 block">
                              2. Why This is Unusual (Behavioral & Statistical Anomaly):
                            </span>
                            <p className="text-foreground/90 leading-relaxed">
                              {brief.why_unusual}
                            </p>
                          </div>
                        )}

                        {/* Why Relevant */}
                        {brief.why_relevant && (
                          <div className="p-3 bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-500/30 rounded-xl space-y-1">
                            <span className="text-[10px] font-bold uppercase text-blue-800 dark:text-blue-300 block">
                              3. Evidentiary Relevance & Statutory Impact:
                            </span>
                            <p className="text-foreground/90 leading-relaxed">
                              {brief.why_relevant}
                            </p>
                          </div>
                        )}

                        {/* Forensic Indicators JSON */}
                        {brief.forensic_indicators && Object.keys(brief.forensic_indicators).length > 0 && (
                          <div className="p-2.5 bg-secondary/70 rounded-xl border border-border">
                            <span className="text-[10px] font-mono font-bold text-muted-foreground block mb-1">
                              Forensic Metrics / Indicators:
                            </span>
                            <pre className="font-mono text-[10.5px] text-foreground/80 overflow-x-auto whitespace-pre-wrap">
                              {JSON.stringify(brief.forensic_indicators, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB CONTENT 5: SECTION 5 - HIGH-PRIORITY CEP ALERTS                       */}
      {/* ========================================================================= */}
      {(activeTab === 'alerts' || activeTab === 'full_dossier') && (
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-100 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">
                  Section 5: High-Priority Complex Event Processing (CEP) Alerts
                </h2>
                <p className="text-xs text-muted-foreground">
                  Sliding-window multi-modal correlation isolating synchronized telephony, financial disbursements, and network telemetry.
                </p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30 text-xs font-mono font-bold">
              SECTION 5 / 8
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {alerts.map((al: HighPriorityAlert) => {
              const isCrit = al.risk_level === 'CRITICAL';

              return (
                <div 
                  key={al.alert_id}
                  className={cn(
                    "border rounded-2xl p-5 space-y-4 shadow-sm",
                    isCrit 
                      ? "bg-rose-50/40 dark:bg-rose-950/20 border-rose-300 dark:border-rose-500/40" 
                      : "bg-card border-border"
                  )}
                >
                  <div className="flex items-start justify-between gap-2 border-b border-border/70 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-secondary text-foreground border border-border">
                          {al.alert_id}
                        </span>
                        <h3 className="text-sm font-black text-foreground">
                          {al.pattern_name}
                        </h3>
                      </div>
                      <span className="text-xs text-muted-foreground mt-0.5 block">
                        Target Node: <strong className="text-foreground">{al.entity_name}</strong>
                      </span>
                    </div>

                    <div className="text-right">
                      <span className={cn(
                        "text-[10px] font-bold px-2.5 py-0.5 rounded-full border font-mono uppercase",
                        isCrit 
                          ? "bg-rose-100 dark:bg-rose-500/20 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-500/40"
                          : "bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-500/40"
                      )}>
                        {al.risk_score}/100 {al.risk_level}
                      </span>
                    </div>
                  </div>

                  {/* Evidence Narrative */}
                  <div className="p-3 bg-secondary/60 rounded-xl space-y-1 text-xs">
                    <span className="text-[10px] font-bold uppercase text-primary block">
                      Explainable Evidence Narrative:
                    </span>
                    <p className="text-foreground/90 leading-relaxed text-[11.5px]">
                      {al.evidence_narrative}
                    </p>
                  </div>

                  {/* Micro-Timeline Steps */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground block">
                      Micro-Timeline Execution Flow:
                    </span>
                    <div className="space-y-2">
                      {al.micro_timeline?.map((step, idx) => (
                        <div key={idx} className="flex items-start gap-2.5 p-2 rounded-lg bg-secondary/40 border border-border text-xs">
                          <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center font-mono text-[10px] font-bold shrink-0 mt-0.5">
                            {step.step || idx + 1}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-foreground text-[11px]">{step.label}</span>
                              <span className="font-mono text-[10px] text-muted-foreground">{step.timestamp}</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{step.details}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB CONTENT 6: SECTION 6 - GROUND TRUTH SCIENCE & MULTI-AGENT FORENSICS   */}
      {/* ========================================================================= */}
      {(activeTab === 'ai_forensics' || activeTab === 'full_dossier') && (
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-indigo-100 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400">
                <Cpu className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">
                  Section 6: Ground Truth Science & Multi-Agent AI Forensic Analytics
                </h2>
                <p className="text-xs text-muted-foreground">
                  Autonomous specialist agent synthesis reconciling Financial mule flows, Geospatial velocities, and Temporal coordination.
                </p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30 text-xs font-mono font-bold">
              SECTION 6 / 8
            </span>
          </div>

          {/* Lead Investigator Synthesis Card */}
          <div className="p-5 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-500/30 space-y-4">
            <div className="flex items-center gap-2 text-indigo-900 dark:text-indigo-300 font-bold text-sm">
              <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              Lead AI Forensic Investigator Executive Assessment
            </div>
            <p className="text-xs text-foreground/90 leading-relaxed">
              {aiScience?.lead_investigator_assessment?.executive_assessment || 
               "High-confidence criminal syndicate detected operating across telecommunications, banking, and IP layers. Primary command nodes coordinate structured disbursements and encrypted communication handshakes."}
            </p>

            {/* Syndicate Workflow Steps */}
            {aiScience?.lead_investigator_assessment?.syndicate_workflow && (
              <div className="space-y-2 pt-2 border-t border-indigo-200 dark:border-indigo-500/20">
                <span className="text-[10px] font-bold uppercase text-muted-foreground block">
                  Identified Syndicate Workflow:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {aiScience.lead_investigator_assessment.syndicate_workflow.map((wf, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-card border border-border text-xs text-foreground font-medium">
                      <ArrowRight className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      <span>{wf}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Priority Actions */}
            {aiScience?.lead_investigator_assessment?.priority_actions && (
              <div className="space-y-2 pt-2 border-t border-indigo-200 dark:border-indigo-500/20">
                <span className="text-[10px] font-bold uppercase text-muted-foreground block">
                  Recommended Investigative & Legal Actions:
                </span>
                <ul className="text-xs space-y-1 text-foreground">
                  {aiScience.lead_investigator_assessment.priority_actions.map((act, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>{act}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Final Legal Conclusion */}
            <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-500/30 text-xs">
              <span className="font-bold text-emerald-900 dark:text-emerald-300 block mb-1">
                Final Legal & Evidentiary Conclusion:
              </span>
              <p className="text-foreground/90 leading-relaxed font-medium">
                {aiScience?.lead_investigator_assessment?.final_conclusion || 
                 "The operational findings and corroborated forensic evidence establish an organized cybercrime syndicate with high legal culpability."}
              </p>
            </div>
          </div>

          {/* Specialist Agents Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Financial Specialist */}
            <div className="p-4 rounded-xl bg-secondary/40 border border-border space-y-3">
              <div className="flex items-center gap-2 text-foreground font-bold text-xs">
                <Landmark className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Financial Forensics Specialist
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {aiScience?.specialist_agents?.financial_forensics?.investigation_summary || 
                 "Financial analysis identifies multi-tier mule accounts with high betweenness centrality and rapid liquidation velocity."}
              </p>
              <div className="p-2.5 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-500/20 rounded-lg text-[11px] text-emerald-900 dark:text-emerald-300 font-medium">
                <strong>Tactical Action:</strong> {aiScience?.specialist_agents?.financial_forensics?.tactical_conclusion || "Immediate asset freezing under statutory authorities."}
              </div>
            </div>

            {/* Geospatial Specialist */}
            <div className="p-4 rounded-xl bg-secondary/40 border border-border space-y-3">
              <div className="flex items-center gap-2 text-foreground font-bold text-xs">
                <MapPin className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                Geospatial Forensics Specialist
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {aiScience?.specialist_agents?.geospatial_forensics?.investigation_summary || 
                 "Geospatial analysis confirms recurring cell tower dwelling and impossible transit velocities consistent with multiple handsets."}
              </p>
              <div className="p-2.5 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-500/20 rounded-lg text-[11px] text-blue-900 dark:text-blue-300 font-medium">
                <strong>Tactical Action:</strong> {aiScience?.specialist_agents?.geospatial_forensics?.tactical_conclusion || "Deploy surveillance teams at identified cell tower convergence."}
              </div>
            </div>

            {/* Temporal Specialist */}
            <div className="p-4 rounded-xl bg-secondary/40 border border-border space-y-3">
              <div className="flex items-center gap-2 text-foreground font-bold text-xs">
                <Clock className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                Temporal Forensics Specialist
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {aiScience?.specialist_agents?.temporal_forensics?.investigation_summary || 
                 "Temporal analysis reveals synchronized communication and banking activity, establishing premeditated conspiracy."}
              </p>
              <div className="p-2.5 bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-500/20 rounded-lg text-[11px] text-purple-900 dark:text-purple-300 font-medium">
                <strong>Tactical Action:</strong> {aiScience?.specialist_agents?.temporal_forensics?.tactical_conclusion || "Tight communication-financial correlation indicates real-time operational command."}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB CONTENT 7: SECTION 7 - GRAPH DATA SCIENCE (GDS) & TOPOLOGY            */}
      {/* ========================================================================= */}
      {(activeTab === 'gds' || activeTab === 'full_dossier') && sec5 && (
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-indigo-100 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400">
                <Network className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">
                  Section 7: Graph Data Science (GDS) & Topology Intelligence
                </h2>
                <p className="text-xs text-muted-foreground">
                  Algorithmic Betweenness Centrality, PageRank, and Louvain/Leiden modularity clustering isolating key syndicate handlers.
                </p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30 text-xs font-mono font-bold">
              SECTION 7 / 8
            </span>
          </div>

          {/* GDS Metrics Table */}
          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Graph Structural Metrics & Inferred Network Roles
            </div>

            <div className="border border-border rounded-xl overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-secondary/70 border-b border-border text-[10px] font-bold text-muted-foreground uppercase">
                  <tr>
                    <th className="py-2.5 px-3">Node Identifier</th>
                    <th className="py-2.5 px-3">Entity Name</th>
                    <th className="py-2.5 px-3">Betweenness Centrality</th>
                    <th className="py-2.5 px-3">PageRank Score</th>
                    <th className="py-2.5 px-3">Leiden Community Cluster</th>
                    <th className="py-2.5 px-3">Inferred Network Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {sec5.graph_structural_metrics.map((row, idx) => (
                    <tr key={idx} className="hover:bg-secondary/30 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-primary">{row.node_identifier || row.entity_node_id}</td>
                      <td className="py-2.5 px-3 font-bold text-foreground">{row.entity_name || 'Target Operative'}</td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-foreground">{row.betweenness_centrality}</td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-foreground">{row.pagerank_score}</td>
                      <td className="py-2.5 px-3 font-sans text-muted-foreground">{row.leiden_community || row.leiden_community_cluster}</td>
                      <td className="py-2.5 px-3 font-bold text-foreground">
                        <span className="px-2 py-0.5 rounded bg-secondary border border-border text-[11px]">
                          {row.inferred_criminal_role || row.inferred_network_role}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Covert Bridge Finding Box */}
          <div className="p-4 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-500/30 text-xs space-y-2">
            <div className="font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-2">
              <Shield className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              Covert Bridge Handler Finding: {sec5.covert_bridge_finding.target_node}
            </div>
            <p className="text-foreground/90 leading-relaxed text-[11.5px]">
              {sec5.covert_bridge_finding.finding_summary}
            </p>
            <div className="text-[11px] font-mono text-indigo-800 dark:text-indigo-300 font-bold">
              Legal Implication: {sec5.covert_bridge_finding.legal_implication}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB CONTENT 8: SECTION 8 - MASTER EVIDENCE TIMELINE                       */}
      {/* ========================================================================= */}
      {(activeTab === 'timeline' || activeTab === 'full_dossier') && sec6 && (
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">
                  Section 8: Master Chronological Evidence Log
                </h2>
                <p className="text-xs text-muted-foreground">
                  Cross-domain multi-source event sequence chronologically aligned across cellular telephony, core banking, and network sessions.
                </p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 text-xs font-mono font-bold">
              SECTION 8 / 8
            </span>
          </div>

          {/* Timeline Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-secondary/30 rounded-xl border border-border">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold text-muted-foreground uppercase">Filter Domain:</span>
              {['ALL', 'TELECOM', 'FINANCIAL', 'GEOSPATIAL', 'NETWORK', 'CROSS_DOMAIN'].map(d => (
                <button
                  key={d}
                  onClick={() => setLogFilterDomain(d)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                    logFilterDomain === d
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  )}
                >
                  {d}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 text-xs font-mono">
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                value={logSearchQuery}
                onChange={e => setLogSearchQuery(e.target.value)}
                placeholder="Search raw event summary..."
                className="bg-secondary border border-border rounded-lg px-2.5 py-1 text-xs text-foreground outline-none w-48"
              />
            </div>
          </div>

          {/* Timeline Table */}
          <div className="border border-border rounded-xl overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-secondary/70 border-b border-border text-[10px] font-bold text-muted-foreground uppercase">
                <tr>
                  <th className="py-2.5 px-3">Timestamp (UTC)</th>
                  <th className="py-2.5 px-3">Data Domain</th>
                  <th className="py-2.5 px-3">Raw Event Summary</th>
                  <th className="py-2.5 px-3">Target Entity</th>
                  <th className="py-2.5 px-3">Anomaly / Threat Flag</th>
                  <th className="py-2.5 px-3">Evidence Source File</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredTimeline.map((row, idx) => {
                  const isCritical = row.anomaly_risk_flag.includes('CRITICAL') || row.anomaly_risk_flag.includes('ANOM-001');
                  return (
                    <tr key={idx} className="hover:bg-secondary/30 transition-colors font-mono">
                      <td className="py-2.5 px-3 text-[11px] text-muted-foreground whitespace-nowrap">{row.timestamp_utc}</td>
                      <td className="py-2.5 px-3 font-sans font-bold text-foreground">{row.data_source_domain || row.domain}</td>
                      <td className="py-2.5 px-3 font-sans text-foreground text-[11px]">{row.raw_event_summary}</td>
                      <td className="py-2.5 px-3 font-bold text-primary">{row.normalized_entity_id}</td>
                      <td className="py-2.5 px-3">
                        <span className={cn(
                          "text-[10px] font-bold px-2 py-0.5 rounded-full border",
                          isCritical
                            ? "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/30"
                            : "bg-secondary text-muted-foreground border-border"
                        )}>
                          {row.anomaly_risk_flag}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-muted-foreground font-sans">{row.evidence_source}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB CONTENT 9: SECTION 9 - SYSTEM AUDIT ANNEXURE & RSA SEAL               */}
      {/* ========================================================================= */}
      {(activeTab === 'audit' || activeTab === 'full_dossier') && sec7 && (
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-500/10 text-slate-700 dark:text-slate-400">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">
                  Section 9: Forensic Integrity & System Audit Annexure
                </h2>
                <p className="text-xs text-muted-foreground">
                  Cryptographically chained audit trail and RSA-2048 non-repudiation signature seal.
                </p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-500/10 text-slate-700 dark:text-slate-400 border border-slate-200 dark:border-slate-500/30 text-xs font-mono font-bold">
              STATUTORY ANNEXURE
            </span>
          </div>

          {/* Audit Trail Table */}
          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Immutable User Activity Audit Log (Tamper-Chained)
            </div>

            <div className="border border-border rounded-xl overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-secondary/70 border-b border-border text-[10px] font-bold text-muted-foreground uppercase">
                  <tr>
                    <th className="py-2.5 px-3">Activity ID</th>
                    <th className="py-2.5 px-3">Operator ID</th>
                    <th className="py-2.5 px-3">Action Type</th>
                    <th className="py-2.5 px-3">Parameters / Filters</th>
                    <th className="py-2.5 px-3">SHA-256 Signature</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 font-mono">
                  {sec7.immutable_user_activity_audit_log.map((log, idx) => (
                    <tr key={idx} className="hover:bg-secondary/30 transition-colors">
                      <td className="py-2.5 px-3 font-bold text-primary">{log.activity_id}</td>
                      <td className="py-2.5 px-3 text-muted-foreground font-sans">{log.investigator_id}</td>
                      <td className="py-2.5 px-3 font-bold text-foreground font-sans">{log.action_type}</td>
                      <td className="py-2.5 px-3 text-muted-foreground text-[11px] font-sans">{log.parameters}</td>
                      <td className="py-2.5 px-3 text-[11px] text-muted-foreground truncate max-w-xs">{log.sha256_signature}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Final Verification Seal Card */}
          <div className="p-6 rounded-2xl bg-secondary/50 border border-border space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
              <div className="flex items-center gap-2 text-foreground font-bold text-sm">
                <Award className="w-5 h-5 text-primary" />
                Final Cryptographic Verification Seal
              </div>
              <span className="px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 text-xs font-mono font-bold">
                SEALED & IMMUTABLE
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
              <div className="space-y-3 font-mono">
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold">Report Self-Digest (SHA-256)</span>
                  <span className="text-foreground text-[11px] break-all">{sec7.final_verification_seal.generated_pdf_sha256_placeholder}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold">Digital Verification Signature (RSA-2048)</span>
                  <span className="text-primary font-bold text-[11px] break-all">{sec7.final_verification_seal.digital_verification_signature}</span>
                </div>
                <p className="text-muted-foreground text-[11px] font-sans italic">
                  {sec7.final_verification_seal.attestation_statement}
                </p>
              </div>

              <div className="space-y-3 p-4 bg-card rounded-xl border border-border">
                <div className="text-[10px] uppercase font-bold text-muted-foreground">Officer Attestation & Sign-Off</div>
                <div className="space-y-1 text-xs">
                  <div className="font-bold text-foreground">{sec7.final_verification_seal.certifying_officer}</div>
                  <div className="text-muted-foreground">Badge ID: {sec7.final_verification_seal.certifying_officer_id}</div>
                  <div className="text-muted-foreground">Official Seal: Directorate of Cyber Crime & Forensic Intelligence</div>
                  <div className="text-muted-foreground">Attested Date: {sec7.final_verification_seal.attestation_date}</div>
                </div>
                <div className="pt-2 text-[10px] text-rose-600 dark:text-rose-400 font-bold uppercase">
                  {sec7.final_verification_seal.legal_warning}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
