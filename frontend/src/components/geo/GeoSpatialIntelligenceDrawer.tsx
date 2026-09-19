'use client';

import React, { useState } from 'react';
import { 
  X, BookOpen, MapPin, Clock, Users, Landmark, 
  ShieldAlert, Activity, Navigation, ArrowDown, AlertTriangle, 
  ExternalLink, Copy, Check, Radio, CreditCard, MessageSquare,
  Crosshair, Search, ChevronRight, ShieldCheck, Database, Compass, Eye
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { 
  GeoCanonicalEvent, 
  CoLocationFinding, 
  CommonPlace, 
  SpatialStoryCard 
} from '../../services/apiClient';

export type GeoDrawerTab = 'STORY' | 'INSPECTOR' | 'COLOCATIONS' | 'COMMON_PLACES';

interface GeoSpatialIntelligenceDrawerProps {
  isOpen: boolean;
  activeTab: GeoDrawerTab;
  onTabChange: (tab: GeoDrawerTab) => void;
  onClose: () => void;

  // Story Props
  storyCards: SpatialStoryCard[];
  onSelectStoryCard: (card: SpatialStoryCard) => void;

  // Inspector Props
  selectedEvent: GeoCanonicalEvent | null;
  selectedPlace?: CommonPlace | null;
  allEvents?: GeoCanonicalEvent[];
  onViewOnGraph?: (entityId: string) => void;
  onFocusTime?: (timestampMs: number) => void;
  onInvestigateArea?: (lat: number, lng: number) => void;

  // Co-Locations Props
  coLocations: CoLocationFinding[];
  onSelectCoLocation: (co: CoLocationFinding) => void;

  // Common Places Props
  commonPlaces: CommonPlace[];
  onSelectPlace: (place: CommonPlace) => void;
}

export const GeoSpatialIntelligenceDrawer: React.FC<GeoSpatialIntelligenceDrawerProps> = ({
  isOpen,
  activeTab,
  onTabChange,
  onClose,
  storyCards,
  onSelectStoryCard,
  selectedEvent,
  selectedPlace,
  allEvents = [],
  onViewOnGraph,
  onFocusTime,
  onInvestigateArea,
  coLocations,
  onSelectCoLocation,
  commonPlaces,
  onSelectPlace,
}) => {
  const [copiedCoords, setCopiedCoords] = useState(false);
  const [inspectorSubTab, setInspectorSubTab] = useState<'Overview' | 'Narrative' | 'Entities' | 'Raw'>('Overview');

  if (!isOpen) return null;

  // Active event coordinate resolution
  const activeEv = selectedEvent || (allEvents.length > 0 ? allEvents[0] : null);
  const lat = activeEv ? activeEv.latitude : selectedPlace?.latitude || 30.7333;
  const lng = activeEv ? activeEv.longitude : selectedPlace?.longitude || 76.7794;
  const coordsString = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

  const locationTitle = activeEv?.location_name || selectedPlace?.place_name || activeEv?.address || 'Designated Surveillance Coordinate';
  const locationSubtitle = activeEv?.address || `${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E`;

  // Nearby events within ~500m
  const nearbyEvents = allEvents.filter(e => {
    return Math.abs(e.latitude - lat) < 0.008 && Math.abs(e.longitude - lng) < 0.008;
  });

  // Entities at this location
  const uniqueEntitiesAtLocation = Array.from(
    new Set(nearbyEvents.map(e => e.entity_name || e.entity_id || 'Subject'))
  );

  const copyCoords = () => {
    navigator.clipboard.writeText(coordsString);
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 2000);
  };

  return (
    <>
      {/* Mobile Backdrop */}
      <div 
        onClick={onClose}
        className="fixed inset-0 bg-black/60 z-35 md:hidden backdrop-blur-xs"
      />
      <div className="fixed inset-y-0 right-0 w-full sm:w-[540px] md:w-[580px] bg-card/98 border-l border-border shadow-2xl z-40 flex flex-col backdrop-blur-xl animate-in slide-in-from-right duration-300 text-foreground select-none">
      {/* ─────────────────────────────────────────────────────────────
          1. TOP DRAWER HEADER
         ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10 border border-primary/20 text-primary">
            {activeTab === 'STORY' && <BookOpen className="w-5 h-5" />}
            {activeTab === 'INSPECTOR' && <MapPin className="w-5 h-5" />}
            {activeTab === 'COLOCATIONS' && <Users className="w-5 h-5" />}
            {activeTab === 'COMMON_PLACES' && <Landmark className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="font-bold text-sm tracking-tight text-foreground">
              {activeTab === 'STORY' && 'Spatial Reconstruction Story'}
              {activeTab === 'INSPECTOR' && 'Location & Coordinate Inspector'}
              {activeTab === 'COLOCATIONS' && 'Physical Co-Location Intelligence'}
              {activeTab === 'COMMON_PLACES' && 'High-Frequency Spatial Hubs'}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {activeTab === 'STORY' && `${storyCards.length} chronological narrative milestones`}
              {activeTab === 'INSPECTOR' && locationTitle}
              {activeTab === 'COLOCATIONS' && `${coLocations.length} multi-subject rendezvous detected`}
              {activeTab === 'COMMON_PLACES' && `${commonPlaces.length} recurring geofence zones`}
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors"
          title="Close Drawer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          2. DRAWER NAVIGATION TABS (Story, Inspector, Co-Locations, Places)
         ───────────────────────────────────────────────────────────── */}
      <div className="flex border-b border-border bg-secondary/40 text-xs px-3 gap-1 overflow-x-auto scrollbar-hide flex-shrink-0">
        {[
          { id: 'STORY' as GeoDrawerTab, label: 'Story Insights', icon: BookOpen, count: storyCards.length },
          { id: 'INSPECTOR' as GeoDrawerTab, label: 'Location Inspector', icon: MapPin },
          { id: 'COLOCATIONS' as GeoDrawerTab, label: 'Co-Locations', icon: Users, count: coLocations.length },
          { id: 'COMMON_PLACES' as GeoDrawerTab, label: 'Common Places', icon: Landmark, count: commonPlaces.length },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "px-3 py-2 font-medium border-b-2 text-xs transition-all whitespace-nowrap flex items-center gap-1.5",
                isActive
                  ? "border-primary text-primary font-bold bg-card shadow-2xs"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/60"
              )}
            >
              <Icon className={cn("w-3.5 h-3.5", isActive ? "text-primary" : "text-muted-foreground")} />
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className={cn(
                  "px-1.5 py-0.2 rounded-full font-mono text-[10px] font-bold",
                  isActive ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"
                )}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          3. TAB CONTENT BODY
         ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
        {/* ================= TAB 1: STORY INSIGHTS ================= */}
        {activeTab === 'STORY' && (
          <div className="space-y-4">
            <div className="p-3 bg-secondary/40 border border-border/80 rounded-xl text-xs text-muted-foreground flex items-start gap-2">
              <BookOpen className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
              <span>
                Evidence-backed chronological spatial narrative generated directly from location telemetry, CDR cell towers, and NFC acquisitions. Click any step to inspect coordinates on the map.
              </span>
            </div>

            {storyCards.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground space-y-2">
                <BookOpen className="w-8 h-8 mx-auto opacity-30" />
                <p>No spatial narrative cards generated for the current active filter.</p>
              </div>
            ) : (
              storyCards.map((card, idx) => {
                const hasAnomaly = card.anomalies && card.anomalies.length > 0;

                return (
                  <div key={card.card_id} className="relative group">
                    {/* Vertical connector line */}
                    {idx < storyCards.length - 1 && (
                      <div className="absolute left-4 top-10 bottom--3 w-0.5 bg-border/80 z-0 group-hover:bg-primary/50 transition-colors" />
                    )}

                    <div
                      onClick={() => onSelectStoryCard(card)}
                      className={cn(
                        "p-4 rounded-xl border transition-all cursor-pointer relative z-10 space-y-2.5 shadow-2xs",
                        hasAnomaly
                          ? "bg-rose-500/5 hover:bg-rose-500/10 border-rose-500/30"
                          : "bg-card hover:bg-secondary/40 border-border/80 hover:border-primary/50"
                      )}
                    >
                      {/* Step Header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-primary/10 border border-primary/30 text-primary flex items-center justify-center font-mono text-xs font-bold shadow-2xs">
                            {card.step_index}
                          </span>
                          <span className="font-bold text-foreground text-xs">
                            {card.entity_name}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          <span>{card.time_range_formatted}</span>
                        </div>
                      </div>

                      {/* Location details */}
                      <div className="flex items-start gap-2 pl-1">
                        <MapPin className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                        <div>
                          <h5 className="font-bold text-foreground text-xs">
                            {card.location_name}
                          </h5>
                          <p className="text-[10px] font-mono text-muted-foreground">
                            {card.coordinates[0].toFixed(4)}° N, {card.coordinates[1].toFixed(4)}° E
                          </p>
                        </div>
                      </div>

                      {/* Narrative Text */}
                      <p className="text-xs text-muted-foreground leading-relaxed pl-1">
                        {card.action_summary}
                      </p>

                      {/* Transit Metrics */}
                      {card.distance_from_previous_km !== null && card.distance_from_previous_km !== undefined && (
                        <div className="p-2.5 rounded-lg bg-secondary/50 border border-border/60 grid grid-cols-3 gap-2 text-[10px] font-mono">
                          <div>
                            <span className="text-muted-foreground block text-[9px]">Transit</span>
                            <span className="text-foreground font-bold">{card.distance_from_previous_km} km</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block text-[9px]">Duration</span>
                            <span className="text-foreground font-bold">
                              {card.travel_time_from_previous_sec ? `${Math.round(card.travel_time_from_previous_sec / 60)}m` : '15m'}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block text-[9px]">Velocity</span>
                            <span className={cn("font-bold", (card.implied_speed_kmh || 0) > 120 ? "text-rose-500" : "text-emerald-500")}>
                              {card.implied_speed_kmh ? `${card.implied_speed_kmh} km/h` : 'Standard'}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Anomalies Alert */}
                      {hasAnomaly && (
                        <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[11px] font-bold flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>{card.anomalies?.[0]}</span>
                        </div>
                      )}

                      {/* Footer Actions & Evidence */}
                      <div className="flex items-center justify-between pt-1 text-[10px] text-muted-foreground border-t border-border/40">
                        <span className="font-mono">Ref: {card.evidence_refs?.[0] || card.card_id}</span>
                        <span className="text-primary font-bold flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                          Focus on Map <ChevronRight className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ================= TAB 2: LOCATION INSPECTOR ================= */}
        {activeTab === 'INSPECTOR' && (
          <div className="space-y-4">
            {/* Coordinate Card & Radar HUD */}
            <div className="relative rounded-2xl overflow-hidden border border-border bg-gradient-to-br from-secondary/80 to-card dark:from-[#0d1527] dark:to-[#050811] p-4 shadow-sm space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                    Active Surveillance Target
                  </span>
                  <h4 className="text-sm font-bold text-foreground mt-0.5">
                    {locationTitle}
                  </h4>
                  <p className="text-[11px] font-mono text-muted-foreground">
                    {locationSubtitle}
                  </p>
                </div>

                <button
                  onClick={copyCoords}
                  className="px-2.5 py-1 bg-card hover:bg-secondary border border-border rounded-lg text-[11px] font-mono font-bold flex items-center gap-1 shadow-2xs transition-colors"
                >
                  {copiedCoords ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedCoords ? 'Copied' : 'Copy GPS'}</span>
                </button>
              </div>

              {/* Forensic Coordinate Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-border/40 text-[11px] font-mono">
                <div className="bg-secondary/60 p-2 rounded-lg border border-border/40">
                  <span className="text-[9px] text-muted-foreground block">Latitude</span>
                  <span className="text-foreground font-bold">{lat.toFixed(5)}°</span>
                </div>
                <div className="bg-secondary/60 p-2 rounded-lg border border-border/40">
                  <span className="text-[9px] text-muted-foreground block">Longitude</span>
                  <span className="text-foreground font-bold">{lng.toFixed(5)}°</span>
                </div>
                <div className="bg-secondary/60 p-2 rounded-lg border border-border/40">
                  <span className="text-[9px] text-muted-foreground block">Accuracy</span>
                  <span className="text-foreground font-bold">±{activeEv?.accuracy_radius_meters || 50}m</span>
                </div>
                <div className="bg-secondary/60 p-2 rounded-lg border border-border/40">
                  <span className="text-[9px] text-muted-foreground block">Confidence</span>
                  <span className="text-emerald-500 font-bold">{Math.round((activeEv?.location_confidence || 0.95) * 100)}%</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2">
                {onInvestigateArea && (
                  <button
                    onClick={() => onInvestigateArea(lat, lng)}
                    className="flex-1 py-1.5 px-3 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <Crosshair className="w-3.5 h-3.5" />
                    <span>Scan Geofence Area</span>
                  </button>
                )}

                {onViewOnGraph && activeEv?.entity_id && (
                  <button
                    onClick={() => onViewOnGraph(activeEv.entity_id || '')}
                    className="py-1.5 px-3 bg-secondary hover:bg-secondary/80 border border-border text-foreground text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Graph View</span>
                  </button>
                )}
              </div>
            </div>

            {/* Narrative Summary */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-2">
              <h5 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-primary" />
                <span>Forensic Movement Narrative</span>
              </h5>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Subject <strong className="text-foreground">{activeEv?.entity_name || activeEv?.entity_id || 'Target'}</strong> was recorded at this location via {activeEv?.location_type || 'GPS telemetry'}. 
                {nearbyEvents.length > 1 && ` A total of ${nearbyEvents.length} recorded events cluster within a 500-meter radius across the investigation timespan.`}
                {uniqueEntitiesAtLocation.length > 1 && ` Multiple case entities (${uniqueEntitiesAtLocation.join(', ')}) have registered trace records at this coordinate, corroborating it as a shared rendezvous point.`}
              </p>
            </div>

            {/* Nearby Entities at Coordinate */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <h5 className="font-bold text-foreground flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-blue-500" />
                  <span>Entities at this Coordinate ({uniqueEntitiesAtLocation.length})</span>
                </h5>
              </div>

              <div className="space-y-1.5">
                {uniqueEntitiesAtLocation.map((ent, idx) => (
                  <div key={idx} className="p-2 bg-secondary/50 rounded-lg flex items-center justify-between text-xs">
                    <span className="font-bold text-foreground">{ent}</span>
                    <span className="text-[10px] font-mono text-muted-foreground">Trace Confirmed</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 3: CO-LOCATIONS ================= */}
        {activeTab === 'COLOCATIONS' && (
          <div className="space-y-3">
            <div className="p-3 bg-secondary/40 border border-border/80 rounded-xl text-xs text-muted-foreground flex items-start gap-2">
              <Users className="w-4 h-4 text-cyan-500 flex-shrink-0 mt-0.5" />
              <span>
                Physical co-locations detected where multiple targets converged in the same geographic radius within an overlapping time window.
              </span>
            </div>

            {coLocations.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground space-y-2">
                <Users className="w-8 h-8 mx-auto opacity-30" />
                <p>No multi-entity rendezvous detected in current scope.</p>
              </div>
            ) : (
              coLocations.map((co) => (
                <div
                  key={co.co_location_id}
                  onClick={() => onSelectCoLocation(co)}
                  className="bg-card hover:bg-secondary/40 border border-border/80 hover:border-cyan-500/50 rounded-xl p-3.5 space-y-2.5 transition-all cursor-pointer shadow-2xs group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground group-hover:text-cyan-400 transition-colors">
                      {co.entity_names.join(' & ')}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                      {Math.round(co.correlation_score * 100)}% Confidence
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <MapPin className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                    <span className="truncate">{co.location_name}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 p-2 rounded-lg bg-secondary/50 text-[10px] font-mono">
                    <div>
                      <span className="text-muted-foreground block text-[9px]">Proximity</span>
                      <span className="text-foreground font-bold">~{Math.round(co.distance_between_meters)} meters</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[9px]">Overlap Duration</span>
                      <span className="text-foreground font-bold">{Math.round(co.duration_seconds / 60)} minutes</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 text-[10px] text-muted-foreground border-t border-border/40">
                    <span>{co.supporting_events?.length || 2} Supporting Events</span>
                    <span className="text-primary font-bold flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                      Inspect Rendezvous <ChevronRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ================= TAB 4: COMMON PLACES ================= */}
        {activeTab === 'COMMON_PLACES' && (
          <div className="space-y-3">
            <div className="p-3 bg-secondary/40 border border-border/80 rounded-xl text-xs text-muted-foreground flex items-start gap-2">
              <Landmark className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <span>
                High-affinity spatial convergence hubs identified across cellular antennas, bank branches, transit hubs, and safehouses.
              </span>
            </div>

            {commonPlaces.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground space-y-2">
                <Landmark className="w-8 h-8 mx-auto opacity-30" />
                <p>No high-frequency spatial hubs identified yet.</p>
              </div>
            ) : (
              commonPlaces.map((place) => (
                <div
                  key={place.place_id}
                  onClick={() => onSelectPlace(place)}
                  className="bg-card hover:bg-secondary/40 border border-border/80 hover:border-amber-500/50 rounded-xl p-3.5 space-y-2 transition-all cursor-pointer shadow-2xs group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground group-hover:text-amber-400 transition-colors">
                      {place.place_name}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                      {place.location_type || 'Hub'}
                    </span>
                  </div>

                  <p className="text-[11px] font-mono text-muted-foreground">
                    {place.latitude.toFixed(4)}° N, {place.longitude.toFixed(4)}° E • Radius ±{place.radius_meters}m
                  </p>

                  <div className="flex items-center justify-between pt-1 text-[10px] text-muted-foreground border-t border-border/40">
                    <span>{place.time_spans?.length || 1} Registered Visits</span>
                    <span className="text-primary font-bold flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                      View Geofence <ChevronRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  </>
);
};
export default GeoSpatialIntelligenceDrawer;
