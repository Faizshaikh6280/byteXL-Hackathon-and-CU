'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, X, Sparkles, Filter, SlidersHorizontal, Phone, Globe, 
  Landmark, User, Hash, DollarSign, AtSign, Share2, Clock, 
  CheckCircle, ArrowRight, Bot, Database, ShieldAlert, ChevronRight,
  RotateCcw, AlertTriangle, Layers, Radio
} from 'lucide-react';
import { 
  apiClient, OmniSearchCard, OmniSearchResponse, 
  NLQueryResponse, SearchHistoryItem 
} from '../services/apiClient';
import { cn } from '../utils/cn';

interface OmniSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId?: string;
  onPivotToGraph?: (entityId: string) => void;
}

export const OmniSearchModal: React.FC<OmniSearchModalProps> = ({
  isOpen,
  onClose,
  caseId,
  onPivotToGraph
}) => {
  const [query, setQuery] = useState('');
  const [activeMode, setActiveMode] = useState<'entity' | 'natural_language'>('entity');
  const [matchMode, setMatchMode] = useState<'all' | 'exact' | 'fuzzy'>('all');
  
  // Multi-criteria filters
  const [showFilters, setShowFilters] = useState(false);
  const [minConfidence, setMinConfidence] = useState(0.5);
  const [timeBufferMins, setTimeBufferMins] = useState(15);
  const [minRisk, setMinRisk] = useState(0);
  const [minDegree, setMinDegree] = useState(0);
  const [geoTowerId, setGeoTowerId] = useState('');
  const [geoRadiusKm, setGeoRadiusKm] = useState(2);
  const [minAmount, setMinAmount] = useState<number | ''>('');
  const [incidentTime, setIncidentTime] = useState('');

  // Results & States
  const [isLoading, setIsLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<OmniSearchResponse | null>(null);
  const [nlResult, setNlResult] = useState<NLQueryResponse | null>(null);
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // Load search history on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      loadHistory();
    }
  }, [isOpen, caseId]);

  const loadHistory = async () => {
    try {
      const res = await apiClient.getSearchHistory(caseId, 8);
      setHistory(res.history || []);
    } catch (err) {
      console.warn('Failed to load search history:', err);
    }
  };

  // Client-side quick auto-type preview for live badge
  const detectInputType = (val: string): { type: string; label: string; icon: any; color: string } => {
    const trimmed = val.trim();
    if (!trimmed) return { type: 'SEARCH', label: 'Universal Omni-Bar', icon: Search, color: 'text-muted-foreground' };
    
    if (trimmed.length > 25 || /^(find|show|who|list|where|get|what|trace)\b/i.test(trimmed)) {
      return { type: 'NATURAL_LANGUAGE', label: 'Natural Language Query (Qwen 2.5)', icon: Bot, color: 'text-cyan-400' };
    }
    if (/^\+?[0-9]{10,14}$/.test(trimmed.replace(/[\s-]/g, ''))) {
      return { type: 'PHONE', label: 'Cellular / MSISDN', icon: Phone, color: 'text-blue-400' };
    }
    if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(trimmed)) {
      return { type: 'IP_ADDRESS', label: 'IPv4 Address', icon: Globe, color: 'text-purple-400' };
    }
    if (/^(BANK|AC|ACC|SB|CA)?[0-9]{9,18}$/i.test(trimmed.replace(/[\s-]/g, ''))) {
      return { type: 'BANK_ACCOUNT', label: 'Bank Account Number', icon: Landmark, color: 'text-emerald-400' };
    }
    if (/^[0-9]{15}$/.test(trimmed)) {
      return { type: 'IMEI', label: 'Device IMEI (15-digit)', icon: Hash, color: 'text-amber-400' };
    }
    if (trimmed.startsWith('@')) {
      return { type: 'SOCIAL_HANDLE', label: 'Social / Messaging Handle', icon: AtSign, color: 'text-sky-400' };
    }
    if (/^[₹$€£]?[0-9]+([,.][0-9]{2})?$/.test(trimmed)) {
      return { type: 'AMOUNT', label: 'Monetary Transaction Amount', icon: DollarSign, color: 'text-matrixGreen' };
    }
    return { type: 'NAME_KEYWORD', label: 'Person / Entity Keyword', icon: User, color: 'text-primary' };
  };

  const detectedInfo = detectInputType(query);
  const DetectedIcon = detectedInfo.icon;

  const handleSearch = async (overrideQuery?: string) => {
    const q = (overrideQuery ?? query).trim();
    if (!q) return;

    setIsLoading(true);
    setErrorMessage(null);

    if (activeMode === 'natural_language' || detectedInfo.type === 'NATURAL_LANGUAGE') {
      try {
        const res = await apiClient.nlQuery({ prompt: q, case_id: caseId });
        setNlResult(res);
        setSearchResults(null);
        loadHistory();
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to process natural language query.');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    try {
      const res = await apiClient.omniSearch({
        query: q,
        case_id: caseId,
        match_mode: matchMode,
        filters: {
          min_confidence: minConfidence,
          time_window_mins: timeBufferMins,
          min_risk_score: minRisk > 0 ? minRisk * 100 : undefined,
          min_degree: minDegree > 0 ? minDegree : undefined,
          geo_tower_id: geoTowerId.trim() || undefined,
          geo_radius_km: geoRadiusKm,
          min_amount: minAmount !== '' ? Number(minAmount) : undefined,
          incident_time: incidentTime || undefined
        }
      });
      setSearchResults(res);
      setNlResult(null);
      loadHistory();
    } catch (err: any) {
      setErrorMessage(err.message || 'Search execution failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-4xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Top Omni-Bar Input */}
        <div className="p-4 border-b border-border bg-card/80">
          <div className="flex items-center gap-2 mb-2">
            <button
              type="button"
              onClick={() => setActiveMode('entity')}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer",
                activeMode === 'entity' 
                  ? "bg-primary text-primary-foreground shadow-sm" 
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              )}
            >
              <Search className="w-3.5 h-3.5" /> Entity & Identifier Search
            </button>
            <button
              type="button"
              onClick={() => setActiveMode('natural_language')}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer",
                activeMode === 'natural_language' 
                  ? "bg-primary text-primary-foreground shadow-sm" 
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              )}
            >
              <Bot className="w-3.5 h-3.5 text-cyan-400" /> Natural Language AI (Qwen 2.5)
            </button>

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowFilters(!showFilters)}
                className={cn(
                  "p-1.5 rounded-lg border text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer",
                  showFilters ? "bg-primary/10 border-primary text-primary" : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                )}
                title="Toggle Advanced Spatial-Temporal & Risk Filters"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Filters</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Main Input Row */}
          <div className="relative flex items-center bg-secondary/80 rounded-xl border border-border focus-within:border-primary px-3 py-2 transition-all">
            <DetectedIcon className={cn("w-5 h-5 shrink-0 mr-3", detectedInfo.color)} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                activeMode === 'natural_language'
                  ? "Ask in plain English, e.g. 'Find all persons connected to bank accounts receiving over 10 lakhs'..."
                  : "Omni-Bar: Enter name, phone (+91...), IP (103...), bank account, handle (@...), or amount..."
              }
              className="flex-1 bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground text-sm font-medium"
            />

            {query && (
              <button
                type="button"
                onClick={() => { setQuery(''); setSearchResults(null); setNlResult(null); }}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground mr-2 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              disabled={isLoading || !query.trim()}
              onClick={() => handleSearch()}
              className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  Searching...
                </>
              ) : (
                <>Search <ArrowRight className="w-3 h-3" /></>
              )}
            </button>
          </div>

          {/* Auto-Type Recognition Pill & Match Mode Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-2 mt-2 px-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Detected Modality:</span>
              <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 bg-card", detectedInfo.color)}>
                <DetectedIcon className="w-3 h-3" />
                {detectedInfo.label}
              </span>
            </div>

            {activeMode === 'entity' && (
              <div className="flex items-center gap-1 bg-secondary/60 p-0.5 rounded-lg border border-border">
                <button
                  type="button"
                  onClick={() => setMatchMode('all')}
                  className={cn(
                    "px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer",
                    matchMode === 'all' ? "bg-card text-primary shadow-xs" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Smart (All)
                </button>
                <button
                  type="button"
                  onClick={() => setMatchMode('exact')}
                  className={cn(
                    "px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer",
                    matchMode === 'exact' ? "bg-card text-primary shadow-xs" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Exact Match
                </button>
                <button
                  type="button"
                  onClick={() => setMatchMode('fuzzy')}
                  className={cn(
                    "px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer",
                    matchMode === 'fuzzy' ? "bg-card text-primary shadow-xs" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Fuzzy (Jaro-Winkler)
                </button>
              </div>
            )}
          </div>

          {/* Collapsible Multi-Criteria & Spatial-Temporal Filters Drawer */}
          {showFilters && (
            <div className="mt-3 p-4 rounded-xl bg-secondary/60 border border-border space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* 1. Temporal Bounding */}
                <div className="p-3 rounded-xl bg-card border border-border/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-blue-400" /> Temporal Bounding
                    </span>
                    <span className="text-[10px] font-mono text-primary font-bold">±{timeBufferMins} mins</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="120"
                    step="5"
                    value={timeBufferMins}
                    onChange={e => setTimeBufferMins(Number(e.target.value))}
                    className="w-full cursor-pointer accent-primary"
                  />
                  <input
                    type="text"
                    placeholder="Incident time (e.g. 14:05 UTC)"
                    value={incidentTime}
                    onChange={e => setIncidentTime(e.target.value)}
                    className="w-full px-2 py-1 rounded bg-secondary text-[11px] font-mono border border-border text-foreground placeholder:text-muted-foreground"
                  />
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    Filters records within customizable sliding windows (e.g., active within ±15 minutes of an incident).
                  </p>
                </div>

                {/* 2. Geospatial Radius */}
                <div className="p-3 rounded-xl bg-card border border-border/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5 text-purple-400" /> Geospatial Radius
                    </span>
                    <span className="text-[10px] font-mono text-primary font-bold">{geoRadiusKm} km radius</span>
                  </div>
                  <input
                    type="text"
                    placeholder="Tower ID or Location (e.g. 104, Sector 17)"
                    value={geoTowerId}
                    onChange={e => setGeoTowerId(e.target.value)}
                    className="w-full px-2 py-1 rounded bg-secondary text-[11px] font-mono border border-border text-foreground placeholder:text-muted-foreground"
                  />
                  <input
                    type="range"
                    min="1"
                    max="15"
                    step="1"
                    value={geoRadiusKm}
                    onChange={e => setGeoRadiusKm(Number(e.target.value))}
                    className="w-full cursor-pointer accent-primary"
                  />
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    Allows queries like "Find all active devices within 2 km radius of Cell Tower 104".
                  </p>
                </div>

                {/* 3. Cross-Domain Thresholds */}
                <div className="p-3 rounded-xl bg-card border border-border/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" /> Cross-Domain Thresholds
                    </span>
                    <span className="text-[10px] font-mono text-primary font-bold">
                      {minRisk > 0 ? `Risk > ${Math.round(minRisk * 100)}%` : 'No floor'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-muted-foreground block mb-0.5">Risk Floor:</span>
                      <input
                        type="range"
                        min="0"
                        max="0.9"
                        step="0.1"
                        value={minRisk}
                        onChange={e => setMinRisk(Number(e.target.value))}
                        className="w-full cursor-pointer accent-primary"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block mb-0.5">Degree &gt; {minDegree}:</span>
                      <input
                        type="range"
                        min="0"
                        max="10"
                        step="1"
                        value={minDegree}
                        onChange={e => setMinDegree(Number(e.target.value))}
                        className="w-full cursor-pointer accent-primary"
                      />
                    </div>
                  </div>
                  <input
                    type="number"
                    placeholder="Min Amount ₹ (e.g. 200000)"
                    value={minAmount}
                    onChange={e => setMinAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-2 py-1 rounded bg-secondary text-[11px] font-mono border border-border text-foreground placeholder:text-muted-foreground"
                  />
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    Filters entities based on Composite Risk Score (&gt; 75), high amounts, or node degree (&gt; 3).
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Search History Chips when no query or fresh state */}
          {!searchResults && !nlResult && history.length > 0 && (
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <RotateCcw className="w-3 h-3 text-primary" /> Case Search History
              </div>
              <div className="flex flex-wrap gap-2">
                {history.map(item => {
                  const qText = item.query || (item as any).query_text || 'Query';
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setQuery(qText);
                        handleSearch(qText);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-secondary hover:bg-secondary/80 border border-border text-xs text-foreground flex items-center gap-1.5 transition-colors cursor-pointer group"
                    >
                      <Search className="w-3 h-3 text-muted-foreground group-hover:text-primary" />
                      <span>{qText}</span>
                      {item.detected_type && (
                        <span className="text-[9px] font-mono px-1 rounded bg-background text-muted-foreground">
                          {item.detected_type}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Natural Language Query Results */}
          {nlResult && (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-cyan-950/20 border border-cyan-500/30">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-cyan-400">
                    <Bot className="w-4 h-4" /> Synthesized Cypher Query (Qwen 2.5 Local LLM)
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {nlResult.result_count ?? nlResult.total_records ?? nlResult.records?.length ?? 0} Graph Records Found
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-obsidian border border-cyan-500/20 font-mono text-xs text-cyan-300 overflow-x-auto whitespace-pre">
                  {nlResult.generated_cypher || nlResult.cypher_query}
                </div>
              </div>

              {/* Records List */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Graph Result Entities
                </div>
                {nlResult.records.length === 0 ? (
                  <div className="p-6 text-center text-xs text-muted-foreground bg-secondary/20 rounded-xl">
                    No matching graph patterns located for this query.
                  </div>
                ) : (
                  nlResult.records.map((rec, i) => {
                    const primary = rec.p || rec.b || rec.n || rec;
                    
                    // Extract real entity name/label from record properties
                    const entityTitle = primary.name || primary.suspect_name || primary.sender_holder || primary.recipient_holder || primary.holder;
                    const accountOrPhone = primary.account_number || primary.sender_account || primary.recipient_account || primary.phone_number || primary.number || primary.phone || primary.source || primary.destination;
                    const amountVal = primary.amount !== undefined ? (Number(primary.amount) >= 100000 ? `₹${(Number(primary.amount)/100000).toFixed(1)}L` : `₹${Number(primary.amount).toLocaleString()}`) : null;
                    const locationOrTower = primary.tower_id || primary.location || primary.address;
                    const clusterId = primary.golden_id || primary.cluster_id || primary.z_cluster_id;
                    const riskScore = primary.risk_score !== undefined ? Math.round(Number(primary.risk_score) * 100) : (primary.risk ? Math.round(Number(primary.risk) * 100) : null);

                    const displayName = entityTitle || accountOrPhone || locationOrTower || clusterId || `Entity Record #${i+1}`;
                    const pivotId = clusterId || accountOrPhone || entityTitle || primary.id || displayName;

                    return (
                      <div 
                        key={i}
                        className="p-3 rounded-xl bg-card border border-border/80 hover:border-primary/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-secondary text-primary">
                            <Database className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-xs font-bold text-foreground flex items-center gap-2">
                              <span>{displayName}</span>
                              {amountVal && (
                                <span className="text-[10px] font-mono font-bold text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                                  {amountVal}
                                </span>
                              )}
                              {riskScore !== null && (
                                <span className="text-[10px] font-mono font-bold text-amber-400 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                                  {riskScore}% Risk
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-muted-foreground font-mono flex flex-wrap items-center gap-2 mt-0.5">
                              {accountOrPhone && accountOrPhone !== displayName && (
                                <span>Account/Phone: <strong className="text-foreground">{accountOrPhone}</strong></span>
                              )}
                              {clusterId && <span>Cluster: {clusterId}</span>}
                              {locationOrTower && <span>Tower/Loc: {locationOrTower}</span>}
                              {primary.communityId !== undefined && <span>Community #{primary.communityId}</span>}
                              {primary.pagerank !== undefined && <span>PageRank: {Number(primary.pagerank).toFixed(3)}</span>}
                            </div>
                          </div>
                        </div>

                        {onPivotToGraph && pivotId && (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onPivotToGraph(pivotId);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer self-end sm:self-auto"
                          >
                            <Share2 className="w-3 h-3" /> Pivot to Graph
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Unified Entity Knowledge Cards Results */}
          {searchResults && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                <span>
                  Found <strong className="text-foreground">{searchResults.total_results}</strong> resolved match{searchResults.total_results !== 1 ? 'es' : ''} in case
                </span>
                <span className="font-mono text-[11px]">Mode: {searchResults.match_mode.toUpperCase()}</span>
              </div>

              {searchResults.cards.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground bg-secondary/30 rounded-2xl border border-dashed border-border">
                  No entities matched "{searchResults.query}". Try toggling Fuzzy Match or broadening filters.
                </div>
              ) : (
                searchResults.cards.map((card, idx) => (
                  <div 
                    key={idx}
                    className="p-4 rounded-2xl bg-secondary/30 border border-border hover:border-primary/40 transition-all shadow-sm space-y-3"
                  >
                    {/* Header */}
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                          {card.primary_name ? card.primary_name[0].toUpperCase() : 'E'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-foreground">{card.primary_name}</h4>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-secondary border border-border text-muted-foreground">
                              {card.type}
                            </span>
                            <span className={cn(
                              "text-[10px] font-extrabold px-2 py-0.5 rounded-full border",
                              card.risk_level === 'CRITICAL' ? "bg-rose-500/10 text-rose-500 border-rose-500/30" :
                              card.risk_level === 'HIGH' ? "bg-amber-500/10 text-amber-500 border-amber-500/30" :
                              "bg-blue-500/10 text-blue-400 border-blue-500/30"
                            )}>
                              {card.risk_level} ({Math.round(card.risk_score * 100)}%)
                            </span>
                          </div>
                          <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                            <span className="font-mono text-primary font-semibold">{card.entity_id}</span>
                            <span>•</span>
                            <span className="text-emerald-400 font-medium">{card.match_reason}</span>
                          </div>
                        </div>
                      </div>

                      {/* Pivot Action */}
                      {onPivotToGraph && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onPivotToGraph(card.graph_pivot_id || card.entity_id || card.primary_name);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                        >
                          <Share2 className="w-3.5 h-3.5" /> Pivot to Graph Visualizer
                        </button>
                      )}
                    </div>

                    {/* Resolved Person Identity Banner (for Bank Accounts / Phone / Device nodes resolved to real identities) */}
                    {card.resolved_person && (
                      <div className="p-3 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-primary/20 text-primary flex items-center justify-center font-bold text-xs">
                            <User className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-primary">
                              Resolved Entity Identity
                            </div>
                            <div className="text-xs font-bold text-foreground flex items-center gap-2">
                              <span>{card.resolved_person.name}</span>
                              {card.resolved_person.role && (
                                <span className="text-[10px] font-medium text-muted-foreground px-1.5 py-0.5 rounded bg-secondary border border-border">
                                  {card.resolved_person.role}
                                </span>
                              )}
                              {card.resolved_person.risk_score !== undefined && (
                                <span className="text-[10px] font-bold text-amber-400">
                                  Risk: {Math.round(card.resolved_person.risk_score * 100)}%
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        {onPivotToGraph && (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onPivotToGraph(card.resolved_person?.name || card.graph_pivot_id || card.entity_id);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary text-[11px] font-semibold flex items-center gap-1 border border-primary/40 transition-colors cursor-pointer"
                          >
                            <Share2 className="w-3 h-3" /> View Resolved Person
                          </button>
                        )}
                      </div>
                    )}

                    {/* Identifiers Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs pt-1">
                      {card.verified_phones && card.verified_phones.length > 0 && (
                        <div className="p-2 rounded-xl bg-card border border-border/70">
                          <div className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1 mb-1">
                            <Phone className="w-3 h-3 text-blue-400" /> Verified Phones
                          </div>
                          <div className="font-mono text-xs text-foreground truncate">
                            {card.verified_phones.join(', ')}
                          </div>
                        </div>
                      )}

                      {card.bank_accounts && card.bank_accounts.length > 0 && (
                        <div className="p-2 rounded-xl bg-card border border-border/70">
                          <div className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1 mb-1">
                            <Landmark className="w-3 h-3 text-emerald-400" /> Bank Accounts
                          </div>
                          <div className="font-mono text-xs text-foreground truncate">
                            {card.bank_accounts.join(', ')}
                          </div>
                        </div>
                      )}

                      {card.known_aliases && card.known_aliases.length > 0 && (
                        <div className="p-2 rounded-xl bg-card border border-border/70">
                          <div className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1 mb-1">
                            <User className="w-3 h-3 text-purple-400" /> Known Aliases
                          </div>
                          <div className="text-xs text-foreground truncate">
                            {card.known_aliases.join(', ')}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Associated Cross-Domain Anomalies */}
                    {card.associated_anomalies && card.associated_anomalies.length > 0 && (
                      <div className="pt-2 border-t border-border/60 space-y-2">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <AlertTriangle className="w-3 h-3 text-amber-500" />
                          Associated Anomalies ({card.associated_anomalies.length})
                        </div>
                        <div className="space-y-1.5">
                          {card.associated_anomalies.map((ano, aIdx) => (
                            <div 
                              key={aIdx} 
                              className="p-2.5 rounded-xl bg-card border border-border/70 flex flex-col gap-1 text-xs"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className={cn(
                                    "text-[10px] font-extrabold px-1.5 py-0.5 rounded border",
                                    ano.severity === 'CRITICAL' ? "bg-rose-500/10 text-rose-500 border-rose-500/30" :
                                    ano.severity === 'HIGH' ? "bg-amber-500/10 text-amber-500 border-amber-500/30" :
                                    "bg-blue-500/10 text-blue-400 border-blue-500/30"
                                  )}>
                                    {ano.severity}
                                  </span>
                                  <span className="font-semibold text-foreground text-xs">{ano.title}</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                  <span className="px-1.5 py-0.5 rounded bg-secondary border border-border font-mono">{ano.domain}</span>
                                  {ano.score !== undefined && (
                                    <span className="font-mono text-amber-400 font-bold">
                                      Score: {Math.round(ano.score * 100)}%
                                    </span>
                                  )}
                                </div>
                              </div>
                              {ano.what_happened && (
                                <p className="text-[11px] text-muted-foreground leading-relaxed pl-1 border-l-2 border-primary/30">
                                  {ano.what_happened}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Associated Investigation Alerts */}
                    {card.associated_alerts && card.associated_alerts.length > 0 && (
                      <div className="pt-2 border-t border-border/60 space-y-1.5">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <ShieldAlert className="w-3 h-3 text-rose-400" />
                          Associated Alerts ({card.associated_alerts.length})
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {card.associated_alerts.map((alt, alIdx) => (
                            <div 
                              key={alIdx}
                              className="px-2.5 py-1 rounded-xl bg-card border border-rose-500/20 text-xs flex items-center gap-2"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                              <span className="font-medium text-foreground">{alt.pattern_name}</span>
                              <span className="text-[10px] font-extrabold text-rose-400 font-mono">
                                {alt.risk_level} ({Math.round(alt.risk_score * 100)}%)
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Timeline Preview Snippet */}
                    {card.timeline_snippet && card.timeline_snippet.length > 0 && (
                      <div className="pt-2 border-t border-border/60">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-primary" /> Associated Activity Fingerprint
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {card.timeline_snippet.map((snip, sIdx) => (
                            <span 
                              key={sIdx}
                              className="px-2 py-0.5 rounded-lg bg-card border border-border text-[11px] text-muted-foreground flex items-center gap-1.5"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                              <strong className="text-foreground">{snip.label}</strong>
                              <span className="text-[10px] text-muted-foreground">({snip.time})</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-border bg-card/60 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <kbd className="font-mono text-[10px] bg-secondary border border-border px-1.5 py-0.5 rounded">ESC</kbd>
            <span>to close</span>
            <span className="mx-1">•</span>
            <kbd className="font-mono text-[10px] bg-secondary border border-border px-1.5 py-0.5 rounded">ENTER</kbd>
            <span>to execute</span>
          </div>
          <div className="text-[11px] font-mono text-muted-foreground flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-primary" /> TRACE Intelligent Omni-Bar Engine
          </div>
        </div>
      </div>
    </div>
  );
};

export default OmniSearchModal;
