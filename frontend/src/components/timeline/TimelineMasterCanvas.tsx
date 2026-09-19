import React, { useRef, useState, useEffect, useMemo } from 'react';
import { 
  Smartphone, CreditCard, MessagesSquare, MapPin, Globe, AlertTriangle, 
  Users, Share2, Zap, ShieldAlert, Sparkles, Link2, Clock, ZoomIn, Layers
} from 'lucide-react';
import { 
  TimelineCanonicalEvent, TemporalCorrelation, ActivityBurst, 
  TemporalInconsistency, TimeBucketDensity 
} from '../../services/apiClient';
import { useTimelineStore } from '../../store/useTimelineStore';
import { TimelineEventMarker } from './TimelineEventMarker';
import { TimelineCorrelationConnector } from './TimelineCorrelationConnector';
import { getDomainTheme } from './timelineAdapters';
import { cn } from '../../utils/cn';

interface MasterCanvasProps {
  events: TimelineCanonicalEvent[];
  correlations: TemporalCorrelation[];
  bursts: ActivityBurst[];
  inconsistencies: TemporalInconsistency[];
  densityBuckets: TimeBucketDensity[];
  onSelectEvent: (event: TimelineCanonicalEvent) => void;
  fullBounds?: [number, number];
}

export interface SingleLaneEvent {
  isCluster: false;
  event: TimelineCanonicalEvent;
  xPct: number;
  yOffset: number;
}

export interface EventCluster {
  isCluster: true;
  clusterId: string;
  count: number;
  events: TimelineCanonicalEvent[];
  startMs: number;
  endMs: number;
  avgMs: number;
  xPct: number;
  hasAnomaly: boolean;
  dominantDomain: string;
}

export type LaneItem = SingleLaneEvent | EventCluster;

const DEFAULT_DOMAIN_LANES = [
  { id: 'TELECOM', label: 'Telecom (Calls & SMS)', domain: 'TELECOM' },
  { id: 'FINANCIAL', label: 'Banking & Financial', domain: 'FINANCIAL' },
  { id: 'LOCATION', label: 'Geospatial Telemetry', domain: 'LOCATION' },
  { id: 'SOCIAL', label: 'Social & Messaging', domain: 'SOCIAL' },
  { id: 'NETWORK', label: 'IPDR / Network Sessions', domain: 'NETWORK' },
  { id: 'GENERAL', label: 'General Events', domain: 'GENERAL' },
  { id: 'KYC', label: 'Identity & KYC', domain: 'KYC' },
  { id: 'ANALYTICAL', label: 'Analytical Signals & Risk', domain: 'ANALYTICAL' }
];

