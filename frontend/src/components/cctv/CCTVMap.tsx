'use client';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import Map, { Marker, Popup, Source, Layer, NavigationControl } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { 
  Camera, Building2, ShieldCheck, MapPin, 
  AlertTriangle, Navigation, ZoomIn, ZoomOut, RotateCcw, CheckCircle2 
} from 'lucide-react';
import { CCTVSource, RouteHypothesis, CCTVIncidentLocation } from '../../services/apiClient';
import { CCTVLegend } from './CCTVLegend';
import { cn } from '../../utils/cn';

interface Props {
  location: CCTVIncidentLocation;
  sources: CCTVSource[];
  selectedRoute: RouteHypothesis | null;
  selectedSource: CCTVSource | null;
  onSelectSource: (source: CCTVSource) => void;
  onMapClickCoords?: (lat: number, lng: number) => void;
  deploymentPolygons?: Array<{
    id: string;
    name: string;
    coordinates: [number, number][];
  }>;
}

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

export const CCTVMap: React.FC<Props> = ({
  location,
  sources,
  selectedRoute,
  selectedSource,
  onSelectSource,
  onMapClickCoords,
  deploymentPolygons = []
}) => {
  const mapRef = useRef<any>(null);
  const [activePopupSource, setActivePopupSource] = useState<CCTVSource | null>(null);

  const [viewState, setViewState] = useState({
    longitude: location.longitude || 76.7682,
    latitude: location.latitude || 30.7225,
    zoom: 13.5,
    pitch: 30,
    bearing: 0
  });

  // Re-center when incident location changes
  useEffect(() => {
    if (location && location.latitude && location.longitude) {
      setViewState(prev => ({
        ...prev,
        latitude: location.latitude,
        longitude: location.longitude,
        zoom: 13.8,
        transitionDuration: 1000
      }));
    }
  }, [location.latitude, location.longitude]);

  // Center on selected source
  useEffect(() => {
    if (selectedSource) {
      setActivePopupSource(selectedSource);
      setViewState(prev => ({
        ...prev,
        latitude: selectedSource.latitude,
        longitude: selectedSource.longitude,
        zoom: Math.max(prev.zoom, 15),
        transitionDuration: 800
      }));
    }
  }, [selectedSource?.id]);

  // Center or fit bounds on selected route
  useEffect(() => {
    if (selectedRoute && selectedRoute.route_geometry?.coordinates?.length) {
      const coords = selectedRoute.route_geometry.coordinates;
      let minLng = coords[0][0], maxLng = coords[0][0];
      let minLat = coords[0][1], maxLat = coords[0][1];
      for (const [lng, lat] of coords) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
      setViewState(prev => ({
        ...prev,
        longitude: (minLng + maxLng) / 2,
        latitude: (minLat + maxLat) / 2,
        zoom: 13.0,
        transitionDuration: 800
      }));
    }
  }, [selectedRoute?.route_id]);

  // GeoJSON data for the selected route
  const routeGeoJson = useMemo(() => {
    if (!selectedRoute || !selectedRoute.route_geometry) return null;
    return {
      type: 'Feature' as const,
      properties: {
        name: selectedRoute.route_name,
        type: selectedRoute.route_type
      },
      geometry: selectedRoute.route_geometry
    };
  }, [selectedRoute]);

  // GeoJSON data for coverage gaps
  const gapsGeoJson = useMemo(() => {
    if (!selectedRoute || !selectedRoute.coverage_gaps?.length) return null;
    return {
      type: 'FeatureCollection' as const,
      features: selectedRoute.coverage_gaps.map((g) => ({
        type: 'Feature' as const,
        properties: {
          id: g.gap_id,
          explanation: g.explanation,
          distance: g.distance_meters
        },
        geometry: {
          type: 'LineString' as const,
          coordinates: [g.start_coord, g.end_coord]
        }
      }))
    };
  }, [selectedRoute]);

  // GeoJSON data for government deployment polygons
  const polygonsGeoJson = useMemo(() => {
    if (!deploymentPolygons.length) return null;
    return {
      type: 'FeatureCollection' as const,
      features: deploymentPolygons.map((p) => ({
        type: 'Feature' as const,
        properties: { id: p.id, name: p.name },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [p.coordinates]
        }
      }))
    };
  }, [deploymentPolygons]);

  const handleResetView = () => {
    setViewState(prev => ({
      ...prev,
      latitude: location.latitude,
      longitude: location.longitude,
      zoom: 13.8,
      pitch: 30,
      bearing: 0
    }));
  };

  return (
    <div className="relative w-full h-full min-h-[480px] rounded-2xl overflow-hidden border border-border shadow-inner bg-background">
      <Map
        ref={mapRef}
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        mapStyle={MAP_STYLE}
        style={{ width: '100%', height: '100%' }}
        onClick={(e) => {
          if (onMapClickCoords) {
            onMapClickCoords(e.lngLat.lat, e.lngLat.lng);
          }
        }}
      >
        {/* Navigation Controls */}
        <NavigationControl position="top-right" />

        {/* 1. Government Deployment Polygons (Blue Translucent) */}
        {polygonsGeoJson && (
          <Source id="govt-deployment-polygons" type="geojson" data={polygonsGeoJson}>
            <Layer
              id="deployment-fill"
              type="fill"
              paint={{
                'fill-color': '#3b82f6',
                'fill-opacity': 0.12
              }}
            />
            <Layer
              id="deployment-outline"
              type="line"
              paint={{
                'line-color': '#60a5fa',
                'line-width': 1.5,
                'line-dasharray': [2, 2]
              }}
            />
          </Source>
        )}

        {/* 2. Active Candidate Route Line */}
        {routeGeoJson && (
          <Source id="selected-route" type="geojson" data={routeGeoJson}>
            {/* Outer Glow */}
            <Layer
              id="route-casing"
              type="line"
              paint={{
                'line-color': selectedRoute?.route_type === 'APPROACH' ? '#2563eb' : '#9333ea',
                'line-width': 8,
                'line-opacity': 0.4
              }}
            />
            {/* Core Route Line */}
            <Layer
              id="route-line"
              type="line"
              paint={{
                'line-color': selectedRoute?.route_type === 'APPROACH' ? '#60a5fa' : '#c084fc',
                'line-width': 4.5,
                'line-opacity': 0.95
              }}
            />
          </Source>
        )}

        {/* 3. Coverage Gaps (Amber / Red Dashed Segments) */}
        {gapsGeoJson && (
          <Source id="coverage-gaps" type="geojson" data={gapsGeoJson}>
            <Layer
              id="gaps-line"
              type="line"
              paint={{
                'line-color': '#fbbf24',
                'line-width': 5,
                'line-dasharray': [2, 2]
              }}
            />
          </Source>
        )}

        {/* 4. Crime Scene Marker (Red Pulsing) */}
        <Marker
          latitude={location.latitude}
          longitude={location.longitude}
          anchor="bottom"
        >
          <div className="flex flex-col items-center cursor-pointer group">
            <div className="px-2 py-0.5 rounded-md bg-red-600/90 text-white font-bold text-[10px] shadow-lg tracking-wider mb-1 uppercase ring-1 ring-white/30 whitespace-nowrap">
              Crime Scene
            </div>
            <div className="relative">
              <span className="absolute -inset-1 rounded-full bg-red-500 animate-ping opacity-75" />
              <div className="relative w-8 h-8 rounded-full bg-red-600 border-2 border-white flex items-center justify-center text-white shadow-xl">
                <MapPin className="w-5 h-5 fill-white text-red-600" />
              </div>
            </div>
          </div>
        </Marker>

        {/* 5. CCTV Source Markers */}
        {sources.map((src) => {
          const isSelected = selectedSource?.id === src.id;
          const isGovt = src.type === 'GOVERNMENT_CCTV' || src.type === 'GOVERNMENT_DEPLOYMENT';
          const isVerified = src.type === 'INVESTIGATOR_VERIFIED';

          let bgClass = "bg-amber-500 border-amber-300 text-black";
          if (isVerified) {
            bgClass = "bg-emerald-500 border-emerald-300 text-black";
          } else if (isGovt) {
            bgClass = "bg-blue-500 border-blue-300 text-white";
          }

          return (
            <Marker
              key={src.id}
              latitude={src.latitude}
              longitude={src.longitude}
              anchor="center"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                onSelectSource(src);
                setActivePopupSource(src);
              }}
            >
              <div 
                className={cn(
                  "w-7 h-7 rounded-full border-2 shadow-lg flex items-center justify-center cursor-pointer transition-all duration-200 transform hover:scale-125",
                  bgClass,
                  isSelected && "ring-4 ring-white/80 scale-125 z-20"
                )}
                title={`${src.name} (${src.category})`}
              >
                {isVerified ? (
                  <ShieldCheck className="w-4 h-4" />
                ) : isGovt ? (
                  <Camera className="w-4 h-4" />
                ) : (
                  <Building2 className="w-4 h-4" />
                )}
              </div>
            </Marker>
          );
        })}

        {/* 6. Active Popup for Selected Source */}
        {activePopupSource && (
          <Popup
            latitude={activePopupSource.latitude}
            longitude={activePopupSource.longitude}
            anchor="bottom"
            onClose={() => setActivePopupSource(null)}
            closeButton={true}
            closeOnClick={false}
            className="z-30"
          >
            <div className="p-2 text-foreground space-y-1.5 max-w-[260px]">
              <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-muted-foreground">
                <span className={cn(
                  "w-2 h-2 rounded-full",
                  activePopupSource.type.includes('GOVERNMENT') ? "bg-blue-400" : (activePopupSource.type.includes('VERIFIED') ? "bg-emerald-400" : "bg-amber-400")
                )} />
                {activePopupSource.type.replace(/_/g, ' ')}
              </div>

              <h4 className="text-xs font-bold text-foreground leading-snug">
                {activePopupSource.name}
              </h4>

              {activePopupSource.address && (
                <p className="text-[11px] text-muted-foreground line-clamp-1">
                  {activePopupSource.address}
                </p>
              )}

              <div className="text-[11px] font-semibold text-primary">
                {Math.round(activePopupSource.distance_meters)}m from crime scene
              </div>

              {activePopupSource.phone && (
                <div className="text-[11px] text-emerald-400 font-mono">
                  Tel: {activePopupSource.phone}
                </div>
              )}

              <button
                type="button"
                onClick={() => onSelectSource(activePopupSource)}
                className="w-full mt-1.5 text-[11px] font-bold py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
              >
                View Details
              </button>
            </div>
          </Popup>
        )}
      </Map>

      {/* Floating Map Controls */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
        <button
          type="button"
          onClick={handleResetView}
          className="p-2 rounded-xl bg-panel/90 backdrop-blur-md border border-border shadow-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          title="Reset to Crime Scene View"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        {selectedRoute && (
          <div className="px-3 py-1.5 rounded-xl bg-panel/90 backdrop-blur-md border border-border shadow-lg text-xs font-bold text-foreground flex items-center gap-2">
            <Navigation className="w-3.5 h-3.5 text-primary" />
            <span>{selectedRoute.route_name} ({selectedRoute.distance_km} km)</span>
          </div>
        )}
      </div>

      {/* Embedded Minimalist Legend */}
      <CCTVLegend />
    </div>
  );
};
