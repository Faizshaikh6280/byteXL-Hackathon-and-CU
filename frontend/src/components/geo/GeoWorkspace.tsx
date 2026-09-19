'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Map as MapIcon, Users, Landmark, BookOpen, Crosshair, Filter, 
  Download, Layers, RefreshCw, Activity, ShieldCheck, Sparkles, Navigation,
  Search, ChevronDown, Compass, Check, MapPin, Eye, X
} from 'lucide-react';

import { useCase } from '../../context/CaseContext';
import { useTimelineStore } from '../../store/useTimelineStore';
import { 
  api, GeoCanonicalEvent, MovementSegment, CoLocationFinding, 
  CommonPlace, SpatialStoryCard, ActivityDensityCell, GeoInvestigationResponse 
} from '../../services/apiClient';

import { GeoDeckGLMap } from './GeoDeckGLMap';
import { GeoMetricsRibbon } from './GeoMetricsRibbon';
import { GeoFilterPanel, EntityFilterItem } from './GeoFilterPanel';
import { GeoTimelinePlayback } from './GeoTimelinePlayback';
import { GeoLegend } from './GeoLegend';
import { GeoAreaInvestigationModal } from './GeoAreaInvestigationModal';
import { GeoSpatialIntelligenceDrawer, GeoDrawerTab } from './GeoSpatialIntelligenceDrawer';
import { cn } from '../../utils/cn';

const ENTITY_COLOR_PALETTE: Array<[number, number, number]> = [
  [59, 130, 246],  // Blue (Aarav Sharma)
  [244, 63, 94],   // Crimson / Rose (Riya Mehta)
  [52, 211, 153],  // Emerald (Vikram Bedi)
  [251, 191, 36],  // Amber (Kabir Singh)
  [168, 85, 247],  // Purple (Aman Verma)
  [6, 182, 212],   // Cyan
  [244, 114, 182], // Pink
  [249, 115, 22],  // Orange
];

