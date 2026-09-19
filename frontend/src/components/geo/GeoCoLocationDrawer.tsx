'use client';
import React, { useState } from 'react';
import { 
  Users, Radio, MapPin, Calendar, Activity, ExternalLink, ShieldCheck, 
  ChevronRight, AlertCircle, Sparkles
} from 'lucide-react';
import { CoLocationFinding } from '../../services/apiClient';

interface GeoCoLocationDrawerProps {
  coLocations: CoLocationFinding[];
  onSelectCoLocation: (coLoc: CoLocationFinding) => void;
  onViewOnGraph?: (entityId: string) => void;
}

export const GeoCoLocationDrawer: React.FC<GeoCoLocationDrawerProps> = ({
  coLocations,
  onSelectCoLocation,
  onViewOnGraph,
}) => {
  const [filterType, setFilterType] = useState<string>('ALL');

  const filtered = coLocations.filter(c => {
    if (filterType === 'ALL') return true;
    if (filterType === 'REPEATED') return c.co_location_type === 'REPEATED_PRESENCE_IN_AREA';
    if (filterType === 'PROXIMITY') return c.co_location_type === 'PROXIMITY_OVERLAP';
    if (filterType === 'CELL') return c.co_location_type === 'CELL_SECTOR_OVERLAP';
    return true;
  });

  return (
    <div className="flex flex-col h-full bg-card border-r border-border/80 text-xs w-96 backdrop-blur-xl">
      {/* Header */}
      <div className="p-3.5 border-b border-border/70 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-foreground text-sm">
            <Users className="w-4 h-4 text-primary" />
            <span>Co-Location & Convergence</span>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary font-mono text-[11px] font-bold">
            {coLocations.length} Found
          </span>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-hide">
          {[
            { id: 'ALL', label: 'All' },
            { id: 'REPEATED', label: 'Repeated' },
            { id: 'PROXIMITY', label: 'Proximity' },
            { id: 'CELL', label: 'Cell Sector' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id)}
              className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors whitespace-nowrap ${
                filterType === tab.id
                  ? 'bg-primary text-primary-foreground font-bold shadow-sm'
                  : 'bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {filtered.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground space-y-2">
            <Users className="w-8 h-8 mx-auto opacity-30" />
            <p>No co-location patterns match the selected filter.</p>
          </div>
        ) : (
          filtered.map(co => {
            const isRepeated = co.co_location_type === 'REPEATED_PRESENCE_IN_AREA';

            return (
              <div
                key={co.co_location_id}
                onClick={() => onSelectCoLocation(co)}
                className={`p-3 rounded-xl border transition-all cursor-pointer hover:border-primary/60 group space-y-2 ${
                  isRepeated
                    ? 'bg-rose-500/5 border-rose-500/30 hover:bg-rose-500/10'
                    : 'bg-secondary/30 border-border/60 hover:bg-secondary/60'
                }`}
              >
                {/* Top badges */}
                <div className="flex items-center justify-between">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${
                      isRepeated
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        : co.co_location_type === 'PROXIMITY_OVERLAP'
                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                        : 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                    }`}
                  >
                    {isRepeated ? 'Repeated Presence' : co.co_location_type.replace('_OVERLAP', '')}
                  </span>

                  <div className="flex items-center gap-1 font-mono text-[11px] font-bold text-primary">
                    <Sparkles className="w-3 h-3 text-primary" />
                    <span>Score {co.correlation_score}</span>
                  </div>
                </div>

                {/* Participant Entities */}
                <div className="space-y-0.5">
                  <div className="font-semibold text-foreground text-xs flex items-center gap-1">
                    <span>{co.entity_names.join(' & ')}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
                    <MapPin className="w-3 h-3 flex-shrink-0 text-muted-foreground" />
                    <span className="truncate">{co.location_name || 'Area Sector'}</span>
                  </div>
                </div>

                {/* Metrics row */}
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/40 text-[10px]">
                  <div>
                    <span className="text-muted-foreground">Proximity:</span>{' '}
                    <span className="font-mono text-foreground font-semibold">
                      {co.distance_between_meters > 0
                        ? `~${co.distance_between_meters}m`
                        : 'Same Sector'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Window:</span>{' '}
                    <span className="font-mono text-foreground font-semibold">
                      {co.start_time.substring(11, 16)} - {co.end_time.substring(11, 16)}
                    </span>
                  </div>
                </div>

                {/* Multi-day repeated presence badge */}
                {co.distinct_days_count > 1 && (
                  <div className="flex items-center gap-1 text-[10px] text-rose-300 font-mono bg-rose-500/10 p-1 rounded">
                    <Calendar className="w-3 h-3 text-rose-400" />
                    <span>Observed across {co.distinct_days_count} distinct calendar days ({co.occurrence_count} times)</span>
                  </div>
                )}

                {/* Actions & Graph Link */}
                <div className="flex items-center justify-between pt-1 border-t border-border/30 text-[10px]">
                  <span className="text-primary group-hover:underline flex items-center gap-0.5">
                    <span>Focus on Map</span>
                    <ChevronRight className="w-3 h-3" />
                  </span>

                  {onViewOnGraph && co.entity_ids[0] && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewOnGraph(co.entity_ids[0]);
                      }}
                      className="text-muted-foreground hover:text-foreground hover:underline flex items-center gap-1"
                      title="Inspect relationship on graph"
                    >
                      <ExternalLink className="w-2.5 h-2.5" />
                      <span>Graph</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Forensic Epistemic Disclaimer */}
      <div className="p-2.5 bg-secondary/50 border-t border-border/60 text-[10px] text-muted-foreground flex items-start gap-1.5 leading-tight">
        <ShieldCheck className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
        <span>
          Co-location flags observational spatio-temporal overlap of device identifiers; does not assert physical meeting or collusion.
        </span>
      </div>
    </div>
  );
};
