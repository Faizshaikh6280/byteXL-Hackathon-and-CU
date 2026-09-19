'use client';
import React, { useMemo, useState, useEffect, useRef } from 'react';
import DeckGL from '@deck.gl/react';
import MapGL from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ScatterplotLayer, PathLayer } from '@deck.gl/layers';
import { TripsLayer } from '@deck.gl/geo-layers';
import { HeatmapLayer } from '@deck.gl/aggregation-layers';
import { WebMercatorViewport } from '@deck.gl/core';
import { useTheme } from 'next-themes';
import { 
  Search, Crosshair, Plus, Minus, Maximize2, Minimize2, 
  Layers, MapPin, Radio, Compass, ShieldAlert, Sparkles, Building2,
  Phone, CreditCard, Users, Briefcase
} from 'lucide-react';

import { 
  GeoCanonicalEvent, MovementSegment, 
  ActivityDensityCell, GeoLocationType, CommonPlace 
} from '../../services/apiClient';

interface GeoDeckGLMapProps {
  events: GeoCanonicalEvent[];
  movements: MovementSegment[];
  tripsWaypoints: any[];
  densityGrid: ActivityDensityCell[];
  commonPlaces?: CommonPlace[];
  selectedEvent: GeoCanonicalEvent | null;
  onSelectEvent: (event: GeoCanonicalEvent) => void;
  onMapClickCoordinates?: (lat: number, lng: number) => void;
  currentTime: number;
  timeRange: [number, number];
  entityColors: Record<string, [number, number, number]>;
  
  // Layer Toggles
  showWaypoints: boolean;
  showMovements: boolean;
  showTrips: boolean;
  showCoverage: boolean;
  showHeatmap: boolean;
  
  initialCenter?: { lat: number; lng: number };
  isLiveTracking?: boolean;
  setIsLiveTracking?: (v: boolean) => void;
  onOpenLegend?: () => void;
  onTriggerScan?: () => void;
  onToggleInspector?: () => void;
  showInspector?: boolean;
}

// 100% Reliable, Zero-Watermark Esri Gray Canvas & Satellite Raster Tile Styles
const DARK_RASTER_STYLE: any = {
  version: 8,
  sources: {
    'esri-dark-canvas': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 16,
      attribution: '© Esri, HERE, Garmin, © OpenStreetMap contributors',
    },
    'esri-dark-reference': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 16,
    },
  },
  layers: [
    {
      id: 'esri-dark-canvas-layer',
      type: 'raster',
      source: 'esri-dark-canvas',
      minzoom: 0,
      maxzoom: 20,
    },
    {
      id: 'esri-dark-reference-layer',
      type: 'raster',
      source: 'esri-dark-reference',
      minzoom: 0,
      maxzoom: 20,
    },
  ],
};

const LIGHT_RASTER_STYLE: any = {
  version: 8,
  sources: {
    'esri-light-canvas': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 16,
      attribution: '© Esri, HERE, Garmin, © OpenStreetMap contributors',
    },
    'esri-light-reference': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 16,
    },
  },
  layers: [
    {
      id: 'esri-light-canvas-layer',
      type: 'raster',
      source: 'esri-light-canvas',
      minzoom: 0,
      maxzoom: 20,
    },
    {
      id: 'esri-light-reference-layer',
      type: 'raster',
      source: 'esri-light-reference',
      minzoom: 0,
      maxzoom: 20,
    },
  ],
};

const SATELLITE_STYLE: any = {
  version: 8,
  sources: {
    'esri-satellite': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© Esri, Maxar, Earthstar Geographics',
    },
  },
  layers: [
    {
      id: 'esri-satellite-layer',
      type: 'raster',
      source: 'esri-satellite',
      minzoom: 0,
      maxzoom: 20,
    },
  ],
};

const HYBRID_STYLE: any = {
  version: 8,
  sources: {
    'esri-satellite': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 19,
    },
    'esri-boundaries': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: 'esri-satellite-layer',
      type: 'raster',
      source: 'esri-satellite',
      minzoom: 0,
      maxzoom: 20,
    },
    {
      id: 'esri-boundaries-layer',
      type: 'raster',
      source: 'esri-boundaries',
      minzoom: 0,
      maxzoom: 20,
    },
  ],
};

