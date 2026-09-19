'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, Clock, MapPin, Smartphone, CreditCard, MessagesSquare, Globe, 
  AlertTriangle, ShieldCheck, Share2, FileText, Bookmark, ExternalLink, 
  Compass, Link2, Hash, Database, CheckCircle2, Copy, Check,
  Navigation, Zap, Eye, ChevronRight, Layers, ArrowRight, Activity,
  Maximize2, ArrowLeftRight, UserCheck, Calendar, Phone, RadioTower,
  Sliders, ChevronDown
} from 'lucide-react';
import { 
  TimelineCanonicalEvent, 
  TemporalCorrelation, 
  ActivityBurst, 
  TemporalInconsistency,
  TimelineSummaryStats,
  apiClient
} from '../../services/apiClient';
import { useTimelineStore } from '../../store/useTimelineStore';
import { 
  getDomainTheme, 
  getEpistemicConfig, 
  getRiskConfig, 
  formatEventDateTime, 
  formatINR 
} from './timelineAdapters';
import { cn } from '../../utils/cn';

export type TimelineDrawerTab = 'DOSSIER' | 'CONTEXT' | 'CORRELATIONS' | 'RAW';

interface TimelineIntelligenceDrawerProps {
  isOpen: boolean;
  event: TimelineCanonicalEvent | null;
  allEvents: TimelineCanonicalEvent[];
  correlations: TemporalCorrelation[];
  bursts: ActivityBurst[];
  inconsistencies: TemporalInconsistency[];
  summary: TimelineSummaryStats;
  onClose: () => void;
  onFocusEventTime: (timestampMs: number) => void;
  onZoomWindow: (startMs: number, endMs: number) => void;
  onNavigateToGraph?: (entityId: string) => void;
  onNavigateToMap?: (entityId?: string) => void;
}

interface DrawerErrorBoundaryProps {
  children: React.ReactNode;
  onClose: () => void;
}

interface DrawerErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class DrawerErrorBoundary extends React.Component<DrawerErrorBoundaryProps, DrawerErrorBoundaryState> {
  constructor(props: DrawerErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): DrawerErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error("[TimelineIntelligenceDrawer] Caught rendering error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-y-0 right-0 w-full sm:w-[540px] md:w-[600px] bg-card/98 border-l border-border shadow-2xl z-40 flex flex-col backdrop-blur-xl p-6 justify-center items-center text-center space-y-4">
          <AlertTriangle className="w-10 h-10 text-amber-500" />
          <h3 className="text-sm font-bold text-foreground">Unable to Display Event Details</h3>
          <p className="text-xs text-muted-foreground max-w-sm">
            {this.state.error?.message || "Some telemetry fields for this event could not be formatted."}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              this.props.onClose();
            }}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/90 transition-colors"
          >
            Close Panel
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export const TimelineIntelligenceDrawer: React.FC<TimelineIntelligenceDrawerProps> = (props) => {
  return (
    <DrawerErrorBoundary onClose={props.onClose}>
      <TimelineIntelligenceDrawerContent {...props} />
    </DrawerErrorBoundary>
  );
};

