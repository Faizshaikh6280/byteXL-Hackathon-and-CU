'use client';
import React from 'react';
import { Layers, ShieldCheck, MapPin, Radio, Landmark, Globe, Activity } from 'lucide-react';

interface GeoLegendProps {
  showWaypoints: boolean;
  setShowWaypoints: (v: boolean) => void;
  showMovements: boolean;
  setShowMovements: (v: boolean) => void;
  showTrips: boolean;
  setShowTrips: (v: boolean) => void;
  showCoverage: boolean;
  setShowCoverage: (v: boolean) => void;
  showHeatmap: boolean;
  setShowHeatmap: (v: boolean) => void;
}

export const GeoLegend: React.FC<GeoLegendProps> = ({
  showWaypoints,
  setShowWaypoints,
  showMovements,
  setShowMovements,
  showTrips,
  setShowTrips,
  showCoverage,
  setShowCoverage,
  showHeatmap,
  setShowHeatmap,
}) => {
  return (
    <div className="bg-card/95 border border-border/80 rounded-xl p-3 backdrop-blur-md shadow-xl text-xs space-y-2.5 max-w-xs select-none">
      <div className="flex items-center justify-between pb-1.5 border-b border-border/60">
        <div className="flex items-center gap-1.5 font-bold text-foreground text-[11px] uppercase tracking-wider">
          <Layers className="w-3.5 h-3.5 text-primary" />
          <span>Layer Visibility</span>
        </div>
      </div>

      {/* Layer Toggles */}
      <div className="grid grid-cols-2 gap-1.5">
        <button
          onClick={() => setShowWaypoints(!showWaypoints)}
          className={`px-2 py-1 rounded text-[10px] font-medium flex items-center gap-1.5 border transition-all ${
            showWaypoints
              ? 'bg-primary/20 border-primary/50 text-primary'
              : 'bg-secondary/40 border-border/40 text-muted-foreground line-through'
          }`}
        >
          <MapPin className="w-3 h-3" />
          <span>Waypoints</span>
        </button>

        <button
          onClick={() => setShowMovements(!showMovements)}
          className={`px-2 py-1 rounded text-[10px] font-medium flex items-center gap-1.5 border transition-all ${
            showMovements
              ? 'bg-primary/20 border-primary/50 text-primary'
              : 'bg-secondary/40 border-border/40 text-muted-foreground line-through'
          }`}
        >
          <Activity className="w-3 h-3" />
          <span>Trajectories</span>
        </button>

        <button
          onClick={() => setShowTrips(!showTrips)}
          className={`px-2 py-1 rounded text-[10px] font-medium flex items-center gap-1.5 border transition-all ${
            showTrips
              ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
              : 'bg-secondary/40 border-border/40 text-muted-foreground line-through'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span>Trips Trail</span>
        </button>

        <button
          onClick={() => setShowCoverage(!showCoverage)}
          className={`px-2 py-1 rounded text-[10px] font-medium flex items-center gap-1.5 border transition-all ${
            showCoverage
              ? 'bg-purple-500/20 border-purple-500/50 text-purple-400'
              : 'bg-secondary/40 border-border/40 text-muted-foreground line-through'
          }`}
        >
          <Radio className="w-3 h-3" />
          <span>Tower Sectors</span>
        </button>

        <button
          onClick={() => setShowHeatmap(!showHeatmap)}
          className={`col-span-2 px-2 py-1 rounded text-[10px] font-medium flex items-center justify-center gap-1.5 border transition-all ${
            showHeatmap
              ? 'bg-rose-500/20 border-rose-500/50 text-rose-400'
              : 'bg-secondary/40 border-border/40 text-muted-foreground'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-rose-400" />
          <span>Activity Density Heatmap</span>
        </button>
      </div>

      {/* Semantic Quality Guide */}
      <div className="pt-2 border-t border-border/60 space-y-1 text-[10px]">
        <span className="text-muted-foreground font-semibold uppercase tracking-wider block mb-1">
          Precision Semantics
        </span>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(6,182,212,0.8)]" />
          <span className="text-foreground">GPS Coordinates (~10-25m)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
          <span className="text-foreground">ATM / Bank Branch (~20m)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-purple-400 shadow-[0_0_6px_rgba(192,132,252,0.8)]" />
          <span className="text-foreground">Cell Tower (~500m-1.5km)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]" />
          <span className="text-foreground">Social Geotag (~200m)</span>
        </div>
        <div className="flex items-center gap-2 pt-1 border-t border-border/40">
          <span className="w-4 h-0.5 bg-primary" />
          <span className="text-muted-foreground">Continuous Track</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-0.5 border-b border-dashed border-red-400" />
          <span className="text-red-400">Time Gap / Telemetry Discontinuity</span>
        </div>
      </div>
    </div>
  );
};
