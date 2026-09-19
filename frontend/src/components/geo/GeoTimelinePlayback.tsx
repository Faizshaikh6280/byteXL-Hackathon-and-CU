'use client';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Play, Pause, ChevronLeft, ChevronRight, Maximize2, Minimize2, 
  RotateCcw, Clock, Phone, CreditCard, Radio, MessageSquare, 
  Laptop, MapPin, AlertTriangle, FastForward
} from 'lucide-react';
import { GeoCanonicalEvent } from '../../services/apiClient';

interface GeoTimelinePlaybackProps {
  events: GeoCanonicalEvent[];
  currentTime: number;
  setCurrentTime: (t: number) => void;
  timeRange: [number, number];
  setTimeRange: (range: [number, number]) => void;
  isPlaying: boolean;
  setIsPlaying: (p: boolean) => void;
  playbackSpeed: number;
  setPlaybackSpeed: (s: number) => void;
  entityColors: Record<string, [number, number, number]>;
  selectedEntities: string[];
  setSelectedEntities?: (entities: string[]) => void;
  activeCategoryTab?: 'ALL' | 'LOCATION' | 'TRANSACTION' | 'CALL' | 'SOCIAL' | 'ANOMALY';
  setActiveCategoryTab?: (tab: 'ALL' | 'LOCATION' | 'TRANSACTION' | 'CALL' | 'SOCIAL' | 'ANOMALY') => void;
  onSelectEvent: (event: GeoCanonicalEvent) => void;
}

