import React, { useMemo } from 'react';
import DeckGL from '@deck.gl/react';
import Map from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ScatterplotLayer } from '@deck.gl/layers';
import { TripsLayer } from '@deck.gl/geo-layers';
import { TimelineCanonicalEvent } from '../../services/apiClient';
import { useTimelineStore } from '../../store/useTimelineStore';
import { MapPin, Navigation } from 'lucide-react';

interface MapPanelProps {
  events: TimelineCanonicalEvent[];
  onSelectEvent: (event: TimelineCanonicalEvent) => void;
}

const INITIAL_VIEW_STATE = {
  longitude: 77.2090,
  latitude: 28.6139,
  zoom: 11,
  pitch: 45,
  bearing: 0
};

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

export const TimelineMapPanel: React.FC<MapPanelProps> = ({
  events,
  onSelectEvent
}) => {
  const { currentTime, timeRange, selectedEventId } = useTimelineStore();

  // Extract events with coordinates
  const geoEvents = useMemo(() => {
    return events.filter(e => e.latitude !== null && e.longitude !== null && !isNaN(e.latitude!) && !isNaN(e.longitude!));
  }, [events]);

  // Group paths by entity for TripsLayer
  const waypoints = useMemo(() => {
    const groups: Record<string, { cluster_id: string; path: number[][]; timestamps: number[] }> = {};

    geoEvents.forEach(ev => {
      const key = ev.z_cluster_id || ev.entity_name || 'UNKNOWN';
      if (!groups[key]) {
        groups[key] = {
          cluster_id: key,
          path: [],
          timestamps: []
        };
      }
      groups[key].path.push([ev.longitude!, ev.latitude!]);
      groups[key].timestamps.push(ev.timestamp_ms);
    });

    return Object.values(groups).map(g => {
      const sorted = g.timestamps.map((t, i) => ({ t, p: g.path[i] })).sort((a, b) => a.t - b.t);
      return {
        cluster_id: g.cluster_id,
        path: sorted.map(s => s.p),
        timestamps: sorted.map(s => s.t)
      };
    });
  }, [geoEvents]);

  // Active / Selected Point
  const selectedEvent = useMemo(() => {
    return geoEvents.find(e => e.event_id === selectedEventId);
  }, [geoEvents, selectedEventId]);

  const layers = useMemo(() => {
    const pointsData = geoEvents.map(ev => ({
      position: [ev.longitude!, ev.latitude!],
      event: ev,
      isSelected: ev.event_id === selectedEventId,
      isAnomaly: ev.anomaly_score > 0
    }));

    return [
      new ScatterplotLayer({
        id: 'timeline-geo-points',
        data: pointsData,
        getPosition: (d: any) => d.position,
        getFillColor: (d: any) => d.isSelected ? [6, 182, 212, 255] : d.isAnomaly ? [239, 68, 68, 220] : [99, 102, 241, 200],
        getRadius: (d: any) => d.isSelected ? 250 : 120,
        radiusMinPixels: 5,
        radiusMaxPixels: 16,
        pickable: true,
        onClick: (info: any) => {
          if (info.object && info.object.event) {
            onSelectEvent(info.object.event);
          }
        }
      }),
      new TripsLayer({
        id: 'timeline-geo-trips',
        data: waypoints,
        getPath: (d: any) => d.path,
        getTimestamps: (d: any) => d.timestamps,
        getColor: [6, 182, 212],
        opacity: 0.9,
        widthMinPixels: 3,
        trailLength: Math.max(60000, (timeRange[1] - timeRange[0]) * 0.08),
        currentTime: currentTime,
        shadowEnabled: false
      })
    ];
  }, [geoEvents, waypoints, currentTime, timeRange, selectedEventId, onSelectEvent]);

  // Center on selected event if coordinates exist
  const viewState = useMemo(() => {
    if (selectedEvent && selectedEvent.latitude && selectedEvent.longitude) {
      return {
        ...INITIAL_VIEW_STATE,
        latitude: selectedEvent.latitude,
        longitude: selectedEvent.longitude,
        zoom: 13
      };
    }
    return INITIAL_VIEW_STATE;
  }, [selectedEvent]);

  return (
    <div className="relative w-full h-full bg-background overflow-hidden">
      <DeckGL
        initialViewState={viewState as any}
        controller={true}
        layers={layers}
      >
        <Map mapStyle={MAP_STYLE} />
      </DeckGL>

      {/* Floating Status Card */}
      <div className="absolute top-4 left-4 z-10 bg-card/90 border border-border p-3 rounded-lg backdrop-blur-md shadow-lg max-w-xs space-y-1">
        <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
          <Navigation className="w-3.5 h-3.5" />
          <span>Synchronized Geospatial Tracking</span>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {geoEvents.length} geo-referenced observations mapped across timeline trajectory.
        </p>
        {selectedEvent && (
          <div className="pt-2 border-t border-border text-xs">
            <span className="font-semibold text-foreground">Focused: </span>
            <span className="text-amber-400 font-mono">{selectedEvent.location_name || 'Selected Waypoint'}</span>
          </div>
        )}
      </div>
    </div>
  );
};
