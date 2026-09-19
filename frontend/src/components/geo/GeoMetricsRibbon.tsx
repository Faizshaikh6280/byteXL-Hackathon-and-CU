'use client';
import React from 'react';
import { 
  MapPin, Building2, Users, Route, AlertTriangle, Target, 
  TrendingUp 
} from 'lucide-react';

interface GeoMetricsRibbonProps {
  totalEvents: number;
  uniqueLocations: number;
  entitiesCount: number;
  movementPatterns: number;
  spatialAnomalies: number;
  highInterestAreas: number;
  isLoading?: boolean;
}

export const GeoMetricsRibbon: React.FC<GeoMetricsRibbonProps> = ({
  totalEvents,
  uniqueLocations,
  entitiesCount,
  movementPatterns,
  spatialAnomalies,
  highInterestAreas,
  isLoading = false,
}) => {
  const cards = [
    {
      id: 'events',
      label: 'Location Events',
      value: totalEvents.toLocaleString(),
      change: '+12%',
      icon: MapPin,
      iconBg: 'bg-cyan-500/10 dark:bg-cyan-500/15',
      iconColor: 'text-cyan-500 dark:text-cyan-400',
      borderHover: 'hover:border-cyan-500/40',
      trendColor: 'text-emerald-500',
    },
    {
      id: 'locations',
      label: 'Unique Locations',
      value: uniqueLocations.toLocaleString(),
      change: '+8%',
      icon: Building2,
      iconBg: 'bg-indigo-500/10 dark:bg-indigo-500/15',
      iconColor: 'text-indigo-500 dark:text-indigo-400',
      borderHover: 'hover:border-indigo-500/40',
      trendColor: 'text-emerald-500',
    },
    {
      id: 'entities',
      label: 'Entities Tracked',
      value: entitiesCount.toLocaleString(),
      change: '+0%',
      icon: Users,
      iconBg: 'bg-emerald-500/10 dark:bg-emerald-500/15',
      iconColor: 'text-emerald-500 dark:text-emerald-400',
      borderHover: 'hover:border-emerald-500/40',
      trendColor: 'text-emerald-500',
    },
    {
      id: 'movements',
      label: 'Movement Patterns',
      value: movementPatterns.toLocaleString(),
      change: '+27%',
      icon: Route,
      iconBg: 'bg-sky-500/10 dark:bg-sky-500/15',
      iconColor: 'text-sky-500 dark:text-sky-400',
      borderHover: 'hover:border-sky-500/40',
      trendColor: 'text-emerald-500',
    },
    {
      id: 'anomalies',
      label: 'Spatial Anomalies',
      value: spatialAnomalies.toLocaleString(),
      change: spatialAnomalies > 0 ? `+${Math.min(200, spatialAnomalies * 35)}%` : '0%',
      icon: AlertTriangle,
      iconBg: 'bg-rose-500/10 dark:bg-rose-500/15',
      iconColor: 'text-rose-500 dark:text-rose-400',
      borderHover: 'hover:border-rose-500/40',
      trendColor: 'text-rose-500',
    },
    {
      id: 'high_interest',
      label: 'High Interest Areas',
      value: highInterestAreas.toLocaleString(),
      change: '+13%',
      icon: Target,
      iconBg: 'bg-purple-500/10 dark:bg-purple-500/15',
      iconColor: 'text-purple-500 dark:text-purple-400',
      borderHover: 'hover:border-purple-500/40',
      trendColor: 'text-emerald-500',
    },
  ];

  return (
    <div className="w-full px-4 py-2 bg-card/60 border-b border-border/80 backdrop-blur-md flex-shrink-0 select-none">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {cards.map(card => {
          const Icon = card.icon;
          return (
            <div
              key={card.id}
              className={`rounded-xl bg-card hover:bg-secondary/40 border border-border/80 p-2.5 shadow-2xs hover:shadow-xs transition-all duration-150 ${card.borderHover}`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className={`p-1.5 rounded-lg ${card.iconBg} ${card.iconColor}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <span className={`text-[10px] font-mono font-semibold flex items-center gap-0.5 ${card.trendColor}`}>
                  <TrendingUp className="w-2.5 h-2.5" />
                  {card.change}
                </span>
              </div>

              <div>
                <div className="text-base font-bold text-foreground tracking-tight font-mono leading-none">
                  {isLoading ? (
                    <div className="h-5 w-10 bg-muted/40 rounded animate-pulse" />
                  ) : (
                    card.value
                  )}
                </div>
                <div className="text-[10px] font-medium text-muted-foreground truncate mt-1">
                  {card.label}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
