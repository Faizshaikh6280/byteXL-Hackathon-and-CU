'use client';
import React from 'react';

export const CCTVLegend: React.FC = () => {
  return (
    <div className="absolute bottom-6 left-6 z-10 bg-panel/90 backdrop-blur-md border border-border rounded-xl p-3.5 shadow-xl text-xs space-y-2 pointer-events-auto max-w-[240px]">
      <div className="font-semibold text-foreground tracking-wide flex items-center gap-1.5 border-b border-border/60 pb-1.5">
        <span className="w-2 h-2 rounded-full bg-primary" />
        Map Legend
      </div>
      <div className="space-y-1.5 text-muted-foreground font-medium">
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded-full bg-red-500 ring-2 ring-red-500/30 flex-shrink-0 animate-pulse" />
          <span className="text-foreground">Crime Scene</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded-full bg-blue-500 ring-2 ring-blue-500/30 flex-shrink-0" />
          <span className="text-foreground">Government CCTV</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded-full bg-amber-500 ring-2 ring-amber-500/30 flex-shrink-0" />
          <span className="text-foreground">Potential Private CCTV</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 ring-2 ring-emerald-500/30 flex-shrink-0" />
          <span className="text-foreground">Verified CCTV</span>
        </div>
        <div className="flex items-center gap-2 pt-1 border-t border-border/40">
          <span className="w-6 h-1 rounded bg-blue-400 flex-shrink-0" />
          <span className="text-foreground">Possible Route</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-6 h-1 rounded border-b-2 border-dashed border-amber-400 flex-shrink-0" />
          <span className="text-amber-400 font-semibold">Coverage Gap</span>
        </div>
      </div>
    </div>
  );
};
