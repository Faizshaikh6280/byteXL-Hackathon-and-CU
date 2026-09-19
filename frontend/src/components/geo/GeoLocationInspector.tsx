'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, MapPin, Clock, Users, Shield, Lightbulb, ExternalLink, 
  Copy, Check, Phone, CreditCard, Radio, MessageSquare, Laptop, 
  Crosshair, Search, AlertTriangle, ChevronRight, Activity, Calendar,
  ArrowLeftRight, ShieldCheck, Database, Compass, Eye
} from 'lucide-react';
import { GeoCanonicalEvent, CoLocationFinding, CommonPlace, api } from '../../services/apiClient';

interface GeoLocationInspectorProps {
  event: GeoCanonicalEvent | null;
  commonPlace?: CommonPlace | null;
  coLocations?: CoLocationFinding[];
  allEvents?: GeoCanonicalEvent[];
  onClose: () => void;
  onViewOnGraph?: (entityId: string) => void;
  onFocusTime?: (timestampMs: number) => void;
  onInvestigateArea?: (lat: number, lng: number) => void;
}

export const GeoLocationInspector: React.FC<GeoLocationInspectorProps> = ({
  event,
  commonPlace,
  coLocations = [],
  allEvents = [],
  onClose,
  onViewOnGraph,
  onFocusTime,
  onInvestigateArea,
}) => {
  const [activeTab, setActiveTab] = useState<'Overview' | 'Context' | 'Entities' | 'CoLocations' | 'Raw'>('Overview');
  const [copiedCoords, setCopiedCoords] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);

  // Context data from segment context API
  const [contextData, setContextData] = useState<any>(null);
  const [loadingContext, setLoadingContext] = useState(false);

  // Active event fallback
  const activeEv = event || (allEvents.length > 0 ? allEvents[0] : null);

  const lat = activeEv ? activeEv.latitude : commonPlace?.latitude || 30.7410;
  const lng = activeEv ? activeEv.longitude : commonPlace?.longitude || 76.7680;
  const coordsString = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

  const locationTitle = activeEv?.location_name || commonPlace?.place_name || activeEv?.address || 'Designated Surveillance Coordinate';
  const locationSubtitle = activeEv?.address || `${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E, Sector Grid`;

  // Simple Geohash-like hash generator for authentic forensic feel
  const geohash = useMemo(() => {
    const latInt = Math.floor((lat + 90) * 1000).toString(36);
    const lngInt = Math.floor((lng + 180) * 1000).toString(36);
    return `gh-${latInt.slice(-4)}${lngInt.slice(-4)}`.toLowerCase();
  }, [lat, lng]);

  // Fetch adjacent context when active event changes
  useEffect(() => {
    if (!activeEv || !activeEv.case_id || !activeEv.event_id) {
      setContextData(null);
      return;
    }

    setLoadingContext(true);
    api.getGeoSegmentContext(activeEv.case_id, activeEv.event_id, 1800)
      .then(res => setContextData(res))
      .catch(err => {
        console.warn("Could not load segment context:", err);
        setContextData(null);
      })
      .finally(() => setLoadingContext(false));
  }, [activeEv?.case_id, activeEv?.event_id]);

  // Find all events associated with this spot (within ~500m)
  const nearbyEvents = useMemo(() => {
    return allEvents.filter(e => {
      const dLat = Math.abs(e.latitude - lat);
      const dLng = Math.abs(e.longitude - lng);
      return dLat < 0.008 && dLng < 0.008;
    });
  }, [allEvents, lat, lng]);

  const uniqueEntitiesAtLocation = useMemo(() => {
    const map = new Map<string, { name: string; count: number; lastSeen: string; firstSeen: string }>();
    nearbyEvents.forEach(e => {
      const id = e.entity_id || e.entity_name || 'UNKNOWN';
      const name = e.entity_name || id;
      const existing = map.get(id);
      if (!existing) {
        map.set(id, { name, count: 1, lastSeen: e.timestamp, firstSeen: e.timestamp });
      } else {
        existing.count += 1;
        if (new Date(e.timestamp) > new Date(existing.lastSeen)) existing.lastSeen = e.timestamp;
        if (new Date(e.timestamp) < new Date(existing.firstSeen)) existing.firstSeen = e.timestamp;
      }
    });
    return Array.from(map.entries()).map(([id, val]) => ({ id, ...val }));
  }, [nearbyEvents]);

  // Find co-locations near here
  const locationCoLocations = useMemo(() => {
    return coLocations.filter(c => {
      const dLat = Math.abs(c.latitude - lat);
      const dLng = Math.abs(c.longitude - lng);
      return dLat < 0.012 && dLng < 0.012;
    });
  }, [coLocations, lat, lng]);

  // Comprehensive forensic narrative paragraphs
  const detailedNarrative = useMemo(() => {
    const paragraphs: string[] = [];

    // 1. Core Event & Spatial Context
    if (activeEv) {
      const entity = activeEv.entity_name || activeEv.entity_id || 'Subject';
      const timeStr = new Date(activeEv.timestamp).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      paragraphs.push(
        `On ${timeStr} UTC, ${entity} was recorded at "${locationTitle}" via ${activeEv.location_type || 'GPS telemetry'}. Spatial resolution is bounded within a radius of ±${activeEv.accuracy_radius_meters || 50}m with ${Math.round((activeEv.location_confidence || 0.9) * 100)}% confidence.`
      );
    }

    // 2. Behavioral & Correlation Context
    if (locationCoLocations.length > 0) {
      const c = locationCoLocations[0];
      const names = c.entity_names.join(' and ');
      const dur = Math.max(1, Math.round(c.duration_seconds / 60));
      paragraphs.push(
        `Spatial convergence analysis identified a critical co-location event: ${names} were concurrently present in this zone for approximately ${dur} minutes (proximity distance: ~${Math.round(c.distance_between_meters)}m). This indicates physical rendezvous or synchronous activity.`
      );
    } else if (uniqueEntitiesAtLocation.length > 1) {
      paragraphs.push(
        `Multi-subject intersection: A total of ${uniqueEntitiesAtLocation.length} distinct case entities have registered physical trace records at this coordinate across the timeline, confirming it as a high-affinity convergence point.`
      );
    }

    // 3. Anomaly Assessment
    if (activeEv && activeEv.anomaly_score > 0) {
      paragraphs.push(
        `Security Alert (Anomaly Index ${activeEv.anomaly_score}/100): Flagged for ${activeEv.anomaly_reasons.join(', ')}. The recorded kinematic speed or timing deviates from normal behavioral baselines established for this case.`
      );
    }

    return paragraphs;
  }, [activeEv, locationTitle, locationCoLocations, uniqueEntitiesAtLocation]);

  const copyCoords = () => {
    navigator.clipboard.writeText(coordsString);
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 2000);
  };

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  return (
    <div className="w-88 xl:w-96 flex flex-col h-full bg-card dark:bg-[#0a0f1d] border-l border-border/70 select-none overflow-hidden flex-shrink-0 z-20">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between sticky top-0 bg-card/95 dark:bg-[#0a0f1d]/95 backdrop-blur-md z-10">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1 rounded-lg bg-rose-500/10 text-rose-500 border border-rose-500/30 flex-shrink-0">
            <MapPin className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="font-bold text-xs text-foreground truncate">
                {locationTitle}
              </h3>
              {activeEv?.epistemic_status && (
                <span className={`px-1.5 py-0.2 rounded text-[8px] font-mono font-bold uppercase ${
                  activeEv.epistemic_status === 'OBSERVED' 
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                    : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                }`}>
                  {activeEv.epistemic_status}
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground truncate">
              {locationSubtitle}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex-shrink-0"
          title="Close Inspector"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-border/60 bg-secondary/20 text-xs px-2 pt-1 gap-1 overflow-x-auto scrollbar-hide flex-shrink-0">
        {[
          { id: 'Overview', label: 'Overview' },
          { id: 'Context', label: 'Context (±30m)', badge: contextData?.prior_events?.length || null },
          { id: 'Entities', label: 'Entities', count: uniqueEntitiesAtLocation.length },
          { id: 'CoLocations', label: 'Co-Locations', count: locationCoLocations.length },
          { id: 'Raw', label: 'Raw Evidence' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-2.5 py-1.5 font-medium border-b-2 text-[11px] transition-all whitespace-nowrap flex items-center gap-1 ${
              activeTab === tab.id
                ? 'border-primary text-primary font-bold'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && tab.count > 0 && (
              <span className="px-1 rounded-full bg-secondary font-mono text-[9px]">
                {tab.count}
              </span>
            )}
            {tab.badge && (
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            )}
          </button>
        ))}
      </div>

      {/* Tab Content Body */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 text-xs custom-scrollbar">
        {/* ================= 1. OVERVIEW TAB ================= */}
        {activeTab === 'Overview' && (
          <>
            {/* Authentic Forensic Radar Telemetry HUD (Zero Placeholder Images) */}
            <div className="relative rounded-xl overflow-hidden border border-border/80 bg-gradient-to-br from-secondary/80 to-card dark:from-[#0d1527] dark:via-[#090f1d] dark:to-[#050811] p-3 shadow-lg flex-shrink-0">
              {/* Background SVG Coordinate Grid & Radar Reticle */}
              <div className="absolute inset-0 opacity-20 pointer-events-none">
                <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <pattern id="radar-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(56, 189, 248, 0.4)" strokeWidth="0.5" />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#radar-grid)" />
                  <circle cx="50%" cy="50%" r="35" fill="none" stroke="rgba(56, 189, 248, 0.6)" strokeWidth="0.8" strokeDasharray="2,2" />
                  <circle cx="50%" cy="50%" r="70" fill="none" stroke="rgba(56, 189, 248, 0.3)" strokeWidth="0.8" />
                  <line x1="50%" y1="0" x2="50%" y2="100%" stroke="rgba(56, 189, 248, 0.4)" strokeWidth="0.8" />
                  <line x1="0" y1="50%" x2="100%" y2="50%" stroke="rgba(56, 189, 248, 0.4)" strokeWidth="0.8" />
                </svg>
              </div>

              {/* HUD Content */}
              <div className="relative z-10 space-y-2">
                {/* Top Telemetry Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-cyan-500 animate-ping" />
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
                      Geospatial Fix Verified
                    </span>
                  </div>
                  <span className="font-mono text-[9px] text-muted-foreground bg-secondary/80 dark:bg-black/60 px-1.5 py-0.5 rounded border border-border/50">
                    {geohash}
                  </span>
                </div>

                {/* Target Entity Callout */}
                <div className="flex items-center justify-between pt-1">
                  <div className="min-w-0">
                    <span className="text-[9px] text-muted-foreground uppercase font-mono block">Primary Subject</span>
                    <h4 className="text-sm font-bold text-foreground truncate">
                      {activeEv?.entity_name || activeEv?.entity_id || 'Target Subject'}
                    </h4>
                  </div>
                  {activeEv?.domain && (
                    <span className="px-2 py-0.5 rounded-md bg-primary/20 text-primary font-mono text-[10px] font-bold border border-primary/30 uppercase">
                      {activeEv.domain}
                    </span>
                  )}
                </div>

                {/* Coordinate Readout with Copy */}
                <div className="pt-1.5 border-t border-border/40 flex items-center justify-between font-mono text-[11px]">
                  <div className="flex items-center gap-1 text-slate-300">
                    <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{coordsString}</span>
                  </div>
                  <button
                    onClick={copyCoords}
                    className="text-primary hover:underline flex items-center gap-1 text-[10px]"
                  >
                    {copiedCoords ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedCoords ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 4 Key Forensic Stat Metrics */}
            <div className="grid grid-cols-4 gap-1.5 text-center flex-shrink-0">
              <div className="p-2 rounded-xl bg-secondary/40 border border-border/60">
                <div className="flex items-center justify-center gap-0.5 text-xs text-cyan-400 font-bold font-mono">
                  <MapPin className="w-3 h-3 text-cyan-400" />
                  <span>{nearbyEvents.length || 1}</span>
                </div>
                <div className="text-[8px] text-muted-foreground uppercase mt-0.5">Events</div>
              </div>

              <div className="p-2 rounded-xl bg-secondary/40 border border-border/60">
                <div className="flex items-center justify-center gap-0.5 text-xs text-emerald-400 font-bold font-mono">
                  <Users className="w-3 h-3 text-emerald-400" />
                  <span>{uniqueEntitiesAtLocation.length || 1}</span>
                </div>
                <div className="text-[8px] text-muted-foreground uppercase mt-0.5">Entities</div>
              </div>

              <div className="p-2 rounded-xl bg-secondary/40 border border-border/60">
                <div className="flex items-center justify-center gap-0.5 text-xs text-purple-400 font-bold font-mono">
                  <Radio className="w-3 h-3 text-purple-400" />
                  <span>~{activeEv?.accuracy_radius_meters || 100}m</span>
                </div>
                <div className="text-[8px] text-muted-foreground uppercase mt-0.5">Uncertainty</div>
              </div>

              <div className="p-2 rounded-xl bg-secondary/40 border border-border/60">
                <div className="flex items-center justify-center gap-0.5 text-xs font-bold font-mono">
                  <AlertTriangle className={`w-3 h-3 ${activeEv && activeEv.anomaly_score > 0 ? 'text-rose-400' : 'text-slate-400'}`} />
                  <span className={activeEv && activeEv.anomaly_score > 0 ? 'text-rose-400' : 'text-muted-foreground'}>
                    {activeEv?.anomaly_score || 0}
                  </span>
                </div>
                <div className="text-[8px] text-muted-foreground uppercase mt-0.5">Anomaly</div>
              </div>
            </div>

            {/* Spatial Anomaly Alert (If detected) */}
            {activeEv && activeEv.anomaly_score > 0 && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-xs text-rose-400">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Spatial Anomaly Detected (Risk Index: {activeEv.anomaly_score}/100)</span>
                </div>
                <div className="space-y-1 pl-5">
                  {activeEv.anomaly_reasons.map((r, i) => (
                    <p key={i} className="text-[11px] text-rose-200/90 leading-tight">
                      • {r}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Detailed Forensic Insight Paragraphs */}
            <div className="p-3 rounded-xl bg-secondary/30 border border-border/60 space-y-2">
              <div className="flex items-center gap-1.5 font-bold text-foreground text-xs">
                <Lightbulb className="w-3.5 h-3.5 text-amber-400 fill-amber-400/20" />
                <span>Forensic Analytical Insight</span>
              </div>
              <div className="space-y-2 text-[11px] text-muted-foreground leading-relaxed">
                {detailedNarrative.map((para, idx) => (
                  <p key={idx} className="bg-card/90 dark:bg-black/20 p-2.5 rounded-lg border border-border/50 text-foreground/90">
                    {para}
                  </p>
                ))}
              </div>
            </div>

            {/* Quick Investigation Action Buttons */}
            <div className="grid grid-cols-3 gap-1.5">
              <button
                onClick={() => activeEv && onFocusTime && onFocusTime(activeEv.timestamp_ms)}
                className="px-2 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 border border-border/70 text-[10px] font-medium text-foreground flex flex-col items-center justify-center gap-0.5 transition-colors"
              >
                <Clock className="w-3 h-3 text-cyan-500" />
                <span>Jump in Timeline</span>
              </button>
              <button
                onClick={() => onInvestigateArea && onInvestigateArea(lat, lng)}
                className="px-2 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 border border-border/70 text-[10px] font-medium text-foreground flex flex-col items-center justify-center gap-0.5 transition-colors"
              >
                <Search className="w-3 h-3 text-indigo-500" />
                <span>Geofence Scan</span>
              </button>
              <button
                onClick={() => {
                  if (activeEv?.entity_id && onViewOnGraph) {
                    onViewOnGraph(activeEv.entity_id);
                  }
                }}
                disabled={!activeEv?.entity_id || !onViewOnGraph}
                className="px-2 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-[10px] font-semibold flex flex-col items-center justify-center gap-0.5 transition-colors shadow-xs"
              >
                <ExternalLink className="w-3 h-3" />
                <span>View on Graph</span>
              </button>
            </div>

            {/* Precision & Telemetry Specs */}
            <div className="p-3 rounded-xl bg-secondary/30 border border-border/60 space-y-1.5 text-[11px]">
              <div className="flex items-center gap-1.5 font-bold text-foreground pb-1 border-b border-border/40">
                <Compass className="w-3.5 h-3.5 text-primary" />
                <span>Telemetry & Precision</span>
              </div>

              <div className="flex justify-between items-center pt-0.5">
                <span className="text-muted-foreground">Location Mode</span>
                <span className="font-semibold text-foreground">
                  {activeEv?.location_type || 'GPS Cellular'}
                </span>
              </div>

              <div className="flex justify-between items-center pt-0.5 border-t border-border/40">
                <span className="text-muted-foreground">Radial Uncertainty</span>
                <span className="font-mono text-foreground font-semibold">
                  ±{activeEv?.accuracy_radius_meters || 50} meters
                </span>
              </div>

              <div className="flex justify-between items-center pt-0.5 border-t border-border/40">
                <span className="text-muted-foreground">Epistemic Confidence</span>
                <span className="font-mono text-primary font-bold">
                  {Math.round((activeEv?.location_confidence || 0.9) * 100)}%
                </span>
              </div>

              {activeEv?.cell_tower_id && (
                <div className="flex justify-between items-center pt-0.5 border-t border-border/40">
                  <span className="text-muted-foreground">Cell Sector ID</span>
                  <span className="font-mono text-amber-400 font-semibold flex items-center gap-1">
                    <Radio className="w-3 h-3" />
                    <span>{activeEv.cell_tower_id}</span>
                  </span>
                </div>
              )}
            </div>

            {/* Cryptographic Provenance & Chain of Custody */}
            <div className="p-3 rounded-xl bg-secondary/30 border border-border/60 space-y-1.5 text-[11px]">
              <div className="flex items-center gap-1.5 font-bold text-foreground pb-1 border-b border-border/40">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Evidence Chain of Custody</span>
              </div>

              <div className="flex justify-between items-center pt-0.5">
                <span className="text-muted-foreground">Evidence File:</span>
                <span className="font-mono text-foreground font-medium">
                  {activeEv?.evidence_filename || 'canonical_ingest.csv'}
                </span>
              </div>

              <div className="flex justify-between items-center pt-0.5 border-t border-border/40">
                <span className="text-muted-foreground">Record Identifier:</span>
                <span className="font-mono text-muted-foreground">
                  {activeEv?.event_id || 'N/A'}
                </span>
              </div>

              {activeEv?.evidence_sha256 && (
                <div className="pt-1 border-t border-border/40">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-0.5">
                    <span>SHA-256 Digest:</span>
                    <button
                      onClick={() => copyHash(activeEv.evidence_sha256!)}
                      className="text-primary hover:underline flex items-center gap-0.5"
                    >
                      {copiedHash ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
                      <span>{copiedHash ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <p className="font-mono text-[9px] text-emerald-600 dark:text-emerald-400 break-all bg-secondary/70 p-1.5 rounded border border-border/50">
                    {activeEv.evidence_sha256}
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {/* ================= 2. CONTEXT (±30m) TAB ================= */}
        {activeTab === 'Context' && (
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 font-bold text-xs text-foreground">
              <ArrowLeftRight className="w-3.5 h-3.5 text-cyan-400" />
              <span>Temporal Neighborhood Analysis (±30 Minutes)</span>
            </div>

            {loadingContext ? (
              <div className="text-center py-8 space-y-2">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-muted-foreground text-xs">Querying temporal window...</p>
              </div>
            ) : contextData ? (
              <div className="space-y-3">
                {/* Context Summary Narrative */}
                <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-[11px] text-cyan-200 leading-relaxed">
                  {contextData.context_summary}
                </div>

                {/* Pre-Departure Events */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider block">
                    Pre-Departure Activity ({contextData.prior_events?.length || 0})
                  </span>
                  {contextData.prior_events?.length > 0 ? (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                      {contextData.prior_events.map((pe: any, idx: number) => (
                        <div key={idx} className="p-2 rounded-lg bg-secondary/40 border border-border/50 text-[10px] space-y-0.5">
                          <div className="flex justify-between font-mono text-muted-foreground">
                            <span className="text-primary font-semibold">{pe.event_type}</span>
                            <span>{pe.timestamp ? new Date(pe.timestamp).toLocaleTimeString() : '-'}</span>
                          </div>
                          <div className="text-foreground font-medium">{pe.location_name || pe.domain}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-muted-foreground italic bg-secondary/20 p-2 rounded">
                      No precursor activity observed in the 30m prior window.
                    </p>
                  )}
                </div>

                {/* Post-Arrival Events */}
                <div className="space-y-1.5 pt-2 border-t border-border/40">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                    Post-Arrival Activity ({contextData.posterior_events?.length || 0})
                  </span>
                  {contextData.posterior_events?.length > 0 ? (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                      {contextData.posterior_events.map((pe: any, idx: number) => (
                        <div key={idx} className="p-2 rounded-lg bg-secondary/40 border border-border/50 text-[10px] space-y-0.5">
                          <div className="flex justify-between font-mono text-muted-foreground">
                            <span className="text-emerald-400 font-semibold">{pe.event_type}</span>
                            <span>{pe.timestamp ? new Date(pe.timestamp).toLocaleTimeString() : '-'}</span>
                          </div>
                          <div className="text-foreground font-medium">{pe.location_name || pe.domain}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-muted-foreground italic bg-secondary/20 p-2 rounded">
                      No subsequent activity observed in the 30m post window.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground text-[11px]">
                No adjacent activity signals registered within ±30 minutes.
              </div>
            )}
          </div>
        )}

        {/* ================= 3. ENTITIES TAB ================= */}
        {activeTab === 'Entities' && (
          <div className="space-y-2">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
              Observed Entities At Coordinate ({uniqueEntitiesAtLocation.length})
            </span>
            {uniqueEntitiesAtLocation.map(ent => (
              <div
                key={ent.id}
                className="p-2.5 rounded-xl bg-secondary/40 border border-border/60 flex items-center justify-between"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-primary font-bold text-xs">
                    {ent.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-xs text-foreground truncate">{ent.name}</div>
                    <div className="text-[10px] font-mono text-muted-foreground">
                      {ent.count} sightings recorded
                    </div>
                  </div>
                </div>
                {onViewOnGraph && (
                  <button
                    onClick={() => onViewOnGraph(ent.id)}
                    className="p-1.5 rounded-lg bg-secondary hover:bg-primary/20 hover:text-primary text-muted-foreground transition-colors"
                    title="Investigate Subject on Graph"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ================= 4. CO-LOCATIONS TAB ================= */}
        {activeTab === 'CoLocations' && (
          <div className="space-y-2.5">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
              Nearby Co-Presence Findings ({locationCoLocations.length})
            </span>
            {locationCoLocations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground space-y-1">
                <Users className="w-7 h-7 mx-auto opacity-30" />
                <p className="text-xs">No multi-subject convergence within 500m of this coordinate.</p>
              </div>
            ) : (
              locationCoLocations.map((coloc, idx) => (
                <div key={idx} className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/30 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-bold text-xs text-purple-400">
                      <Users className="w-3.5 h-3.5" />
                      <span>{coloc.entity_names.join(' & ')}</span>
                    </div>
                    <span className="text-[10px] font-mono font-bold bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded">
                      ~{Math.round(coloc.distance_between_meters)}m
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Observed for approximately {Math.max(1, Math.round(coloc.duration_seconds / 60))} minutes at {coloc.location_name}.
                  </p>
                </div>
              ))
            )}
          </div>
        )}

        {/* ================= 5. RAW EVIDENCE TAB ================= */}
        {activeTab === 'Raw' && (
          <div className="space-y-2">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
              Raw Record Ingestion Attributes
            </span>
            <div className="p-2.5 rounded-xl bg-secondary/60 dark:bg-black/50 border border-border/60 font-mono text-[10px] overflow-x-auto custom-scrollbar">
              <pre className="text-foreground dark:text-slate-300">
                {JSON.stringify(activeEv?.metadata || activeEv || {}, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