export const TimelineMasterCanvas: React.FC<MasterCanvasProps> = ({
  events,
  correlations,
  bursts,
  inconsistencies,
  densityBuckets,
  onSelectEvent,
  fullBounds
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasDimensions, setCanvasDimensions] = useState<{ width: number; height: number }>({ width: 800, height: 500 });

  // Panning state
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartTimeRangeRef = useRef<[number, number]>([0, 0]);
  const hasMovedRef = useRef(false);
  const [isPanning, setIsPanning] = useState(false);

  // Cluster hover tooltip state
  const [hoveredCluster, setHoveredCluster] = useState<EventCluster | null>(null);
  const [clusterTooltipPos, setClusterTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const {
    activeMode,
    zoomLevel,
    currentTime,
    setCurrentTime,
    timeRange,
    setTimeRange,
    selectedEventId,
    selectedCorrelationId,
    setSelectedCorrelationId,
    selectedDomains,
    selectedEntityIds
  } = useTimelineStore();

  const minMs = timeRange[0];
  const maxMs = timeRange[1];
  const timeSpan = Math.max(1000, maxMs - minMs);

  // Measure canvas track dimensions for SVG connectors and clustering
  useEffect(() => {
    if (!canvasRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect) {
          setCanvasDimensions({
            width: entry.contentRect.width,
            height: entry.contentRect.height
          });
        }
      }
    });
    observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, []);

  // Compute Active Lanes based on Mode
  const lanes = useMemo(() => {
    if (activeMode === 'network' || (activeMode === 'subject' && selectedEntityIds.length === 0)) {
      const entityMap: Record<string, { label: string; count: number }> = {};
      events.forEach(e => {
        const entName = e.entity_name || (e.actor_entities[0] || 'Unknown Entity');
        if (!entityMap[entName]) {
          entityMap[entName] = { label: entName, count: 0 };
        }
        entityMap[entName].count++;
      });

      const sortedEnts = Object.keys(entityMap).sort((a, b) => entityMap[b].count - entityMap[a].count);
      return sortedEnts.slice(0, 8).map((name) => ({
        id: name,
        label: name,
        domain: 'ENTITY'
      }));
    }

    const dynamicDomains = Array.from(new Set(events.map(e => e.domain)));
    const allLanes = [...DEFAULT_DOMAIN_LANES];
    dynamicDomains.forEach(d => {
      if (!allLanes.some(l => l.id === d)) {
        allLanes.push({ id: d, label: d, domain: d });
      }
    });

    const eventDomainSet = new Set(events.map(e => e.domain));
    const filteredLanes = allLanes
      .filter(l => eventDomainSet.has(l.id))
      .filter(l => selectedDomains.length === 0 || selectedDomains.includes(l.id));

    return filteredLanes;
  }, [activeMode, events, selectedDomains, selectedEntityIds]);

  // Compute Time Axis Ticks with Adaptive Formatting
  const timeTicks = useMemo(() => {
    const tickCount = 8;
    const ticks: Array<{ timeMs: number; label: string; subLabel: string; xPct: number }> = [];
    const spanHours = timeSpan / (3600 * 1000);

    for (let i = 0; i <= tickCount; i++) {
      const t = minMs + (i / tickCount) * timeSpan;
      const d = new Date(t);
      let label = d.toISOString().slice(11, 19);
      let subLabel = d.toISOString().slice(0, 10);

      if (spanHours > 72) {
        // Multi-day scale: show Date as main label, time as sub-label
        label = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
        subLabel = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else if (spanHours > 12) {
        // Daily scale: show Date and Hour
        label = `${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        subLabel = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      } else if (spanHours <= 1) {
        // Granular minute scale: show HH:mm:ss
        label = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        subLabel = `+${Math.round((i / tickCount) * (timeSpan / 60000))}m`;
      }

      ticks.push({
        timeMs: t,
        label,
        subLabel,
        xPct: (i / tickCount) * 100
      });
    }
    return ticks;
  }, [minMs, timeSpan]);

  // Activity Density Spectrogram
  const computedDensityBins = useMemo(() => {
    const binCount = 64;
    const bins: Array<{
      startMs: number;
      endMs: number;
      eventCount: number;
      anomalyCount: number;
      label: string;
    }> = [];

    const binSpan = timeSpan / binCount;
    for (let i = 0; i < binCount; i++) {
      const bStart = minMs + i * binSpan;
      const bEnd = bStart + binSpan;
      bins.push({
        startMs: bStart,
        endMs: bEnd,
        eventCount: 0,
        anomalyCount: 0,
        label: new Date(bStart).toISOString().slice(0, 16).replace('T', ' ')
      });
    }

    events.forEach(ev => {
      if (ev.timestamp_ms >= minMs && ev.timestamp_ms <= maxMs) {
        const binIdx = Math.min(binCount - 1, Math.max(0, Math.floor((ev.timestamp_ms - minMs) / binSpan)));
        bins[binIdx].eventCount++;
        if (ev.anomaly_score > 0 || (ev.anomaly_ids && ev.anomaly_ids.length > 0)) {
          bins[binIdx].anomalyCount++;
        }
      }
    });

    const maxCount = Math.max(1, ...bins.map(b => b.eventCount));
    return { bins, maxCount };
  }, [events, minMs, maxMs, timeSpan]);

  // Scrubber cursor position percentage
  const cursorXPct = Math.min(100, Math.max(0, ((currentTime - minMs) / timeSpan) * 100));

  // ─────────────────────────────────────────────────────────────────────────────
  // SMART EVENT CLUSTERING PER LANE
  // ─────────────────────────────────────────────────────────────────────────────
  const laneItemsMap = useMemo(() => {
    const itemsMap: Record<string, LaneItem[]> = {};
    const clusterThresholdPx = 28; // Pixel distance threshold to form a cluster
    const canvasW = Math.max(400, canvasDimensions.width);

    lanes.forEach(lane => {
      // 1. STRICT VIEWPORT FILTERING (Solves the clamping pile-up bug!)
      const visibleLaneEvents = events
        .filter(ev => {
          if (ev.timestamp_ms < minMs || ev.timestamp_ms > maxMs) return false;
          if (activeMode === 'network' || (activeMode === 'subject' && selectedEntityIds.length === 0)) {
            const entName = ev.entity_name || (ev.actor_entities[0] || 'Unknown Entity');
            return entName === lane.id;
          }
          return ev.domain === lane.id;
        })
        .sort((a, b) => a.timestamp_ms - b.timestamp_ms);

      if (visibleLaneEvents.length === 0) {
        itemsMap[lane.id] = [];
        return;
      }

      const laneItems: LaneItem[] = [];
      let currentClusterEvents: TimelineCanonicalEvent[] = [];

      const flushCluster = () => {
        if (currentClusterEvents.length === 0) return;

        if (currentClusterEvents.length === 1) {
          // Render as single individual event
          const ev = currentClusterEvents[0];
          const xPct = Math.min(99.5, Math.max(0.5, ((ev.timestamp_ms - minMs) / timeSpan) * 100));
          laneItems.push({
            isCluster: false,
            event: ev,
            xPct,
            yOffset: 0
          });
        } else {
          // Render as clustered pill
          const startMs = currentClusterEvents[0].timestamp_ms;
          const endMs = currentClusterEvents[currentClusterEvents.length - 1].timestamp_ms;
          const avgMs = (startMs + endMs) / 2;
          const xPct = Math.min(99, Math.max(1, ((avgMs - minMs) / timeSpan) * 100));
          const hasAnomaly = currentClusterEvents.some(e => (e.anomaly_score || 0) >= 40 || e.risk_level === 'CRITICAL');
          const dominantDomain = lane.domain === 'ENTITY' ? currentClusterEvents[0].domain : lane.domain;

          laneItems.push({
            isCluster: true,
            clusterId: `cluster-${lane.id}-${startMs}`,
            count: currentClusterEvents.length,
            events: [...currentClusterEvents],
            startMs,
            endMs,
            avgMs,
            xPct,
            hasAnomaly,
            dominantDomain
          });
        }
        currentClusterEvents = [];
      };

      visibleLaneEvents.forEach((ev) => {
        if (currentClusterEvents.length === 0) {
          currentClusterEvents.push(ev);
        } else {
          const prevEv = currentClusterEvents[currentClusterEvents.length - 1];
          const prevX = ((prevEv.timestamp_ms - minMs) / timeSpan) * canvasW;
          const currX = ((ev.timestamp_ms - minMs) / timeSpan) * canvasW;

          if (currX - prevX < clusterThresholdPx) {
            currentClusterEvents.push(ev);
          } else {
            flushCluster();
            currentClusterEvents.push(ev);
          }
        }
      });
      flushCluster();

      // Apply vertical staggering to individual events that are still moderately close
      laneItems.forEach((item, idx) => {
        if (!item.isCluster) {
          const single = item as SingleLaneEvent;
          const prev = laneItems[idx - 1];
          const next = laneItems[idx + 1];
          const prevX = prev ? prev.xPct : -999;
          const nextX = next ? next.xPct : 999;
          if (Math.abs(single.xPct - prevX) < 4 || Math.abs(nextX - single.xPct) < 4) {
            const pattern = [0, -12, 12, -6, 6];
            single.yOffset = pattern[idx % pattern.length];
          }
        }
      });

      itemsMap[lane.id] = laneItems;
    });

    return itemsMap;
  }, [events, lanes, minMs, maxMs, timeSpan, canvasDimensions.width, activeMode, selectedEntityIds]);

  // Compute event coordinates for SVG connector overlay (Maps events or their enclosing cluster)
  const eventCoordinates = useMemo(() => {
    const coords: Record<string, { x: number; y: number }> = {};
    if (lanes.length === 0 || canvasDimensions.width === 0) return coords;

    const laneHeight = canvasDimensions.height / lanes.length;

    lanes.forEach((lane, lIdx) => {
      const items = laneItemsMap[lane.id] || [];
      const pyY = lIdx * laneHeight + laneHeight / 2;

      items.forEach(item => {
        if (item.isCluster) {
          const pxX = (item.xPct / 100) * canvasDimensions.width;
          item.events.forEach(ev => {
            coords[ev.event_id] = { x: pxX, y: pyY };
          });
        } else {
          const single = item as SingleLaneEvent;
          const pxX = (single.xPct / 100) * canvasDimensions.width;
          coords[single.event.event_id] = { x: pxX, y: pyY + single.yOffset };
        }
      });
    });

    return coords;
  }, [lanes, laneItemsMap, canvasDimensions]);

  // Active correlation event IDs
  const activeCorrelationEventIds = useMemo(() => {
    if (!selectedCorrelationId) return new Set<string>();
    const c = correlations.find(corr => corr.correlation_id === selectedCorrelationId);
    if (!c) return new Set<string>();
    return new Set([c.event_a_id, c.event_b_id]);
  }, [selectedCorrelationId, correlations]);

  // Drill-down Zoom on Cluster Click
  const handleClusterClick = (cluster: EventCluster, e: React.MouseEvent) => {
    e.stopPropagation();
    const span = Math.max(60000, cluster.endMs - cluster.startMs);
    const margin = Math.max(30000, span * 0.4);
    const newStart = Math.max(0, cluster.startMs - margin);
    const newEnd = cluster.endMs + margin;
    setTimeRange([newStart, newEnd]);
    setCurrentTime(cluster.avgMs);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // MOUSE PANNING & CANVAS CLICK HANDLERS
  // ─────────────────────────────────────────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // Left click only
    isDraggingRef.current = true;
    hasMovedRef.current = false;
    dragStartXRef.current = e.clientX;
    dragStartTimeRangeRef.current = [minMs, maxMs];
    setIsPanning(true);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    const deltaX = e.clientX - dragStartXRef.current;
    if (Math.abs(deltaX) > 4) {
      hasMovedRef.current = true;
    }

    if (hasMovedRef.current && canvasDimensions.width > 0) {
      const timeShift = -(deltaX / canvasDimensions.width) * timeSpan;
      const initial = dragStartTimeRangeRef.current;
      let newMin = initial[0] + timeShift;
      let newMax = initial[1] + timeShift;

      // Bound clamping if fullBounds are provided
      if (fullBounds && fullBounds[1] > fullBounds[0]) {
        if (newMin < fullBounds[0]) {
          const shift = fullBounds[0] - newMin;
          newMin += shift;
          newMax += shift;
        }
        if (newMax > fullBounds[1]) {
          const shift = newMax - fullBounds[1];
          newMin -= shift;
          newMax -= shift;
        }
      }

      setTimeRange([Math.round(newMin), Math.round(newMax)]);
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsPanning(false);

    // If it was a quick click without drag movement, set scrubber to clicked timestamp
    if (!hasMovedRef.current && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickPct = Math.min(1, Math.max(0, clickX / rect.width));
      const targetMs = minMs + clickPct * timeSpan;
      setCurrentTime(targetMs);
    }
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    isDraggingRef.current = true;
    hasMovedRef.current = false;
    dragStartXRef.current = touch.clientX;
    dragStartTimeRangeRef.current = [minMs, maxMs];
    setIsPanning(true);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - dragStartXRef.current;
    if (Math.abs(deltaX) > 4) {
      hasMovedRef.current = true;
    }

    if (hasMovedRef.current && canvasDimensions.width > 0) {
      const timeShift = -(deltaX / canvasDimensions.width) * timeSpan;
      const initial = dragStartTimeRangeRef.current;
      let newMin = initial[0] + timeShift;
      let newMax = initial[1] + timeShift;

      if (fullBounds && fullBounds[1] > fullBounds[0]) {
        if (newMin < fullBounds[0]) {
          const shift = fullBounds[0] - newMin;
          newMin += shift;
          newMax += shift;
        }
        if (newMax > fullBounds[1]) {
          const shift = newMax - fullBounds[1];
          newMin -= shift;
          newMax -= shift;
        }
      }

      setTimeRange([Math.round(newMin), Math.round(newMax)]);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsPanning(false);

    if (!hasMovedRef.current && canvasRef.current && e.changedTouches.length > 0) {
      const touch = e.changedTouches[0];
      const rect = canvasRef.current.getBoundingClientRect();
      const clickX = touch.clientX - rect.left;
      const clickPct = Math.min(1, Math.max(0, clickX / rect.width));
      const targetMs = minMs + clickPct * timeSpan;
      setCurrentTime(targetMs);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background select-none overflow-hidden relative">
      {/* ─────────────────────────────────────────────────────────────
          TOP AXIS & WAVEFORM ROW
          Left: Fixed Gutter (w-52)
          Right: Temporal Axis & SVG Waveform (flex-1)
         ───────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex border-b border-border bg-card/80 backdrop-blur-md">
        {/* Left Gutter Label */}
        <div className="w-24 sm:w-44 flex-shrink-0 border-r border-border/60 px-1.5 sm:px-2 py-1 flex flex-col justify-between bg-card/90">
          <div className="flex items-center gap-1 sm:gap-1.5 text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground truncate">
            <Clock className="w-3 h-3 text-primary flex-shrink-0" />
            <span className="truncate">Scale</span>
          </div>
          <div className="flex items-center justify-between text-[8px] sm:text-[9px] font-mono text-muted-foreground pt-1 border-t border-border/30">
            <span className="font-bold text-primary truncate">Wave</span>
            <span className="text-[8px] hidden sm:inline">(Click peak)</span>
          </div>
        </div>

        {/* Right Header: Time Axis + SVG Waveform */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Time Axis Ticks */}
          <div className="h-8 relative border-b border-border/50">
            {timeTicks.map((tick, idx) => (
              <div
                key={idx}
                className="absolute top-0 bottom-0 flex flex-col justify-end pb-0.5 -translate-x-1/2 pointer-events-none"
                style={{ left: `${tick.xPct}%` }}
              >
                <div className="w-px h-1.5 bg-border mx-auto mb-0.5" />
                <div className="flex flex-col items-center">
                  <span className="text-[10px] font-mono font-bold text-foreground whitespace-nowrap leading-none">
                    {tick.label}
                  </span>
                  <span className="text-[8px] font-mono text-muted-foreground whitespace-nowrap leading-none mt-0.5">
                    {tick.subLabel}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* SVG Activity Waveform Spectrogram (Guaranteed 100% visible in light & dark mode) */}
          <div className="h-7 bg-secondary/30 relative flex items-center px-1">
            <svg 
              className="w-full h-6 block overflow-visible" 
              preserveAspectRatio="none" 
              viewBox={`0 0 ${computedDensityBins.bins.length * 10} 24`}
            >
              {computedDensityBins.bins.map((bin, idx) => {
                const height = bin.eventCount > 0 
                  ? Math.max(4, Math.round((bin.eventCount / computedDensityBins.maxCount) * 20)) 
                  : 1.5;
                const y = 24 - height;
                const isAnom = bin.anomalyCount > 0;

                return (
                  <rect
                    key={idx}
                    x={idx * 10 + 1}
                    y={y}
                    width={8}
                    height={height}
                    rx={1}
                    fill={bin.eventCount === 0 ? "var(--border)" : isAnom ? "#ef4444" : "#6366f1"}
                    className={cn(
                      "cursor-pointer transition-all duration-150",
                      bin.eventCount > 0 ? "opacity-85 hover:opacity-100" : "opacity-40"
                    )}
                    onClick={() => {
                      if (bin.eventCount > 0) {
                        const margin = (bin.endMs - bin.startMs) * 0.5;
                        setTimeRange([Math.max(0, bin.startMs - margin), bin.endMs + margin]);
                      }
                    }}
                  >
                    <title>{`${bin.label}: ${bin.eventCount} events${isAnom ? ` (${bin.anomalyCount} anomalies)` : ''}`}</title>
                  </rect>
                );
              })}
            </svg>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          MAIN LANES BODY
          Left: Fixed Lane Titles Column (w-52)
          Right: Scrollable Canvas Track (flex-1)
         ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* Left Fixed Lane Headers Column (NEVER overlapped by events!) */}
        <div className="w-24 sm:w-44 flex-shrink-0 border-r border-border/80 bg-card/60 flex flex-col z-10 select-none">
          {lanes.map((lane) => {
            const domainCfg = getDomainTheme(lane.domain === 'ENTITY' ? 'TELECOM' : lane.domain);
            const LaneIcon = lane.domain === 'ENTITY' ? Users : domainCfg.icon;

            const laneEventCount = events.filter(ev => {
              if (activeMode === 'network' || (activeMode === 'subject' && selectedEntityIds.length === 0)) {
                const entName = ev.entity_name || (ev.actor_entities[0] || 'Unknown Entity');
                return entName === lane.id;
              }
              return ev.domain === lane.id;
            }).length;

            return (
              <div
                key={lane.id}
                className="flex-1 min-h-[48px] border-b border-border/40 px-1.5 sm:px-2 py-1 sm:py-1.5 flex items-center gap-1.5 sm:gap-2 transition-colors hover:bg-secondary/40"
              >
                <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
                  <div className={cn("p-1 rounded-md border flex-shrink-0", domainCfg.bg, domainCfg.border)}>
                    <LaneIcon className={cn("w-3 h-3", lane.domain === 'ENTITY' ? 'text-primary' : domainCfg.color)} />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[10px] sm:text-[11px] font-bold text-foreground truncate leading-tight" title={lane.label}>
                      {lane.label}
                    </span>
                    <span className="text-[8px] sm:text-[9px] font-mono text-muted-foreground leading-tight truncate">
                      {laneEventCount} ev
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right Canvas Track (Holds all events, clusters, SVG connectors, bursts, and scrubber) */}
        <div
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className={cn(
            "flex-1 h-full overflow-y-auto relative select-none flex flex-col touch-none",
            isPanning ? "cursor-grabbing" : "cursor-crosshair"
          )}
        >
          {/* Activity Burst Shaded Bands */}
          {bursts.map(b => {
            const bStart = new Date(b.start_time).getTime();
            const bEnd = new Date(b.end_time).getTime();
            const leftPct = Math.max(0, ((bStart - minMs) / timeSpan) * 100);
            const rightPct = Math.min(100, ((bEnd - minMs) / timeSpan) * 100);
            const widthPct = Math.max(1.5, rightPct - leftPct);

            return (
              <div
                key={b.burst_id}
                className="absolute top-0 bottom-0 bg-amber-500/[0.05] border-x border-dashed border-amber-500/25 pointer-events-none z-0"
                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                title={`Temporal Episode: ${b.event_count} events over ${Math.round(b.duration_seconds / 60)}m`}
              />
            );
          })}

          {/* Lane Horizontal Guidelines & Events/Clusters */}
          <div className="flex-1 flex flex-col min-h-full relative">
            {lanes.map((lane, lIdx) => {
              const laneItems = laneItemsMap[lane.id] || [];

              return (
                <div
                  key={lane.id}
                  className={cn(
                    "flex-1 min-h-[50px] border-b border-border/40 relative flex items-center transition-colors group",
                    lIdx % 2 === 0 ? "bg-card/10" : "bg-transparent"
                  )}
                >
                  {/* Subtle Sub-grid Guideline */}
                  <div className="absolute inset-0 flex items-center pointer-events-none">
                    <div className="w-full h-px border-t border-dashed border-border/25" />
                  </div>

                  {/* Render Cluster Pills & Individual Event Markers */}
                  {laneItems.map((item) => {
                    if (item.isCluster) {
                      return (
                        <div
                          key={item.clusterId}
                          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-25 cursor-pointer group/cluster"
                          style={{ left: `${item.xPct}%` }}
                          onClick={(e) => handleClusterClick(item, e)}
                          onMouseEnter={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setClusterTooltipPos({ x: rect.left + rect.width / 2, y: rect.top - 8 });
                            setHoveredCluster(item);
                          }}
                          onMouseLeave={() => setHoveredCluster(null)}
                        >
                          <div className={cn(
                            "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold transition-all shadow-md hover:scale-110 active:scale-95 border backdrop-blur-md",
                            item.hasAnomaly 
                              ? "bg-rose-500/20 text-rose-500 border-rose-500/50 ring-2 ring-rose-500/30" 
                              : "bg-primary/20 text-primary border-primary/50 hover:bg-primary/30"
                          )}>
                            <Layers className="w-3 h-3" />
                            <span>+{item.count}</span>
                            {item.hasAnomaly && (
                              <AlertTriangle className="w-2.5 h-2.5 text-rose-500 animate-pulse" />
                            )}
                          </div>
                        </div>
                      );
                    }

                    // Individual Event Marker
                    const single = item as SingleLaneEvent;
                    const isCorrelated = activeCorrelationEventIds.has(single.event.event_id);
                    return (
                      <TimelineEventMarker
                        key={single.event.event_id}
                        event={single.event}
                        xPosition={single.xPct}
                        laneIndex={lIdx}
                        isSelected={selectedEventId === single.event.event_id}
                        isCorrelatedActive={isCorrelated}
                        yOffset={single.yOffset}
                        onSelect={onSelectEvent}
                      />
                    );
                  })}
                </div>
              );
            })}

            {/* SVG Overlay: Curvilinear Correlation Connectors & Velocity Warnings */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none z-15"
              style={{ width: canvasDimensions.width, height: canvasDimensions.height }}
            >
              {/* Draw Visible Correlations */}
              {correlations.map(c => {
                const coordA = eventCoordinates[c.event_a_id];
                const coordB = eventCoordinates[c.event_b_id];
                if (!coordA || !coordB) return null;

                const isSelected = selectedCorrelationId === c.correlation_id;

                return (
                  <TimelineCorrelationConnector
                    key={c.correlation_id}
                    correlation={c}
                    x1={coordA.x}
                    y1={coordA.y}
                    x2={coordB.x}
                    y2={coordB.y}
                    isSelected={isSelected}
                    onSelect={(corr) => setSelectedCorrelationId(corr.correlation_id)}
                  />
                );
              })}

              {/* Draw Velocity Inconsistencies */}
              {inconsistencies.map(inc => {
                const coordA = eventCoordinates[inc.event_a_id];
                const coordB = eventCoordinates[inc.event_b_id];
                if (!coordA || !coordB) return null;

                const midX = (coordA.x + coordB.x) / 2;
                const midY = (coordA.y + coordB.y) / 2;

                return (
                  <g key={inc.inconsistency_id} className="cursor-pointer pointer-events-auto">
                    <line
                      x1={coordA.x}
                      y1={coordA.y}
                      x2={coordB.x}
                      y2={coordB.y}
                      stroke="#ef4444"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      className="opacity-70 animate-pulse"
                    />
                    <circle cx={midX} cy={midY} r={4} fill="#ef4444" />
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Global Playback Vertical Scrubber Line */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-cyan-400 z-30 pointer-events-none shadow-[0_0_12px_rgba(6,182,212,0.8)] transition-all duration-75"
            style={{ left: `${cursorXPct}%` }}
          >
            <div className="w-3 h-3 rounded-full bg-cyan-400 -translate-x-[5px] -translate-y-1 shadow-[0_0_8px_rgba(6,182,212,1)]" />
          </div>
        </div>
      </div>

      {/* Floating Cluster Tooltip */}
      {hoveredCluster && (
        <div
          className="fixed z-50 pointer-events-none transform -translate-x-1/2 -translate-y-full mb-2 bg-card/95 border border-border shadow-2xl rounded-xl p-3 text-xs w-64 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
          style={{ left: clusterTooltipPos.x, top: clusterTooltipPos.y }}
        >
          <div className="flex items-center justify-between pb-1 border-b border-border/50">
            <div className="flex items-center gap-1.5 font-bold text-primary">
              <Layers className="w-3.5 h-3.5" />
              <span>{hoveredCluster.count} Events Cluster</span>
            </div>
            {hoveredCluster.hasAnomaly && (
              <span className="px-1.5 py-0.2 rounded bg-rose-500/10 text-rose-500 font-mono text-[9px] font-bold border border-rose-500/20">
                Anomaly
              </span>
            )}
          </div>
          <div className="py-1.5 space-y-1 text-[11px]">
            <div className="text-muted-foreground flex justify-between font-mono">
              <span>Span:</span>
              <span>{new Date(hoveredCluster.startMs).toISOString().slice(11, 16)} → {new Date(hoveredCluster.endMs).toISOString().slice(11, 16)}</span>
            </div>
            <div className="text-foreground line-clamp-2">
              {hoveredCluster.events.slice(0, 3).map(e => e.event_type).join(' · ')}
              {hoveredCluster.events.length > 3 ? ` +${hoveredCluster.events.length - 3} more` : ''}
            </div>
          </div>
          <div className="pt-1 border-t border-border/40 text-[10px] text-primary font-semibold flex items-center gap-1">
            <ZoomIn className="w-3 h-3" />
            <span>Click to zoom & expand this time window</span>
          </div>
        </div>
      )}
    </div>
  );
};
export default TimelineMasterCanvas;
