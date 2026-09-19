'use client';
import React from 'react';
import { MapPin, Users, Activity, ExternalLink, ChevronRight, Landmark } from 'lucide-react';
import { CommonPlace } from '../../services/apiClient';

interface GeoCommonPlacesPanelProps {
  commonPlaces: CommonPlace[];
  onSelectPlace: (place: CommonPlace) => void;
}

export const GeoCommonPlacesPanel: React.FC<GeoCommonPlacesPanelProps> = ({
  commonPlaces,
  onSelectPlace,
}) => {
  return (
    <div className="flex flex-col h-full bg-card border-r border-border/80 text-xs w-96 backdrop-blur-xl">
      {/* Header */}
      <div className="p-3.5 border-b border-border/70 flex items-center justify-between">
        <div className="flex items-center gap-2 font-bold text-foreground text-sm">
          <Landmark className="w-4 h-4 text-primary" />
          <span>Common Places & Hubs</span>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary font-mono text-[11px] font-bold">
          {commonPlaces.length} Hubs
        </span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {commonPlaces.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground space-y-2">
            <Landmark className="w-8 h-8 mx-auto opacity-30" />
            <p>No high-frequency hubs identified.</p>
          </div>
        ) : (
          commonPlaces.map(place => {
            const hasMultiEntity = place.unique_entity_count > 1;

            return (
              <div
                key={place.place_id}
                onClick={() => onSelectPlace(place)}
                className={`p-3 rounded-xl border transition-all cursor-pointer hover:border-primary/60 group space-y-2 ${
                  hasMultiEntity
                    ? 'bg-primary/5 border-primary/30 hover:bg-primary/10'
                    : 'bg-secondary/30 border-border/60 hover:bg-secondary/60'
                }`}
              >
                {/* Top badges */}
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded bg-secondary text-[10px] font-mono font-bold uppercase text-muted-foreground">
                    {place.dominant_domain}
                  </span>

                  <div className="flex items-center gap-1 text-[11px] font-mono">
                    <span className="text-primary font-bold">{place.total_visits}</span>
                    <span className="text-muted-foreground">visits</span>
                  </div>
                </div>

                {/* Place Name */}
                <div className="space-y-0.5">
                  <h4 className="font-semibold text-foreground text-xs flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                    <span className="truncate">{place.place_name}</span>
                  </h4>
                  <p className="text-[10px] font-mono text-muted-foreground pl-5">
                    {place.latitude.toFixed(4)}, {place.longitude.toFixed(4)} (~{place.radius_meters}m cluster)
                  </p>
                </div>

                {/* Multi-Entity Breakdown */}
                <div className="pt-1.5 border-t border-border/40 space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Users className="w-3 h-3 text-primary" />
                      <span>Entities Observed:</span>
                    </span>
                    <span className="font-bold text-foreground font-mono">
                      {place.unique_entity_count}
                    </span>
                  </div>

                  {/* Entity chips with visit counts */}
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {Object.entries(place.entity_visit_counts).map(([ent, count]) => (
                      <span
                        key={ent}
                        className="px-1.5 py-0.5 rounded bg-secondary/80 border border-border/50 text-[10px] font-mono text-muted-foreground flex items-center gap-1"
                      >
                        <span className="text-foreground font-medium truncate max-w-[100px]">{ent}:</span>
                        <span className="text-primary font-bold">{count}</span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Footer action */}
                <div className="flex items-center justify-between pt-1 border-t border-border/30 text-[10px]">
                  <span className="text-primary group-hover:underline flex items-center gap-0.5">
                    <span>Inspect Hub on Map</span>
                    <ChevronRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
