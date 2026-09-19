import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  AlertTriangle, Loader2, RefreshCw, Sparkles, Filter, 
  Layers, Clock, Search, RotateCcw, MapPin, Share2, Compass
} from 'lucide-react';
import { useTimelineStore } from '../../store/useTimelineStore';
import { 
  apiClient, 
  TimelineCanonicalEvent, 
  TemporalCorrelation, 
  ActivityBurst, 
  TemporalInconsistency, 
  TimeBucketDensity, 
  TimelineSummaryStats 
} from '../../services/apiClient';
import { useCase } from '../../context/CaseContext';
import { TimelineHeader } from './TimelineHeader';
import { TimelineFilterSidebar } from './TimelineFilterSidebar';
import { TimelineMasterCanvas } from './TimelineMasterCanvas';
import { TimelinePlaybackControls } from './TimelinePlaybackControls';
import { TimelineIntelligenceDrawer } from './TimelineIntelligenceDrawer';
import { TimelineContextModal } from './TimelineContextModal';
import { TimelineExportModal } from './TimelineExportModal';
import { TimelineStorylinePanel } from './TimelineStorylinePanel';
import { TimelineCompareView } from './TimelineCompareView';
import { TimelineMapPanel } from './TimelineMapPanel';
import { cn } from '../../utils/cn';

interface TimelineWorkspaceProps {
  caseId?: string;
  caseReference?: string;
  caseTitle?: string;
  onNavigateToGraph?: (entityId: string) => void;
  onNavigateToMap?: (entityId?: string) => void;
}

const INITIAL_SUMMARY: TimelineSummaryStats = {
  total_events: 0,
  total_entities: 0,
  total_anomalies: 0,
  total_correlations: 0,
  total_bursts: 0,
  total_inconsistencies: 0,
  domain_breakdown: {}
};