export const GeoDeckGLMap: React.FC<GeoDeckGLMapProps> = ({
  events,
  movements,
  tripsWaypoints,
  densityGrid,
  commonPlaces = [],
  selectedEvent,
  onSelectEvent,
  onMapClickCoordinates,
  currentTime,
  timeRange,
  entityColors,
  showWaypoints,
  showMovements,
  showTrips,
  showCoverage,
  showHeatmap,
  initialCenter,
  isLiveTracking = false,
  setIsLiveTracking,
  onOpenLegend,
  onTriggerScan,
  onToggleInspector,
  showInspector = true,
}) => {
  const { theme } = useTheme();
  const [mapStyleType, setMapStyleType] = useState<'MAP' | 'SATELLITE' | 'HYBRID'>('MAP');
  const [searchLocationQuery, setSearchLocationQuery] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Default coordinates centered on Chandigarh/Mohali/Panchkula hub
  const defaultLng = 76.7794;
  const defaultLat = 30.7333;

  // ViewState
  const [viewState, setViewState] = useState({
    longitude: defaultLng,
    latitude: defaultLat,
    zoom: 11.2,
    pitch: 35,
    bearing: -10,
    transitionDuration: 0,
  });

  // Re-center when initialCenter changes
  useEffect(() => {
    if (initialCenter && initialCenter.lat && initialCenter.lng) {
      setViewState(prev => ({
        ...prev,
        latitude: initialCenter.lat,
        longitude: initialCenter.lng,
        zoom: 11.2,
        transitionDuration: 1000,
      }));
    }
  }, [initialCenter?.lat, initialCenter?.lng]);

  // Center on selected event
  useEffect(() => {
    if (selectedEvent && selectedEvent.latitude && selectedEvent.longitude) {
      setViewState(prev => ({
        ...prev,
        latitude: selectedEvent.latitude,
        longitude: selectedEvent.longitude,
        zoom: Math.max(prev.zoom, 13),
        transitionDuration: 800,
      }));
    }
  }, [selectedEvent?.geo_event_id]);

  const handleZoom = (delta: number) => {
    setViewState(prev => ({
      ...prev,
      zoom: Math.max(2, Math.min(20, prev.zoom + delta)),
      transitionDuration: 300,
    }));
  };

  const handleRecenter = () => {
    setViewState(prev => ({
      ...prev,
      latitude: defaultLat,
      longitude: defaultLng,
      zoom: 11.2,
      pitch: 35,
      bearing: -10,
      transitionDuration: 800,
    }));
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Base map style adapts to mode and active theme
  const currentMapStyle = useMemo(() => {
    if (mapStyleType === 'SATELLITE') return SATELLITE_STYLE;
    if (mapStyleType === 'HYBRID') return HYBRID_STYLE;
    if (theme === 'light') return LIGHT_RASTER_STYLE;
    return DARK_RASTER_STYLE;
  }, [mapStyleType, theme]);

  // Deck.gl Layers
  const layers = useMemo(() => {
    const activeLayers: any[] = [];

    // 1. Heatmap Layer
    if (showHeatmap && densityGrid.length > 0) {
      activeLayers.push(
        new HeatmapLayer({
          id: 'geo-activity-heatmap',
          data: densityGrid,
          getPosition: (d: ActivityDensityCell) => [d.longitude, d.latitude],
          getWeight: (d: ActivityDensityCell) => d.event_count,
          radiusPixels: 50,
          intensity: 2,
          threshold: 0.1,
          opacity: 0.75,
        })
      );
    }

    // 2. Trajectories & Movement Tracks
    if (showMovements && movements.length > 0) {
      activeLayers.push(
        new PathLayer({
          id: 'geo-movement-paths',
          data: movements,
          getPath: (d: MovementSegment) => d.path_points,
          getColor: (d: MovementSegment) => {
            const entKey = d.entity_name || d.entity_id;
            const c = entityColors[entKey] || [59, 130, 246];
            return d.is_gap ? [244, 63, 94, 160] : [c[0], c[1], c[2], 230];
          },
          getWidth: (d: MovementSegment) => (d.is_gap ? 2 : 4),
          widthMinPixels: 2.5,
          widthMaxPixels: 6,
          getDashArray: (d: MovementSegment) => (d.is_gap ? [8, 4] : [0, 0]),
          dashJustified: true,
          pickable: true,
        })
      );
    }

    // 3. Animated Trips Layer
    if (showTrips && tripsWaypoints.length > 0) {
      const trailDuration = Math.max(3600000, (timeRange[1] - timeRange[0]) * 0.05);
      activeLayers.push(
        new TripsLayer({
          id: 'geo-trips-animated',
          data: tripsWaypoints,
          getPath: (d: any) => d.path,
          getTimestamps: (d: any) => d.timestamps,
          getColor: (d: any) => {
            const entKey = d.entity_name || d.cluster_id;
            return entityColors[entKey] || [251, 191, 36];
          },
          opacity: 1.0,
          widthMinPixels: 4,
          trailLength: trailDuration,
          currentTime: currentTime,
          shadowEnabled: false,
        })
      );
    }

    // 4. Tower Sectors
    if (showCoverage) {
      const towerEvents = events.filter(e => e.location_type === GeoLocationType.CELL_TOWER || e.cell_tower_id);
      if (towerEvents.length > 0) {
        activeLayers.push(
          new ScatterplotLayer({
            id: 'geo-cell-coverage-sectors',
            data: towerEvents,
            getPosition: (d: GeoCanonicalEvent) => [d.longitude, d.latitude],
            getFillColor: [168, 85, 247, 35],
            getLineColor: [168, 85, 247, 180],
            getLineWidth: 1.5,
            stroked: true,
            filled: true,
            getRadius: (d: GeoCanonicalEvent) => d.accuracy_radius_meters || 750,
            radiusMinPixels: 15,
            radiusMaxPixels: 60,
            pickable: false,
          })
        );
      }
    }

    // 5. Canonical Geo Waypoints
    if (showWaypoints && events.length > 0) {
      activeLayers.push(
        new ScatterplotLayer({
          id: 'geo-waypoints-scatterplot',
          data: events,
          getPosition: (d: GeoCanonicalEvent) => [d.longitude, d.latitude],
          getFillColor: (d: GeoCanonicalEvent) => {
            if (selectedEvent && selectedEvent.geo_event_id === d.geo_event_id) {
              return [255, 255, 255, 255];
            }
            if (d.anomaly_score > 0) {
              return [244, 63, 94, 250];
            }
            const entKey = d.entity_name || d.entity_id || 'UNKNOWN';
            const c = entityColors[entKey];
            if (c) return [c[0], c[1], c[2], 230];
            return [59, 130, 246, 230];
          },
          getLineColor: (d: GeoCanonicalEvent) => {
            if (selectedEvent && selectedEvent.geo_event_id === d.geo_event_id) {
              return [59, 130, 246, 255];
            }
            return [0, 0, 0, 180];
          },
          getLineWidth: 2,
          stroked: true,
          getRadius: (d: GeoCanonicalEvent) => {
            if (selectedEvent && selectedEvent.geo_event_id === d.geo_event_id) return 220;
            if (d.anomaly_score > 0) return 160;
            return 100;
          },
          radiusMinPixels: 7,
          radiusMaxPixels: 22,
          pickable: true,
          onClick: (info: any) => {
            if (info.object) {
              onSelectEvent(info.object);
            }
          },
        })
      );
    }

    return activeLayers;
  }, [
    events,
    movements,
    tripsWaypoints,
    densityGrid,
    selectedEvent,
    entityColors,
    showWaypoints,
    showMovements,
    showTrips,
    showCoverage,
    showHeatmap,
    currentTime,
    timeRange,
    onSelectEvent,
  ]);

  // Key locations for floating callouts and pulsating radar circles
  const keyLocations: GeoCanonicalEvent[] = useMemo(() => {
    if (events.length === 0) return [];
    
    const store: Record<string, GeoCanonicalEvent> = {};
    events.forEach(e => {
      const name = e.location_name || e.address || 'Point';
      if (!store[name] || e.anomaly_score > store[name].anomaly_score) {
        store[name] = e;
      }
    });

    const list = Object.values(store);
    list.sort((a, b) => b.anomaly_score - a.anomaly_score);
    return list.slice(0, 4);
  }, [events]);

  // Compute pixel positions for key locations using WebMercatorViewport
  const projectedCallouts = useMemo(() => {
    if (typeof window === 'undefined' || !containerRef.current) return [];
    const width = containerRef.current.clientWidth || 800;
    const height = containerRef.current.clientHeight || 500;
    if (width <= 0 || height <= 0) return [];

    try {
      const ViewportClass: any = WebMercatorViewport;
      const viewport = new ViewportClass({
        width,
        height,
        longitude: viewState.longitude,
        latitude: viewState.latitude,
        zoom: viewState.zoom,
        pitch: viewState.pitch,
        bearing: viewState.bearing,
      });

      return keyLocations.map((ev: GeoCanonicalEvent) => {
        const [x, y] = viewport.project([ev.longitude, ev.latitude]);
        return {
          event: ev,
          x,
          y,
          isVisible: x >= -50 && x <= width + 50 && y >= -50 && y <= height + 50,
        };
      });
    } catch {
      return [];
    }
  }, [keyLocations, viewState]);

  // Projected cluster badges for common places (matching reference image circles with numbers)
  const projectedBadges = useMemo(() => {
    if (typeof window === 'undefined' || !containerRef.current || !commonPlaces) return [];
    const width = containerRef.current.clientWidth || 800;
    const height = containerRef.current.clientHeight || 500;
    if (width <= 0 || height <= 0) return [];

    try {
      const ViewportClass: any = WebMercatorViewport;
      const viewport = new ViewportClass({
        width,
        height,
        longitude: viewState.longitude,
        latitude: viewState.latitude,
        zoom: viewState.zoom,
        pitch: viewState.pitch,
        bearing: viewState.bearing,
      });

      return commonPlaces.slice(0, 5).map((place, i) => {
        const [x, y] = viewport.project([place.longitude, place.latitude]);
        return {
          place,
          x,
          y,
          badgeNumber: place.unique_entity_count || (i + 2),
          color: i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-purple-500' : i === 2 ? 'bg-orange-500' : 'bg-emerald-500',
          isVisible: x >= 20 && x <= width - 20 && y >= 20 && y <= height - 20,
        };
      });
    } catch {
      return [];
    }
  }, [commonPlaces, viewState]);

  return (
    <div ref={containerRef} className="relative w-full h-full bg-background overflow-hidden select-none">
      {/* DeckGL Map Canvas */}
      <DeckGL
        viewState={viewState as any}
        onViewStateChange={({ viewState: vs }: any) => setViewState(vs)}
        controller={true}
        layers={layers}
        onClick={(info: any) => {
          if (!info.object && info.coordinate && onMapClickCoordinates) {
            onMapClickCoordinates(info.coordinate[1], info.coordinate[0]);
          }
        }}
      >
        <MapGL mapStyle={currentMapStyle} />
      </DeckGL>

      {/* ================= ON-MAP PULSATING RADAR RINGS, NUMBERED BADGES & CALLOUT CARDS ================= */}
      <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
        {/* 1. Numbered Cluster Badges (Matches Reference Image) */}
        {projectedBadges.map(({ place, x, y, badgeNumber, color, isVisible }, i) => {
          if (!isVisible) return null;
          return (
            <div
              key={place.place_id || i}
              className="absolute pointer-events-auto cursor-pointer transition-transform hover:scale-125 z-15"
              style={{ left: x, top: y }}
              onClick={() => {
                const matchEv = events.find(e => Math.abs(e.latitude - place.latitude) < 0.01 && Math.abs(e.longitude - place.longitude) < 0.01);
                if (matchEv) onSelectEvent(matchEv);
              }}
              title={`${place.place_name} (${badgeNumber} entities)`}
            >
              <div className="relative -translate-x-1/2 -translate-y-1/2 flex items-center justify-center">
                <span className={`w-6 h-6 rounded-full ${color} text-white font-bold text-[11px] shadow-lg flex items-center justify-center border-2 border-white/80 ring-2 ring-black/40`}>
                  {badgeNumber}
                </span>
              </div>
            </div>
          );
        })}

        {/* 2. Projected Hotspot Callout Cards */}
        {projectedCallouts.map(({ event: ev, x, y, isVisible }, idx) => {
          if (!isVisible) return null;
          const isSelected = selectedEvent?.geo_event_id === ev.geo_event_id;
          const isHotspot = ev.anomaly_score > 0 || idx === 0;

          return (
            <div key={ev.geo_event_id}>
              {/* Pulsating Radar Concentric Rings */}
              {isHotspot && (
                <div
                  className="absolute pointer-events-none"
                  style={{ left: x, top: y }}
                >
                  <div className="w-32 h-32 rounded-full border-2 border-rose-500/70 bg-rose-500/15 radar-pulse-ring" />
                  <div
                    className="w-20 h-20 rounded-full border border-purple-500/80 bg-purple-500/25 radar-pulse-ring"
                    style={{ animationDelay: '0.9s' }}
                  />
                  <div className="w-4 h-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,1)]" />
                </div>
              )}

              {/* Floating Callout Card */}
              <div
                onClick={e => {
                  e.stopPropagation();
                  onSelectEvent(ev);
                }}
                className={`absolute pointer-events-auto cursor-pointer -translate-x-1/2 -translate-y-[135%] transition-all duration-200 hover:scale-105 ${
                  isSelected ? 'z-30 scale-105' : 'z-20'
                }`}
                style={{ left: x, top: y }}
              >
                <div className={`px-3 py-2 rounded-xl backdrop-blur-xl border shadow-xl flex flex-col gap-0.5 text-xs whitespace-nowrap bg-card/95 border-border text-foreground`}>
                  <div className="flex items-center gap-1.5 font-bold text-[11px]">
                    {idx === 0 ? (
                      <Briefcase className="w-3.5 h-3.5 text-rose-500" />
                    ) : idx === 1 ? (
                      <Users className="w-3.5 h-3.5 text-cyan-500" />
                    ) : idx === 2 ? (
                      <Phone className="w-3.5 h-3.5 text-pink-500" />
                    ) : (
                      <Building2 className="w-3.5 h-3.5 text-amber-500" />
                    )}
                    <span className="text-foreground font-semibold">
                      {idx === 0 ? 'Business Meeting' : ev.entity_name || ev.location_name}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
                    <span>{ev.location_name || 'Hotspot Point'}</span>
                    <span className="opacity-40">•</span>
                    <span>{new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>

                {/* Bottom Indicator Arrow */}
                <div className="w-2.5 h-2.5 mx-auto rotate-45 -mt-1.5 border-r border-b bg-card border-border" />
              </div>
            </div>
          );
        })}
      </div>

      {/* ================= MAP CONTROLS OVERLAY ================= */}

      {/* Re-Open Inspector Button if Closed */}
      {onToggleInspector && !showInspector && (
        <button
          onClick={onToggleInspector}
          className="absolute top-1/2 -translate-y-1/2 right-0 z-20 bg-card/95 hover:bg-card border-l border-t border-b border-border/80 px-1.5 py-3 rounded-l-xl text-xs font-semibold text-primary hover:text-primary/90 shadow-2xl backdrop-blur-md flex flex-col items-center gap-1 transition-all"
          title="Open Location Inspector"
        >
          <MapPin className="w-3.5 h-3.5" />
          <span className="[writing-mode:vertical-rl] tracking-wider text-[9px] font-bold">INSPECTOR</span>
        </button>
      )}

      {/* 1. Base Map Switcher (Top Left) */}
      <div className="absolute top-4 left-4 z-20 flex items-center bg-card/95 border border-border/80 rounded-xl p-1 shadow-xl backdrop-blur-md text-xs font-semibold">
        {(['MAP', 'SATELLITE', 'HYBRID'] as const).map(type => (
          <button
            key={type}
            onClick={() => setMapStyleType(type)}
            className={`px-3 py-1 rounded-lg text-[11px] uppercase tracking-wider transition-all ${
              mapStyleType === type
                ? 'bg-primary text-primary-foreground font-bold shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
            }`}
          >
            {type === 'MAP' ? 'Map' : type === 'SATELLITE' ? 'Satellite' : 'Hybrid'}
          </button>
        ))}
      </div>

      {/* 2. Floating Search Location Bar (Top Right) */}
      <div className="absolute top-4 right-14 z-20 hidden md:flex items-center">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 absolute left-3 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search location, address or place..."
            value={searchLocationQuery}
            onChange={e => setSearchLocationQuery(e.target.value)}
            className="w-64 bg-card/95 border border-border/80 rounded-xl pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground shadow-xl backdrop-blur-md focus:outline-none focus:border-primary transition-all"
          />
        </div>
      </div>

      {/* 3. Floating Action Toolbar (Right Column) */}
      <div className="absolute top-4 right-3 z-20 flex flex-col gap-2">
        <div className="flex flex-col bg-card/95 border border-border/80 rounded-xl p-1 shadow-xl backdrop-blur-md">
          {onOpenLegend && (
            <button
              onClick={onOpenLegend}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="Toggle Layer Legend"
            >
              <Layers className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={handleRecenter}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="Re-Center Investigation Hub"
          >
            <Crosshair className="w-4 h-4" />
          </button>

          {onTriggerScan && (
            <button
              onClick={onTriggerScan}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="Geofence Scan Tool"
            >
              <Compass className="w-4 h-4" />
            </button>
          )}

          <div className="h-px bg-border/60 my-1 mx-1" />

          <button
            onClick={() => handleZoom(1)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="Zoom In"
          >
            <Plus className="w-4 h-4" />
          </button>

          <button
            onClick={() => handleZoom(-1)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="Zoom Out"
          >
            <Minus className="w-4 h-4" />
          </button>

          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Map'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* 4. Live Tracking Glowing Toggle (Bottom Right) */}
      <div className="absolute bottom-4 right-4 z-20">
        <div
          onClick={() => setIsLiveTracking && setIsLiveTracking(!isLiveTracking)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border backdrop-blur-md shadow-2xl cursor-pointer transition-all ${
            isLiveTracking
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400 font-semibold'
              : 'bg-card/95 border-border/80 text-muted-foreground hover:text-foreground'
          }`}
        >
          <div className="relative flex items-center justify-center">
            <span className={`w-2 h-2 rounded-full ${isLiveTracking ? 'bg-emerald-400 animate-ping' : 'bg-muted-foreground'}`} />
            <span className={`w-1.5 h-1.5 rounded-full absolute ${isLiveTracking ? 'bg-emerald-400' : 'bg-muted-foreground'}`} />
          </div>
          <span className="text-xs">Live Tracking</span>
          <div className={`w-7 h-4 rounded-full p-0.5 transition-colors flex items-center ${isLiveTracking ? 'bg-emerald-500' : 'bg-secondary'}`}>
            <div className={`w-3 h-3 rounded-full bg-white transition-transform ${isLiveTracking ? 'translate-x-3' : 'translate-x-0'}`} />
          </div>
        </div>
      </div>

      {/* 5. Scale Bar (Bottom Left) */}
      <div className="absolute bottom-4 left-4 z-20 pointer-events-none">
        <div className="bg-card/90 backdrop-blur-sm border border-border px-2 py-0.5 rounded text-[10px] font-mono text-foreground/80 shadow-md">
          5 km
        </div>
      </div>
    </div>
  );
};
