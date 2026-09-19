import React from 'react';
import { ShieldAlert, ArrowRight } from 'lucide-react';
import { cn } from '../../utils/cn';
import { AnomalyStats } from '../../services/apiClient';
import { computeDonutSegments } from './dashboardAdapters';

interface ThreatStateDonutProps {
  stats: AnomalyStats;
  onNavigateTab: (tabId: string) => void;
}

export const ThreatStateDonut: React.FC<ThreatStateDonutProps> = ({
  stats,
  onNavigateTab
}) => {
  const total = stats.total || (stats.critical + stats.high + stats.medium + stats.low) || 0;

  // Items for donut calculation
  const items = [
    { key: 'critical', label: 'Critical', value: stats.critical, color: '#ef4444' },
    { key: 'high', label: 'High', value: stats.high, color: '#f97316' },
    { key: 'medium', label: 'Medium', value: stats.medium, color: '#f59e0b' },
    { key: 'low', label: 'Low / Baseline', value: stats.low, color: '#3b82f6' }
  ];

  const segments = computeDonutSegments(items, 50, 50, 36);

  return (
    <div className="bg-card/70 border border-border/80 rounded-2xl p-5 flex flex-col justify-between shadow-xs select-none">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold font-mono">
              3
            </span>
            <h3 className="text-sm font-bold tracking-tight text-foreground">
              Threat / Anomaly State
            </h3>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Risk distribution from anomaly engine
          </p>
        </div>
        <ShieldAlert className="w-4 h-4 text-rose-500" />
      </div>

      {/* Center Donut + Legend */}
      <div className="flex flex-col xs:flex-row items-center justify-around gap-3 sm:gap-4 py-2">
        {/* SVG Donut Chart */}
        <div className="relative w-32 h-32 flex-shrink-0 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            {/* Background Track */}
            <circle
              cx="50"
              cy="50"
              r="36"
              fill="transparent"
              stroke="var(--border)"
              strokeWidth="10"
              className="opacity-40"
            />
            {/* Slices */}
            {segments.map((seg) => (
              <path
                key={seg.key}
                d={seg.path}
                fill="transparent"
                stroke={seg.color}
                strokeWidth="10"
                strokeLinecap="round"
                className="transition-all duration-300 hover:opacity-80 cursor-pointer"
              >
                <title>{`${seg.label}: ${seg.value} (${seg.percent}%)`}</title>
              </path>
            ))}
          </svg>

          {/* Donut Center Hole Value */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-2xl font-black font-mono tracking-tight text-foreground leading-none">
              {total}
            </span>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-0.5">
              Total
            </span>
          </div>
        </div>

        {/* Legend List */}
        <div className="flex flex-col gap-2 min-w-[120px]">
          {items.map((it) => (
            <div key={it.key} className="flex items-center justify-between text-xs gap-3">
              <span className="flex items-center gap-2 text-muted-foreground">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: it.color }} />
                <span>{it.label}</span>
              </span>
              <span className="font-mono font-bold text-foreground">
                {it.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer Action Link */}
      <div className="pt-3 border-t border-border/50 text-center">
        <button
          onClick={() => onNavigateTab('anomalies')}
          className="text-xs font-bold text-primary hover:text-primary/80 transition-colors inline-flex items-center gap-1 group"
        >
          <span>View All Anomalies</span>
          <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </div>
  );
};
export default ThreatStateDonut;
