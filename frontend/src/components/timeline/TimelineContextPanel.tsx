import React, { useState } from 'react';
import { 
  X, Clock, MapPin, Smartphone, CreditCard, MessagesSquare, Globe, 
  AlertTriangle, ShieldCheck, Share2, FileText, Bookmark, ExternalLink, 
  Compass, Link2, Hash, Database, CheckCircle2, Copy, Check,
  Navigation, Zap, Eye, ChevronRight, Layers, ArrowRight, Activity
} from 'lucide-react';
import { 
  TimelineCanonicalEvent, 
  TemporalCorrelation, 
  ActivityBurst, 
  TemporalInconsistency,
  TimelineSummaryStats 
} from '../../services/apiClient';
import { useTimelineStore } from '../../store/useTimelineStore';
import { TimelineMapPanel } from './TimelineMapPanel';
import { 
  getDomainTheme, 
  getEpistemicConfig, 
  getRiskConfig, 
  formatEventDateTime, 
  formatINR 
} from './timelineAdapters';
import { cn } from '../../utils/cn';

interface TimelineContextPanelProps {
  event: TimelineCanonicalEvent | null;
  events: TimelineCanonicalEvent[];
  correlations: TemporalCorrelation[];
  bursts: ActivityBurst[];
  inconsistencies: TemporalInconsistency[];
  summary: TimelineSummaryStats;
  onClose: () => void;
  onNavigateToGraph?: (entityId: string) => void;
  onNavigateToMap?: (entityId?: string) => void;
}

