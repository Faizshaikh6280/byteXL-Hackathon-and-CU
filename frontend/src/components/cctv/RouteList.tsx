'use client';
import React, { useState } from 'react';
import { Navigation, Sparkles, AlertCircle, Compass, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { RouteHypothesis } from '../../services/apiClient';
import { RouteCard } from './RouteCard';
import { cn } from '../../utils/cn';

interface Props {
  routes: RouteHypothesis[];
  selectedRoute: RouteHypothesis | null;
  onSelectRoute: (route: RouteHypothesis) => void;
  recommendedStartingPoint?: string;
}

export const RouteList: React.FC<Props> = ({
  routes,
  selectedRoute,
  onSelectRoute,
  recommendedStartingPoint
}) => {
  const [filterType, setFilterType] = useState<'ALL' | 'APPROACH' | 'DEPARTURE'>('ALL');

  const filteredRoutes = routes.filter((r) => {
    if (filterType === 'APPROACH' && r.route_type !== 'APPROACH') return false;
    if (filterType === 'DEPARTURE' && r.route_type !== 'DEPARTURE') return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Smart Recommendation Banner */}
      {recommendedStartingPoint && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/20 flex items-start gap-3 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0 text-amber-400 mt-0.5">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="space-y-1 min-w-0">
            <div className="text-xs font-bold text-amber-400 uppercase tracking-wider">
              Recommended Starting Point
            </div>
            <p className="text-xs text-foreground/90 font-medium leading-relaxed">
              {recommendedStartingPoint}
            </p>
            <div className="text-[11px] text-muted-foreground pt-0.5">
              Decision-support hypothesis based on arterial road speed, camera density, and entry/exit gateway alignment.
            </div>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilterType('ALL')}
            className={cn(
              "text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors",
              filterType === 'ALL'
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-secondary text-muted-foreground border-border hover:text-foreground"
            )}
          >
            All Candidate Routes ({routes.length})
          </button>

          <button
            type="button"
            onClick={() => setFilterType('APPROACH')}
            className={cn(
              "text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1",
              filterType === 'APPROACH'
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-secondary text-muted-foreground border-border hover:text-foreground"
            )}
          >
            <ArrowDownLeft className="w-3.5 h-3.5" />
            Possible Approach ({routes.filter(r => r.route_type === 'APPROACH').length})
          </button>

          <button
            type="button"
            onClick={() => setFilterType('DEPARTURE')}
            className={cn(
              "text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1",
              filterType === 'DEPARTURE'
                ? "bg-purple-600 text-white border-purple-600"
                : "bg-secondary text-muted-foreground border-border hover:text-foreground"
            )}
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            Possible Departure ({routes.filter(r => r.route_type === 'DEPARTURE').length})
          </button>
        </div>

        <span className="text-[11px] text-muted-foreground hidden sm:inline-block">
          Click &apos;View Route&apos; to inspect camera lineup
        </span>
      </div>

      {/* Route Cards */}
      {filteredRoutes.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredRoutes.map((route) => (
            <RouteCard
              key={route.route_id}
              route={route}
              isSelected={selectedRoute?.route_id === route.route_id}
              onSelect={() => onSelectRoute(route)}
            />
          ))}
        </div>
      ) : (
        <div className="p-12 text-center border border-dashed border-border rounded-2xl space-y-2">
          <Navigation className="w-8 h-8 text-muted-foreground mx-auto" />
          <h4 className="text-sm font-bold text-foreground">No candidate routes for this category</h4>
          <p className="text-xs text-muted-foreground">Try selecting All Candidate Routes or adjusting incident location.</p>
        </div>
      )}
    </div>
  );
};