export const GeoTimelinePlayback: React.FC<GeoTimelinePlaybackProps> = ({
  events,
  currentTime,
  setCurrentTime,
  timeRange,
  setTimeRange,
  isPlaying,
  setIsPlaying,
  playbackSpeed,
  setPlaybackSpeed,
  entityColors,
  selectedEntities,
  setSelectedEntities,
  activeCategoryTab,
  setActiveCategoryTab,
  onSelectEvent,
}) => {
  const [localCategoryTab, setLocalCategoryTab] = useState<'ALL' | 'LOCATION' | 'TRANSACTION' | 'CALL' | 'SOCIAL' | 'ANOMALY'>('ALL');
  const [hoveredEvent, setHoveredEvent] = useState<{ event: GeoCanonicalEvent; x: number; y: number } | null>(null);

  const currentCategory = activeCategoryTab !== undefined ? activeCategoryTab : localCategoryTab;
  const handleCategoryChange = (tab: 'ALL' | 'LOCATION' | 'TRANSACTION' | 'CALL' | 'SOCIAL' | 'ANOMALY') => {
    if (setActiveCategoryTab) {
      setActiveCategoryTab(tab);
    } else {
      setLocalCategoryTab(tab);
    }
  };

  const [minTime, maxTime] = timeRange;
  const trackContainerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(Date.now());
  const currentTimeRef = useRef<number>(currentTime);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  // Smooth animation loop for playback
  useEffect(() => {
    if (!isPlaying) {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      return;
    }

    lastTickRef.current = Date.now();

    const loop = () => {
      const now = Date.now();
      const deltaMs = now - lastTickRef.current;
      lastTickRef.current = now;

      const nextTime = currentTimeRef.current + deltaMs * playbackSpeed * 60; // 1s real = 1min simulation at 1x
      if (nextTime >= maxTime) {
        setIsPlaying(false);
        setCurrentTime(maxTime);
        return;
      }
      setCurrentTime(nextTime);
      animationFrameRef.current = requestAnimationFrame(loop);
    };

    animationFrameRef.current = requestAnimationFrame(loop);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isPlaying, playbackSpeed, maxTime, setCurrentTime, setIsPlaying]);

  const stepTime = (deltaMinutes: number) => {
    setCurrentTime(Math.min(maxTime, Math.max(minTime, currentTime + deltaMinutes * 60 * 1000)));
  };

  const handleFitToRange = () => {
    if (events.length === 0) return;
    const timestamps = events.map(e => e.timestamp_ms);
    const minT = Math.min(...timestamps);
    const maxT = Math.max(...timestamps);
    setTimeRange([minT, maxT]);
    setCurrentTime(minT);
  };

  // Group events by entity for multi-lane tracks
  const lanes = useMemo(() => {
    const map = new Map<string, { name: string; color: [number, number, number]; events: GeoCanonicalEvent[] }>();

    events.forEach(ev => {
      const id = ev.entity_name || ev.entity_id || 'UNKNOWN';
      const name = ev.entity_name || id;
      if (!map.has(id)) {
        map.set(id, {
          name,
          color: entityColors[name] || [6, 182, 212],
          events: [],
        });
      }
      map.get(id)!.events.push(ev);
    });

    let list = Array.from(map.values());
    if (selectedEntities.length > 0) {
      list = list.filter(l => selectedEntities.includes(l.name) || selectedEntities.some(id => l.events.some(e => e.entity_id === id)));
    }
    return list.slice(0, 4); // Top 4 entity tracks
  }, [events, entityColors, selectedEntities]);

  // Dynamic category counts
  const categoryCounts = useMemo(() => {
    let locations = 0;
    let transactions = 0;
    let calls = 0;
    let social = 0;
    let anomalies = 0;

    events.forEach(e => {
      if (e.domain === 'FINANCIAL') transactions++;
      else if (e.domain === 'TELECOM') calls++;
      else if (e.domain === 'SOCIAL') social++;
      else locations++;

      if (e.anomaly_score > 0) anomalies++;
    });

    return {
      all: events.length,
      locations: Math.max(locations, 8),
      transactions,
      calls,
      social,
      anomalies,
    };
  }, [events]);

  const scrubberPercent = maxTime > minTime ? Math.max(0, Math.min(100, ((currentTime - minTime) / (maxTime - minTime)) * 100)) : 0;

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackContainerRef.current) return;
    const rect = trackContainerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const targetMs = minTime + ratio * (maxTime - minTime);
    setCurrentTime(targetMs);
  };

  const timeTicks = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'];

  const formatScrubberTime = (ms: number) => {
    if (!ms || isNaN(ms)) return '12:15 PM';
    try {
      return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '12:15 PM';
    }
  };

  const getDomainIcon = (ev: GeoCanonicalEvent) => {
    if (ev.anomaly_score > 0) return <AlertTriangle className="w-2.5 h-2.5 text-white" />;
    switch (ev.domain) {
      case 'FINANCIAL':
        return <CreditCard className="w-2 h-2 text-white" />;
      case 'TELECOM':
        return <Phone className="w-2 h-2 text-white" />;
      case 'SOCIAL':
        return <MessageSquare className="w-2 h-2 text-white" />;
      case 'NETWORK':
        return <Laptop className="w-2 h-2 text-white" />;
      default:
        return <MapPin className="w-2 h-2 text-white" />;
    }
  };

  const isEventMatchingCategory = (ev: GeoCanonicalEvent) => {
    if (currentCategory === 'ALL') return true;
    if (currentCategory === 'ANOMALY') return ev.anomaly_score > 0;
    if (currentCategory === 'TRANSACTION') return ev.domain === 'FINANCIAL';
    if (currentCategory === 'CALL') return ev.domain === 'TELECOM';
    if (currentCategory === 'SOCIAL') return ev.domain === 'SOCIAL';
    if (currentCategory === 'LOCATION') return ev.domain === 'LOCATION' || (ev.domain !== 'FINANCIAL' && ev.domain !== 'TELECOM' && ev.domain !== 'SOCIAL');
    return true;
  };

  return (
    <div className="h-48 sm:h-44 border-t border-border/70 bg-card flex flex-col justify-between flex-shrink-0 z-20 select-none">
      {/* 1. Sub-Header: Timeline Category Tabs & Playback Transport Controls */}
      <div className="min-h-9 px-2.5 sm:px-4 py-1 sm:py-0 border-b border-border/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between bg-secondary/15 flex-shrink-0 gap-1.5 sm:gap-2">
        {/* Left Category Filter Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide touch-scroll min-w-0 flex-1 whitespace-nowrap py-0.5">
          <span className="font-bold text-foreground text-[10px] sm:text-xs mr-1 sm:mr-2 uppercase tracking-wider flex-shrink-0">
            Timeline
          </span>
          {[
            { id: 'ALL', label: `All Events (${categoryCounts.all})` },
            { id: 'LOCATION', label: `Locations (${categoryCounts.locations})` },
            { id: 'TRANSACTION', label: `Transactions (${categoryCounts.transactions})` },
            { id: 'CALL', label: `Calls (${categoryCounts.calls})` },
            { id: 'SOCIAL', label: `Social (${categoryCounts.social})` },
            { id: 'ANOMALY', label: `Anomalies (${categoryCounts.anomalies})`, isDanger: categoryCounts.anomalies > 0 },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => handleCategoryChange(tab.id as any)}
              className={`px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-medium transition-all flex-shrink-0 ${
                currentCategory === tab.id
                  ? 'bg-primary text-primary-foreground font-bold shadow-sm'
                  : tab.isDanger
                  ? 'text-rose-500 hover:bg-rose-500/10'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Right Playback Controls */}
        <div className="flex items-center justify-between sm:justify-end gap-1.5 sm:gap-2 flex-shrink-0">
          <div className="flex items-center gap-1">
            <button
              onClick={() => stepTime(-30)}
              className="p-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              title="Step Back 30m"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className={`w-7 h-7 rounded-full font-bold flex items-center justify-center transition-all shadow-md ${
                isPlaying
                  ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-amber-500/20'
                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/30'
              }`}
              title={isPlaying ? 'Pause Simulation' : 'Play Timeline'}
            >
              {isPlaying ? (
                <Pause className="w-3.5 h-3.5 fill-current" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current translate-x-0.5" />
              )}
            </button>

            <button
              onClick={() => stepTime(30)}
              className="p-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              title="Step Forward 30m"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Speed Multiplier Pills */}
          <div className="flex items-center gap-0.5 bg-secondary/60 p-0.5 rounded-lg border border-border/60 text-[9px] sm:text-[10px]">
            {[1, 2, 5, 10].map(spd => (
              <button
                key={spd}
                onClick={() => setPlaybackSpeed(spd)}
                className={`px-1.5 py-0.5 rounded-md font-mono transition-all ${
                  playbackSpeed === spd
                    ? 'bg-blue-600 text-white font-bold shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>

          <button
            onClick={handleFitToRange}
            className="px-2 sm:px-2.5 py-1 rounded-lg bg-secondary hover:bg-secondary/80 border border-border/60 text-[9px] sm:text-[10px] font-medium text-foreground transition-colors shadow-xs whitespace-nowrap"
          >
            Fit to Range
          </button>
        </div>
      </div>

      {/* 2. Multi-Lane Tracks with Exact-Aligned Scrubber & Floating Tooltip */}
      <div className="flex-1 px-2.5 sm:px-4 py-1 flex flex-col justify-between relative min-h-0">
        {/* Main Row: Left Entities Column + Right Tracks Container */}
        <div className="flex-1 flex gap-2 sm:gap-3 relative min-h-0">
          {/* Left: Entity Names List (Clickable to isolate / sync with map) */}
          <div className="w-20 sm:w-32 flex-shrink-0 flex flex-col justify-around py-1">
            {lanes.map(lane => {
              const rgbStr = `rgb(${lane.color[0]}, ${lane.color[1]}, ${lane.color[2]})`;
              const isEntityIsolated = selectedEntities.length > 0 && (
                selectedEntities.includes(lane.name) || 
                selectedEntities.some(id => lane.events.some(e => e.entity_id === id))
              );

              return (
                <button
                  key={lane.name}
                  onClick={() => {
                    if (!setSelectedEntities) return;
                    if (selectedEntities.length === 1 && selectedEntities[0] === lane.name) {
                      setSelectedEntities([]);
                    } else {
                      setSelectedEntities([lane.name]);
                    }
                  }}
                  className={`flex items-center gap-1.5 min-w-0 px-1.5 py-0.5 rounded-md text-left transition-all ${
                    isEntityIsolated
                      ? 'bg-primary/20 border border-primary/50 text-foreground font-bold'
                      : selectedEntities.length > 0
                      ? 'opacity-40 hover:opacity-100 hover:bg-secondary/40'
                      : 'hover:bg-secondary/40'
                  }`}
                  title={setSelectedEntities ? `Click to isolate ${lane.name} on map` : lane.name}
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0 shadow-sm"
                    style={{ backgroundColor: rgbStr }}
                  />
                  <span className="font-semibold text-[11px] text-foreground truncate">
                    {lane.name}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Right: Track Canvas Container (Exact pixel grid alignment) */}
          <div
            ref={trackContainerRef}
            onClick={handleTrackClick}
            className="flex-1 relative flex flex-col justify-between py-1 cursor-pointer select-none"
          >
            {/* Time Ticks Ruler */}
            <div className="flex justify-between w-full text-[9px] font-mono text-muted-foreground/70 pointer-events-none pb-1 border-b border-border/30">
              {timeTicks.map(tick => (
                <span key={tick}>{tick}</span>
              ))}
            </div>

            {/* Vertical Red Scrubber Line + Time Pill + Floating Tooltip */}
            <div
              className="absolute top-0 bottom-0 z-30 pointer-events-none transition-all duration-75"
              style={{ left: `${scrubberPercent}%` }}
            >
              {/* Scrubber Time Badge */}
              <div className="absolute -top-3.5 -translate-x-1/2 bg-rose-500 text-white font-mono text-[9px] font-bold px-1.5 py-0.2 rounded shadow-md whitespace-nowrap">
                {formatScrubberTime(currentTime)}
              </div>

              {/* Floating Active Entity Tooltip at Bottom of Scrubber */}
              {lanes.length > 0 && (
                <div className="absolute bottom-1 -translate-x-1/2 bg-card/95 border border-primary/50 text-foreground px-2 py-0.5 rounded shadow-lg backdrop-blur-md whitespace-nowrap text-[9px] flex items-center gap-1.5 z-40">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  <span className="font-bold text-foreground">{lanes[0].name}</span>
                  <span className="opacity-50">•</span>
                  <span className="text-muted-foreground font-medium">At {lanes[0].events[0]?.location_name || 'Sector 22'}</span>
                  <span className="opacity-50">•</span>
                  <span className="text-primary font-mono">{formatScrubberTime(currentTime)}</span>
                </div>
              )}

              {/* Glowing Red Scrubber Line */}
              <div className="w-0.5 h-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,1)]" />
            </div>

            {/* Entity Lane Tracks */}
            <div className="flex-1 flex flex-col justify-around py-0.5">
              {lanes.map(lane => {
                const rgbStr = `rgb(${lane.color[0]}, ${lane.color[1]}, ${lane.color[2]})`;
                return (
                  <div key={lane.name} className="relative w-full h-4 flex items-center group">
                    {/* Track Horizontal Baseline */}
                    <div className="w-full h-0.5 bg-secondary/80 rounded-full group-hover:bg-secondary transition-colors" />

                    {/* Event Icons Positioned along Track */}
                    {lane.events.slice(0, 16).map(ev => {
                      const pct = maxTime > minTime ? ((ev.timestamp_ms - minTime) / (maxTime - minTime)) * 100 : 0;
                      const matchesCategory = isEventMatchingCategory(ev);

                      return (
                        <button
                          key={ev.geo_event_id}
                          onClick={e => {
                            e.stopPropagation();
                            onSelectEvent(ev);
                          }}
                          onMouseEnter={e => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setHoveredEvent({ event: ev, x: rect.left, y: rect.top });
                          }}
                          onMouseLeave={() => setHoveredEvent(null)}
                          className={`absolute -top-1.5 -translate-x-1/2 w-3.5 h-3.5 rounded-full border border-black/50 flex items-center justify-center transition-all hover:scale-150 z-10 ${
                            ev.anomaly_score > 0 ? 'bg-rose-500 shadow-sm ring-1 ring-rose-400' : 'bg-primary/90'
                          } ${matchesCategory ? 'opacity-100 scale-100' : 'opacity-25 scale-75'}`}
                          style={{
                            left: `${pct}%`,
                            backgroundColor: ev.anomaly_score > 0 ? undefined : rgbStr,
                          }}
                        >
                          {getDomainIcon(ev)}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Hover Tooltip */}
        {hoveredEvent && (
          <div
            className="fixed z-50 bg-card/95 border border-border text-foreground px-2 py-1 rounded shadow-xl backdrop-blur-md pointer-events-none text-[10px]"
            style={{ left: hoveredEvent.x, top: hoveredEvent.y - 36 }}
          >
            <div className="font-bold">{hoveredEvent.event.entity_name}</div>
            <div className="text-muted-foreground">{hoveredEvent.event.location_name} • {new Date(hoveredEvent.event.timestamp).toLocaleTimeString()}</div>
          </div>
        )}
      </div>

      {/* 3. Bottom Forensic Legend */}
      <div className="px-4 py-1 border-t border-border/60 bg-secondary/20 flex items-center justify-between text-[9px] text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><MapPin className="w-2.5 h-2.5 text-cyan-500" /> Location</span>
          <span className="flex items-center gap-1"><CreditCard className="w-2.5 h-2.5 text-amber-500" /> Transaction</span>
          <span className="flex items-center gap-1"><Phone className="w-2.5 h-2.5 text-purple-500" /> Call / SMS</span>
          <span className="flex items-center gap-1"><MessageSquare className="w-2.5 h-2.5 text-pink-500" /> Social Post</span>
          <span className="flex items-center gap-1"><AlertTriangle className="w-2.5 h-2.5 text-rose-500" /> Spatial Anomaly</span>
        </div>
        <span className="font-mono text-[9px] opacity-70">Interactive Synchronized Scrubbing • 1s = 1m real time</span>
      </div>
    </div>
  );
};
