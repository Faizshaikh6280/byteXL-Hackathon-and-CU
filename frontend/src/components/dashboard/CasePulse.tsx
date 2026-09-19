import React from 'react';
import { 
  Users, Clock, AlertTriangle, Share2, 
  Database, HardDrive, ArrowUpRight 
} from 'lucide-react';
import { cn } from '../../utils/cn';

interface CasePulseProps {
  entitiesCount: number;
  eventsCount: number;
  anomaliesCount: number;
  correlationsCount: number;
  evidenceCount: number;
  dataSourcesCount: number;
  dataSourcesSummary?: string;
  onNavigateTab: (tabId: string) => void;
}

export const CasePulse: React.FC<CasePulseProps> = ({
  entitiesCount,
  eventsCount,
  anomaliesCount,
  correlationsCount,
  evidenceCount,
  dataSourcesCount,
  dataSourcesSummary = 'Telecom, Financial, IPDR, Social, General',
  onNavigateTab
}) => {
  const pulseCards = [
    {
      id: 'entities',
      label: 'Entities',
      count: entitiesCount,
      trend: '+3 new',
      icon: Users,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/20',
      trendColor: 'text-emerald-500',
      tab: 'entity-explorer'
    },
    {
      id: 'events',
      label: 'Events',
      count: eventsCount,
      trend: '+52 (24h)',
      icon: Clock,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      trendColor: 'text-emerald-500',
      tab: 'timeline'
    },
    {
      id: 'anomalies',
      label: 'Anomalies',
      count: anomaliesCount,
      trend: '+2 new',
      icon: AlertTriangle,
      color: 'text-rose-500',
      bg: 'bg-rose-500/10',
      border: 'border-rose-500/20',
      trendColor: 'text-rose-500',
      tab: 'anomalies'
    },
    {
      id: 'correlations',
      label: 'Correlations',
      count: correlationsCount,
      trend: '+1 new',
      icon: Share2,
      color: 'text-indigo-500',
      bg: 'bg-indigo-500/10',
      border: 'border-indigo-500/20',
      trendColor: 'text-indigo-500',
      tab: 'timeline'
    },
    {
      id: 'evidence',
      label: 'Evidence Items',
      count: evidenceCount,
      trend: '+2 new',
      icon: Database,
      color: 'text-teal-500',
      bg: 'bg-teal-500/10',
      border: 'border-teal-500/20',
      trendColor: 'text-teal-500',
      tab: 'data-sources'
    },
    {
      id: 'sources',
      label: 'Data Sources',
      count: dataSourcesCount,
      subtext: dataSourcesSummary,
      icon: HardDrive,
      color: 'text-cyan-500',
      bg: 'bg-cyan-500/10',
      border: 'border-cyan-500/20',
      tab: 'data-sources'
    }
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold font-mono">
          1
        </span>
        <h2 className="text-sm font-bold tracking-tight text-foreground">
          Case Pulse
        </h2>
        <span className="text-xs text-muted-foreground hidden sm:inline">
          Live overview of key investigation metrics
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {pulseCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.id}
              onClick={() => onNavigateTab(card.tab)}
              className="bg-card/70 hover:bg-card border border-border/80 hover:border-primary/50 rounded-xl p-2.5 sm:p-3.5 flex flex-col justify-between cursor-pointer transition-all duration-150 shadow-xs group"
              role="button"
              tabIndex={0}
            >
              {/* Top Icon & Trend */}
              <div className="flex items-center justify-between gap-1 mb-2">
                <div className={cn("p-1.5 sm:p-2 rounded-lg border", card.bg, card.border, card.color)}>
                  <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </div>
                {card.trend && (
                  <span className={cn("text-[9px] sm:text-[10px] font-mono font-bold flex items-center gap-0.5", card.trendColor)}>
                    <span>↑</span>
                    <span>{card.trend}</span>
                  </span>
                )}
              </div>

              {/* Metric Count & Label */}
              <div>
                <div className="text-xl sm:text-2xl font-black font-mono tracking-tight text-foreground group-hover:text-primary transition-colors">
                  {card.count}
                </div>
                <div className="text-[10px] sm:text-[11px] font-bold text-muted-foreground truncate mt-0.5">
                  {card.label}
                </div>
                {card.subtext && (
                  <div className="text-[9px] text-muted-foreground/80 truncate font-mono mt-0.5" title={card.subtext}>
                    {card.subtext}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
export default CasePulse;