export const TimelineContextPanel: React.FC<TimelineContextPanelProps> = ({
  event,
  events,
  correlations,
  bursts,
  inconsistencies,
  summary,
  onClose,
  onNavigateToGraph,
  onNavigateToMap
}) => {
  const { 
    activeContextTab, 
    setActiveContextTab, 
    setContextEventId,
    setSelectedEventId,
    selectedCorrelationId,
    setSelectedCorrelationId
  } = useTimelineStore();

  const [copiedHash, setCopiedHash] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [reportAdded, setReportAdded] = useState(false);

  const domainCfg = getDomainTheme(event?.domain);
  const epistemicCfg = getEpistemicConfig(event?.epistemic_status);
  const riskCfg = getRiskConfig(event?.risk_level, event?.anomaly_score);
  const timeInfo = formatEventDateTime(event?.normalized_timestamp, event?.timezone_offset);
  const isAnomaly = (event?.anomaly_score || 0) > 0 || (event?.anomaly_ids && event.anomaly_ids.length > 0);

  const copyHash = () => {
    if (event?.evidence_sha256) {
      navigator.clipboard.writeText(event.evidence_sha256);
      setCopiedHash(true);
      setTimeout(() => setCopiedHash(false), 2000);
    }
  };

  // Filter correlations related to the selected event if present
  const relevantCorrelations = event
    ? correlations.filter(c => c.event_a_id === event.event_id || c.event_b_id === event.event_id)
    : correlations;

  return (
    <aside className="w-96 xl:w-[420px] flex-shrink-0 border-l border-border bg-card/95 backdrop-blur-xl flex flex-col h-full z-20 shadow-2xl transition-all duration-200">
      {/* Tab Switcher & Window Controls */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-card">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 bg-secondary/80 p-0.5 rounded-lg border border-border">
          <button
            onClick={() => setActiveContextTab('event')}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition-all",
              activeContextTab === 'event'
                ? "bg-card text-foreground shadow-xs border border-border/80"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <FileText className="w-3.5 h-3.5 text-primary" />
            <span>Event Dossier</span>
          </button>

          <button
            onClick={() => setActiveContextTab('map')}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition-all",
              activeContextTab === 'map'
                ? "bg-card text-foreground shadow-xs border border-border/80"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <MapPin className="w-3.5 h-3.5 text-amber-400" />
            <span>Geo Map</span>
          </button>

          <button
            onClick={() => setActiveContextTab('intelligence')}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition-all",
              activeContextTab === 'intelligence'
                ? "bg-card text-foreground shadow-xs border border-border/80"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Zap className="w-3.5 h-3.5 text-indigo-400" />
            <span>Intelligence</span>
            {(relevantCorrelations.length > 0 || bursts.length > 0 || inconsistencies.length > 0) && (
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            )}
          </button>
        </div>

        {/* Global Panel Actions */}
        <div className="flex items-center gap-1">
          {event && (
            <button
              onClick={() => setIsBookmarked(!isBookmarked)}
              className={cn(
                "p-1.5 rounded-md hover:bg-secondary transition-colors",
                isBookmarked ? "text-amber-400 fill-current" : "text-muted-foreground hover:text-foreground"
              )}
              title="Bookmark Event"
            >
              <Bookmark className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-secondary transition-colors"
            title="Collapse Context Panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          TAB 1: EVENT DOSSIER
         ───────────────────────────────────────────────────────────── */}
      {activeContextTab === 'event' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {event ? (
            <>
              {/* Event Header & Epistemic Status */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                      {event.event_id}
                    </span>
                    <span className={cn(
                      "text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider",
                      epistemicCfg.badgeClass
                    )}>
                      {epistemicCfg.label}
                    </span>
                  </div>
                  {event.risk_level && event.risk_level !== 'NONE' && (
                    <span className={cn(
                      "text-[10px] font-bold px-2 py-0.5 rounded border uppercase",
                      riskCfg.badgeClass
                    )}>
                      {event.risk_level}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className={cn("p-1.5 rounded-md border", domainCfg.bg, domainCfg.border)}>
                    <domainCfg.icon className={cn("w-4 h-4", domainCfg.color)} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground tracking-tight">{event.event_type}</h3>
                    <span className="text-[11px] text-muted-foreground font-medium">{domainCfg.label}</span>
                  </div>
                </div>
              </div>

              {/* Timestamp Forensic Block */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Temporal Provenance
                </label>
                <div className="bg-secondary/60 border border-border rounded-lg p-2.5 space-y-1.5 text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground font-sans">Normalized UTC:</span>
                    <span className="font-bold text-foreground">{event.normalized_timestamp.replace('T', ' ').slice(0, 19)} UTC</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground font-sans">Raw Recorded:</span>
                    <span className="text-muted-foreground truncate max-w-[200px]" title={event.raw_timestamp}>
                      {event.raw_timestamp}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground font-sans">Source Timezone:</span>
                    <span className={cn("font-bold", event.timezone_offset ? "text-foreground" : "text-amber-400")}>
                      {event.timezone_offset || 'UNKNOWN'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground font-sans">Precision & Confidence:</span>
                    <span className="text-foreground font-sans">
                      {event.timestamp_precision} · {Math.round((event.timestamp_confidence || 1.0) * 100)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Entity Resolution Block */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Entity Attribution
                </label>
                <div className="bg-secondary/40 border border-border rounded-lg p-3 space-y-2.5">
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">Primary Subject:</span>
                    <div className="text-sm font-bold text-foreground mt-0.5 flex items-center justify-between">
                      <span>{event.entity_name || (event.actor_entities[0] || 'Unresolved Entity')}</span>
                      {onNavigateToGraph && (
                        <button
                          onClick={() => onNavigateToGraph(event.z_cluster_id || event.entity_name || event.actor_entities[0])}
                          className="text-[11px] text-primary hover:underline flex items-center gap-1 font-normal font-sans"
                        >
                          <span>Graph</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    {event.z_cluster_id && (
                      <span className="inline-block mt-1 text-[10px] font-mono bg-primary/10 text-primary border border-primary/25 px-1.5 py-0.5 rounded font-bold">
                        Cluster: {event.z_cluster_id}
                      </span>
                    )}
                  </div>

                  {event.actor_entities && event.actor_entities.length > 0 && (
                    <div className="pt-2 border-t border-border/40">
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold">Associated Identifiers:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {event.actor_entities.map((a, i) => (
                          <span key={i} className="text-[11px] font-mono bg-card px-1.5 py-0.5 rounded border border-border text-foreground">
                            {a}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {event.counterparty && (
                    <div className="pt-2 border-t border-border/40">
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold">Counterparty / Recipient:</span>
                      <div className="text-xs font-mono font-bold text-foreground mt-0.5">
                        {event.counterparty}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Domain Specific Telemetry */}
              {event.domain === 'FINANCIAL' && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Financial Transaction Telemetry
                  </label>
                  <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Transaction Value:</span>
                      <span className="text-base font-mono font-bold text-emerald-400">
                        {formatINR(event.amount_inr)}
                      </span>
                    </div>
                    {event.channel && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Payment Channel:</span>
                        <span className="font-mono font-bold text-foreground">{event.channel}</span>
                      </div>
                    )}
                    {event.txn_type && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Transaction Type:</span>
                        <span className="font-mono text-foreground">{event.txn_type}</span>
                      </div>
                    )}
                    {event.narration && (
                      <div className="pt-1.5 border-t border-emerald-500/20 text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">Narration: </span>
                        {event.narration}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {event.domain === 'TELECOM' && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Telecommunication Telemetry
                  </label>
                  <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-lg p-3 space-y-2 text-xs">
                    {event.duration_seconds !== undefined && event.duration_seconds !== null && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Call / Session Duration:</span>
                        <span className="font-mono font-bold text-foreground">
                          {event.duration_seconds} seconds ({Math.floor(event.duration_seconds / 60)}m {event.duration_seconds % 60}s)
                        </span>
                      </div>
                    )}
                    {event.cell_tower_id && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Cell Tower ID:</span>
                        <span className="font-mono text-indigo-300 font-bold">{event.cell_tower_id}</span>
                      </div>
                    )}
                    {event.imei && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">IMEI Handset Identifier:</span>
                        <span className="font-mono text-foreground">{event.imei}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {event.domain === 'NETWORK' && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Network & IP Telemetry
                  </label>
                  <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-lg p-3 space-y-2 text-xs">
                    {event.client_ip && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Client Assigned IP:</span>
                        <span className="font-mono font-bold text-cyan-300">{event.client_ip}</span>
                      </div>
                    )}
                    {event.destination_ip && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Target Destination IP:</span>
                        <span className="font-mono text-foreground">{event.destination_ip}</span>
                      </div>
                    )}
                    {event.bytes_transferred !== undefined && event.bytes_transferred !== null && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Payload Transferred:</span>
                        <span className="font-mono text-foreground">
                          {(event.bytes_transferred / 1024).toFixed(1)} KB
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Geospatial Telemetry */}
              {(event.location_name || event.latitude !== null) && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Geospatial Telemetry
                  </label>
                  <div className="bg-secondary/40 border border-border rounded-lg p-3 space-y-2">
                    {event.location_name && (
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                        <span className="text-xs font-medium text-foreground">{event.location_name}</span>
                      </div>
                    )}
                    {event.latitude !== null && event.longitude !== null && (
                      <div className="flex items-center justify-between text-xs font-mono text-muted-foreground pt-1 border-t border-border/40">
                        <span>Coordinates:</span>
                        <span className="text-foreground font-bold">{event.latitude?.toFixed(5)}, {event.longitude?.toFixed(5)}</span>
                      </div>
                    )}
                    {event.location_source && (
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Source:</span>
                        <span className="text-foreground">{event.location_source}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Anomaly Finding Block */}
              {isAnomaly && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-destructive flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Analytical Anomaly Signal</span>
                  </label>
                  <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-destructive font-bold">Severity:</span>
                      <span className="font-mono font-bold uppercase text-destructive">{event.risk_level || 'ELEVATED'}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Anomaly Confidence Score:</span>
                      <span className="font-mono font-bold text-destructive">{event.anomaly_score.toFixed(1)} / 100</span>
                    </div>
                    {event.anomaly_reasons && event.anomaly_reasons.length > 0 && (
                      <div className="text-xs text-foreground font-medium pt-1.5 border-t border-destructive/20 space-y-1">
                        {event.anomaly_reasons.map((r, i) => (
                          <div key={i} className="flex items-start gap-1.5">
                            <span className="text-destructive font-bold">•</span>
                            <span>{r}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Cryptographic Evidence Lineage */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Evidence Lineage & Chain of Custody</span>
                </label>
                <div className="bg-secondary/50 border border-border rounded-lg p-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Evidence ID:</span>
                    <span className="font-mono font-bold text-foreground">{event.evidence_id}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Raw Source File:</span>
                    <span className="font-mono text-foreground truncate max-w-[180px]" title={event.evidence_filename || 'evidence.raw'}>
                      {event.evidence_filename || 'evidence.raw'}
                    </span>
                  </div>
                  {event.source_record_id && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Record Reference:</span>
                      <span className="font-mono text-foreground">{event.source_record_id}</span>
                    </div>
                  )}
                  {event.evidence_sha256 && (
                    <div className="pt-2 border-t border-border/40">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-muted-foreground uppercase font-semibold">Cryptographic SHA-256:</span>
                        <button onClick={copyHash} className="text-[10px] text-primary flex items-center gap-1 hover:underline">
                          {copiedHash ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedHash ? 'Checksum Copied' : 'Copy'}</span>
                        </button>
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground break-all bg-card/70 p-1.5 rounded border border-border">
                        {event.evidence_sha256}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Context Investigation Actions */}
              <div className="space-y-2 pt-2 border-t border-border">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Investigative Actions
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setContextEventId(event.event_id, 15)}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 bg-secondary hover:bg-secondary/80 border border-border text-foreground text-xs font-semibold rounded-md transition-colors"
                  >
                    <Clock className="w-3.5 h-3.5 text-primary" />
                    <span>±15m Context</span>
                  </button>

                  {onNavigateToGraph && (
                    <button
                      onClick={() => onNavigateToGraph(event.z_cluster_id || event.entity_name || event.actor_entities[0])}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 bg-secondary hover:bg-secondary/80 border border-border text-foreground text-xs font-semibold rounded-md transition-colors"
                    >
                      <Share2 className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Open in Graph</span>
                    </button>
                  )}

                  {(event.latitude !== null || event.location_name) && (
                    <button
                      onClick={() => setActiveContextTab('map')}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 bg-secondary hover:bg-secondary/80 border border-border text-foreground text-xs font-semibold rounded-md transition-colors"
                    >
                      <MapPin className="w-3.5 h-3.5 text-amber-400" />
                      <span>Focus Geo Map</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setReportAdded(true);
                      setTimeout(() => setReportAdded(false), 2000);
                    }}
                    className={cn(
                      "flex items-center justify-center gap-1.5 px-3 py-2 border text-xs font-semibold rounded-md transition-colors",
                      reportAdded
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                        : "bg-secondary hover:bg-secondary/80 border-border text-foreground"
                    )}
                  >
                    <FileText className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{reportAdded ? 'Added to Dossier' : 'Add to Dossier'}</span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* Empty State when no event selected */
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-secondary border border-border flex items-center justify-center text-muted-foreground">
                <FileText className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-foreground">Temporal Event Dossier</h4>
                <p className="text-xs text-muted-foreground max-w-xs">
                  Select an event node or correlation arc on the timeline canvas to inspect granular telemetry and chain of custody.
                </p>
              </div>

              {/* Summary Stats Overview in Empty State */}
              <div className="w-full bg-secondary/40 border border-border rounded-lg p-3 space-y-2 text-xs text-left mt-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Canonical Events:</span>
                  <span className="font-mono font-bold text-foreground">{summary.total_events}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Resolved Entities:</span>
                  <span className="font-mono font-bold text-foreground">{summary.total_entities}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Flagged Anomalies:</span>
                  <span className="font-mono font-bold text-destructive">{summary.total_anomalies}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Active Correlations:</span>
                  <span className="font-mono font-bold text-indigo-400">{summary.total_correlations}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 2: SYNCHRONIZED GEOSPATIAL MAP
         ───────────────────────────────────────────────────────────── */}
      {activeContextTab === 'map' && (
        <div className="flex-1 flex flex-col h-full relative overflow-hidden">
          <TimelineMapPanel
            events={events}
            onSelectEvent={(ev) => setSelectedEventId(ev.event_id)}
          />
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 3: INTELLIGENCE (CORRELATIONS, BURSTS, INCONSISTENCIES)
         ───────────────────────────────────────────────────────────── */}
      {activeContextTab === 'intelligence' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Active Correlations Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5 text-primary" />
                <span>Discovered Correlations ({relevantCorrelations.length})</span>
              </label>
            </div>

            {relevantCorrelations.length === 0 ? (
              <div className="p-4 bg-secondary/30 border border-border rounded-lg text-center text-xs text-muted-foreground">
                No active correlations detected for this scope.
              </div>
            ) : (
              <div className="space-y-2">
                {relevantCorrelations.map(c => {
                  const isSelected = selectedCorrelationId === c.correlation_id;

                  return (
                    <div
                      key={c.correlation_id}
                      onClick={() => {
                        setSelectedCorrelationId(isSelected ? null : c.correlation_id);
                        if (c.event_a_id) setSelectedEventId(c.event_a_id);
                      }}
                      className={cn(
                        "p-3 rounded-lg border text-xs space-y-1.5 cursor-pointer transition-all shadow-xs",
                        isSelected
                          ? "bg-primary/10 border-primary shadow-sm"
                          : "bg-secondary/40 hover:bg-secondary/70 border-border"
                      )}
                    >
                      <div className="flex items-center justify-between font-semibold">
                        <span className="font-bold text-foreground text-xs">{c.relationship_type.replace(/_/g, ' ')}</span>
                        <span className="font-mono text-[10px] bg-card px-1.5 py-0.5 rounded border border-border text-primary font-bold">
                          {c.time_delta_formatted}
                        </span>
                      </div>

                      <p className="text-[11px] text-muted-foreground line-clamp-2">{c.description}</p>

                      <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/40">
                        <span>Confidence: <strong className="text-foreground">{Math.round((c.correlation_score || 0.9) * 100)}%</strong></span>
                        <span className="text-primary font-mono font-bold flex items-center gap-0.5">
                          <span>Focus Sequence</span>
                          <ChevronRight className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Activity Bursts Section */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" />
              <span>Detected Activity Bursts ({bursts.length})</span>
            </label>

            {bursts.length === 0 ? (
              <div className="p-4 bg-secondary/30 border border-border rounded-lg text-center text-xs text-muted-foreground">
                No activity bursts detected.
              </div>
            ) : (
              <div className="space-y-2">
                {bursts.map(b => (
                  <div key={b.burst_id} className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg text-xs space-y-1.5">
                    <div className="flex items-center justify-between font-bold text-foreground">
                      <span>Temporal Episode ({b.event_count} Events)</span>
                      <span className="font-mono text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">
                        {Math.round(b.duration_seconds / 60)} min span
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{b.description}</p>
                    <div className="flex flex-wrap gap-1 pt-1 border-t border-amber-500/20 text-[10px]">
                      {b.entities.map((ent, idx) => (
                        <span key={idx} className="bg-card px-1.5 py-0.5 rounded border border-border text-foreground font-mono">
                          {ent}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Temporal / Geo Inconsistencies Section */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Potential Velocity Inconsistencies ({inconsistencies.length})</span>
            </label>

            {inconsistencies.length === 0 ? (
              <div className="p-4 bg-secondary/30 border border-border rounded-lg text-center text-xs text-muted-foreground">
                No physical velocity implausibilities detected.
              </div>
            ) : (
              <div className="space-y-2">
                {inconsistencies.map(inc => (
                  <div key={inc.inconsistency_id} className="p-3 bg-rose-500/5 border border-rose-500/20 rounded-lg text-xs space-y-1.5">
                    <div className="flex items-center justify-between font-bold text-rose-400">
                      <span>Potential Spatio-Temporal Inconsistency</span>
                      <span className="font-mono text-[10px] bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/30">
                        {inc.required_speed_kmh ? `${Math.round(inc.required_speed_kmh)} km/h` : 'Implausible Speed'}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{inc.description}</p>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-rose-500/20">
                      <span>Delta: {Math.round(inc.time_delta_seconds / 60)} min</span>
                      <span>Distance: {inc.distance_km.toFixed(1)} km</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
};
export default TimelineContextPanel;
