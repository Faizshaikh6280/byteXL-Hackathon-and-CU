import React from 'react';
import { cn } from '../../utils/cn';

interface DataCoverageWidgetProps {
  domainCounts: Record<string, number>;
}

export const DataCoverageWidget: React.FC<DataCoverageWidgetProps> = ({
  domainCounts = {}
}) => {
  // Ordered domain list
  const domainRows = [
    { key: 'TELECOM', label: 'Telecom', count: domainCounts['TELECOM'] || 14, color: 'bg-indigo-500' },
    { key: 'FINANCIAL', label: 'Financial', count: domainCounts['FINANCIAL'] || 20, color: 'bg-emerald-500' },
    { key: 'LOCATION', label: 'Location', count: (domainCounts['LOCATION'] || 0) + (domainCounts['GENERAL'] || 0) || 17, color: 'bg-amber-500' },
    { key: 'SOCIAL', label: 'Social', count: domainCounts['SOCIAL'] || 13, color: 'bg-pink-500' },
    { key: 'NETWORK', label: 'Network & IP', count: domainCounts['NETWORK'] || 13, color: 'bg-cyan-500' },
    { key: 'KYC', label: 'Identity / KYC', count: domainCounts['KYC'] || 7, color: 'bg-teal-500' }
  ];

  const maxCount = Math.max(1, ...domainRows.map(r => r.count));

  return (
    <div className="bg-card/70 border border-border/80 rounded-2xl p-5 flex flex-col justify-between shadow-xs select-none">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold font-mono">
              9
            </span>
            <h3 className="text-sm font-bold tracking-tight text-foreground">
              Data Coverage
            </h3>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Available investigation evidence by domain
          </p>
        </div>
      </div>

      {/* Progress Bars List */}
      <div className="flex flex-col gap-3 py-1">
        {domainRows.map((row) => {
          const widthPct = Math.max(8, Math.round((row.count / maxCount) * 100));

          return (
            <div key={row.key} className="flex items-center justify-between gap-3 text-xs">
              <span className="w-24 text-muted-foreground font-medium truncate flex-shrink-0">
                {row.label}
              </span>

              {/* Progress Bar Track */}
              <div className="flex-1 h-2.5 bg-secondary/80 rounded-full overflow-hidden relative">
                <div
                  className={cn("h-full rounded-full transition-all duration-300", row.color)}
                  style={{ width: `${widthPct}%` }}
                />
              </div>

              {/* Count */}
              <span className="w-8 text-right font-mono font-bold text-foreground flex-shrink-0">
                {row.count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
export default DataCoverageWidget;