export const GeoWorkspace: React.FC<{ onViewOnGraph?: (entityId: string) => void }> = ({
  onViewOnGraph
}) => {
  const { activeCase } = useCase();
  const { currentTime, setCurrentTime, timeRange, setTimeRange } = useTimelineStore();

  const [investigation, setInvestigation] = useState<GeoInvestigationResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Left Filter Panel Drawer (collapsible, 0px when closed)
  const [showFilters, setShowFilters] = useState(false);

  // Right Slider Intelligence Drawer (Story, Inspector, Co-Locations, Places)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeDrawerTab, setActiveDrawerTab] = useState<GeoDrawerTab>('STORY');

  // Modals & Panels toggle
  const [isAreaModalOpen, setIsAreaModalOpen] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [isLiveTracking, setIsLiveTracking] = useState(false);

  // Layer Toggles
  const [showWaypoints, setShowWaypoints] = useState(true);
  const [showMovements, setShowMovements] = useState(true);
  const [showTrips, setShowTrips] = useState(true);
  const [showCoverage, setShowCoverage] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // Selection state
  const [selectedEvent, setSelectedEvent] = useState<GeoCanonicalEvent | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<CommonPlace | null>(null);
  const [areaModalCenter, setAreaModalCenter] = useState<[number, number]>([30.7333, 76.7794]);

  // Synchronized Multi-Dimensional Filters
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [minConfidence, setMinConfidence] = useState<number>(0);
  const [timelineCategory, setTimelineCategory] = useState<'ALL' | 'LOCATION' | 'TRANSACTION' | 'CALL' | 'SOCIAL' | 'ANOMALY'>('ALL');

  const targetCaseId = activeCase?.case_id || 'INV-2026-BLACK-CIRCUIT';

  // Load geo investigation data from backend
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getGeoInvestigation(targetCaseId);
      setInvestigation(res);

      // Sync timeline range if available
      if (res.events.length > 0) {
        const timestamps = res.events.map(e => e.timestamp_ms);
        const minT = Math.min(...timestamps);
        const maxT = Math.max(...timestamps);
        setTimeRange([minT, maxT]);
        if (currentTime < minT || currentTime > maxT) {
          setCurrentTime(minT);
        }

        // Default to the first hotspot if no event is selected
        if (!selectedEvent && res.events.length > 0) {
          const hotspot = res.events.find(e => e.anomaly_score > 0) || res.events[0];
          setSelectedEvent(hotspot);
        }
      }
    } catch (err) {
      console.error("Failed to load geospatial investigation:", err);
    } finally {
      setLoading(false);
    }
  }, [targetCaseId, currentTime, setCurrentTime, setTimeRange]);

  useEffect(() => {
    loadData();
  }, [targetCaseId]);

  // Live Tracking loop
  useEffect(() => {
    if (!isLiveTracking) return;
    const timer = setInterval(() => {
      const next = currentTime + 1000 * 60 * 15; // advance 15 min
      if (next >= timeRange[1]) {
        setCurrentTime(timeRange[0]);
      } else {
        setCurrentTime(next);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [isLiveTracking, currentTime, timeRange, setCurrentTime]);

  // Stable entity colors
  const entityColors = useMemo(() => {
    const colors: Record<string, [number, number, number]> = {};
    if (!investigation) return colors;

    const uniqueEnts = Array.from(new Set(investigation.events.map(e => e.entity_name || e.entity_id || 'UNKNOWN')));
    uniqueEnts.forEach((ent, idx) => {
      colors[ent] = ENTITY_COLOR_PALETTE[idx % ENTITY_COLOR_PALETTE.length];
    });
    return colors;
  }, [investigation]);

  // Available Entities list for filters
  const availableEntities: EntityFilterItem[] = useMemo(() => {
    if (!investigation) return [];
    const counts = new Map<string, { name: string; count: number }>();
    
    investigation.events.forEach(e => {
      const id = e.entity_id || 'UNKNOWN';
      const name = e.entity_name || id;
      const existing = counts.get(id);
      if (!existing) {
        counts.set(id, { name, count: 1 });
      } else {
        existing.count += 1;
      }
    });

    return Array.from(counts.entries()).map(([id, item]) => ({
      id,
      name: item.name,
      color: entityColors[item.name] || [59, 130, 246],
      eventCount: item.count,
    }));
  }, [investigation, entityColors]);

  const entityNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    availableEntities.forEach(e => {
      map[e.id] = e.name;
    });
    return map;
  }, [availableEntities]);

  const availableDomains = useMemo(() => {
    if (!investigation) return [];
    return Array.from(new Set(investigation.events.map(e => e.domain)));
  }, [investigation]);

  // ================= BI-DIRECTIONAL FILTER SYNCHRONIZATION =================
  const filteredEvents = useMemo(() => {
    if (!investigation?.events) return [];
    return investigation.events.filter(ev => {
      // 1. Entity Filter
      if (selectedEntities.length > 0) {
        const matchesEntity = selectedEntities.includes(ev.entity_id || '') || 
                              selectedEntities.includes(ev.entity_name || '');
        if (!matchesEntity) return false;
      }

      // 2. Domain / Data Type Filter
      if (selectedDomains.length > 0) {
        if (!selectedDomains.includes(ev.domain)) return false;
      }

      // 3. Confidence Threshold Filter
      if (minConfidence > 0) {
        if ((ev.location_confidence || 1) < minConfidence) return false;
      }

      // 4. Category Tab Filter
      if (timelineCategory === 'ANOMALY' && ev.anomaly_score <= 0) return false;
      if (timelineCategory === 'TRANSACTION' && ev.domain !== 'FINANCIAL') return false;
      if (timelineCategory === 'CALL' && ev.domain !== 'TELECOM') return false;
      if (timelineCategory === 'SOCIAL' && ev.domain !== 'SOCIAL') return false;
      if (timelineCategory === 'LOCATION') {
        const isLoc = ev.domain === 'LOCATION' || (ev.domain !== 'FINANCIAL' && ev.domain !== 'TELECOM' && ev.domain !== 'SOCIAL');
        if (!isLoc) return false;
      }

      return true;
    });
  }, [investigation, selectedEntities, selectedDomains, minConfidence, timelineCategory]);

  const filteredMovements = useMemo(() => {
    if (!investigation?.movements) return [];
    if (selectedEntities.length === 0) return investigation.movements;
    return investigation.movements.filter(m => selectedEntities.includes(m.entity_id));
  }, [investigation, selectedEntities]);

  const filteredTripsWaypoints = useMemo(() => {
    if (!investigation?.trips_waypoints) return [];
    if (selectedEntities.length === 0) return investigation.trips_waypoints;
    return investigation.trips_waypoints.filter(t => selectedEntities.includes(t.entity_id));
  }, [investigation, selectedEntities]);

  const filteredDensityGrid = useMemo(() => {
    if (!investigation?.density_grid) return [];
    return investigation.density_grid;
  }, [investigation]);

  const uniqueLocationsCount = useMemo(() => {
    if (!investigation) return 0;
    const set = new Set<string>();
    filteredEvents.forEach(e => {
      set.add(`${e.latitude.toFixed(3)},${e.longitude.toFixed(3)}`);
    });
    return Math.max(set.size, investigation.common_places?.length || 0);
  }, [investigation, filteredEvents]);

  const spatialAnomaliesCount = useMemo(() => {
    return filteredEvents.filter(e => e.anomaly_score > 0).length;
  }, [filteredEvents]);

  const handleExportGeoJSON = async () => {
    try {
      const data = await api.exportGeoDossier(targetCaseId, 'geojson');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `GeoDossier_${targetCaseId}.geojson`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
    }
  };

  const handleMapClick = (lat: number, lng: number) => {
    setAreaModalCenter([lat, lng]);
    setIsAreaModalOpen(true);
  };

  const resetFilters = () => {
    setSelectedEntities([]);
    setSelectedDomains([]);
    setMinConfidence(0);
    setTimelineCategory('ALL');
  };

  const toggleDrawerTab = (tab: GeoDrawerTab) => {
    if (isDrawerOpen && activeDrawerTab === tab) {
      setIsDrawerOpen(false);
    } else {
      setActiveDrawerTab(tab);
      setIsDrawerOpen(true);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-background overflow-hidden relative select-none">
      {/* ─────────────────────────────────────────────────────────────
          1. TOP COMMAND BAR (Light/Dark Theme-Consistent)
         ───────────────────────────────────────────────────────────── */}
      <div className="h-13 border-b border-border bg-card px-4 flex items-center justify-between z-20 flex-shrink-0">
        {/* Left: Title + Live Correlation Badge */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-xl bg-primary/10 text-primary border border-primary/25 flex-shrink-0">
            <MapIcon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-foreground tracking-tight leading-none whitespace-nowrap">
                Geospatial Intelligence
              </h1>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[9px] font-bold text-emerald-500 uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Correlation
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5 hidden xl:block truncate">
              Investigate physical movements, co-location convergence, and spatial anomalies
            </p>
          </div>
        </div>

        {/* Center: Module Trigger Pills (Clean, Theme-Safe Badges) */}
        <div className="hidden md:flex items-center gap-1 bg-secondary/50 p-1 rounded-xl border border-border text-xs">
          {/* 1. Filters & Controls */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all text-xs",
              showFilters
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filters</span>
            {selectedEntities.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-blue-500 text-white font-mono text-[9px] font-bold">
                {selectedEntities.length}
              </span>
            )}
          </button>

          {/* 2. Story Insights (Slider Trigger) */}
          <button
            onClick={() => toggleDrawerTab('STORY')}
            className={cn(
              "px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all text-xs",
              isDrawerOpen && activeDrawerTab === 'STORY'
                ? "bg-purple-600 text-white shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}
          >
            <BookOpen className={cn("w-3.5 h-3.5", isDrawerOpen && activeDrawerTab === 'STORY' ? "text-white" : "text-purple-500")} />
            <span>Story Insights</span>
            <span className={cn(
              "px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold border",
              isDrawerOpen && activeDrawerTab === 'STORY'
                ? "bg-white/20 text-white border-white/30"
                : "bg-secondary text-foreground border-border/60"
            )}>
              {investigation?.story_cards?.length || 0}
            </span>
          </button>

          {/* 3. Co-Locations (Slider Trigger) */}
          <button
            onClick={() => toggleDrawerTab('COLOCATIONS')}
            className={cn(
              "px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all text-xs",
              isDrawerOpen && activeDrawerTab === 'COLOCATIONS'
                ? "bg-cyan-600 text-white shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}
          >
            <Users className={cn("w-3.5 h-3.5", isDrawerOpen && activeDrawerTab === 'COLOCATIONS' ? "text-white" : "text-cyan-500")} />
            <span>Co-Locations</span>
            <span className={cn(
              "px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold border",
              isDrawerOpen && activeDrawerTab === 'COLOCATIONS'
                ? "bg-white/20 text-white border-white/30"
                : "bg-secondary text-foreground border-border/60"
            )}>
              {investigation?.co_locations?.length || 0}
            </span>
          </button>

          {/* 4. Common Places (Slider Trigger) */}
          <button
            onClick={() => toggleDrawerTab('COMMON_PLACES')}
            className={cn(
              "px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all text-xs",
              isDrawerOpen && activeDrawerTab === 'COMMON_PLACES'
                ? "bg-amber-600 text-white shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}
          >
            <Landmark className={cn("w-3.5 h-3.5", isDrawerOpen && activeDrawerTab === 'COMMON_PLACES' ? "text-white" : "text-amber-500")} />
            <span>Common Places</span>
            <span className={cn(
              "px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold border",
              isDrawerOpen && activeDrawerTab === 'COMMON_PLACES'
                ? "bg-white/20 text-white border-white/30"
                : "bg-secondary text-foreground border-border/60"
            )}>
              {investigation?.common_places?.length || 0}
            </span>
          </button>

          {/* 5. Location Inspector (Slider Trigger) */}
          <button
            onClick={() => toggleDrawerTab('INSPECTOR')}
            className={cn(
              "px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all text-xs",
              isDrawerOpen && activeDrawerTab === 'INSPECTOR'
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}
          >
            <MapPin className="w-3.5 h-3.5 text-rose-500" />
            <span>Inspector</span>
          </button>

          {/* 6. Geofence Scan */}
          <button
            onClick={() => setIsAreaModalOpen(true)}
            className="px-3 py-1.5 rounded-lg font-semibold text-emerald-500 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 flex items-center gap-1.5 transition-all text-xs"
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>Geofence Scan</span>
          </button>
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleExportGeoJSON}
            className="px-2.5 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 border border-border text-foreground text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>

          <button
            onClick={() => setShowLegend(!showLegend)}
            className={cn(
              "p-1.5 rounded-lg border border-border text-xs transition-colors",
              showLegend ? "bg-primary/10 text-primary border-primary/30" : "bg-secondary text-muted-foreground hover:text-foreground"
            )}
            title="Toggle Layer Legend"
          >
            <Layers className="w-4 h-4" />
          </button>

          <button
            onClick={loadData}
            className="p-1.5 rounded-lg bg-secondary hover:bg-secondary/80 border border-border text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh Data"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin text-primary")} />
          </button>
        </div>
      </div>

      {/* Mobile Sub-Command Trigger Strip (md:hidden) */}
      <div className="md:hidden flex items-center gap-1.5 px-3 py-1.5 border-b border-border bg-card/95 overflow-x-auto scrollbar-hide touch-scroll z-20 flex-shrink-0">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            "px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1 text-xs flex-shrink-0 transition-all",
            showFilters
              ? "bg-primary text-primary-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground bg-secondary/60"
          )}
        >
          <Filter className="w-3.5 h-3.5" />
          <span>Filters</span>
          {selectedEntities.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-blue-500 text-white font-mono text-[9px] font-bold">
              {selectedEntities.length}
            </span>
          )}
        </button>

        <button
          onClick={() => toggleDrawerTab('STORY')}
          className={cn(
            "px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1 text-xs flex-shrink-0 transition-all",
            isDrawerOpen && activeDrawerTab === 'STORY'
              ? "bg-purple-600 text-white shadow-xs"
              : "text-muted-foreground hover:text-foreground bg-secondary/60"
          )}
        >
          <BookOpen className={cn("w-3.5 h-3.5", isDrawerOpen && activeDrawerTab === 'STORY' ? "text-white" : "text-purple-500")} />
          <span>Story ({investigation?.story_cards?.length || 0})</span>
        </button>

        <button
          onClick={() => toggleDrawerTab('COLOCATIONS')}
          className={cn(
            "px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1 text-xs flex-shrink-0 transition-all",
            isDrawerOpen && activeDrawerTab === 'COLOCATIONS'
              ? "bg-cyan-600 text-white shadow-xs"
              : "text-muted-foreground hover:text-foreground bg-secondary/60"
          )}
        >
          <Users className={cn("w-3.5 h-3.5", isDrawerOpen && activeDrawerTab === 'COLOCATIONS' ? "text-white" : "text-cyan-500")} />
          <span>Co-Locations ({investigation?.co_locations?.length || 0})</span>
        </button>

        <button
          onClick={() => toggleDrawerTab('COMMON_PLACES')}
          className={cn(
            "px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1 text-xs flex-shrink-0 transition-all",
            isDrawerOpen && activeDrawerTab === 'COMMON_PLACES'
              ? "bg-amber-600 text-white shadow-xs"
              : "text-muted-foreground hover:text-foreground bg-secondary/60"
          )}
        >
          <Landmark className={cn("w-3.5 h-3.5", isDrawerOpen && activeDrawerTab === 'COMMON_PLACES' ? "text-white" : "text-amber-500")} />
          <span>Places ({investigation?.common_places?.length || 0})</span>
        </button>

        <button
          onClick={() => toggleDrawerTab('INSPECTOR')}
          className={cn(
            "px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1 text-xs flex-shrink-0 transition-all",
            isDrawerOpen && activeDrawerTab === 'INSPECTOR'
              ? "bg-primary text-primary-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground bg-secondary/60"
          )}
        >
          <MapPin className="w-3.5 h-3.5 text-rose-500" />
          <span>Inspector</span>
        </button>

        <button
          onClick={() => setIsAreaModalOpen(true)}
          className="px-2.5 py-1 rounded-lg font-semibold text-emerald-500 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 flex items-center gap-1 text-xs flex-shrink-0 transition-all"
        >
          <Crosshair className="w-3.5 h-3.5" />
          <span>Scan</span>
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          2. TOP KPI BANNER (Theme-Consistent)
         ───────────────────────────────────────────────────────────── */}
      <GeoMetricsRibbon
        totalEvents={filteredEvents.length}
        uniqueLocations={uniqueLocationsCount}
        entitiesCount={selectedEntities.length > 0 ? selectedEntities.length : availableEntities.length}
        movementPatterns={filteredMovements.length}
        spatialAnomalies={spatialAnomaliesCount}
        highInterestAreas={investigation?.common_places.length || 0}
        isLoading={loading}
      />

      {/* ─────────────────────────────────────────────────────────────
          3. CORE 3-COLUMN CANVAS (Spacious Hero Map + Right Slider)
         ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex overflow-hidden relative">
        {/* Left Column: Interactive Collapsible Filters Drawer */}
        {showFilters && (
          <>
            <div 
              onClick={() => setShowFilters(false)}
              className="fixed inset-0 bg-black/50 z-30 md:hidden backdrop-blur-xs" 
            />
            <div className="fixed md:static inset-y-0 left-0 z-40 md:z-20 w-72 max-w-[85vw] flex-shrink-0 h-full border-r border-border bg-card shadow-2xl md:shadow-none animate-in slide-in-from-left duration-200">
              <GeoFilterPanel
                availableEntities={availableEntities}
                selectedEntities={selectedEntities}
                setSelectedEntities={setSelectedEntities}
                availableDomains={availableDomains}
                selectedDomains={selectedDomains}
                setSelectedDomains={setSelectedDomains}
                minConfidence={minConfidence}
                setMinConfidence={setMinConfidence}
                timeRange={timeRange}
                onTimeRangeChange={(start, end) => setTimeRange([start, end])}
                onResetFilters={resetFilters}
                onClose={() => setShowFilters(false)}
              />
            </div>
          </>
        )}

        {/* Center Hero Map: Occupies all available width! */}
        <div className="flex-1 min-w-0 h-full relative">
          <GeoDeckGLMap
            events={filteredEvents}
            movements={filteredMovements}
            tripsWaypoints={filteredTripsWaypoints}
            densityGrid={filteredDensityGrid}
            commonPlaces={investigation?.common_places || []}
            selectedEvent={selectedEvent}
            onSelectEvent={ev => {
              setSelectedEvent(ev);
              setSelectedPlace(null);
              setActiveDrawerTab('INSPECTOR');
              setIsDrawerOpen(true);
            }}
            onMapClickCoordinates={handleMapClick}
            currentTime={currentTime}
            timeRange={timeRange}
            entityColors={entityColors}
            showWaypoints={showWaypoints}
            showMovements={showMovements}
            showTrips={showTrips}
            showCoverage={showCoverage}
            showHeatmap={showHeatmap}
            initialCenter={investigation?.summary_metrics?.center}
            isLiveTracking={isLiveTracking}
            setIsLiveTracking={setIsLiveTracking}
            onOpenLegend={() => setShowLegend(!showLegend)}
            onTriggerScan={() => setIsAreaModalOpen(true)}
            onToggleInspector={() => {
              setActiveDrawerTab('INSPECTOR');
              setIsDrawerOpen(!isDrawerOpen);
            }}
            showInspector={isDrawerOpen && activeDrawerTab === 'INSPECTOR'}
          />

          {/* Floating Map Legend (Bottom Left) */}
          {showLegend && (
            <div className="absolute bottom-12 left-4 z-30">
              <GeoLegend
                showWaypoints={showWaypoints}
                setShowWaypoints={setShowWaypoints}
                showMovements={showMovements}
                setShowMovements={setShowMovements}
                showTrips={showTrips}
                setShowTrips={setShowTrips}
                showCoverage={showCoverage}
                setShowCoverage={setShowCoverage}
                showHeatmap={showHeatmap}
                setShowHeatmap={setShowHeatmap}
              />
            </div>
          )}

          {/* Active Filter Pill Overlay on Map */}
          {(selectedEntities.length > 0 || timelineCategory !== 'ALL' || selectedDomains.length > 0) && (
            <div className="absolute top-4 left-4 z-30 bg-card/95 border border-primary/40 text-foreground px-3 py-1.5 rounded-xl flex items-center gap-2 text-xs shadow-xl backdrop-blur-md">
              <Filter className="w-3.5 h-3.5 text-primary" />
              <span className="font-semibold text-primary">Map Filtered:</span>
              <span className="text-foreground">
                {selectedEntities.length > 0 ? `${selectedEntities.map(id => entityNameMap[id] || id).join(', ')}` : ''}
                {timelineCategory !== 'ALL' ? ` [${timelineCategory}]` : ''}
              </span>
              <button
                onClick={resetFilters}
                className="ml-1 text-[10px] text-muted-foreground hover:text-foreground bg-secondary px-1.5 py-0.5 rounded transition-colors"
              >
                Clear
              </button>
            </div>
          )}

          {/* Loading Indicator */}
          {loading && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-card/95 border border-primary/40 px-3 py-1.5 rounded-xl flex items-center gap-2 text-xs font-mono text-primary shadow-xl backdrop-blur-md">
              <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span>Correlating Geospatial Traces...</span>
            </div>
          )}
        </div>

        {/* ─────────────────────────────────────────────────────────────
            Right Column: Unified Slide-Out Intelligence Drawer
            (Story Insights, Inspector, Co-Locations, Common Places)
           ───────────────────────────────────────────────────────────── */}
        <GeoSpatialIntelligenceDrawer
          isOpen={isDrawerOpen}
          activeTab={activeDrawerTab}
          onTabChange={setActiveDrawerTab}
          onClose={() => setIsDrawerOpen(false)}
          storyCards={investigation?.story_cards || []}
          onSelectStoryCard={card => {
            const cardTimeMs = card.timestamp ? new Date(card.timestamp).getTime() : Date.now();
            const ev = investigation?.events.find(e => e.geo_event_id === card.card_id || (Math.abs(e.latitude - card.coordinates[0]) < 0.005 && Math.abs(e.longitude - card.coordinates[1]) < 0.005)) || null;
            if (ev) setSelectedEvent(ev);
            if (cardTimeMs) setCurrentTime(cardTimeMs);
          }}
          selectedEvent={selectedEvent}
          selectedPlace={selectedPlace}
          allEvents={investigation?.events || []}
          onViewOnGraph={onViewOnGraph}
          onFocusTime={t => setCurrentTime(t)}
          onInvestigateArea={(lat, lng) => {
            setAreaModalCenter([lat, lng]);
            setIsAreaModalOpen(true);
          }}
          coLocations={investigation?.co_locations || []}
          onSelectCoLocation={co => {
            const ev = investigation?.events.find(e => Math.abs(e.latitude - co.latitude) < 0.01 && Math.abs(e.longitude - co.longitude) < 0.01) || null;
            if (ev) setSelectedEvent(ev);
            setSelectedPlace(null);
          }}
          commonPlaces={investigation?.common_places || []}
          onSelectPlace={place => {
            setSelectedPlace(place);
            const ev = investigation?.events.find(e => Math.abs(e.latitude - place.latitude) < 0.01 && Math.abs(e.longitude - place.longitude) < 0.01) || null;
            if (ev) setSelectedEvent(ev);
          }}
        />
      </div>

      {/* ─────────────────────────────────────────────────────────────
          4. BOTTOM MULTI-TRACK TIMELINE (Synchronized)
         ───────────────────────────────────────────────────────────── */}
      <GeoTimelinePlayback
        events={investigation?.events || []}
        currentTime={currentTime}
        setCurrentTime={setCurrentTime}
        timeRange={timeRange}
        setTimeRange={setTimeRange}
        isPlaying={isPlaying}
        setIsPlaying={setIsPlaying}
        playbackSpeed={playbackSpeed}
        setPlaybackSpeed={setPlaybackSpeed}
        entityColors={entityColors}
        selectedEntities={selectedEntities}
        setSelectedEntities={setSelectedEntities}
        activeCategoryTab={timelineCategory}
        setActiveCategoryTab={setTimelineCategory}
        onSelectEvent={ev => {
          setSelectedEvent(ev);
          setSelectedPlace(null);
          setActiveDrawerTab('INSPECTOR');
          setIsDrawerOpen(true);
        }}
      />

      {/* ─────────────────────────────────────────────────────────────
          5. GEOFENCE AREA INVESTIGATION MODAL
         ───────────────────────────────────────────────────────────── */}
      {isAreaModalOpen && (
        <GeoAreaInvestigationModal
          caseId={targetCaseId}
          initialCenter={areaModalCenter}
          onClose={() => setIsAreaModalOpen(false)}
          onFocusCoordinates={(lat, lng) => {
            setSelectedEvent({
              geo_event_id: `AREA-SCAN-${Date.now()}`,
              event_id: 'AREA-SCAN',
              case_id: targetCaseId,
              latitude: lat,
              longitude: lng,
              timestamp: new Date().toISOString(),
              timestamp_ms: Date.now(),
              raw_timestamp: new Date().toISOString(),
              location_type: 'GPS' as any,
              accuracy_radius_meters: 500,
              location_confidence: 1.0,
              location_name: `Geofence Scan Center (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
              domain: 'ANALYTICAL',
              event_type: 'GEOFENCE_CENTER',
              raw_evidence_id: 'SCAN',
              anomaly_score: 0,
              anomaly_reasons: [],
              epistemic_status: 'OBSERVED',
              metadata: {},
            });
            setActiveDrawerTab('INSPECTOR');
            setIsDrawerOpen(true);
          }}
        />
      )}
    </div>
  );
};
export default GeoWorkspace;
