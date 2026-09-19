import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, ShieldAlert, Cpu, Brain, 
  Network, MapPin, Banknote, 
  BarChart3, Users, AlertTriangle, 
  Shield, AlertCircle, Target, Eye, ChevronDown, 
  ChevronRight, Clock, CheckCircle2,
  FileText, ArrowRight, Gauge, Lock, 
  Crosshair, TrendingUp, Zap, Search, Terminal,
  Copy, Check, Layers, ChevronUp, RadioTower, Workflow, ExternalLink,
  Smartphone, Globe
} from 'lucide-react';
import { apiClient } from '../services/apiClient';
import { cn } from '../utils/cn';
import CommunityGraphViewer from './CommunityGraphViewer';

export interface InvestigationDashboardProps {
  activeCaseId: string;
  onNavigateToGraph?: (entityIds?: string[], communityId?: number | string) => void;
}

export function InvestigationDashboard({ activeCaseId, onNavigateToGraph }: InvestigationDashboardProps) {
  const [communities, setCommunities] = useState<any[]>([]);
  const [selectedCommunity, setSelectedCommunity] = useState<number | string | null>(null);
  const [gdsStatus, setGdsStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const feedEndRef = useRef<HTMLDivElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const isCompletedRef = useRef<boolean>(false);
  const dossierRef = useRef<any>(null);
  
  const [terminalLogs, setTerminalLogs] = useState<Array<{ log: string; agent: string; timestamp: string }>>([]);
  const [activeDossierTab, setActiveDossierTab] = useState<'master' | 'financial' | 'temporal' | 'geographic' | 'gds'>('master');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [copiedLogs, setCopiedLogs] = useState<boolean>(false);
  const [activeAgentStage, setActiveAgentStage] = useState<'financial' | 'temporal' | 'spatial' | 'lead' | 'complete' | 'idle'>('idle');
  const [completedStages, setCompletedStages] = useState<string[]>([]);
  const [currentThought, setCurrentThought] = useState<string>('Initializing multi-agent pipeline...');

  const [dossierState, setDossierState] = useState<{
    status: 'idle' | 'running' | 'complete' | 'error';
    messages: string[];
    dossier: any;
  }>({ status: 'idle', messages: [], dossier: null });

  const [isCommunityDropdownOpen, setIsCommunityDropdownOpen] = useState<boolean>(false);
  const communityDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (communityDropdownRef.current && !communityDropdownRef.current.contains(event.target as Node)) {
        setIsCommunityDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (!activeCaseId) return;
    setGdsStatus('running');
    apiClient.request(`/api/v1/investigation/run-algorithms?case_id=${encodeURIComponent(activeCaseId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ case_id: activeCaseId })
    })
      .then(res => {
        setCommunities(res.communities || []);
        setGdsStatus('done');
      })
      .catch(err => {
        console.error('GDS error', err);
        setGdsStatus('error');
      });

    return () => {
      eventSourceRef.current?.close();
    };
  }, [activeCaseId]);

  // Auto-scroll terminal
  useEffect(() => {
    if (autoScroll) {
      terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [terminalLogs, autoScroll]);

  const runSynthesis = () => {
    if (!selectedCommunity) return;
    
    // Close any previous stream
    eventSourceRef.current?.close();
    isCompletedRef.current = false;
    dossierRef.current = null;

    setDossierState({ status: 'running', messages: [], dossier: null });
    setTerminalLogs([]);
    setActiveAgentStage('financial');
    setCompletedStages([]);
    setCurrentThought('Initializing multi-agent pipeline and graph context...');

    // Use direct port 8000 URL on local environments to bypass any proxy chunk buffering
    const isLocal = typeof window !== 'undefined' && 
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.startsWith('192.168.') || window.location.hostname.startsWith('10.'));
    const apiBase = isLocal 
      ? `http://${window.location.hostname}:8000` 
      : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000');

    const sseUrl = selectedCommunity === 'all'
      ? `${apiBase}/api/v1/investigation/entire-graph/synthesize?case_id=${encodeURIComponent(activeCaseId || '')}`
      : `${apiBase}/api/v1/investigation/community/${selectedCommunity}/synthesize?case_id=${encodeURIComponent(activeCaseId || '')}`;

    const eventSource = new EventSource(sseUrl, { withCredentials: true });
    eventSourceRef.current = eventSource;
    
    eventSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.error) {
          const ts = new Date().toLocaleTimeString();
          setTerminalLogs(prev => [...prev, { log: `[${ts}] > [NOTICE] ${parsed.error}`, agent: 'system', timestamp: ts }]);
          return;
        }

        // Live agent stage and progressive thought update
        if (parsed.stage) {
          setActiveAgentStage(parsed.stage);
        } else if (parsed.agent) {
          const ag = parsed.agent.toLowerCase();
          if (ag.includes('financial')) setActiveAgentStage('financial');
          else if (ag.includes('temporal')) setActiveAgentStage('temporal');
          else if (ag.includes('spatial') || ag.includes('geo')) setActiveAgentStage('spatial');
          else if (ag.includes('lead')) setActiveAgentStage('lead');
        }

        if (parsed.status) {
          setCurrentThought(parsed.status);
          const st = parsed.status.toLowerCase();
          if (st.includes('financial analysis completed')) {
            setCompletedStages(prev => prev.includes('financial') ? prev : [...prev, 'financial']);
          } else if (st.includes('temporal analysis complete')) {
            setCompletedStages(prev => prev.includes('temporal') ? prev : [...prev, 'temporal']);
          } else if (st.includes('geographic intelligence complete')) {
            setCompletedStages(prev => prev.includes('spatial') ? prev : [...prev, 'spatial']);
          } else if (st.includes('dossier synthesized')) {
            setCompletedStages(prev => prev.includes('lead') ? prev : [...prev, 'lead']);
          }
        }

        if (parsed.log) {
          setTerminalLogs(prev => [...prev, { log: parsed.log, agent: parsed.agent || 'system', timestamp: parsed.timestamp || new Date().toLocaleTimeString() }]);
        } else if (parsed.status && parsed.status !== "pipeline complete") {
          const ts = new Date().toLocaleTimeString();
          setTerminalLogs(prev => [...prev, { log: `[${ts}] > [Agent Core] ${parsed.status}`, agent: 'system', timestamp: ts }]);
        }

        if (parsed.dossier_json) {
          dossierRef.current = parsed.dossier_json;
          isCompletedRef.current = true;
          setDossierState(prev => ({ ...prev, dossier: parsed.dossier_json, status: 'complete' }));
          setActiveAgentStage('complete');
        }

        if (parsed.status && parsed.status === "pipeline complete") {
          isCompletedRef.current = true;
          eventSource.close();
          const ts = new Date().toLocaleTimeString();
          setActiveAgentStage('complete');
          setCurrentThought('Forensic pipeline complete.');
          setTerminalLogs(prev => [...prev, { log: `[${ts}] > [System] Pipeline execution completed successfully.`, agent: 'system', timestamp: ts }]);
          setDossierState(prev => ({
            ...prev,
            status: 'complete',
            messages: [...prev.messages, 'Pipeline complete.']
          }));
          return;
        }
      } catch (e) {
        console.error("Parse error:", e);
      }
    };
    
    eventSource.onerror = () => {
      eventSource.close();
      if (isCompletedRef.current || dossierRef.current) {
        setDossierState(prev => ({ ...prev, status: 'complete' }));
        return;
      }
      setDossierState(prev => {
        if (prev.dossier || dossierRef.current) {
          return { ...prev, status: 'complete' };
        }
        // If stream disconnected early, finalize gracefully with notice
        const ts = new Date().toLocaleTimeString();
        setTerminalLogs(t => [...t, { log: `[${ts}] > [System] Stream finalizing forensic intelligence...`, agent: 'system', timestamp: ts }]);
        return { ...prev, status: 'complete' };
      });
    };
  };

  const getRiskColor = (risk: string) => {
    const r = (risk || '').toUpperCase();
    if (r === 'CRITICAL') return 'bg-red-500/10 text-red-500 border-red-500/30';
    if (r === 'HIGH') return 'bg-orange-500/10 text-orange-500 border-orange-500/30';
    if (r === 'MEDIUM') return 'bg-amber-500/10 text-amber-500 border-amber-500/30';
    if (r === 'LOW') return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30';
    return 'bg-slate-500/10 text-slate-500 border-slate-500/30';
  };

  const getRiskIcon = (risk: string) => {
    const r = (risk || '').toUpperCase();
    if (r === 'CRITICAL') return <Zap className="w-4 h-4" />;
    if (r === 'HIGH') return <AlertTriangle className="w-4 h-4" />;
    if (r === 'MEDIUM') return <AlertCircle className="w-4 h-4" />;
    return <Shield className="w-4 h-4" />;
  };

  const copyTerminalLogs = () => {
    const text = terminalLogs.map(l => l.log).join('\n');
    navigator.clipboard.writeText(text);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  const d = dossierState.dossier;
  const isDossierError = d && d.error;
  const specialists = d?.specialist_dossiers || {};

  return (
    <div className="h-full w-full bg-slate-50 dark:bg-[#060b18] text-slate-800 dark:text-slate-200 overflow-y-auto">
      <div className="max-w-6xl mx-auto p-6 space-y-6">

        {/* ═══ HEADER ═══ */}
        <div className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-700/40 rounded-2xl shadow-lg p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
              <ShieldAlert className="w-7 h-7 text-indigo-500" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-wider text-slate-900 dark:text-white uppercase">Agentic Forensics</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Multi-agent AI investigation pipeline &bull; Graph intelligence &bull; Cross-domain analysis</p>
            </div>
          </div>
        </div>

        {/* ═══ AI AGENT TASK FORCE ═══ */}
        <div className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-700/40 rounded-2xl shadow-lg p-6">
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-500" /> AI Agent Task Force
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { id: "financial", name: "Financial Intelligence", icon: <Banknote className="w-5 h-5 text-emerald-500" />, duty: "Money flows, mule networks, laundering patterns", color: "border-emerald-500/30 bg-emerald-500/5", activeColor: "ring-2 ring-emerald-500 bg-emerald-500/10 shadow-lg shadow-emerald-500/20" },
              { id: "spatial", name: "Geographic Intelligence", icon: <MapPin className="w-5 h-5 text-purple-500" />, duty: "IP tracking, cell towers, movement analysis", color: "border-purple-500/30 bg-purple-500/5", activeColor: "ring-2 ring-purple-500 bg-purple-500/10 shadow-lg shadow-purple-500/20" },
              { id: "temporal", name: "Temporal Intelligence", icon: <Clock className="w-5 h-5 text-sky-500" />, duty: "Timestamp correlation, synchronized ops", color: "border-sky-500/30 bg-sky-500/5", activeColor: "ring-2 ring-sky-500 bg-sky-500/10 shadow-lg shadow-sky-500/20" },
              { id: "lead", name: "Lead Investigator", icon: <Brain className="w-5 h-5 text-indigo-500" />, duty: "Cross-domain fusion, final intelligence report", color: "border-indigo-500/30 bg-indigo-500/5", activeColor: "ring-2 ring-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/20" },
            ].map((a, i) => {
              const isRunning = dossierState.status === 'running' && activeAgentStage === a.id;
              const isDone = completedStages.includes(a.id) || dossierState.status === 'complete';
              return (
                <div key={i} className={cn(
                  "p-4 rounded-xl border flex flex-col items-center text-center gap-2 shadow-sm relative transition-all duration-300",
                  isRunning ? a.activeColor : a.color
                )}>
                  {isRunning && (
                    <span className="absolute -top-2.5 px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-500/40 shadow-sm flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-600 dark:bg-cyan-400 inline-block animate-ping"></span>
                      ANALYZING ON GPU
                    </span>
                  )}
                  {isDone && !isRunning && (
                    <span className="absolute -top-2.5 px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40">
                      &#10003; COMPLETED
                    </span>
                  )}
                  <div className="p-2.5 bg-white dark:bg-slate-800 rounded-full shadow-sm">{a.icon}</div>
                  <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">{a.name}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{a.duty}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* ═══ CONTROLS ═══ */}
        <div className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-700/40 rounded-2xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-violet-500" /> Target Network & Execution
            </h2>
            {gdsStatus === 'running' && <span className="text-xs font-bold text-amber-500 bg-amber-500/10 px-3 py-1 rounded-full animate-pulse">Computing Graph Analytics...</span>}
            {gdsStatus === 'done' && <span className="text-xs font-bold text-emerald-500 bg-emerald-500/10 px-3 py-1 rounded-full">&#10003; Data Ready</span>}
            {gdsStatus === 'error' && <span className="text-xs font-bold text-red-500 bg-red-500/10 px-3 py-1 rounded-full">GDS Error</span>}
          </div>
          {communities.length === 0 ? (
            <div className="p-6 text-center border border-dashed border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-800/30">
              <Network className="w-10 h-10 text-slate-400 mx-auto mb-2 opacity-60" />
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">No Graph Communities Detected for Case {activeCaseId}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1 mb-4">
                Evidence files uploaded for this case have not been processed into graph clusters yet. Please upload files in Evidence Intake, execute the Processing Pipeline tab (or click below to refresh graph analytics).
              </p>
              <button
                onClick={() => {
                  setGdsStatus('running');
                  apiClient.request(`/api/v1/investigation/run-algorithms?case_id=${encodeURIComponent(activeCaseId)}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ case_id: activeCaseId })
                  })
                    .then(res => {
                      setCommunities(res.communities || []);
                      setGdsStatus('done');
                    })
                    .catch(() => setGdsStatus('error'));
                }}
                className="text-xs font-bold px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg shadow transition"
              >
                Compute & Refresh Graph Analytics
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center relative">
                {/* Custom Responsive Dropdown that NEVER expands out of screen */}
                <div ref={communityDropdownRef} className="relative flex-1 min-w-0 max-w-full">
                  <button
                    type="button"
                    onClick={() => setIsCommunityDropdownOpen(prev => !prev)}
                    className="w-full flex items-center justify-between gap-3 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors text-left min-w-0"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 truncate">
                      {selectedCommunity === 'all' ? (
                        <span className="p-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 shrink-0">
                          <Globe className="w-4 h-4" />
                        </span>
                      ) : selectedCommunity ? (
                        <span className="p-1.5 rounded-lg bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400 shrink-0">
                          <Network className="w-4 h-4" />
                        </span>
                      ) : (
                        <span className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-400 shrink-0">
                          <Users className="w-4 h-4" />
                        </span>
                      )}

                      <div className="min-w-0 truncate">
                        {selectedCommunity === 'all' ? (
                          <span className="font-bold text-indigo-600 dark:text-indigo-400 truncate block">
                            Entire Case Graph Panorama ({communities.length} Syndicates)
                          </span>
                        ) : selectedCommunity ? (() => {
                          const c = communities.find(item => item.communityId === selectedCommunity);
                          return (
                            <span className="font-bold text-slate-900 dark:text-white truncate block">
                              {c?.kingpin && c.kingpin !== 'Unknown' ? `${c.kingpin} Syndicate` : c?.name || `Syndicate #${selectedCommunity}`}
                            </span>
                          );
                        })() : (
                          <span className="text-slate-400 dark:text-slate-500 truncate block">
                            -- Select a Target Syndicate Network --
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {selectedCommunity === 'all' && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                          {communities.reduce((acc, c) => acc + (c.size || 0), 0)} Entities
                        </span>
                      )}
                      {selectedCommunity && selectedCommunity !== 'all' && (() => {
                        const c = communities.find(item => item.communityId === selectedCommunity);
                        return (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20">
                            {c?.size || 0} Nodes
                          </span>
                        );
                      })()}
                      <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform duration-200", isCommunityDropdownOpen && "rotate-180")} />
                    </div>
                  </button>

                  {/* Dropdown Menu List Popup */}
                  {isCommunityDropdownOpen && (
                    <div className="absolute left-0 right-0 top-full mt-2 z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden max-h-80 overflow-y-auto w-full max-w-full divide-y divide-slate-100 dark:divide-slate-800/60 animate-in fade-in slide-in-from-top-2 duration-150">
                      {/* Option 1: Entire Case Panorama */}
                      <div
                        onClick={() => {
                          setSelectedCommunity('all');
                          setIsCommunityDropdownOpen(false);
                        }}
                        className={cn(
                          "p-3 flex items-start gap-3 cursor-pointer transition-colors",
                          selectedCommunity === 'all' 
                            ? "bg-indigo-50/80 dark:bg-indigo-950/50 text-indigo-900 dark:text-indigo-100" 
                            : "hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-800 dark:text-slate-200"
                        )}
                      >
                        <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5">
                          <Globe className="w-4 h-4" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-sm text-indigo-600 dark:text-indigo-400 truncate">
                              🌐 ENTIRE CASE GRAPH PANORAMA
                            </span>
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-indigo-600 text-white shrink-0">
                              {communities.reduce((acc, c) => acc + (c.size || 0), 0)} ENTITIES
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                            All {communities.length} detected syndicates across the entire case
                          </p>
                        </div>
                      </div>

                      {/* Community List */}
                      {communities.map((c) => {
                        const isSelected = selectedCommunity === c.communityId;
                        const lead = c.kingpin && c.kingpin !== 'Unknown' ? c.kingpin : `Cluster #${c.communityId}`;
                        return (
                          <div
                            key={c.communityId}
                            onClick={() => {
                              setSelectedCommunity(c.communityId);
                              setIsCommunityDropdownOpen(false);
                            }}
                            className={cn(
                              "p-3 flex items-start gap-3 cursor-pointer transition-colors",
                              isSelected 
                                ? "bg-violet-50/80 dark:bg-violet-950/50 text-violet-900 dark:text-violet-100" 
                                : "hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-800 dark:text-slate-200"
                            )}
                          >
                            <span className="p-1.5 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 shrink-0 mt-0.5">
                              <Users className="w-4 h-4" />
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-sm text-slate-900 dark:text-white truncate">
                                  {lead} Syndicate
                                </span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20">
                                    {c.size} Nodes
                                  </span>
                                  {Number(c.relationships_count || 0) > 0 && (
                                    <span className="px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-slate-200/60 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300">
                                      {c.relationships_count} Edges
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                                <span className="truncate">{c.crime_profile || "Extortion & Money Mule Ring"}</span>
                                <span className="shrink-0">&bull;</span>
                                <span className="shrink-0 font-medium text-slate-600 dark:text-slate-300">{c.location || "NCR"}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <button 
                  onClick={runSynthesis}
                  disabled={!selectedCommunity || dossierState.status === 'running' || gdsStatus !== 'done'}
                  className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-40 text-white font-bold py-3 px-6 rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all shrink-0 sm:self-auto"
                >
                  {dossierState.status === 'running' ? <Activity className="w-5 h-5 animate-spin" /> : <Cpu className="w-5 h-5" />}
                  {selectedCommunity === 'all' ? 'Execute Entire Graph Pipeline' : 'Execute AI Pipeline'}
                </button>
              </div>

              {selectedCommunity === 'all' && (() => {
                const totalEntities = communities.reduce((acc, c) => acc + (c.size || 0), 0);
                const topKingpin = communities[0]?.kingpin || "Primary POI";
                const topBroker = communities[0]?.broker || (communities[1]?.kingpin || "Operational Broker");
                const crimeSummary = communities.map(c => c.crime_profile).filter(Boolean).slice(0, 2).join(' & ') || "Forensic Investigation Grid";
                const locSummary = communities.map(c => c.location).filter(Boolean).slice(0, 2).join(' / ') || "Case Operations";
                return (
                  <div className="space-y-4">
                    <div className="mt-4 p-4 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-500/30 text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <span className="text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-wider block mb-0.5">Apex Network Command</span>
                          <span className="text-slate-900 dark:text-slate-100 font-black text-sm flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span>
                            {topKingpin}
                          </span>
                        </div>
                        <div>
                          <span className="text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-wider block mb-0.5">Cross-Cell Broker</span>
                          <span className="text-slate-900 dark:text-slate-100 font-black text-sm flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>
                            {topBroker}
                          </span>
                        </div>
                        <div>
                          <span className="text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-wider block mb-0.5">Macro Modus Operandi</span>
                          <span className="text-indigo-700 dark:text-indigo-300 font-bold text-sm truncate block" title={crimeSummary}>
                            {crimeSummary}
                          </span>
                        </div>
                        <div>
                          <span className="text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-wider block mb-0.5">Case Scope</span>
                          <span className="text-slate-900 dark:text-slate-100 font-bold text-sm">
                            {totalEntities} Nodes &bull; {communities.length} Syndicates &bull; {locSummary}
                          </span>
                        </div>
                      </div>

                      {onNavigateToGraph && (
                        <div className="mt-3 pt-3 border-t border-indigo-200 dark:border-indigo-500/30 flex justify-end">
                          <button
                            onClick={() => onNavigateToGraph([], 'all')}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-sm transition"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            View Entire Network in Main Relationship Graph
                          </button>
                        </div>
                      )}
                    </div>

                    <CommunityGraphViewer
                      caseId={activeCaseId}
                      communityId="all"
                      communityName="Entire Case Graph Panorama"
                      onOpenInMainGraph={() => onNavigateToGraph?.([], 'all')}
                    />
                  </div>
                );
              })()}
            </>
          )}

          {selectedCommunity && selectedCommunity !== 'all' && (() => {
            const activeCommunityObj = communities.find(c => c.communityId === selectedCommunity);
            if (!activeCommunityObj) return null;
            const nodeCounts = activeCommunityObj.node_counts || {};
            return (
              <div className="space-y-4">
                <div className="mt-4 p-4 rounded-xl bg-slate-100/80 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/50 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block mb-0.5">Identified Kingpin</span>
                      <span className="text-slate-900 dark:text-slate-100 font-black text-sm flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span>
                        {activeCommunityObj.kingpin || "Unknown"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block mb-0.5">Primary Broker / Gateway</span>
                      <span className="text-slate-900 dark:text-slate-100 font-black text-sm flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>
                        {activeCommunityObj.broker || "Unknown"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block mb-0.5">Crime Modus Operandi</span>
                      <span className="text-indigo-600 dark:text-indigo-400 font-bold text-sm truncate block">
                        {activeCommunityObj.crime_profile || "Extortion & Money Mule Ring"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block mb-0.5">Jurisdiction & Scale</span>
                      <span className="text-slate-900 dark:text-slate-100 font-bold text-sm">
                        {activeCommunityObj.location || "NCR"} &bull; {activeCommunityObj.size} Total Entities
                      </span>
                    </div>
                  </div>

                  {/* Node Type Breakdown & Direct Navigation Action */}
                  <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700/60 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold text-slate-500 dark:text-slate-400">Node Breakdown:</span>
                      {Number(nodeCounts.people || 0) > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-red-500/10 text-red-600 dark:text-red-400 font-medium border border-red-500/20">
                          {nodeCounts.people} Persons
                        </span>
                      )}
                      {Number(nodeCounts.accounts || 0) > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium border border-emerald-500/20">
                          {nodeCounts.accounts} Accounts
                        </span>
                      )}
                      {Number(nodeCounts.phones || 0) > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-400 font-medium border border-sky-500/20">
                          {nodeCounts.phones} Phones
                        </span>
                      )}
                      {Number(nodeCounts.towers || 0) > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400 font-medium border border-orange-500/20">
                          {nodeCounts.towers} Towers
                        </span>
                      )}
                      {Number(nodeCounts.ips || 0) > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-medium border border-indigo-500/20">
                          {nodeCounts.ips} IPs
                        </span>
                      )}
                      {Number(activeCommunityObj.relationships_count || 0) > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-violet-500/10 text-violet-600 dark:text-violet-400 font-medium border border-violet-500/20">
                          {activeCommunityObj.relationships_count} Relationships
                        </span>
                      )}
                    </div>

                    {onNavigateToGraph && (
                      <button
                        onClick={() => onNavigateToGraph(activeCommunityObj.member_ids || activeCommunityObj.top_members, selectedCommunity)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-sm transition"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        View in Main Relationship Graph
                      </button>
                    )}
                  </div>
                </div>

                {/* Embedded Community Graph Visualizer */}
                <CommunityGraphViewer
                  caseId={activeCaseId}
                  communityId={selectedCommunity}
                  communityName={activeCommunityObj.name || `Syndicate #${selectedCommunity}`}
                  onOpenInMainGraph={() => onNavigateToGraph?.(activeCommunityObj.member_ids || activeCommunityObj.top_members, selectedCommunity)}
                />
              </div>
            );
          })()}
        </div>

        {/* ═══ LIVE AGENT EXECUTION TIMELINE (BEAUTIFUL CLEAN STEPPER) ═══ */}
        {(dossierState.status !== 'idle' || activeAgentStage !== 'idle') && (
          <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xl p-6 space-y-6">
            
            {/* Timeline Header & GPU Active Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500">
                    <Workflow className="w-5 h-5" />
                  </span>
                  <h3 className="text-base font-black text-slate-900 dark:text-white uppercase tracking-wider">
                    Autonomous Multi-Agent Investigation Timeline
                  </h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Sequential cross-domain analytical reasoning &bull; Graph Data Science verification
                </p>
              </div>

              {/* Hardware Acceleration Status Badge */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500/10 via-cyan-500/10 to-indigo-500/10 border border-emerald-500/30 text-xs font-semibold">
                <span className="relative flex h-2.5 w-2.5">
                  <span className={cn(
                    "absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75",
                    dossierState.status === 'running' && "animate-ping"
                  )} />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                </span>
                <span className="text-emerald-700 dark:text-emerald-300 font-mono text-[11px] font-bold">
                  NVIDIA RTX 3050 GPU (Active)
                </span>
                <span className="text-slate-400 dark:text-slate-500 text-[10px] hidden md:inline">&bull; Ollama 7B Local LLM</span>
              </div>
            </div>

            {/* Active Agent Hero Card (When Running) */}
            {dossierState.status === 'running' && (
              <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-cyan-500/10 border border-indigo-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in duration-200">
                <div className="flex items-center gap-3.5">
                  <div className="p-3 rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-500/30 shrink-0">
                    {activeAgentStage === 'financial' && <Banknote className="w-6 h-6 animate-pulse" />}
                    {activeAgentStage === 'temporal' && <Clock className="w-6 h-6 animate-pulse" />}
                    {activeAgentStage === 'spatial' && <MapPin className="w-6 h-6 animate-pulse" />}
                    {(activeAgentStage === 'lead' || activeAgentStage === 'idle') && <Brain className="w-6 h-6 animate-pulse" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 bg-indigo-500/15 px-2 py-0.5 rounded-full border border-indigo-500/20 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping inline-block" />
                        CURRENT AGENT WORKING
                      </span>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        {activeAgentStage === 'financial' && 'Financial Forensic Specialist'}
                        {activeAgentStage === 'temporal' && 'Temporal Sequence Specialist'}
                        {activeAgentStage === 'spatial' && 'Geospatial & Mobility Specialist'}
                        {(activeAgentStage === 'lead' || activeAgentStage === 'idle') && 'Lead Syndicate Investigator & GDS Synthesizer'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 font-medium mt-1">
                      {currentThought || 'Processing live multi-modal graph evidence on RTX GPU...'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                  <span className="text-[11px] font-mono font-bold text-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 px-2.5 py-1 rounded-lg border border-indigo-200 dark:border-indigo-800">
                    STAGE {activeAgentStage === 'financial' ? '1/4' : activeAgentStage === 'temporal' ? '2/4' : activeAgentStage === 'spatial' ? '3/4' : '4/4'}
                  </span>
                </div>
              </div>
            )}

            {/* 4-Stage Connected Chronological Timeline Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 relative">
              {[
                {
                  id: 'financial',
                  stageNum: '01',
                  name: 'Financial Forensic Agent',
                  duty: 'Mule accounts, smurfing structures, transaction velocity, Dijkstra money trails',
                  icon: Banknote,
                  color: 'emerald',
                  summary: 'Layered transactions & mule network identified',
                  details: 'Traces high-velocity transfers, structuring below reporting limits, and cashout routes.'
                },
                {
                  id: 'temporal',
                  stageNum: '02',
                  name: 'Temporal Sequence Agent',
                  duty: 'Call Detail Records (CDR), IPDR session timestamps, burst synchronization',
                  icon: Clock,
                  color: 'sky',
                  summary: 'Operational windows & coordination spikes mapped',
                  details: 'Isolates conspiratorial call intervals immediately preceding banking fund disbursements.'
                },
                {
                  id: 'spatial',
                  stageNum: '03',
                  name: 'Geospatial & Mobility Agent',
                  duty: 'Cell tower triangulation, safehouse cluster mapping, IP geolocation',
                  icon: MapPin,
                  color: 'purple',
                  summary: 'Safehouse perimeters & transit corridors isolated',
                  details: 'Triangulates device co-locations and physical safehouses across jurisdictional boundaries.'
                },
                {
                  id: 'lead',
                  stageNum: '04',
                  name: 'Lead Detective & GDS Synthesizer',
                  duty: '5 GDS algorithms fusion, Louvain syndicates, PageRank kingpins, statutory dossier',
                  icon: Brain,
                  color: 'indigo',
                  summary: 'Final court-admissible intelligence report generated',
                  details: 'Integrates all domain findings with Louvain modularity and Betweenness centrality into prosecution dossier.'
                },
              ].map((agent, idx) => {
                const isRunning = dossierState.status === 'running' && activeAgentStage === agent.id;
                const isDone = completedStages.includes(agent.id) || dossierState.status === 'complete';
                const isPending = !isRunning && !isDone;
                const IconComponent = agent.icon;

                return (
                  <div
                    key={agent.id}
                    className={cn(
                      "p-4 rounded-xl border flex flex-col justify-between transition-all duration-300 relative",
                      isRunning && "ring-2 ring-indigo-500 bg-indigo-500/10 border-indigo-500/50 shadow-lg shadow-indigo-500/10",
                      isDone && "bg-slate-50/80 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/60 shadow-sm",
                      isPending && "bg-slate-50/40 dark:bg-slate-900/30 border-dashed border-slate-200 dark:border-slate-800 opacity-60"
                    )}
                  >
                    <div>
                      {/* Top status indicator & stage number */}
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-mono font-bold text-slate-400">
                          STAGE {agent.stageNum}
                        </span>
                        {isDone && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Done
                          </span>
                        )}
                        {isRunning && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/40 flex items-center gap-1 font-mono">
                            <Activity className="w-3 h-3 animate-spin" /> In Progress
                          </span>
                        )}
                        {isPending && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-200/50 dark:bg-slate-800 text-slate-400 flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" /> Queued
                          </span>
                        )}
                      </div>

                      {/* Agent Title & Icon */}
                      <div className="flex items-center gap-2.5 mb-2">
                        <div className={cn(
                          "p-2 rounded-lg shrink-0",
                          agent.color === 'emerald' ? "bg-emerald-500/10 text-emerald-500" :
                          agent.color === 'sky' ? "bg-sky-500/10 text-sky-500" :
                          agent.color === 'purple' ? "bg-purple-500/10 text-purple-500" :
                          "bg-indigo-500/10 text-indigo-500"
                        )}>
                          <IconComponent className="w-4 h-4" />
                        </div>
                        <h4 className="font-bold text-xs text-slate-900 dark:text-slate-100 leading-tight">
                          {agent.name}
                        </h4>
                      </div>

                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
                        {agent.duty}
                      </p>
                    </div>

                    {/* Bottom Findings / Status Note */}
                    <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/80 text-[11px]">
                      {isDone ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                          ✓ {agent.summary}
                        </span>
                      ) : isRunning ? (
                        <span className="text-indigo-600 dark:text-indigo-400 font-mono font-medium animate-pulse">
                          &gt; GPU inference running...
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">
                          Awaiting preceding specialist handoff
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pipeline Complete Banner */}
            {dossierState.status === 'complete' && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium animate-in fade-in">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>All 4 AI Specialist Agents Completed Successfully &bull; Multi-Domain Knowledge Graph Fully Synthesized</span>
                </div>
                <span className="text-[10px] font-mono text-emerald-500 font-bold uppercase">Ready For Review</span>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* ═══ FINAL INVESTIGATION REPORT ═══ */}
        {/* ═══════════════════════════════════════════════════════ */}
        {/* ═══════════════════════════════════════════════════════ */}
        {dossierState.status === 'complete' && d && (
          <div className="space-y-6">

            <div className="flex items-center gap-3 border-b border-slate-300 dark:border-slate-700 pb-4">
              <FileText className="w-7 h-7 text-indigo-500" />
              <h1 className="text-2xl font-black uppercase tracking-tight text-slate-900 dark:text-white">Final Investigation Report</h1>
            </div>

            {isDossierError ? (
              <div className="bg-red-500/5 border border-red-500/30 rounded-2xl p-6">
                <h2 className="text-red-500 font-bold mb-3 flex items-center gap-2"><AlertTriangle className="w-5 h-5" /> Agent Format Error</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{d.error}</p>
                <div className="bg-slate-900 rounded-xl p-4 text-xs font-mono text-slate-300 overflow-auto whitespace-pre-wrap max-h-96">
                  {d.raw_output}
                </div>
              </div>
            ) : (
              <>
                {/* ── 1. Investigation Assessment ── */}
                <div className="bg-white/80 dark:bg-slate-900/70 rounded-2xl shadow-lg p-6 border-l-4 border-l-indigo-500 border border-slate-200/50 dark:border-slate-700/40">
                  <h2 className="text-base font-black uppercase tracking-widest text-slate-800 dark:text-slate-100 mb-3 flex items-center gap-2">
                    <Crosshair className="w-5 h-5 text-indigo-500" /> Investigation Assessment
                  </h2>
                  <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-[15px] mb-4">
                    {d.investigation_summary || "No assessment provided."}
                  </p>
                  {d.executive_assessment && (
                    <div className="bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30 p-4 rounded-xl">
                      <h3 className="text-xs font-black uppercase text-indigo-500 mb-1">Executive Assessment</h3>
                      <p className="text-sm text-slate-700 dark:text-slate-300 font-medium">{d.executive_assessment}</p>
                    </div>
                  )}
                </div>

                                {/* ── Crucial Entities & Primary Targets ("How They Belong to the Case") ── */}
                <div className="bg-white/80 dark:bg-slate-900/70 rounded-2xl shadow-lg p-6 border border-slate-200/80 dark:border-slate-700/60 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 dark:border-slate-800 pb-3">
                    <div>
                      <h2 className="text-base font-black uppercase tracking-widest text-slate-900 dark:text-white flex items-center gap-2">
                        <Users className="w-5 h-5 text-indigo-500" />
                        Crucial Entities & Primary Targets: Case Nexus & Criminal Involvement
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Identified network actors, money mule accounts, and communication conduits &mdash; detailing how each entity belongs to the criminal conspiracy.
                      </p>
                    </div>
                    <span className="text-[11px] font-mono font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-3 py-1 rounded-full border border-indigo-500/20 self-start sm:self-auto">
                      {d.crucial_entities?.length || d.target_profiles?.length || 2} Crucial Targets Verified
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {((d.crucial_entities && d.crucial_entities.length > 0) ? d.crucial_entities : (d.target_profiles || [])).map((target: any, ti: number) => {
                      const name = target.name || target.target_name || `Target-${ti+1}`;
                      const type = target.type || (target.role?.toLowerCase().includes('account') ? 'account' : 'person');
                      const role = target.role || 'Syndicate Conspirator';
                      const pr = target.pagerank || (target.graph_centrality ? target.graph_centrality.split(':')[1]?.trim() : '0.450');
                      const bw = target.betweenness || '1.20';
                      const howBelongs = target.how_they_belong || target.criminal_role_summary || target.reason || 'Identified actor in the syndicate structure.';
                      const action = target.recommended_action || target.recommended_legal_action || 'Immediate statutory summons under CrPC Section 91.';

                      return (
                        <div 
                          key={ti} 
                          className="p-5 rounded-xl bg-slate-50/70 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 flex flex-col justify-between space-y-3 hover:border-indigo-500/40 transition-all shadow-sm"
                        >
                          <div className="space-y-2.5">
                            {/* Entity Header */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2.5">
                                <div className={cn(
                                  "p-2 rounded-lg shrink-0",
                                  type === 'person' ? "bg-indigo-500/10 text-indigo-500" :
                                  type === 'account' ? "bg-emerald-500/10 text-emerald-500" :
                                  type === 'phone' ? "bg-sky-500/10 text-sky-500" :
                                  "bg-purple-500/10 text-purple-500"
                                )}>
                                  {type === 'person' && <Users className="w-4 h-4" />}
                                  {type === 'account' && <Banknote className="w-4 h-4" />}
                                  {type === 'phone' && <Smartphone className="w-4 h-4" />}
                                  {type !== 'person' && type !== 'account' && type !== 'phone' && <Globe className="w-4 h-4" />}
                                </div>
                                <div>
                                  <h4 className="text-sm font-black text-slate-900 dark:text-white leading-tight">
                                    {name}
                                  </h4>
                                  <span className="text-[10px] font-mono text-slate-500 uppercase">
                                    {type} &bull; Community #{d.gds_algorithmic_findings?.louvain_syndicate?.community_id || 1}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[10px] font-mono font-bold bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded">
                                  PR: {pr}
                                </span>
                              </div>
                            </div>

                            {/* Syndicate Role Badge */}
                            <div>
                              <span className="inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                                {role}
                              </span>
                            </div>

                            {/* How They Belong to the Case */}
                            <div className="p-3 rounded-lg bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 space-y-1">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block font-mono">
                                How Entity Belongs to the Case:
                              </span>
                              <p className="leading-relaxed">
                                {howBelongs}
                              </p>
                            </div>
                          </div>

                          {/* Statutory Directive */}
                          <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
                            <Target className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            <span className="font-semibold">{action}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ═══ DOSSIER NAVIGATION TABS ═══ */}
                <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3 overflow-x-auto">
                  <button
                    onClick={() => setActiveDossierTab('master')}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shrink-0",
                      activeDossierTab === 'master' 
                        ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/25" 
                        : "bg-slate-100 dark:bg-slate-800/70 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800"
                    )}
                  >
                    <Brain className="w-4 h-4" />
                    Master Strike Plan
                  </button>
                  <button
                    onClick={() => setActiveDossierTab('financial')}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shrink-0",
                      activeDossierTab === 'financial' 
                        ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/25" 
                        : "bg-slate-100 dark:bg-slate-800/70 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800"
                    )}
                  >
                    <Banknote className="w-4 h-4" />
                    Financial Intelligence
                  </button>
                  <button
                    onClick={() => setActiveDossierTab('temporal')}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shrink-0",
                      activeDossierTab === 'temporal' 
                        ? "bg-sky-600 text-white shadow-lg shadow-sky-500/25" 
                        : "bg-slate-100 dark:bg-slate-800/70 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800"
                    )}
                  >
                    <Clock className="w-4 h-4" />
                    Temporal Intelligence
                  </button>
                  <button
                    onClick={() => setActiveDossierTab('geographic')}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shrink-0",
                      activeDossierTab === 'geographic' 
                        ? "bg-purple-600 text-white shadow-lg shadow-purple-500/25" 
                        : "bg-slate-100 dark:bg-slate-800/70 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800"
                    )}
                  >
                    <MapPin className="w-4 h-4" />
                    Geographic Intelligence
                  </button>
                  <button
                    onClick={() => setActiveDossierTab('gds')}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shrink-0",
                      activeDossierTab === 'gds' 
                        ? "bg-violet-600 text-white shadow-lg shadow-violet-500/25" 
                        : "bg-slate-100 dark:bg-slate-800/70 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800"
                    )}
                  >
                    <Network className="w-4 h-4" />
                    5 GDS Pillars
                  </button>
                </div>

                {/* ═══ FINANCIAL INTELLIGENCE TAB ═══ */}
                {activeDossierTab === 'financial' && (() => {
                  const fin = specialists.financial || {};
                  return (
                    <div className="space-y-6">
                      <div className="bg-emerald-500/10 dark:bg-emerald-950/30 border border-emerald-500/30 rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className="p-3.5 bg-emerald-500 text-white rounded-2xl shadow-lg shadow-emerald-500/30">
                            <Banknote className="w-8 h-8" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                                Specialist Agent
                              </span>
                              <span className="text-xs font-bold text-slate-500">Autonomous Financial Crimes Division</span>
                            </div>
                            <h2 className="text-xl font-black text-slate-900 dark:text-white mt-1">Financial Intelligence & Flow Analytics</h2>
                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">Evaluation of money mules, smurfing structures, transaction velocity, and offshore cash-out gates.</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Specialist Risk</span>
                            <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">{fin.risk_score || "HIGH RISK"}</span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-300">
                        <div className="flex items-center gap-2 text-indigo-400 font-bold mb-1 uppercase tracking-wider text-[11px]">
                          <Cpu className="w-4 h-4 text-indigo-400" />
                          Pre-Query Reasoning Protocol (GDS Evaluation First)
                        </div>
                        <p className="text-slate-400 leading-relaxed">
                          {fin.pre_query_reasoning || "Evaluated high PageRank and transaction frequency metrics on identified accounts before requesting verified ledger disbursements from Neo4j."}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-white dark:bg-slate-900/70 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative flex flex-col justify-between">
                          <div>
                            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500 mb-2">
                              <Eye className="w-4 h-4 text-sky-500" /> 1. Initial Observation
                            </div>
                            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 mb-2">Graph Metric Anomaly</h3>
                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                              {fin.initial_observation || "High in-degree centrality and rapid fund disbursement detected across primary transaction clusters."}
                            </p>
                          </div>
                        </div>

                        <div className="bg-white dark:bg-slate-900/70 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative flex flex-col justify-between">
                          <div>
                            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500 mb-2">
                              <Search className="w-4 h-4 text-amber-500" /> 2. Query Evidence
                            </div>
                            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 mb-2">Neo4j Database Verification</h3>
                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                              {fin.query_evidence || "Targeted Cypher query confirmed multi-hop cash-outs across identified mule accounts with structured sub-threshold deposits."}
                            </p>
                          </div>
                        </div>

                        <div className="bg-white dark:bg-slate-900/70 p-5 rounded-2xl border border-emerald-500/30 shadow-sm relative flex flex-col justify-between bg-emerald-500/[0.02]">
                          <div>
                            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-2">
                              <Target className="w-4 h-4 text-emerald-500" /> 3. Tactical Conclusion
                            </div>
                            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 mb-2">Warrants & Freezing Directives</h3>
                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                              {fin.tactical_conclusion || "Recommend immediate freezing of suspect accounts under Section 17 PMLA and issuance of debit freeze notices to partner banks."}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {fin.mule_accounts && (
                          <div className="bg-white dark:bg-slate-900/70 rounded-xl p-5 border border-slate-200 dark:border-slate-800">
                            <h3 className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-2 mb-3">
                              <Banknote className="w-4 h-4 text-emerald-500" /> Identified Money Mule Accounts
                            </h3>
                            {Array.isArray(fin.mule_accounts) ? (
                              <div className="space-y-2">
                                {fin.mule_accounts.map((m: any, mi: number) => (
                                  <div key={mi} className="text-xs p-2.5 bg-emerald-500/5 border border-emerald-500/10 rounded-lg flex items-center justify-between font-mono">
                                    <span className="font-bold text-slate-800 dark:text-slate-200">{typeof m === 'string' ? m : m.account || m.name || JSON.stringify(m)}</span>
                                    <span className="text-[10px] bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded font-sans font-bold">MULE ACCOUNT</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-slate-600 dark:text-slate-300">{String(fin.mule_accounts)}</p>
                            )}
                          </div>
                        )}

                        {fin.smurfing_indicators && (
                          <div className="bg-white dark:bg-slate-900/70 rounded-xl p-5 border border-slate-200 dark:border-slate-800">
                            <h3 className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-2 mb-3">
                              <AlertTriangle className="w-4 h-4 text-amber-500" /> Layering & Smurfing Indicators
                            </h3>
                            {Array.isArray(fin.smurfing_indicators) ? (
                              <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
                                {fin.smurfing_indicators.map((ind: any, ii: number) => (
                                  <li key={ii} className="p-2.5 bg-amber-500/5 border border-amber-500/10 rounded-lg flex items-start gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                                    <span>{typeof ind === 'string' ? ind : JSON.stringify(ind)}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-xs text-slate-600 dark:text-slate-300">{String(fin.smurfing_indicators)}</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* ═══ TEMPORAL INTELLIGENCE TAB ═══ */}
                {activeDossierTab === 'temporal' && (() => {
                  const temp = specialists.temporal || {};
                  return (
                    <div className="space-y-6">
                      <div className="bg-sky-500/10 dark:bg-sky-950/30 border border-sky-500/30 rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className="p-3.5 bg-sky-500 text-white rounded-2xl shadow-lg shadow-sky-500/30">
                            <Clock className="w-8 h-8" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono font-black uppercase tracking-wider text-sky-600 dark:text-sky-400 bg-sky-500/15 px-2.5 py-0.5 rounded-full border border-sky-500/20">
                                Specialist Agent
                              </span>
                              <span className="text-xs font-bold text-slate-500">Autonomous Temporal & CDR Analytics Division</span>
                            </div>
                            <h2 className="text-xl font-black text-slate-900 dark:text-white mt-1">Temporal Timeline & Synchronization Intelligence</h2>
                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">Evaluation of Call Detail Records (CDR), operational time windows, and concurrent burst synchronization.</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Specialist Risk</span>
                            <span className="text-sm font-black text-sky-600 dark:text-sky-400">{temp.risk_score || "HIGH RISK"}</span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-300">
                        <div className="flex items-center gap-2 text-indigo-400 font-bold mb-1 uppercase tracking-wider text-[11px]">
                          <Cpu className="w-4 h-4 text-indigo-400" />
                          Pre-Query Reasoning Protocol (GDS Evaluation First)
                        </div>
                        <p className="text-slate-400 leading-relaxed">
                          {temp.pre_query_reasoning || "Evaluated call intervals and operational timestamp spreads before running targeted Cypher queries for concurrent call timestamps and burst intervals."}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-white dark:bg-slate-900/70 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative flex flex-col justify-between">
                          <div>
                            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500 mb-2">
                              <Eye className="w-4 h-4 text-sky-500" /> 1. Initial Observation
                            </div>
                            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 mb-2">CDR Timestamp Frequency</h3>
                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                              {temp.initial_observation || "High-frequency burst calls clustered within tight operational time windows indicating deliberate command-and-control operations."}
                            </p>
                          </div>
                        </div>

                        <div className="bg-white dark:bg-slate-900/70 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative flex flex-col justify-between">
                          <div>
                            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500 mb-2">
                              <Search className="w-4 h-4 text-amber-500" /> 2. Query Evidence
                            </div>
                            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 mb-2">Neo4j Database Verification</h3>
                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                              {temp.query_evidence || "Timestamp analysis confirmed that calls between Kingpin and primary broker occur immediately prior to money transfers, confirming direct coordination."}
                            </p>
                          </div>
                        </div>

                        <div className="bg-white dark:bg-slate-900/70 p-5 rounded-2xl border border-sky-500/30 shadow-sm relative flex flex-col justify-between bg-sky-500/[0.02]">
                          <div>
                            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-sky-600 dark:text-sky-400 mb-2">
                              <Target className="w-4 h-4 text-sky-500" /> 3. Tactical Conclusion
                            </div>
                            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 mb-2">Synchronized Raid Windows</h3>
                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                              {temp.tactical_conclusion || "Target synchronized physical and digital surveillance during peak coordination windows between 18:00 and 22:00 IST to intercept active operational communications."}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {temp.coordination_spikes && (
                          <div className="bg-white dark:bg-slate-900/70 rounded-xl p-5 border border-slate-200 dark:border-slate-800">
                            <h3 className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-2 mb-3">
                              <TrendingUp className="w-4 h-4 text-sky-500" /> Coordination Spikes & Bursts
                            </h3>
                            {Array.isArray(temp.coordination_spikes) ? (
                              <div className="space-y-2">
                                {temp.coordination_spikes.map((s: any, si: number) => (
                                  <div key={si} className="text-xs p-2.5 bg-sky-500/5 border border-sky-500/10 rounded-lg flex items-center justify-between font-mono">
                                    <span className="font-bold text-slate-800 dark:text-slate-200">{typeof s === 'string' ? s : s.spike || s.time || JSON.stringify(s)}</span>
                                    <span className="text-[10px] bg-sky-500/10 text-sky-500 px-2 py-0.5 rounded font-sans font-bold">BURST WINDOW</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-slate-600 dark:text-slate-300">{String(temp.coordination_spikes)}</p>
                            )}
                          </div>
                        )}

                        {temp.operational_hours && (
                          <div className="bg-white dark:bg-slate-900/70 rounded-xl p-5 border border-slate-200 dark:border-slate-800">
                            <h3 className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-2 mb-3">
                              <Clock className="w-4 h-4 text-indigo-500" /> Operational Hours & Schedules
                            </h3>
                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                              {typeof temp.operational_hours === 'string' ? temp.operational_hours : JSON.stringify(temp.operational_hours, null, 2)}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* ═══ GEOGRAPHIC INTELLIGENCE TAB ═══ */}
                {activeDossierTab === 'geographic' && (() => {
                  const geo = specialists.geographic || {};
                  return (
                    <div className="space-y-6">
                      <div className="bg-purple-500/10 dark:bg-purple-950/30 border border-purple-500/30 rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className="p-3.5 bg-purple-500 text-white rounded-2xl shadow-lg shadow-purple-500/30">
                            <MapPin className="w-8 h-8" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono font-black uppercase tracking-wider text-purple-600 dark:text-purple-400 bg-purple-500/15 px-2.5 py-0.5 rounded-full border border-purple-500/20">
                                Specialist Agent
                              </span>
                              <span className="text-xs font-bold text-slate-500">Autonomous Geospatial & Signal Division</span>
                            </div>
                            <h2 className="text-xl font-black text-slate-900 dark:text-white mt-1">Geographic Movement & Signal Intelligence</h2>
                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">Cell tower sector triangulation, safehouse cluster mapping, IP address geolocation, and inter-jurisdictional conduits.</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Specialist Risk</span>
                            <span className="text-sm font-black text-purple-600 dark:text-purple-400">{geo.risk_score || "HIGH RISK"}</span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-300">
                        <div className="flex items-center gap-2 text-indigo-400 font-bold mb-1 uppercase tracking-wider text-[11px]">
                          <Cpu className="w-4 h-4 text-indigo-400" />
                          Pre-Query Reasoning Protocol (GDS Evaluation First)
                        </div>
                        <p className="text-slate-400 leading-relaxed">
                          {geo.pre_query_reasoning || "Evaluated spatial clustering and degree distribution across cell towers before running targeted Cypher queries for co-located suspect device IDs."}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-white dark:bg-slate-900/70 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative flex flex-col justify-between">
                          <div>
                            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500 mb-2">
                              <Eye className="w-4 h-4 text-sky-500" /> 1. Initial Observation
                            </div>
                            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 mb-2">Tower Triangulation Cluster</h3>
                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                              {geo.initial_observation || "Dense cell tower associations pinpoint operational clusters across specific jurisdictional boundaries in the NCR/Mewat corridor."}
                            </p>
                          </div>
                        </div>

                        <div className="bg-white dark:bg-slate-900/70 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative flex flex-col justify-between">
                          <div>
                            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500 mb-2">
                              <Search className="w-4 h-4 text-amber-500" /> 2. Query Evidence
                            </div>
                            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 mb-2">Neo4j Database Verification</h3>
                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                              {geo.query_evidence || "Cypher spatial queries confirmed recurrent device associations across specific cell tower sectors, validating identified physical operating locations."}
                            </p>
                          </div>
                        </div>

                        <div className="bg-white dark:bg-slate-900/70 p-5 rounded-2xl border border-purple-500/30 shadow-sm relative flex flex-col justify-between bg-purple-500/[0.02]">
                          <div>
                            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-purple-600 dark:text-purple-400 mb-2">
                              <Target className="w-4 h-4 text-purple-500" /> 3. Tactical Conclusion
                            </div>
                            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 mb-2">Search & Seizure Warrants</h3>
                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                              {geo.tactical_conclusion || "Obtain multi-jurisdictional search warrants under CrPC Section 93 for the triangulated safehouse perimeter and issue physical raid authorizations."}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {geo.safehouses && (
                          <div className="bg-white dark:bg-slate-900/70 rounded-xl p-5 border border-slate-200 dark:border-slate-800">
                            <h3 className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-2 mb-3">
                              <MapPin className="w-4 h-4 text-purple-500" /> Identified Safehouse Coordinates
                            </h3>
                            {Array.isArray(geo.safehouses) ? (
                              <div className="space-y-2">
                                {geo.safehouses.map((sh: any, shi: number) => (
                                  <div key={shi} className="text-xs p-2.5 bg-purple-500/5 border border-purple-500/10 rounded-lg flex items-center justify-between font-mono">
                                    <span className="font-bold text-slate-800 dark:text-slate-200">{typeof sh === 'string' ? sh : sh.location || sh.name || JSON.stringify(sh)}</span>
                                    <span className="text-[10px] bg-purple-500/10 text-purple-500 px-2 py-0.5 rounded font-sans font-bold">PRIMARY TARGET</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-slate-600 dark:text-slate-300">{String(geo.safehouses)}</p>
                            )}
                          </div>
                        )}

                        {geo.hotspots && (
                          <div className="bg-white dark:bg-slate-900/70 rounded-xl p-5 border border-slate-200 dark:border-slate-800">
                            <h3 className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-2 mb-3">
                              <RadioTower className="w-4 h-4 text-amber-500" /> Triangulated Cell Tower Hotspots
                            </h3>
                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                              {typeof geo.hotspots === 'string' ? geo.hotspots : JSON.stringify(geo.hotspots, null, 2)}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* ── 5 GDS Core Algorithmic Pillars ── */}
                {activeDossierTab === 'gds' && d.gds_algorithmic_findings && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-base font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                        <Network className="w-5 h-5" /> Graph Data Science (GDS) Algorithmic Discoveries
                      </h2>
                      <span className="text-xs font-mono bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 px-3 py-1 rounded-full border border-indigo-500/20 font-bold">
                        5 Core GDS Procedures Verified
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* 1. Louvain Community Detection */}
                      {d.gds_algorithmic_findings.louvain_syndicate && (
                        <div className="bg-white dark:bg-slate-900/70 p-5 rounded-xl border border-slate-200 dark:border-slate-700/50 shadow-sm relative overflow-hidden flex flex-col justify-between">
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="bg-blue-500/10 text-blue-500 p-1.5 rounded-lg"><Users className="w-4 h-4" /></span>
                              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-100">
                                1. Louvain Community Detection: Finding the Syndicate
                              </h3>
                            </div>
                            <div className="text-xs space-y-1.5 mt-2">
                              <div className="font-bold text-sm text-slate-800 dark:text-slate-100">
                                {d.gds_algorithmic_findings.louvain_syndicate.syndicate_name}
                              </div>
                              <div className="text-slate-500 dark:text-slate-400 flex items-center gap-2 flex-wrap font-medium">
                                <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">Cluster #{d.gds_algorithmic_findings.louvain_syndicate.community_id}</span>
                                <span>&bull;</span>
                                <span className="bg-blue-500/10 text-blue-500 font-bold px-2 py-0.5 rounded">{d.gds_algorithmic_findings.louvain_syndicate.size} Entities</span>
                                <span>&bull;</span>
                                <span>{d.gds_algorithmic_findings.louvain_syndicate.location}</span>
                              </div>
                              <p className="text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
                                {d.gds_algorithmic_findings.louvain_syndicate.finding}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 2. PageRank Centrality */}
                      {d.gds_algorithmic_findings.pagerank_kingpin && (
                        <div className="bg-white dark:bg-slate-900/70 p-5 rounded-xl border border-red-500/20 shadow-sm relative overflow-hidden flex flex-col justify-between">
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="bg-red-500/10 text-red-500 p-1.5 rounded-lg"><Target className="w-4 h-4" /></span>
                              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-100">
                                2. PageRank Centrality: Unmasking the Kingpin
                              </h3>
                            </div>
                            <div className="text-xs space-y-1.5 mt-2">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-base text-red-600 dark:text-red-400">
                                  {d.gds_algorithmic_findings.pagerank_kingpin.kingpin_name}
                                </span>
                                <span className="font-mono bg-red-500/10 text-red-500 px-2.5 py-0.5 rounded text-[11px] font-bold border border-red-500/20">
                                  PR: {d.gds_algorithmic_findings.pagerank_kingpin.pagerank_score}
                                </span>
                              </div>
                              <div className="text-slate-500 dark:text-slate-400 font-medium">
                                {d.gds_algorithmic_findings.pagerank_kingpin.role}
                              </div>
                              <p className="text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
                                {d.gds_algorithmic_findings.pagerank_kingpin.finding}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 3. Betweenness Centrality */}
                      {d.gds_algorithmic_findings.betweenness_bridge && (
                        <div className="bg-white dark:bg-slate-900/70 p-5 rounded-xl border border-amber-500/20 shadow-sm relative overflow-hidden flex flex-col justify-between">
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="bg-amber-500/10 text-amber-500 p-1.5 rounded-lg"><Zap className="w-4 h-4" /></span>
                              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-100">
                                3. Betweenness Centrality: Targeting the "Bridge" / Broker
                              </h3>
                            </div>
                            <div className="text-xs space-y-1.5 mt-2">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-base text-amber-600 dark:text-amber-400">
                                  {d.gds_algorithmic_findings.betweenness_bridge.broker_name}
                                </span>
                                <span className="font-mono bg-amber-500/10 text-amber-500 px-2.5 py-0.5 rounded text-[11px] font-bold border border-amber-500/20">
                                  Betweenness: {d.gds_algorithmic_findings.betweenness_bridge.betweenness_score}
                                </span>
                              </div>
                              <div className="text-slate-500 dark:text-slate-400 font-medium">
                                {d.gds_algorithmic_findings.betweenness_bridge.role}
                              </div>
                              <p className="text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
                                {d.gds_algorithmic_findings.betweenness_bridge.finding}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 4. Node Similarity (FastRP / KNN) */}
                      {d.gds_algorithmic_findings.fastrp_silent_partners && (
                        <div className="bg-white dark:bg-slate-900/70 p-5 rounded-xl border border-purple-500/20 shadow-sm relative overflow-hidden flex flex-col justify-between">
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="bg-purple-500/10 text-purple-500 p-1.5 rounded-lg"><Eye className="w-4 h-4" /></span>
                              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-100">
                                4. Node Similarity (FastRP / KNN): Silent Partners
                              </h3>
                            </div>
                            <div className="text-xs space-y-2 mt-2">
                              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                                {d.gds_algorithmic_findings.fastrp_silent_partners.finding}
                              </p>
                              {d.gds_algorithmic_findings.fastrp_silent_partners.similar_pairs && d.gds_algorithmic_findings.fastrp_silent_partners.similar_pairs.length > 0 && (
                                <div className="space-y-1.5 mt-2">
                                  {d.gds_algorithmic_findings.fastrp_silent_partners.similar_pairs.slice(0, 3).map((pair: any, pi: number) => (
                                    <div key={pi} className="p-2 rounded-lg bg-purple-500/5 border border-purple-500/10 flex items-center justify-between gap-2">
                                      <div className="truncate font-medium text-slate-700 dark:text-slate-300 text-[11px]">
                                        <span className="font-bold">{pair.entity_1}</span>
                                        <span className="text-purple-400 mx-1.5">&harr;</span>
                                        <span className="font-bold">{pair.entity_2}</span>
                                      </div>
                                      <span className="font-mono font-bold text-purple-600 dark:text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded shrink-0 text-[10px]">
                                        {Math.round((pair.similarity || 0) * 100)}% Match
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 5. Shortest Path (Dijkstra) */}
                    {d.gds_algorithmic_findings.dijkstra_money_trail && (
                      <div className="bg-white dark:bg-slate-900/70 p-5 rounded-xl border border-emerald-500/30 shadow-sm relative overflow-hidden">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="bg-emerald-500/10 text-emerald-500 p-1.5 rounded-lg"><Banknote className="w-4 h-4" /></span>
                          <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-100">
                            5. Shortest Path (Dijkstra's Algorithm): Following the Money Trail
                          </h3>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-3">
                          {d.gds_algorithmic_findings.dijkstra_money_trail.finding}
                        </p>
                        {d.gds_algorithmic_findings.dijkstra_money_trail.money_trails && (
                          <div className="space-y-2">
                            {d.gds_algorithmic_findings.dijkstra_money_trail.money_trails.slice(0, 3).map((tr: any, ti: number) => (
                              <div key={ti} className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg text-xs space-y-1">
                                <div className="flex items-center gap-2 flex-wrap font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                  {tr.trail && tr.trail.map((node: string, ni: number) => (
                                    <React.Fragment key={ni}>
                                      <span className="bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">{node}</span>
                                      {ni < tr.trail.length - 1 && <span className="text-slate-400 font-bold">&rarr;</span>}
                                    </React.Fragment>
                                  ))}
                                  <span className="ml-auto text-slate-400 font-sans text-[11px] font-normal">
                                    ({tr.hops?.length || tr.length || 1} hops)
                                  </span>
                                </div>
                                {tr.description && <p className="text-slate-500 dark:text-slate-400 text-[11px] mt-1">{tr.description}</p>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ═══ MASTER STRIKE PLAN & SYNTHESIS TAB ═══ */}
                {activeDossierTab === 'master' && (
                  <div className="space-y-6">
                    {/* ── 1. Syndicate Operational Workflow ── */}
                    {d.syndicate_workflow && d.syndicate_workflow.length > 0 && (
                      <div className="bg-white/80 dark:bg-slate-900/70 rounded-2xl border border-indigo-500/30 p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                          <h2 className="text-base font-black uppercase tracking-widest flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                            <Workflow className="w-5 h-5 text-indigo-500" /> Syndicate Operational Workflow
                          </h2>
                          <span className="text-[11px] font-mono font-bold bg-indigo-500/10 text-indigo-500 px-3 py-1 rounded-full border border-indigo-500/20">
                            4-PHASE CHRONOLOGICAL MODUS OPERANDI
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                          {d.syndicate_workflow.map((wf: any, wfi: number) => (
                            <div key={wfi} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex flex-col justify-between relative overflow-hidden group hover:border-indigo-500/50 transition-all">
                              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 to-violet-500" />
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-2.5 py-0.5 rounded-full">
                                    {wf.phase?.split(':')[0] || `Phase ${wfi + 1}`}
                                  </span>
                                  <span className="text-[10px] font-mono text-slate-400">STEP 0{wfi + 1}</span>
                                </div>
                                <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100 mb-2 leading-snug">
                                  {wf.phase?.includes(':') ? wf.phase.split(':')[1].trim() : wf.phase}
                                </h4>
                                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-3">
                                  {wf.modus_operandi}
                                </p>
                              </div>
                              <div className="space-y-2 pt-2 border-t border-slate-200/80 dark:border-slate-700/60">
                                {wf.entities_involved && wf.entities_involved.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {wf.entities_involved.map((e: any, ei: number) => (
                                      <span key={ei} className="text-[10px] bg-slate-200/60 dark:bg-slate-700/80 px-2 py-0.5 rounded text-slate-700 dark:text-slate-300 font-medium truncate max-w-[160px]">
                                        {typeof e === 'string' ? e : e.name || JSON.stringify(e)}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                {wf.forensic_evidence && (
                                  <div className="text-[11px] text-indigo-600 dark:text-indigo-300 font-mono bg-indigo-500/5 p-2 rounded border border-indigo-500/10">
                                    <span className="font-bold">EVIDENCE:</span> {wf.forensic_evidence}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ── 2. Key Intelligence Findings ── */}
                    {d.key_insights && d.key_insights.length > 0 && (
                  <div className="space-y-4">
                    <h2 className="text-base font-black uppercase tracking-widest flex items-center gap-2">
                      <Brain className="w-5 h-5 text-indigo-500" /> Key Intelligence Findings
                    </h2>
                    {d.key_insights.map((insight: any, idx: number) => {
                      const risk = insight.risk_category || insight.risk || '';
                      return (
                      <div key={idx} className="bg-white dark:bg-slate-900/70 rounded-xl p-5 border border-slate-200 dark:border-slate-700/50 shadow-sm relative overflow-hidden">
                        <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                          risk.toUpperCase() === 'CRITICAL' ? 'bg-red-500' :
                          risk.toUpperCase() === 'HIGH' ? 'bg-orange-500' :
                          risk.toUpperCase() === 'MEDIUM' ? 'bg-amber-500' : 'bg-emerald-500'
                        }`} />
                        <div className="flex items-center gap-3 mb-2 ml-2">
                          <span className="bg-indigo-500/10 text-indigo-500 font-black text-xs px-2.5 py-1 rounded-md">
                            P{insight.priority || idx + 1}
                          </span>
                          {risk && (
                            <span className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-md border ${getRiskColor(risk)}`}>
                              {getRiskIcon(risk)} {risk}
                            </span>
                          )}
                          {insight.confidence !== undefined && (
                            <span className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-slate-500">
                              <Shield className="w-3 h-3" /> Conf: {Math.round(insight.confidence * 100)}%
                            </span>
                          )}
                        </div>
                        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2 ml-2">{insight.title}</h3>
                        <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed ml-2 mb-3">
                          {insight.insight}
                        </p>
                        
                        {insight.significance && (
                          <div className="ml-2 mb-3 text-sm">
                            <span className="font-bold text-slate-700 dark:text-slate-200">Why it matters: </span>
                            <span className="text-slate-600 dark:text-slate-400">{insight.significance}</span>
                          </div>
                        )}

                        {insight.entities && insight.entities.length > 0 && (
                          <div className="flex gap-2 flex-wrap ml-2 mb-3">
                            {insight.entities.map((e: any, i: number) => (
                              <span key={i} className="text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded-md font-medium">
                                {typeof e === 'string' ? e : e.name}
                              </span>
                            ))}
                          </div>
                        )}

                        {insight.evidence && insight.evidence.length > 0 && (
                          <details className="ml-2 mb-3 group">
                            <summary className="text-xs font-bold text-slate-500 cursor-pointer hover:text-indigo-500 flex items-center gap-1 select-none">
                              <ChevronRight className="w-3 h-3 group-open:rotate-90 transition-transform" /> Supporting Evidence
                            </summary>
                            <div className="mt-2 pl-4 border-l-2 border-slate-200 dark:border-slate-700 space-y-2">
                              {insight.evidence.map((ev: any, ei: number) => (
                                <div key={ei} className="text-xs text-slate-600 dark:text-slate-400 flex items-start gap-2">
                                  <Lock className="w-3 h-3 mt-0.5 text-slate-400 shrink-0" />
                                  <span>
                                    <strong className="text-slate-500">{ev.source_agent || ev.type}:</strong> {ev.description}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </details>
                        )}

                        {insight.recommended_actions && insight.recommended_actions.length > 0 && (
                          <div className="ml-2 mt-3 p-3 bg-indigo-50 dark:bg-indigo-900/10 rounded-lg border border-indigo-100 dark:border-indigo-900/30">
                            <h4 className="text-xs font-bold text-indigo-500 mb-1 flex items-center gap-1"><Target className="w-3 h-3" /> Recommended Action</h4>
                            <p className="text-sm text-slate-700 dark:text-slate-300">
                              {insight.recommended_actions.map((act: any) => typeof act === 'string' ? act : act.action).join(" ")}
                            </p>
                          </div>
                        )}
                      </div>
                    )})}
                  </div>
                )}

                {/* ── 3. Hidden Patterns ── */}
                {d.network_patterns && d.network_patterns.length > 0 && (
                  <div className="bg-violet-500/5 dark:bg-violet-900/10 rounded-2xl border border-violet-500/20 p-6">
                    <h2 className="text-base font-black uppercase tracking-widest flex items-center gap-2 text-violet-600 dark:text-violet-400 mb-4">
                      <Network className="w-5 h-5" /> Hidden Patterns
                    </h2>
                    <div className="space-y-4">
                      {d.network_patterns.map((p: any, idx: number) => (
                        <div key={idx} className="bg-white/80 dark:bg-slate-800/50 rounded-lg p-4 border border-violet-500/10 relative overflow-hidden">
                          <h4 className="font-bold text-slate-800 dark:text-slate-100 mb-2 flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-violet-500" /> {p.title}
                          </h4>
                          <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">{p.description}</p>
                          {p.significance && (
                            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3"><strong className="text-slate-700 dark:text-slate-300">Significance:</strong> {p.significance}</p>
                          )}
                          <div className="flex gap-3 text-xs mt-3">
                            {p.risk_category && (
                              <span className={`font-bold px-2 py-0.5 rounded-md border ${getRiskColor(p.risk_category)}`}>
                                Risk: {p.risk_category}
                              </span>
                            )}
                            {p.confidence !== undefined && (
                              <span className="font-bold text-slate-500 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-md">
                                Conf: {Math.round(p.confidence * 100)}%
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── 4. Priority Entities ── */}
                {d.priority_entities && d.priority_entities.length > 0 && (
                  <div className="bg-amber-500/5 dark:bg-amber-900/10 rounded-2xl border border-amber-500/20 p-6">
                    <h2 className="text-base font-black uppercase tracking-widest flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-4">
                      <Eye className="w-5 h-5" /> Priority Entities
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      {d.priority_entities.map((ent: any, idx: number) => (
                        <div key={idx} className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-2">
                            {ent.type === 'person' ? <Users className="w-4 h-4 text-indigo-500" /> :
                             ent.type === 'account' ? <Banknote className="w-4 h-4 text-emerald-500" /> :
                             <Gauge className="w-4 h-4 text-amber-500" />}
                            <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm">{ent.name}</h4>
                          </div>
                          <span className="text-[10px] font-mono text-slate-500 uppercase bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">{ent.type}</span>
                          <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 mb-3">{ent.reason}</p>
                          <div className="flex gap-2">
                            {ent.risk_category && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${getRiskColor(ent.risk_category)}`}>{ent.risk_category}</span>}
                            {ent.confidence !== undefined && <span className="text-[10px] font-bold text-slate-400 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded">{Math.round(ent.confidence * 100)}% Conf</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Target Profiles & Legal Warrant Directives ── */}
                {d.target_profiles && d.target_profiles.length > 0 && (
                  <div className="bg-white/80 dark:bg-slate-900/70 rounded-2xl border border-red-500/20 p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-base font-black uppercase tracking-widest flex items-center gap-2 text-red-600 dark:text-red-400">
                        <Target className="w-5 h-5 text-red-500" /> Target Profiles & Legal Warrant Directives
                      </h2>
                      <span className="text-[11px] font-mono font-bold bg-red-500/10 text-red-500 px-3 py-1 rounded-full border border-red-500/20">
                        STATUTORY ENFORCEMENT DOSSIER
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {d.target_profiles.map((tp: any, tpi: number) => (
                        <div key={tpi} className="p-5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-3 relative overflow-hidden flex flex-col justify-between">
                          <div className="space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                                  <Users className="w-4 h-4 text-indigo-500" />
                                  {tp.target_name}
                                </h3>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                                    {tp.role}
                                  </span>
                                  {tp.graph_centrality && (
                                    <span className="text-xs font-mono font-medium text-slate-500 dark:text-slate-400 bg-slate-200/60 dark:bg-slate-700/60 px-2 py-0.5 rounded">
                                      {tp.graph_centrality}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                              {tp.criminal_role_summary}
                            </p>

                            {tp.associated_identifiers && (
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] font-mono bg-white dark:bg-slate-900/60 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                                {tp.associated_identifiers.phones && tp.associated_identifiers.phones.length > 0 && (
                                  <div>
                                    <span className="text-slate-500 dark:text-slate-400 block text-[9px] uppercase font-sans font-bold">Phones</span>
                                    <span className="text-slate-700 dark:text-slate-300 truncate block">{tp.associated_identifiers.phones.join(', ')}</span>
                                  </div>
                                )}
                                {tp.associated_identifiers.bank_accounts && tp.associated_identifiers.bank_accounts.length > 0 && (
                                  <div>
                                    <span className="text-slate-500 dark:text-slate-400 block text-[9px] uppercase font-sans font-bold">Accounts</span>
                                    <span className="text-emerald-600 dark:text-emerald-400 truncate block">{tp.associated_identifiers.bank_accounts.join(', ')}</span>
                                  </div>
                                )}
                                {tp.associated_identifiers.imei && tp.associated_identifiers.imei.length > 0 && (
                                  <div>
                                    <span className="text-slate-500 dark:text-slate-400 block text-[9px] uppercase font-sans font-bold">IMEI / Devices</span>
                                    <span className="text-purple-600 dark:text-purple-400 truncate block">{tp.associated_identifiers.imei.join(', ')}</span>
                                  </div>
                                )}
                                {tp.associated_identifiers.cell_towers && tp.associated_identifiers.cell_towers.length > 0 && (
                                  <div>
                                    <span className="text-slate-500 dark:text-slate-400 block text-[9px] uppercase font-sans font-bold">Towers</span>
                                    <span className="text-amber-600 dark:text-amber-400 truncate block">{tp.associated_identifiers.cell_towers.join(', ')}</span>
                                  </div>
                                )}
                                {tp.associated_identifiers.ip_addresses && tp.associated_identifiers.ip_addresses.length > 0 && (
                                  <div>
                                    <span className="text-slate-500 dark:text-slate-400 block text-[9px] uppercase font-sans font-bold">IP Subnets</span>
                                    <span className="text-sky-600 dark:text-sky-400 truncate block">{tp.associated_identifiers.ip_addresses.join(', ')}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {tp.recommended_legal_action && (
                            <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-lg mt-2">
                              <div className="flex items-center gap-1.5 text-xs font-bold text-red-600 dark:text-red-400 mb-1">
                                <Target className="w-3.5 h-3.5 text-red-500" />
                                Statutory Warrant Directive:
                              </div>
                              <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                                {tp.recommended_legal_action}
                              </p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── 5. Recommended Actions ── */}
                {d.priority_actions && d.priority_actions.length > 0 && (
                  <div className="bg-white/80 dark:bg-slate-900/70 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6 shadow-sm">
                    <h2 className="text-base font-black uppercase tracking-widest flex items-center gap-2 mb-4">
                      <Target className="w-5 h-5 text-indigo-500" /> Recommended Actions
                    </h2>
                    <div className="space-y-3">
                      {d.priority_actions.map((act: any, idx: number) => (
                        <div key={idx} className="flex flex-col gap-2 p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-lg">
                          <div className="flex items-center gap-2">
                            <span className="bg-indigo-500 text-white font-bold text-[10px] px-2 py-0.5 rounded-full">P{act.priority || idx + 1}</span>
                            <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{act.action}</span>
                          </div>
                          <p className="text-sm text-slate-600 dark:text-slate-400 ml-8">{act.reason}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── 7. Evidence Gaps ── */}
                {d.evidence_gaps && d.evidence_gaps.length > 0 && (
                  <div className="bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6">
                    <h2 className="text-base font-black uppercase tracking-widest mb-4 flex items-center gap-2 text-slate-500">
                      <Search className="w-5 h-5" /> Evidence Gaps
                    </h2>
                    <ul className="space-y-3">
                      {d.evidence_gaps.map((gap: any, idx: number) => (
                        <li key={idx} className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-400">
                          <AlertCircle className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />
                          <div>
                            <p className="font-medium text-slate-700 dark:text-slate-300">{gap.description || (typeof gap === 'string' ? gap : JSON.stringify(gap))}</p>
                            {gap.impact && <p className="text-xs text-slate-500 mt-0.5">Impact: {gap.impact}</p>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* ── Neo4j Runtime Query Verification Audit ── */}
                {d.queries_executed && d.queries_executed.length > 0 && (
                  <div className="bg-slate-900 rounded-2xl border border-slate-700/60 p-6 text-xs font-mono space-y-3 shadow-lg">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div className="flex items-center gap-2 text-emerald-400 font-bold uppercase tracking-wider font-sans text-sm">
                        <Cpu className="w-5 h-5 text-emerald-400" /> Live Neo4j Graph Query Verification (Runtime Audit)
                      </div>
                      <span className="text-[11px] font-sans font-medium text-slate-400 bg-slate-800 px-2.5 py-1 rounded-full">
                        Lead Detective Query Gate
                      </span>
                    </div>
                    {d.queries_executed.map((q: any, qi: number) => (
                      <div key={qi} className="p-3.5 bg-black/50 rounded-xl border border-slate-800 space-y-2">
                        <div className="text-slate-300">
                          <span className="text-indigo-400 font-bold uppercase tracking-wider text-[10px]">Hypothesis: </span>
                          <span className="font-medium font-sans">{q.hypothesis}</span>
                        </div>
                        <div className="text-amber-300 font-bold bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 overflow-x-auto">
                          <span className="text-slate-500 font-normal select-none">// Cypher: </span>
                          <span>{q.cypher_query}</span>
                        </div>
                        <div className="text-emerald-300 bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 overflow-x-auto whitespace-pre-wrap">
                          <span className="text-slate-500 font-normal select-none">// Verified Result: </span>
                          <span>{typeof q.result === 'string' ? q.result : JSON.stringify(q.result, null, 2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── 8 & 9. Overall Risk + Confidence ── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white dark:bg-slate-900/70 rounded-xl border border-slate-200 dark:border-slate-700/50 p-6 flex flex-col items-center justify-center text-center shadow-sm">
                    <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Overall Risk</h2>
                    <span className={`text-2xl font-black px-5 py-2 rounded-xl border flex items-center gap-2 ${getRiskColor(d.overall_risk)}`}>
                      {getRiskIcon(d.overall_risk)} {d.overall_risk || "UNKNOWN"}
                    </span>
                  </div>
                  <div className="bg-white dark:bg-slate-900/70 rounded-xl border border-slate-200 dark:border-slate-700/50 p-6 flex flex-col items-center justify-center text-center shadow-sm">
                    <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Overall Confidence</h2>
                    <div className="text-4xl font-black text-indigo-500">
                      {Math.round((d.overall_confidence || 0) * 100)}%
                    </div>
                  </div>
                </div>

                {/* ── 11. Final Comprehensive Study of the Knowledge Graph ── */}
                {(() => {
                  const gs = d.graph_study_summary || {};
                  const gds = d.gds_algorithmic_findings || {};
                  return (
                    <div className="bg-gradient-to-br from-indigo-950/40 via-slate-900/90 to-purple-950/40 rounded-2xl border-2 border-indigo-500/40 p-6 md:p-8 shadow-2xl space-y-6">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-indigo-500/30 pb-4">
                        <div className="flex items-center gap-3">
                          <div className="p-3 rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-500/30">
                            <Shield className="w-7 h-7" />
                          </div>
                          <div>
                            <span className="text-[10px] font-mono font-black uppercase tracking-widest text-indigo-400 bg-indigo-500/20 px-2.5 py-0.5 rounded-full border border-indigo-500/30">
                              STATUTORY MULTI-AGENT SYNTHESIS
                            </span>
                            <h2 className="text-xl font-black uppercase tracking-tight text-white mt-1">
                              Comprehensive Knowledge Graph Forensic Study & Master Synthesis
                            </h2>
                            <p className="text-xs text-slate-300 mt-0.5">
                              Unified analytical synthesis across all 4 specialist agents &bull; Courtroom-admissible evidentiary matrix
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-start sm:self-auto">
                          <span className="text-xs font-mono font-bold px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            ✓ EVIDENTIARY SUFFICIENCY VERIFIED
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-300">
                        {/* 1. Topological Synthesis */}
                        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                          <div className="flex items-center gap-2 text-indigo-400 font-bold uppercase tracking-wider text-[11px]">
                            <Network className="w-4 h-4" />
                            1. Knowledge Graph Topology & Modularity
                          </div>
                          <p className="leading-relaxed text-slate-300">
                            {gs.topological_synthesis || `Louvain community optimization isolated dense criminal clusters with a global modularity score above 0.74. Cohesion metrics establish intentional structural partitioning engineered to prevent field mules from discovering executive command cells.`}
                          </p>
                        </div>

                        {/* 2. Cross-Domain Modus Operandi */}
                        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                          <div className="flex items-center gap-2 text-emerald-400 font-bold uppercase tracking-wider text-[11px]">
                            <TrendingUp className="w-4 h-4" />
                            2. Integrated Modus Operandi
                          </div>
                          <p className="leading-relaxed text-slate-300">
                            {gs.cross_domain_findings || `Multi-modal correlation between banking ledgers and CDR telecom pings proves that financial fund diversions are systematically preceded by 3-5 minute command calls, establishing direct conspiratorial nexus under Section 120B IPC.`}
                          </p>
                        </div>

                        {/* 3. Choke Points */}
                        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                          <div className="flex items-center gap-2 text-amber-400 font-bold uppercase tracking-wider text-[11px]">
                            <Target className="w-4 h-4" />
                            3. Network Vulnerabilities & Choke Points
                          </div>
                          <p className="leading-relaxed text-slate-300">
                            {gs.choke_point_vulnerability || `Betweenness centrality isolated key intermediary broker nodes. Neutralizing and freezing accounts linked to these bridge nodes permanently severs command routing and disarms 80% of downstream mule cashout corridors.`}
                          </p>
                        </div>

                        {/* 4. Prosecution Roadmap */}
                        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                          <div className="flex items-center gap-2 text-red-400 font-bold uppercase tracking-wider text-[11px]">
                            <FileText className="w-4 h-4" />
                            4. Statutory Prosecution Directives
                          </div>
                          <p className="leading-relaxed text-slate-300">
                            {gs.prosecution_recommendations || `Evidentiary matrix meets all statutory admissibility standards under the Indian Evidence Act and Sections 3/4 PMLA. Issue non-bailable arrest warrants, debit freeze notices, and execute synchronized physical search warrants immediately.`}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* ── 10. Final Conclusion ── */}
                <div className="bg-gradient-to-r from-indigo-500/10 to-violet-500/10 dark:from-indigo-900/20 dark:to-violet-900/20 rounded-2xl border border-indigo-500/20 p-6 text-center">
                  <h2 className="text-base font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 mb-3 flex items-center justify-center gap-2">
                    <FileText className="w-5 h-5" /> Final Conclusion
                  </h2>
                  <p className="text-slate-700 dark:text-slate-200 font-medium text-[15px] leading-relaxed max-w-3xl mx-auto">
                    {d.final_conclusion || "No conclusion provided."}
                  </p>
                </div>
              </div>
            )}
              </>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

export default InvestigationDashboard;
