import React from 'react';
import { 
  Star, User, Calendar, RefreshCw, Clock, CheckCircle2, 
  Layers, Users, AlertTriangle, Share2, Database, Map, BarChart3
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { Case } from '../../services/apiClient';

interface CaseContextBarProps {
  activeCase: Case | null;
  investigatorName?: string;
  investigatorBadge?: string;
  minTimestamp?: string;
  maxTimestamp?: string;
  lastUpdated?: string;
  isLoading?: boolean;
  onRefresh: () => void;
  onNavigateTab: (tabId: string) => void;
}

export const CaseContextBar: React.FC<CaseContextBarProps> = ({
  activeCase,
  investigatorName = 'Dr. Ananya Sharma',
  investigatorBadge = 'EMP-IPS-002',
  minTimestamp,
  maxTimestamp,
  lastUpdated = 'Just now',
  isLoading = false,
  onRefresh,
  onNavigateTab
}) => {
  // Compute duration text
  const durationText = React.useMemo(() => {
    if (!minTimestamp || !maxTimestamp) {
      return { range: '30-Day Operational Scope', days: 'Active Window' };
    }
    try {
      const start = new Date(minTimestamp);
      const end = new Date(maxTimestamp);
      const diffDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 3600 * 24)));
      const formatPart = (d: Date) => {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
      };
      return {
        range: `${formatPart(start)} – ${formatPart(end)}`,
        days: `${diffDays} days`
      };
    } catch {
      return { range: 'Operational Scope', days: 'Active' };
    }
  }, [minTimestamp, maxTimestamp]);

  return (
    <div className="flex flex-col gap-3 bg-card/60 backdrop-blur-md border border-border/80 rounded-2xl p-4 sm:p-5 shadow-xs select-none">
      {/* Top Header Row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left: Case Identity & Category Tags */}
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground truncate">
              {activeCase?.title || 'Operation Black Circuit'}
            </h1>
            <button className="text-muted-foreground/60 hover:text-amber-400 transition-colors" title="Pin Case">
              <Star className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
            <span className="font-mono font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">
              Case ID: {activeCase?.case_id || activeCase?.case_reference || 'INV-2026-BLACK-CIRCUIT'}
            </span>
            <span className="text-muted-foreground/40 hidden sm:inline">|</span>
            <span className="truncate max-w-md">
              {activeCase?.description || 'Cyber Fraud • Financial Crime • Multi-State Telecommunication Tracking'}
            </span>
          </div>
        </div>

        {/* Right: Operational Metadata Badges */}
        <div className="grid grid-cols-1 xs:grid-cols-2 sm:flex sm:items-center gap-2 sm:gap-4 flex-wrap w-full lg:w-auto">
          {/* Lead Investigator */}
          <div className="flex items-center gap-2.5 bg-secondary/50 border border-border/60 px-3 py-1.5 rounded-xl min-w-0">
            <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/25 flex items-center justify-center text-primary flex-shrink-0">
              <User className="w-4 h-4" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Lead Investigator</span>
              <span className="text-xs font-bold text-foreground truncate max-w-[130px]">{investigatorName}</span>
              <span className="text-[9px] font-mono text-muted-foreground/80">{investigatorBadge}</span>
            </div>
          </div>

          {/* Case Duration */}
          <div className="flex items-center gap-2.5 bg-secondary/50 border border-border/60 px-3 py-1.5 rounded-xl min-w-0">
            <div className="w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/25 flex items-center justify-center text-blue-400 flex-shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Case Duration</span>
              <span className="text-xs font-mono font-bold text-foreground truncate">{durationText.range}</span>
              <span className="text-[9px] font-mono text-muted-foreground/80">{durationText.days}</span>
            </div>
          </div>

          {/* Case Status Pill */}
          <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 px-3 py-1.5 rounded-xl text-xs font-bold shadow-xs col-span-1 xs:col-span-2 sm:col-span-1 justify-center sm:justify-start">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>{activeCase?.status || 'Active'}</span>
          </div>
        </div>
      </div>

      {/* Sub-navigation & Refresh Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-border/50">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide touch-scroll py-0.5 max-w-full">
          <button
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-primary text-primary-foreground shadow-xs shrink-0"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Overview</span>
          </button>

          <button
            onClick={() => onNavigateTab('entity-explorer')}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/70 transition-colors whitespace-nowrap"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Key Entities</span>
          </button>

          <button
            onClick={() => onNavigateTab('timeline')}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/70 transition-colors whitespace-nowrap"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Recent Activity</span>
          </button>

          <button
            onClick={() => onNavigateTab('anomalies')}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/70 transition-colors whitespace-nowrap"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Anomalies</span>
          </button>

          <button
            onClick={() => onNavigateTab('timeline')}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/70 transition-colors whitespace-nowrap"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Correlations</span>
          </button>

          <button
            onClick={() => onNavigateTab('data-sources')}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/70 transition-colors whitespace-nowrap"
          >
            <Database className="w-3.5 h-3.5" />
            <span>Evidence</span>
          </button>

          <button
            onClick={() => onNavigateTab('geospatial')}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/70 transition-colors whitespace-nowrap"
          >
            <Map className="w-3.5 h-3.5" />
            <span>Map</span>
          </button>

          <button
            onClick={() => onNavigateTab('reports')}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/70 transition-colors whitespace-nowrap"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Reports</span>
          </button>
        </div>

        {/* Refresh & Last Updated */}
        <div className="flex items-center gap-3 self-end sm:self-auto">
          <span className="text-[11px] font-mono text-muted-foreground whitespace-nowrap">
            Last Updated: <strong className="text-foreground">{lastUpdated}</strong>
          </span>

          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-secondary/80 hover:bg-secondary text-foreground border border-border rounded-lg text-xs font-semibold transition-colors shadow-xs"
            title="Refresh case intelligence"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin text-primary")} />
            <span>Refresh</span>
          </button>
        </div>
      </div>
    </div>
  );
};
export default CaseContextBar;
