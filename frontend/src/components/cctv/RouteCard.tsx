'use client';
import React, { useState } from 'react';
import { 
  Navigation, Clock, Eye, AlertTriangle, CheckCircle, 
  ChevronRight, ArrowRight, Shield, Sparkles, MapPin, ChevronDown, ChevronUp 
} from 'lucide-react';
import { RouteHypothesis } from '../../services/apiClient';
import { cn } from '../../utils/cn';

interface Props {
  route: RouteHypothesis;
  isSelected?: boolean;
  onSelect?: () => void;
}

export const RouteCard: React.FC<Props> = ({
  route,
  isSelected,
  onSelect
}) => {
  const [showSequence, setShowSequence] = useState(false);

  return (
    <div 
      className={cn(
        "p-4 rounded-xl border transition-all duration-200 bg-card/80 hover:bg-card shadow-sm relative group",
        isSelected 
          ? "border-primary ring-1 ring-primary/40 shadow-md bg-card" 
          : "border-border hover:border-border/80"
      )}
    >
      {/* Top Badges */}
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <div className="flex items-center gap-2">
          <span className={cn(
            "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border",
            route.route_type === 'APPROACH' 
              ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
              : "bg-purple-500/10 text-purple-400 border-purple-500/20"
          )}>
            {route.route_type === 'APPROACH' ? 'Possible Approach' : 'Possible Departure'}
          </span>

          <span className={cn(
            "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border",
            route.coverage_score === 'High' 
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
              : (route.coverage_score === 'Medium' ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-red-500/10 text-red-400 border-red-500/20")
          )}>
            {route.coverage_score} Relevance
          </span>
        </div>

        {route.is_recommended && (
          <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
            <Sparkles className="w-3 h-3 text-amber-400" />
            Recommended Starting Point
          </span>
        )}
      </div>

      {/* Title & Direction */}
      <div className="space-y-1">
        <h4 className="text-base font-bold text-foreground tracking-tight group-hover:text-primary transition-colors flex items-center justify-between">
          <span>{route.route_name}</span>
          <span className="text-xs font-mono font-bold text-muted-foreground">{route.distance_km} km</span>
        </h4>
        <p className="text-xs text-muted-foreground line-clamp-1 flex items-center gap-1.5">
          <Navigation className="w-3.5 h-3.5 text-primary/70 flex-shrink-0" />
          <span>{route.direction}</span>
        </p>
      </div>

      {/* Metrics Row */}
      <div className="mt-3 grid grid-cols-3 gap-2 py-2 px-3 rounded-lg bg-secondary/40 border border-border/40 text-xs">
        <div>
          <div className="text-[10px] uppercase font-semibold text-muted-foreground">Est. Time</div>
          <div className="font-bold text-foreground flex items-center gap-1 mt-0.5">
            <Clock className="w-3 h-3 text-primary" />
            {route.estimated_travel_time_min}
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase font-semibold text-muted-foreground">CCTV Sources</div>
          <div className="font-bold text-foreground flex items-center gap-1 mt-0.5">
            <Eye className="w-3 h-3 text-blue-400" />
            {route.surveillance_sources_count}
            <span className="text-[10px] text-muted-foreground font-normal">
              ({route.government_count}G / {route.private_count}P)
            </span>
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase font-semibold text-muted-foreground">Coverage Gaps</div>
          <div className={cn(
            "font-bold flex items-center gap-1 mt-0.5",
            route.coverage_gaps_count > 0 ? "text-amber-400" : "text-emerald-400"
          )}>
            {route.coverage_gaps_count > 0 ? (
              <>
                <AlertTriangle className="w-3 h-3 text-amber-400" />
                {route.coverage_gaps_count} Gap{route.coverage_gaps_count > 1 ? 's' : ''}
              </>
            ) : (
              <>
                <CheckCircle className="w-3 h-3 text-emerald-400" />
                Continuous
              </>
            )}
          </div>
        </div>
      </div>

      {/* Why Relevant Snippet */}
      <div className="mt-2.5 text-xs text-muted-foreground space-y-0.5">
        {route.why_relevant.split('\n').slice(0, 2).map((line, idx) => (
          <div key={idx} className="line-clamp-1 text-emerald-400/90 font-medium">
            {line}
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="mt-3 pt-2.5 border-t border-border/40 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setShowSequence(!showSequence)}
          className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          <span>Camera Sequence ({route.cctv_sequence.length})</span>
          {showSequence ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        <button
          type="button"
          onClick={onSelect}
          className={cn(
            "text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm",
            isSelected
              ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
              : "bg-secondary hover:bg-primary hover:text-primary-foreground text-foreground border border-border"
          )}
        >
          <span>View Route</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Expanded Sequence Breadcrumbs */}
      {showSequence && (
        <div className="mt-3 pt-3 border-t border-border/40 space-y-2 animate-in fade-in duration-200">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Sequential Camera Lineup (Estimated Observation Window)
          </div>

          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {/* Origin */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-primary/70 flex-shrink-0" />
              <span className="font-semibold text-foreground truncate">
                {route.route_type === 'APPROACH' ? `Entry: ${route.origin_area}` : 'Crime Scene (Incident Origin)'}
              </span>
            </div>

            {/* Intermediate CCTV Points */}
            {route.cctv_sequence.map((item, sIdx) => (
              <div key={item.source_id || sIdx} className="ml-1 pl-3 border-l-2 border-border/60 py-1 flex items-start justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <div className="font-medium text-foreground truncate flex items-center gap-1.5">
                    <span className={cn(
                      "w-1.5 h-1.5 rounded-full flex-shrink-0",
                      item.source_type.includes('GOVERNMENT') ? "bg-blue-400" : "bg-amber-400"
                    )} />
                    <span className="truncate">{item.source_name}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {item.road_name} • {Math.round(item.distance_from_start_meters)}m
                  </div>
                </div>

                <span className="text-[10px] font-mono font-semibold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded flex-shrink-0">
                  {item.estimated_observation_window}
                </span>
              </div>
            ))}

            {/* Destination */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
              <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
              <span className="font-semibold text-foreground truncate">
                {route.route_type === 'APPROACH' ? 'Crime Scene (Incident Point)' : `Exit Gateway: ${route.destination}`}
              </span>
            </div>
          </div>

          {/* Coverage Gaps Details */}
          {route.coverage_gaps.length > 0 && (
            <div className="mt-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-amber-400">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Coverage Gaps Identified Along Route</span>
              </div>
              {route.coverage_gaps.map((gap, gIdx) => (
                <div key={gap.gap_id || gIdx} className="text-[11px] leading-relaxed text-amber-200/80">
                  • {gap.explanation}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