const TimelineIntelligenceDrawerContent: React.FC<TimelineIntelligenceDrawerProps> = ({
  isOpen,
  event,
  allEvents,
  correlations,
  bursts,
  inconsistencies,
  summary,
  onClose,
  onFocusEventTime,
  onZoomWindow,
  onNavigateToGraph,
  onNavigateToMap
}) => {
  const [activeTab, setActiveTab] = useState<TimelineDrawerTab>('DOSSIER');
  const [copiedHash, setCopiedHash] = useState(false);
  const [copiedCoords, setCopiedCoords] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);

  // Context neighborhood state
  const [contextMinutes, setContextMinutes] = useState<number>(15);
  const [loadingContext, setLoadingContext] = useState<boolean>(false);
  const [contextEvents, setContextEvents] = useState<TimelineCanonicalEvent[]>([]);

  const { setSelectedEventId } = useTimelineStore();

  // Reset tab when event changes
  useEffect(() => {
    if (event) {
      setActiveTab('DOSSIER');
    }
  }, [event?.event_id]);

  // Fetch temporal context neighborhood when context tab or event changes
  useEffect(() => {
    if (!event || !isOpen) return;

    let isMounted = true;
    const fetchContext = async () => {
      setLoadingContext(true);
      try {
        const resp = await apiClient.getTimelineEventContext(
          event.event_id, 
          contextMinutes, 
          event.case_id
        );
        if (isMounted && resp?.context_events) {
          setContextEvents(resp.context_events);
        }
      } catch (err) {
        // Fallback: local window calculation from allEvents
        const windowMs = contextMinutes * 60 * 1000;
        const localNearby = allEvents.filter(e => 
          e.event_id !== event.event_id &&
          Math.abs(e.timestamp_ms - event.timestamp_ms) <= windowMs
        ).sort((a, b) => a.timestamp_ms - b.timestamp_ms);
        if (isMounted) setContextEvents(localNearby);
      } finally {
        if (isMounted) setLoadingContext(false);
      }
    };

    fetchContext();
    return () => { isMounted = false; };
  }, [event, contextMinutes, isOpen, allEvents]);

  if (!isOpen || !event) return null;

  const domainCfg = getDomainTheme(event.domain);
  const epistemicCfg = getEpistemicConfig(event.epistemic_status);
  const riskCfg = getRiskConfig(event.risk_level, event.anomaly_score);

  const relevantCorrelations = correlations.filter(
    c => c.event_a_id === event.event_id || c.event_b_id === event.event_id
  );

  const relevantInconsistencies = inconsistencies.filter(
    inc => inc.event_a_id === event.event_id || inc.event_b_id === event.event_id
  );

  const copyHash = () => {
    if (event.evidence_sha256) {
      navigator.clipboard.writeText(event.evidence_sha256);
      setCopiedHash(true);
      setTimeout(() => setCopiedHash(false), 2000);
    }
  };

  const copyCoords = (coordsStr: string) => {
    navigator.clipboard.writeText(coordsStr);
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 2000);
  };

  // Prior and posterior events around target
  const priorEvents = contextEvents.filter(e => e.timestamp_ms < event.timestamp_ms);
  const posteriorEvents = contextEvents.filter(e => e.timestamp_ms > event.timestamp_ms);

  return (
    <>
      {/* Mobile Backdrop */}
      <div 
        onClick={onClose}
        className="fixed inset-0 bg-black/60 z-35 md:hidden backdrop-blur-xs"
      />
      <div className="fixed inset-y-0 right-0 w-full sm:w-[540px] md:w-[600px] bg-card/98 border-l border-border shadow-2xl z-40 flex flex-col backdrop-blur-xl animate-in slide-in-from-right duration-300 text-foreground select-none">
      {/* ─────────────────────────────────────────────────────────────
          1. DRAWER TOP HEADER
         ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-card">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn("p-2 rounded-xl border flex-shrink-0", domainCfg.bg, domainCfg.border)}>
            <domainCfg.icon className={cn("w-5 h-5", domainCfg.color)} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm tracking-tight text-foreground truncate">
                {event.event_type}
              </h3>
              <span className={cn(
                "text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider",
                epistemicCfg.badgeClass
              )}>
                {epistemicCfg.label}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground font-mono truncate">
              {event.event_id} · {domainCfg.label}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsBookmarked(!isBookmarked)}
            className={cn(
              "p-2 rounded-lg hover:bg-secondary transition-colors",
              isBookmarked ? "text-amber-400 fill-current" : "text-muted-foreground hover:text-foreground"
            )}
            title="Bookmark Event"
          >
            <Bookmark className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors"
            title="Close Drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          2. NAVIGATION TABS (Dossier, Context, Correlations, Raw)
         ───────────────────────────────────────────────────────────── */}
      <div className="flex border-b border-border bg-secondary/40 text-xs px-3 gap-1 overflow-x-auto scrollbar-hide flex-shrink-0">
        {[
          { id: 'DOSSIER' as TimelineDrawerTab, label: 'Event Dossier', icon: FileText },
          { id: 'CONTEXT' as TimelineDrawerTab, label: 'Context (±30m)', icon: ArrowLeftRight, count: contextEvents.length },
          { id: 'CORRELATIONS' as TimelineDrawerTab, label: 'Correlations', icon: Share2, count: relevantCorrelations.length + relevantInconsistencies.length },
          { id: 'RAW' as TimelineDrawerTab, label: 'Raw Evidence', icon: Database },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-3 py-2.5 font-semibold flex items-center gap-1.5 border-b-2 transition-all text-xs whitespace-nowrap",
              activeTab === tab.id
                ? "border-primary text-primary bg-card/60"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-card/20"
            )}
          >
            <tab.icon className="w-3.5 h-3.5" />
            <span>{tab.label}</span>
            {tab.count !== undefined && tab.count > 0 && (
              <span className={cn(
                "px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold border",
                activeTab === tab.id
                  ? "bg-primary/20 text-primary border-primary/30"
                  : "bg-secondary text-muted-foreground border-border"
              )}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          3. TAB CONTENTS BODY
         ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs custom-scrollbar">
        {/* ================= TAB 1: DOSSIER ================= */}
        {activeTab === 'DOSSIER' && (
          <div className="space-y-4">
            {/* Action Bar (Direct Timeline Jumping & Cross-Navigation) */}
            <div className="grid grid-cols-4 gap-2">
              <button
                onClick={() => onFocusEventTime(event.timestamp_ms)}
                className="p-2 rounded-xl bg-secondary/80 hover:bg-secondary border border-border flex flex-col items-center justify-center gap-1 text-[10px] font-semibold text-foreground transition-all hover:border-primary/50 shadow-2xs"
                title="Jump playback scrubber to this timestamp"
              >
                <Clock className="w-4 h-4 text-cyan-500" />
                <span>Jump Scrubber</span>
              </button>

              <button
                onClick={() => {
                  const margin = 15 * 60 * 1000;
                  onZoomWindow(event.timestamp_ms - margin, event.timestamp_ms + margin);
                }}
                className="p-2 rounded-xl bg-secondary/80 hover:bg-secondary border border-border flex flex-col items-center justify-center gap-1 text-[10px] font-semibold text-foreground transition-all hover:border-primary/50 shadow-2xs"
                title="Zoom viewport to ±15 minutes around this event"
              >
                <Maximize2 className="w-4 h-4 text-purple-500" />
                <span>Focus (±15m)</span>
              </button>

              {onNavigateToGraph && (
                <button
                  onClick={() => onNavigateToGraph(event.z_cluster_id || event.entity_name || event.actor_entities[0])}
                  className="p-2 rounded-xl bg-secondary/80 hover:bg-secondary border border-border flex flex-col items-center justify-center gap-1 text-[10px] font-semibold text-foreground transition-all hover:border-primary/50 shadow-2xs"
                  title="Explore entity connections in Link Analysis Graph"
                >
                  <Share2 className="w-4 h-4 text-indigo-500" />
                  <span>Graph Link</span>
                </button>
              )}

              {onNavigateToMap && (
                <button
                  onClick={() => onNavigateToMap(event.z_cluster_id || event.entity_name)}
                  className="p-2 rounded-xl bg-secondary/80 hover:bg-secondary border border-border flex flex-col items-center justify-center gap-1 text-[10px] font-semibold text-foreground transition-all hover:border-primary/50 shadow-2xs"
                  title="Track geographic coordinates on Geospatial Map"
                >
                  <MapPin className="w-4 h-4 text-amber-500" />
                  <span>Sync Map</span>
                </button>
              )}
            </div>

            {/* Event Narration / Summary */}
            <div className="p-3.5 rounded-xl bg-secondary/40 border border-border/80 space-y-1.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
                  Event Synopsis
                </span>
                {event.risk_level && event.risk_level !== 'NONE' && (
                  <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase", riskCfg.badgeClass)}>
                    {event.risk_level} (Score: {event.anomaly_score != null ? Math.round(Number(event.anomaly_score)) : 0})
                  </span>
                )}
              </div>
              <p className="text-foreground text-xs leading-relaxed font-medium">
                {event.narration || `${event.event_type} event recorded in ${event.domain} domain.`}
              </p>
            </div>

            {/* Temporal Provenance Block */}
            <div className="p-3 rounded-xl bg-secondary/30 border border-border space-y-2 font-mono text-[11px]">
              <div className="flex items-center gap-1.5 text-xs font-bold text-foreground font-sans">
                <Clock className="w-3.5 h-3.5 text-primary" />
                <span>Temporal Provenance</span>
              </div>
              <div className="space-y-1.5 pt-1 border-t border-border/40">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground font-sans">Normalized UTC:</span>
                  <span className="font-bold text-foreground">{event.normalized_timestamp ? event.normalized_timestamp.replace('T', ' ').slice(0, 19) : '--'} UTC</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground font-sans">Raw Timestamp:</span>
                  <span className="text-muted-foreground truncate max-w-[220px]" title={event.raw_timestamp || ''}>
                    {event.raw_timestamp || '--'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground font-sans">Source Timezone:</span>
                  <span className={cn("font-bold", event.timezone_offset ? "text-foreground" : "text-amber-500")}>
                    {event.timezone_offset || 'UTC / Unknown'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground font-sans">Precision & Confidence:</span>
                  <span className="text-foreground font-sans font-semibold">
                    {event.timestamp_precision || 'SECOND'} · {Math.round((event.timestamp_confidence || 1.0) * 100)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Entity Attribution */}
            <div className="p-3 rounded-xl bg-secondary/30 border border-border space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                <UserCheck className="w-3.5 h-3.5 text-indigo-500" />
                <span>Entity Attribution</span>
              </div>
              <div className="space-y-2 pt-1 border-t border-border/40">
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-mono block">Primary Subject</span>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-sm font-bold text-foreground">
                      {event.entity_name || (event.actor_entities && event.actor_entities[0]) || 'Unresolved Entity'}
                    </span>
                    {event.z_cluster_id && (
                      <span className="px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/25 font-mono text-[10px] font-bold">
                        {event.z_cluster_id}
                      </span>
                    )}
                  </div>
                </div>

                {Array.isArray(event.actor_entities) && event.actor_entities.length > 1 && (
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-mono block">Associated Actors</span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {event.actor_entities.map((actor, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded bg-secondary border border-border text-[11px] font-medium text-foreground">
                          {actor}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {Array.isArray(event.target_entities) && event.target_entities.length > 0 && (
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-mono block">Target Entities / Counterparties</span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {event.target_entities.map((target, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/25 text-[11px] font-medium text-amber-500">
                          {target}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Financial Telemetry (if banking / financial) */}
            {(event.amount_inr != null || event.domain === 'FINANCIAL') && (
              <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  <div className="flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Financial Transaction Telemetry</span>
                  </div>
                  {event.amount_inr != null && (
                    <span className="font-mono text-sm font-bold">
                      {formatINR(event.amount_inr)}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono pt-1 border-t border-emerald-500/20">
                  {(event.attributes?.sender_account || event.channel) && (
                    <div>
                      <span className="text-muted-foreground font-sans block text-[10px]">Sender / Channel</span>
                      <span className="text-foreground font-bold">{event.attributes?.sender_account || event.channel}</span>
                    </div>
                  )}
                  {(event.attributes?.receiver_account || event.counterparty) && (
                    <div>
                      <span className="text-muted-foreground font-sans block text-[10px]">Receiver / Counterparty</span>
                      <span className="text-foreground font-bold">{event.attributes?.receiver_account || event.counterparty}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Telecom & CDR Telemetry */}
            {((event.duration_seconds != null && !isNaN(Number(event.duration_seconds))) || event.cell_tower_id || event.domain === 'TELECOM') && (
              <div className="p-3 rounded-xl bg-indigo-500/5 border border-indigo-500/20 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-indigo-600 dark:text-indigo-400">
                  <div className="flex items-center gap-1.5">
                    <RadioTower className="w-3.5 h-3.5" />
                    <span>Telecom & Cell Tower Telemetry</span>
                  </div>
                  {event.duration_seconds != null && !isNaN(Number(event.duration_seconds)) && (
                    <span className="font-mono text-xs font-bold">
                      {event.duration_seconds}s ({Math.round(Number(event.duration_seconds) / 60)}m)
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono pt-1 border-t border-indigo-500/20">
                  {event.cell_tower_id && (
                    <div>
                      <span className="text-muted-foreground font-sans block text-[10px]">Tower ID</span>
                      <span className="text-foreground font-bold">{event.cell_tower_id}</span>
                    </div>
                  )}
                  {event.attributes?.call_type && (
                    <div>
                      <span className="text-muted-foreground font-sans block text-[10px]">Transmission Type</span>
                      <span className="text-foreground font-bold uppercase">{event.attributes?.call_type}</span>
                    </div>
                  )}
                  {event.imei && (
                    <div>
                      <span className="text-muted-foreground font-sans block text-[10px]">Handset IMEI</span>
                      <span className="text-foreground font-bold">{event.imei}</span>
                    </div>
                  )}
                  {event.attributes?.imsi && (
                    <div>
                      <span className="text-muted-foreground font-sans block text-[10px]">Subscriber IMSI</span>
                      <span className="text-foreground font-bold">{event.attributes?.imsi}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Geospatial Coordinates */}
            {(event.latitude != null && event.longitude != null && !isNaN(Number(event.latitude)) && !isNaN(Number(event.longitude))) && (
              <div className="p-3 rounded-xl bg-secondary/30 border border-border space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-foreground">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-amber-500" />
                    <span>Geographic Position</span>
                  </div>
                  <button
                    onClick={() => copyCoords(`${event.latitude}, ${event.longitude}`)}
                    className="text-[10px] text-primary hover:underline flex items-center gap-1 font-mono font-normal"
                  >
                    {copiedCoords ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedCoords ? 'Copied' : 'Copy Coordinates'}</span>
                  </button>
                </div>
                <div className="p-2 rounded-lg bg-card border border-border/80 flex items-center justify-between font-mono text-[11px]">
                  <div>
                    <span className="text-muted-foreground text-[10px] block">Coordinates (Lat, Lng)</span>
                    <span className="font-bold text-foreground">{Number(event.latitude).toFixed(5)}, {Number(event.longitude).toFixed(5)}</span>
                  </div>
                  {event.location_name && (
                    <span className="text-[10px] font-semibold text-foreground px-2 py-0.5 rounded bg-secondary border border-border/60">
                      {event.location_name}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Cryptographic Evidence Provenance */}
            <div className="p-3 rounded-xl bg-secondary/30 border border-border space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-foreground">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Evidence Provenance</span>
                </div>
                {event.evidence_sha256 && (
                  <button
                    onClick={copyHash}
                    className="text-[10px] text-primary hover:underline flex items-center gap-1 font-mono font-normal"
                  >
                    {copiedHash ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedHash ? 'Copied' : 'Copy Hash'}</span>
                  </button>
                )}
              </div>
              <div className="space-y-1.5 pt-1 border-t border-border/40 font-mono text-[10px]">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground font-sans">Source Ingestion ID:</span>
                  <span className="text-foreground font-bold">{event.evidence_id || 'SYSTEM_INGEST'}</span>
                </div>
                {event.evidence_filename && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground font-sans">Source File:</span>
                    <span className="text-foreground truncate max-w-[220px]" title={event.evidence_filename}>
                      {event.evidence_filename}
                    </span>
                  </div>
                )}
                {event.evidence_sha256 && (
                  <div className="p-1.5 rounded bg-secondary/70 border border-border/60 font-mono text-[9px] text-emerald-600 dark:text-emerald-400 break-all">
                    {event.evidence_sha256}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 2: CONTEXT (±30m) ================= */}
        {activeTab === 'CONTEXT' && (
          <div className="space-y-4">
            {/* Window Selector */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-secondary/40 border border-border">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Clock className="w-3.5 h-3.5 text-primary" />
                <span>Temporal Window:</span>
              </div>
              <div className="flex items-center gap-1">
                {[5, 15, 30, 60].map(mins => (
                  <button
                    key={mins}
                    onClick={() => setContextMinutes(mins)}
                    className={cn(
                      "px-2 py-0.5 rounded text-[11px] font-mono font-bold transition-colors",
                      contextMinutes === mins
                        ? "bg-primary text-primary-foreground shadow-2xs"
                        : "bg-secondary text-muted-foreground hover:text-foreground"
                    )}
                  >
                    ±{mins}m
                  </button>
                ))}
              </div>
            </div>

            {loadingContext ? (
              <div className="text-center py-12 text-muted-foreground space-y-2">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                <p>Analyzing temporal neighborhood...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Pre-Event Activity */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-500 font-mono flex items-center gap-1">
                      <span>Pre-Event Activity</span>
                      <span className="px-1.5 py-0.2 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-[9px]">
                        {priorEvents.length}
                      </span>
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground">Within -{contextMinutes}m</span>
                  </div>

                  {priorEvents.length === 0 ? (
                    <div className="p-3 rounded-lg bg-secondary/20 border border-dashed border-border text-center text-muted-foreground text-[11px]">
                      No events recorded immediately prior.
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {priorEvents.map(pe => {
                        const deltaMin = Math.round(Math.abs(event.timestamp_ms - pe.timestamp_ms) / 60000);
                        return (
                          <div
                            key={pe.event_id}
                            onClick={() => setSelectedEventId(pe.event_id)}
                            className="p-2.5 rounded-lg bg-card hover:bg-secondary/60 border border-border/80 hover:border-primary/50 transition-colors cursor-pointer space-y-1"
                          >
                            <div className="flex items-center justify-between text-[10px] font-mono">
                              <span className="font-bold text-foreground truncate max-w-[180px]">{pe.event_type}</span>
                              <span className="text-cyan-500 font-bold">-{deltaMin}m</span>
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                              <span>{pe.entity_name || (pe.actor_entities && pe.actor_entities[0]) || 'Unknown'}</span>
                              <span>{pe.normalized_timestamp ? pe.normalized_timestamp.slice(11, 16) : '--:--'} UTC</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Focus Target Card */}
                <div className="p-3 rounded-xl bg-primary/10 border-2 border-primary text-foreground space-y-1 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary font-mono">
                      Current Target Event
                    </span>
                    <span className="text-[10px] font-mono font-bold text-primary">0m (Anchor)</span>
                  </div>
                  <h4 className="text-xs font-bold">{event.event_type}</h4>
                  <p className="text-[11px] text-muted-foreground truncate">{event.narration}</p>
                </div>

                {/* Post-Event Activity */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 font-mono flex items-center gap-1">
                      <span>Post-Event Activity</span>
                      <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[9px]">
                        {posteriorEvents.length}
                      </span>
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground">Within +{contextMinutes}m</span>
                  </div>

                  {posteriorEvents.length === 0 ? (
                    <div className="p-3 rounded-lg bg-secondary/20 border border-dashed border-border text-center text-muted-foreground text-[11px]">
                      No events recorded immediately following.
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {posteriorEvents.map(pe => {
                        const deltaMin = Math.round(Math.abs(pe.timestamp_ms - event.timestamp_ms) / 60000);
                        return (
                          <div
                            key={pe.event_id}
                            onClick={() => setSelectedEventId(pe.event_id)}
                            className="p-2.5 rounded-lg bg-card hover:bg-secondary/60 border border-border/80 hover:border-primary/50 transition-colors cursor-pointer space-y-1"
                          >
                            <div className="flex items-center justify-between text-[10px] font-mono">
                              <span className="font-bold text-foreground truncate max-w-[180px]">{pe.event_type}</span>
                              <span className="text-emerald-500 font-bold">+{deltaMin}m</span>
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                              <span>{pe.entity_name || (pe.actor_entities && pe.actor_entities[0]) || 'Unknown'}</span>
                              <span>{pe.normalized_timestamp ? pe.normalized_timestamp.slice(11, 16) : '--:--'} UTC</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 3: CORRELATIONS & VELOCITY ================= */}
        {activeTab === 'CORRELATIONS' && (
          <div className="space-y-4">
            {/* Correlations Section */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono block">
                Multi-Domain Temporal Correlations ({relevantCorrelations.length})
              </span>

              {relevantCorrelations.length === 0 ? (
                <div className="p-4 rounded-xl bg-secondary/20 border border-dashed border-border text-center text-muted-foreground text-xs space-y-1">
                  <Share2 className="w-5 h-5 mx-auto opacity-40" />
                  <p>No multi-domain correlation link anchored directly to this event.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {relevantCorrelations.map(c => (
                    <div
                      key={c.correlation_id}
                      className="p-3 rounded-xl bg-secondary/40 border border-border hover:border-primary/50 transition-colors space-y-2 shadow-2xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/25 uppercase font-mono">
                          {c.relationship_type}
                        </span>
                        <span className="text-[10px] font-mono font-bold text-emerald-500">
                          {Math.round((c.correlation_score ?? 1) * 100)}% Confidence
                        </span>
                      </div>

                      <p className="text-xs text-foreground leading-relaxed">
                        {c.description || 'Cross-domain activity sequence observed.'}
                      </p>

                      <div className="flex items-center justify-between pt-1 border-t border-border/40 text-[10px] font-mono text-muted-foreground">
                        <span>Delta: {c.time_delta_formatted || (c.time_delta_seconds != null ? `${Math.round(c.time_delta_seconds / 60)}m` : '0m')}</span>
                        <span className="text-primary hover:underline cursor-pointer">View Pair</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Velocity Inconsistencies */}
            <div className="space-y-2 pt-2 border-t border-border/40">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-500 font-mono block">
                Physical Velocity Alerts ({relevantInconsistencies.length})
              </span>

              {relevantInconsistencies.length === 0 ? (
                <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>No spatio-temporal teleportation or speed violations detected.</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {relevantInconsistencies.map(inc => (
                    <div
                      key={inc.inconsistency_id}
                      className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 space-y-1.5"
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                        <span>Required Velocity: {inc.required_speed_kmh != null ? Math.round(Number(inc.required_speed_kmh)) : 'N/A'} km/h</span>
                      </div>
                      <p className="text-[11px] text-foreground leading-relaxed">
                        Subject recorded at distance of {inc.distance_km != null ? Number(inc.distance_km).toFixed(1) : 'N/A'} km in {inc.time_delta_seconds != null ? Math.round(Number(inc.time_delta_seconds) / 60) : 0} minutes, exceeding feasible travel baselines.
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 4: RAW EVIDENCE ================= */}
        {activeTab === 'RAW' && (
          <div className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono block">
              Raw Record Ingestion JSON Attributes
            </span>
            <div className="p-3 rounded-xl bg-secondary/60 dark:bg-black/50 border border-border/80 font-mono text-[10px] overflow-x-auto custom-scrollbar">
              <pre className="text-foreground dark:text-slate-300 leading-relaxed">
                {JSON.stringify(event, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          4. DRAWER FOOTER
         ───────────────────────────────────────────────────────────── */}
      <div className="p-3 border-t border-border bg-card flex items-center justify-between text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5 font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>Case: {event.case_id}</span>
        </div>
        <button
          onClick={onClose}
          className="px-3 py-1 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground font-semibold transition-colors"
        >
          Close Drawer
        </button>
      </div>
    </div>
  </>
);
};
export default TimelineIntelligenceDrawer;