export const TimelineWorkspace: React.FC<TimelineWorkspaceProps> = ({
  caseId,
  caseReference,
  caseTitle,
  onNavigateToGraph,
  onNavigateToMap
}) => {
  const { activeCase } = useCase();
  const effectiveCaseId = caseId || activeCase?.case_id;
  const effectiveCaseRef = caseReference || activeCase?.case_reference || 'ACTIVE CASE';
  const effectiveCaseTitle = caseTitle || activeCase?.title || 'Temporal Footprint Reconstruction';

  const {
    activeMode,
    setActiveMode,
    zoomLevel,
    setZoomLevel,
    selectedDomains,
    selectedEntityIds,
    selectedRiskLevels,
    onlyAnomalies,
    searchQuery,
    selectedEventId,
    setSelectedEventId,
    timeRange,
    setTimeRange,
    currentTime,
    setCurrentTime,
    isRightPanelOpen,
    setIsRightPanelOpen,
    resetFilters
  } = useTimelineStore();

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [events, setEvents] = useState<TimelineCanonicalEvent[]>([]);
  const [correlations, setCorrelations] = useState<TemporalCorrelation[]>([]);
  const [bursts, setBursts] = useState<ActivityBurst[]>([]);
  const [inconsistencies, setInconsistencies] = useState<TemporalInconsistency[]>([]);
  const [densityBuckets, setDensityBuckets] = useState<TimeBucketDensity[]>([]);
  const [entities, setEntities] = useState<Array<{ id: string; name: string; cluster_id?: string; event_count: number; risk_score?: number }>>([]);
  const [summary, setSummary] = useState<TimelineSummaryStats>(INITIAL_SUMMARY);

  // Track full event bounds for zoom operations
  const [fullBounds, setFullBounds] = useState<[number, number]>([0, 0]);

  // Fetch timeline events and computed artifacts from real backend API
  const fetchTimelineData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const resp = await apiClient.getTimelineEvents({
        case_id: effectiveCaseId,
        domains: selectedDomains.length > 0 ? selectedDomains : undefined,
        entities: selectedEntityIds.length > 0 ? selectedEntityIds : undefined,
        risk: selectedRiskLevels.length > 0 ? selectedRiskLevels : undefined,
        only_anomalies: onlyAnomalies ? true : undefined,
        search: searchQuery.trim() ? searchQuery.trim() : undefined,
        zoom: zoomLevel,
        limit: 1000
      });

      setEvents(resp.events || []);
      setCorrelations(resp.correlations || []);
      setBursts(resp.bursts || []);
      setInconsistencies(resp.inconsistencies || []);
      setDensityBuckets(resp.density_buckets || []);
      setEntities(resp.entities || []);
      setSummary(resp.summary || INITIAL_SUMMARY);

      // Compute and store full event bounds
      if (resp.events && resp.events.length > 0) {
        const minMs = Math.min(...resp.events.map(e => e.timestamp_ms));
        const maxMs = Math.max(...resp.events.map(e => e.timestamp_ms));
        if (minMs > 0 && maxMs >= minMs) {
          setFullBounds([minMs, maxMs]);
          // Auto-calibrate time range on initial load or if current range is invalid/out-of-bounds
          if ((timeRange[0] === 0 && timeRange[1] === 100) || timeRange[1] <= minMs || timeRange[0] >= maxMs) {
            setTimeRange([minMs, maxMs]);
          }
        }
      }
    } catch (err: any) {
      console.error("Failed to load timeline events:", err);
      setError(err?.message || "Failed to load timeline events. Please verify backend service connection.");
    } finally {
      setLoading(false);
    }
  // NOTE: timeRange and setTimeRange intentionally excluded to prevent infinite re-fetch loops
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    effectiveCaseId,
    selectedDomains,
    selectedEntityIds,
    selectedRiskLevels,
    onlyAnomalies,
    searchQuery,
    zoomLevel
  ]);

  useEffect(() => {
    fetchTimelineData();
  }, [fetchTimelineData]);

  // Selected event memoized
  const selectedEvent = useMemo(() => {
    if (!selectedEventId) return null;
    return events.find(e => e.event_id === selectedEventId) || null;
  }, [selectedEventId, events]);

  // ── Zoom Level Handler ───────────────────────────────────────────
  // When user clicks Month/Day/Hour/Minute, actually zoom the visible window
  // around the center of the current view. "Month" = see everything,
  // "Day" = 24 hours, "Hour" = 6 hours, "Minute" = 30 minutes.
  useEffect(() => {
    if (fullBounds[0] === 0 && fullBounds[1] === 0) return;
    const fullSpan = fullBounds[1] - fullBounds[0];
    if (fullSpan <= 0) return;

    if (zoomLevel === 'month') {
      // Show full case bounds
      setTimeRange([fullBounds[0], fullBounds[1]]);
      return;
    }

    // Determine an intelligent anchor center:
    // 1. If an event is selected, center on that event.
    // 2. Else if currentTime is valid inside bounds, center on currentTime.
    // 3. Else if bursts exist, center on the highest density activity burst.
    // 4. Else center on the latest event.
    let center: number;
    if (selectedEvent) {
      center = selectedEvent.timestamp_ms;
    } else if (currentTime > fullBounds[0] && currentTime < fullBounds[1]) {
      center = currentTime;
    } else if (bursts.length > 0) {
      const topBurst = [...bursts].sort((a, b) => b.event_count - a.event_count)[0];
      const bStart = new Date(topBurst.start_time).getTime();
      const bEnd = new Date(topBurst.end_time).getTime();
      center = (bStart + bEnd) / 2;
    } else if (events.length > 0) {
      center = events[events.length - 1].timestamp_ms;
    } else {
      const currentCenter = (timeRange[0] + timeRange[1]) / 2;
      center = Math.max(fullBounds[0], Math.min(fullBounds[1], currentCenter));
    }

    let windowMs: number;
    switch (zoomLevel) {
      case 'day':
        windowMs = 24 * 3600 * 1000; // 24 hours
        break;
      case 'hour':
        windowMs = 6 * 3600 * 1000; // 6 hours
        break;
      case 'minute':
        windowMs = 30 * 60 * 1000; // 30 minutes
        break;
      default:
        return;
    }

    const half = windowMs / 2;
    let newMin = center - half;
    let newMax = center + half;

    // Clamp to full bounds
    if (newMin < fullBounds[0]) {
      newMin = fullBounds[0];
      newMax = Math.min(fullBounds[1], newMin + windowMs);
    }
    if (newMax > fullBounds[1]) {
      newMax = fullBounds[1];
      newMin = Math.max(fullBounds[0], newMax - windowMs);
    }

    setTimeRange([newMin, newMax]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomLevel, fullBounds]);

  // Fit bounds helper to reset view to full event bounds
  const handleFitRange = useCallback(() => {
    if (events.length > 0) {
      const minMs = Math.min(...events.map(e => e.timestamp_ms));
      const maxMs = Math.max(...events.map(e => e.timestamp_ms));
      if (minMs > 0 && maxMs >= minMs) {
        setZoomLevel('month');
        setTimeRange([minMs, maxMs]);
      }
    }
  }, [events, setZoomLevel, setTimeRange]);

  // Focus Peak Episode helper to zoom directly into dense incident burst window
  const handleFocusEpisode = useCallback(() => {
    if (bursts.length > 0) {
      const topBurst = [...bursts].sort((a, b) => b.event_count - a.event_count)[0];
      const bStart = new Date(topBurst.start_time).getTime();
      const bEnd = new Date(topBurst.end_time).getTime();
      const margin = Math.max(3600000, (bEnd - bStart) * 0.5);
      setTimeRange([Math.max(0, bStart - margin), bEnd + margin]);
    } else if (events.length > 0) {
      const midIdx = Math.floor(events.length / 2);
      const centerMs = events[midIdx].timestamp_ms;
      const windowMs = 12 * 3600 * 1000;
      setTimeRange([Math.max(0, centerMs - windowMs), centerMs + windowMs]);
    }
  }, [bursts, events, setTimeRange]);

  // Count visible events inside active timeRange
  const visibleEventsCount = useMemo(() => {
    return events.filter(e => e.timestamp_ms >= timeRange[0] && e.timestamp_ms <= timeRange[1]).length;
  }, [events, timeRange]);

  return (
    <div className="flex flex-col h-full bg-background relative overflow-hidden text-foreground">
      {/* Top Header Command Strip */}
      <TimelineHeader
        caseReference={effectiveCaseRef}
        caseTitle={effectiveCaseTitle}
        summary={summary}
        entities={entities}
        visibleEventsCount={visibleEventsCount}
        onRefresh={fetchTimelineData}
        onFitRange={handleFitRange}
        onFocusEpisode={handleFocusEpisode}
      />

      {/* Main Workspace Area (Hero Canvas permanently maintains 100% width!) */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Filter Sidebar (Collapsible) */}
        <TimelineFilterSidebar
          entities={entities}
          domainCounts={summary.domain_breakdown}
        />

        {/* Central Primary Timeline Canvas (HERO) */}
        <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden relative">
          {loading && events.length === 0 ? (
            /* Professional Forensic Skeleton Loading State */
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-muted-foreground space-y-4">
              <div className="relative">
                <div className="w-12 h-12 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                <Clock className="w-5 h-5 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <div className="space-y-1">
                <div className="text-sm font-bold text-foreground">Reconstructing Digital Footprint Timeline...</div>
                <p className="text-xs max-w-sm text-muted-foreground">
                  Synthesizing canonical events across Telecom, Financial, Social, and Geospatial domains.
                </p>
              </div>
            </div>
          ) : error ? (
            /* Forensic Error State */
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center text-destructive">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-foreground">Failed to Load Investigation Timeline</h3>
                <p className="text-xs text-muted-foreground max-w-md">{error}</p>
              </div>
              <button
                onClick={fetchTimelineData}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-md hover:bg-primary/90 transition-colors shadow-sm"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Connection</span>
              </button>
            </div>
          ) : events.length === 0 && activeMode !== 'storyline' ? (
            /* Forensic Empty State */
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-3 text-muted-foreground">
              <div className="w-12 h-12 rounded-full bg-secondary border border-border flex items-center justify-center text-muted-foreground">
                <Clock className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-foreground">No Canonical Events Matched</h4>
                <p className="text-xs max-w-sm">
                  No temporal events match the active domain, entity, search, or anomaly filters for this case.
                </p>
              </div>
              <button
                onClick={resetFilters}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary hover:bg-secondary/80 border border-border text-foreground text-xs font-semibold rounded-md transition-colors mt-2"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Filters</span>
              </button>
            </div>
          ) : (
            /* Active Mode Content */
            <>
              {/* Storyline Reconstruction Mode */}
              {activeMode === 'storyline' && (
                <TimelineStorylinePanel
                  caseId={effectiveCaseId}
                  onSelectEvent={(eid) => setSelectedEventId(eid)}
                />
              )}

              {/* Map + Timeline Synchronized Mode */}
              {activeMode === 'map_sync' && (
                <div className="flex-1 flex flex-col h-full overflow-hidden">
                  {/* Top: Synchronized Map */}
                  <div className="h-1/2 min-h-[260px] border-b border-border relative">
                    <TimelineMapPanel
                      events={events}
                      onSelectEvent={(ev) => setSelectedEventId(ev.event_id)}
                    />
                  </div>
                  {/* Bottom: Synchronized Master Canvas */}
                  <div className="h-1/2 min-h-[260px] relative">
                    <TimelineMasterCanvas
                      events={events}
                      correlations={correlations}
                      bursts={bursts}
                      inconsistencies={inconsistencies}
                      densityBuckets={densityBuckets}
                      onSelectEvent={(ev) => setSelectedEventId(ev.event_id)}
                      fullBounds={fullBounds}
                    />
                  </div>
                </div>
              )}

              {/* Network / Compare Multi-Lane Mode */}
              {activeMode === 'network' && entities.length > 1 && (
                <TimelineMasterCanvas
                  events={events}
                  correlations={correlations}
                  bursts={bursts}
                  inconsistencies={inconsistencies}
                  densityBuckets={densityBuckets}
                  onSelectEvent={(ev) => setSelectedEventId(ev.event_id)}
                  fullBounds={fullBounds}
                />
              )}

              {/* Cross-Domain & Subject POI Modes */}
              {(activeMode === 'cross_domain' || activeMode === 'subject' || (activeMode === 'network' && entities.length <= 1)) && (
                <TimelineMasterCanvas
                  events={events}
                  correlations={correlations}
                  bursts={bursts}
                  inconsistencies={inconsistencies}
                  densityBuckets={densityBuckets}
                  onSelectEvent={(ev) => setSelectedEventId(ev.event_id)}
                  fullBounds={fullBounds}
                />
              )}
            </>
          )}

          {/* Bottom Chronological Playback Controls */}
          {activeMode !== 'storyline' && (
            <TimelinePlaybackControls />
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          RIGHT SLIDE-OUT INTELLIGENCE DRAWER (Overlay Workstation)
          Modeled after Anomaly & GeoSpatial Drawers:
          - Does NOT shrink or re-layout the main timeline canvas!
          - 100% theme consistency across Light and Dark modes!
         ───────────────────────────────────────────────────────────── */}
      <TimelineIntelligenceDrawer
        isOpen={isRightPanelOpen && !!selectedEvent}
        event={selectedEvent}
        allEvents={events}
        correlations={correlations}
        bursts={bursts}
        inconsistencies={inconsistencies}
        summary={summary}
        onClose={() => {
          setIsRightPanelOpen(false);
          setSelectedEventId(null);
        }}
        onFocusEventTime={(ts) => {
          setCurrentTime(ts);
        }}
        onZoomWindow={(start, end) => {
          setTimeRange([start, end]);
        }}
        onNavigateToGraph={onNavigateToGraph}
        onNavigateToMap={(entityId) => {
          setActiveMode('map_sync');
          if (onNavigateToMap) {
            onNavigateToMap(entityId || selectedEvent?.z_cluster_id || selectedEvent?.entity_name);
          }
        }}
      />

      {/* Global Modals */}
      <TimelineContextModal />
      <TimelineExportModal
        caseId={effectiveCaseId}
        totalEvents={summary.total_events}
      />
    </div>
  );
};
export default TimelineWorkspace;
