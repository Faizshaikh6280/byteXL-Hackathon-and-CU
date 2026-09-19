'use client';
import React from 'react';
import { 
  BookOpen, Clock, MapPin, Activity, Navigation, ArrowDown, AlertTriangle, 
  ShieldCheck, ExternalLink 
} from 'lucide-react';
import { SpatialStoryCard } from '../../services/apiClient';

interface GeoSpatialStoryPanelProps {
  storyCards: SpatialStoryCard[];
  onSelectCard: (card: SpatialStoryCard) => void;
}

export const GeoSpatialStoryPanel: React.FC<GeoSpatialStoryPanelProps> = ({
  storyCards,
  onSelectCard,
}) => {
  return (
    <div className="flex flex-col h-full bg-card border-r border-border/80 text-xs w-96 backdrop-blur-xl">
      {/* Header */}
      <div className="p-3.5 border-b border-border/70 flex items-center justify-between">
        <div className="flex items-center gap-2 font-bold text-foreground text-sm">
          <BookOpen className="w-4 h-4 text-primary" />
          <span>Spatial Reconstruction Story</span>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary font-mono text-[11px] font-bold">
          {storyCards.length} Steps
        </span>
      </div>

      {/* Cards List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {storyCards.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground space-y-2">
            <BookOpen className="w-8 h-8 mx-auto opacity-30" />
            <p>No spatial narrative cards generated for current filter.</p>
          </div>
        ) : (
          storyCards.map((card, idx) => {
            const hasAnomaly = card.anomalies && card.anomalies.length > 0;

            return (
              <div key={card.card_id} className="relative group">
                {/* Connector line between steps */}
                {idx < storyCards.length - 1 && (
                  <div className="absolute left-4 top-10 bottom--3 w-0.5 bg-border/60 z-0 group-hover:bg-primary/50 transition-colors" />
                )}

                <div
                  onClick={() => onSelectCard(card)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer relative z-10 space-y-2 ${
                    hasAnomaly
                      ? 'bg-rose-500/5 border-rose-500/30 hover:bg-rose-500/10'
                      : 'bg-secondary/30 border-border/60 hover:bg-secondary/60 hover:border-primary/50'
                  }`}
                >
                  {/* Step Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-primary/20 border border-primary/50 text-primary flex items-center justify-center font-mono text-[10px] font-bold">
                        {card.step_index}
                      </span>
                      <span className="font-semibold text-foreground text-xs">
                        {card.entity_name}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      <span>{card.time_range_formatted.substring(11, 19)}</span>
                    </div>
                  </div>

                  {/* Location info */}
                  <div className="flex items-start gap-1.5 pl-1">
                    <MapPin className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
                    <div>
                      <h5 className="font-medium text-foreground text-[11px]">
                        {card.location_name}
                      </h5>
                      <p className="text-[10px] font-mono text-muted-foreground">
                        {card.coordinates[0].toFixed(4)}, {card.coordinates[1].toFixed(4)}
                      </p>
                    </div>
                  </div>

                  {/* Action Summary */}
                  <p className="text-[11px] text-muted-foreground leading-relaxed pl-1">
                    {card.action_summary}
                  </p>

                  {/* Transit Metrics from previous milestone */}
                  {card.distance_from_previous_km !== null && card.distance_from_previous_km !== undefined && (
                    <div className="p-2 rounded-lg bg-secondary/60 border border-border/50 grid grid-cols-3 gap-1 text-[10px] font-mono">
                      <div>
                        <span className="text-muted-foreground block text-[9px]">Transit</span>
                        <span className="text-foreground font-semibold">{card.distance_from_previous_km} km</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[9px]">Duration</span>
                        <span className="text-foreground font-semibold">
                          {card.travel_time_from_previous_sec ? `${Math.round(card.travel_time_from_previous_sec / 60)} min` : '-'}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[9px]">Implied Velocity</span>
                        <span className={`font-semibold ${card.implied_speed_kmh && card.implied_speed_kmh > 120 ? 'text-rose-500 dark:text-rose-400' : 'text-primary'}`}>
                          {card.implied_speed_kmh ? `${card.implied_speed_kmh} km/h` : '-'}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Anomalies alert */}
                  {hasAnomaly && (
                    <div className="flex items-center gap-1.5 text-[10px] text-rose-500 dark:text-rose-300 font-mono bg-rose-500/10 p-1.5 rounded border border-rose-500/20">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400 flex-shrink-0" />
                      <span>{card.anomalies.join(', ')}</span>
                    </div>
                  )}

                  {/* Provenance ref */}
                  {card.evidence_refs?.length > 0 && (
                    <div className="text-[9px] font-mono text-muted-foreground/80 flex items-center justify-between pt-1 border-t border-border/30">
                      <span>Ref: {card.evidence_refs[0]}</span>
                      <span className="text-primary group-hover:underline">Center Map</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="p-2.5 bg-secondary/50 border-t border-border/60 text-[10px] text-muted-foreground flex items-center gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span>Grounded in cryptographic evidence records with zero generative hallucination.</span>
      </div>
    </div>
  );
};
