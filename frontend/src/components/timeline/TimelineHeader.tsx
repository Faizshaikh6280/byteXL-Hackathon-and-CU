import React from 'react';
import { 
  Clock, Calendar, Filter, Share2, Download, Play, Pause, 
  RotateCcw, ZoomIn, Layers, Users, MapPin, Sparkles, AlertTriangle, 
  ChevronRight, ArrowLeftRight, Activity, Search, RefreshCw, Maximize2, Zap
} from 'lucide-react';
import { useTimelineStore, TimelineMode, TimelineZoom } from '../../store/useTimelineStore';
import { TimelineSummaryStats } from '../../services/apiClient';
import { cn } from '../../utils/cn';

interface TimelineHeaderProps {
  caseReference?: string;
  caseTitle?: string;
  summary: TimelineSummaryStats;
  entities: Array<{ id: string; name: string; cluster_id?: string; event_count: number }>;
  visibleEventsCount?: number;
  onRefresh?: () => void;
  onFitRange?: () => void;
  onFocusEpisode?: () => void;
}

const MODES: Array<{ id: TimelineMode; label: string; icon: any; tooltip: string }> = [
  { id: 'cross_domain', label: 'Cross-Domain', icon: Layers, tooltip: 'Correlated streams across Telecom, Banking, Social & Location' },
  { id: 'subject', label: 'Subject POI', icon: Users, tooltip: 'Single person / entity digital footprint' },
  { id: 'network', label: 'Network Multi-Lane', icon: Share2, tooltip: 'Parallel timelines of connected entities' },
  { id: 'map_sync', label: 'Map + Timeline', icon: MapPin, tooltip: 'Synchronized geographic waypoint tracking' },
  { id: 'storyline', label: 'Storyline Reconstruction', icon: Sparkles, tooltip: 'Evidence-backed chronological narrative sequences' },
];

const ZOOMS: Array<{ id: TimelineZoom; label: string; tooltip: string }> = [
  { id: 'minute', label: '30m', tooltip: '30-minute granular incident window' },
  { id: 'hour', label: '6h', tooltip: '6-hour operational shift window' },
  { id: 'day', label: '24h', tooltip: '24-hour daily cycle window' },
  { id: 'month', label: 'All Time', tooltip: 'Full investigation timespan' },
];

export const TimelineHeader: React.FC<TimelineHeaderProps> = ({
  caseReference = 'ACTIVE CASE',
  caseTitle = 'Investigation',
  summary,
  entities,
  visibleEventsCount,
  onRefresh,
  onFitRange,
  onFocusEpisode
}) => {
  const {
    activeMode,
    setActiveMode,
    zoomLevel,
    setZoomLevel,
    isFilterOpen,
    setIsFilterOpen,
    setIsExportModalOpen,
    timeRange,
    selectedEntityIds,
    setSelectedEntityIds,
    selectedDomains,
    selectedRiskLevels,
    onlyAnomalies,
    searchQuery
  } = useTimelineStore();

  // Count active applied filters
  const activeFilterCount = (searchQuery.trim() ? 1 : 0) +
    (onlyAnomalies ? 1 : 0) +
    (selectedEntityIds.length > 0 ? 1 : 0) +
    (selectedRiskLevels.length > 0 ? 1 : 0) +
    (selectedDomains.length < 8 ? 1 : 0);

  // Formatted active time range string
  const timeRangeLabel = timeRange[0] > 0 && timeRange[1] > timeRange[0]
    ? `${new Date(timeRange[0]).toISOString().slice(0, 10)} ${new Date(timeRange[0]).toISOString().slice(11, 16)} → ${new Date(timeRange[1]).toISOString().slice(0, 10)} ${new Date(timeRange[1]).toISOString().slice(11, 16)} UTC`
    : 'Full Investigation Timespan';

  return (
    <header className="flex flex-col border-b border-border bg-card/90 backdrop-blur-md z-20 select-none">
      {/* Top Strip: Case Lineage & Forensic Status Counters */}
      <div className="flex flex-wrap items-center justify-between px-2.5 sm:px-4 py-2 gap-2 sm:gap-3 border-b border-border/60">
        {/* Case Info */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="flex items-center gap-1.5 bg-primary/10 border border-primary/25 text-primary px-2 sm:px-2.5 py-0.5 rounded-md text-xs font-mono font-bold whitespace-nowrap shadow-xs">
            <Clock className="w-3.5 h-3.5" />
            <span className="truncate max-w-[120px] sm:max-w-none">{caseReference}</span>
          </div>

          <div className="flex items-center gap-2 truncate">
            <h1 className="text-xs sm:text-sm font-bold text-foreground tracking-tight truncate">
              {caseTitle}
            </h1>
            <span className="text-muted-foreground/50 text-xs hidden sm:inline">|</span>
            <span className="text-xs text-muted-foreground font-mono hidden md:inline truncate" title={timeRangeLabel}>
              {timeRangeLabel}
            </span>
          </div>
        </div>

        {/* Dynamic Metric Badges (Forensic High-Density, not oversized) */}
        <div className="flex items-center gap-1.5 sm:gap-2 text-xs flex-wrap">
          <div className="flex items-center gap-1.5 bg-secondary/80 border border-border px-2 sm:px-2.5 py-0.5 rounded-md" title={visibleEventsCount !== undefined ? `Showing ${visibleEventsCount} visible events out of ${summary.total_events} total events in case` : 'Total case events'}>
            <Activity className="w-3.5 h-3.5 text-primary" />
            <span className="font-mono font-bold text-foreground">
              {visibleEventsCount !== undefined ? `${visibleEventsCount} / ${summary.total_events}` : summary.total_events}
            </span>
            <span className="text-muted-foreground text-[11px] hidden xs:inline">Events</span>
          </div>

          <div className="flex items-center gap-1.5 bg-secondary/80 border border-border px-2 py-0.5 rounded-md">
            <Users className="w-3.5 h-3.5 text-indigo-400" />
            <span className="font-mono font-bold text-foreground">{summary.total_entities}</span>
            <span className="text-muted-foreground text-[11px] hidden xs:inline">Entities</span>
          </div>

          {summary.total_anomalies > 0 && (
            <div className="flex items-center gap-1.5 bg-destructive/10 border border-destructive/25 text-destructive px-2 py-0.5 rounded-md">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span className="font-mono font-bold">{summary.total_anomalies}</span>
              <span className="text-[11px] hidden xs:inline">Anomalies</span>
            </div>
          )}

          {summary.total_correlations > 0 && (
            <div className="flex items-center gap-1.5 bg-indigo-500/10 border border-indigo-500/25 text-indigo-400 px-2 py-0.5 rounded-md">
              <Share2 className="w-3.5 h-3.5" />
              <span className="font-mono font-bold">{summary.total_correlations}</span>
              <span className="text-[11px] hidden xs:inline">Correlations</span>
            </div>
          )}

          {summary.total_inconsistencies > 0 && (
            <div className="flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/25 text-rose-400 px-2 py-0.5 rounded-md">
              <span className="font-mono font-bold">{summary.total_inconsistencies}</span>
              <span className="text-[11px] hidden xs:inline">Warnings</span>
            </div>
          )}
        </div>

        {/* Global Workstation Action Buttons */}
        <div className="flex items-center gap-1.5">
          {onFocusEpisode && (
            <button
              onClick={onFocusEpisode}
              className="flex items-center gap-1 px-2 sm:px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-md text-xs font-semibold transition-colors shadow-xs cursor-pointer"
              title="Zoom directly into the peak incident burst window"
            >
              <Zap className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Focus Burst</span>
            </button>
          )}

          {onFitRange && (
            <button
              onClick={onFitRange}
              className="flex items-center gap-1 px-2 sm:px-2.5 py-1 bg-secondary/70 hover:bg-secondary text-muted-foreground hover:text-foreground border border-border rounded-md text-xs font-semibold transition-colors cursor-pointer"
              title="Fit timeline to full case event bounds"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Fit Bounds</span>
            </button>
          )}

          {onRefresh && (
            <button
              onClick={onRefresh}
              className="p-1.5 bg-secondary/70 hover:bg-secondary text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors cursor-pointer"
              title="Refresh timeline data"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className={cn(
              "flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-md text-xs font-semibold border transition-all cursor-pointer",
              isFilterOpen 
                ? "bg-primary text-primary-foreground border-primary shadow-xs" 
                : "bg-secondary/80 hover:bg-secondary text-foreground border-border"
            )}
            title="Toggle Filter Sidebar"
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className={cn(
                "px-1 rounded-full text-[10px] font-mono font-bold",
                isFilterOpen ? "bg-white text-primary" : "bg-primary text-primary-foreground"
              )}>
                {activeFilterCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setIsExportModalOpen(true)}
            className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 bg-secondary/80 hover:bg-secondary border border-border text-foreground rounded-md text-xs font-semibold transition-colors shadow-xs cursor-pointer"
            title="Court-Ready Dossier Export"
          >
            <Download className="w-3.5 h-3.5 text-muted-foreground" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Mode Navigation & Time Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between px-2.5 sm:px-4 py-1.5 gap-2 sm:gap-3 overflow-hidden">
        {/* Mode Switcher */}
        <nav className="flex items-center gap-1 bg-secondary/60 p-0.5 rounded-lg border border-border overflow-x-auto scrollbar-hide touch-scroll max-w-full">
          {MODES.map((mode) => (
            <button
              key={mode.id}
              onClick={() => setActiveMode(mode.id)}
              title={mode.tooltip}
              className={cn(
                "flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-md text-xs font-medium transition-all duration-150 shrink-0 whitespace-nowrap cursor-pointer",
                activeMode === mode.id
                  ? "bg-card text-foreground font-bold shadow-xs border border-border/80"
                  : "text-muted-foreground hover:text-foreground hover:bg-card/40"
              )}
            >
              <mode.icon className={cn("w-3.5 h-3.5 shrink-0", activeMode === mode.id ? "text-primary" : "text-muted-foreground")} />
              <span>{mode.label}</span>
            </button>
          ))}
        </nav>

        {/* Secondary controls: Subject Selector (if subject mode) & Zoom */}
        <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto scrollbar-hide touch-scroll max-w-full">
          {/* Entity Focus Selector for Subject Mode */}
          {activeMode === 'subject' && (
            <div className="flex items-center gap-1.5 bg-secondary/60 border border-border px-2.5 py-0.5 rounded-md">
              <span className="text-[11px] font-semibold text-muted-foreground">Subject:</span>
              <select
                value={selectedEntityIds[0] || ''}
                onChange={(e) => setSelectedEntityIds(e.target.value ? [e.target.value] : [])}
                className="bg-transparent text-xs font-bold text-foreground border-none outline-none cursor-pointer"
              >
                <option value="" className="bg-card">All Entities</option>
                {entities.map(ent => (
                  <option key={ent.id} value={ent.id} className="bg-card">
                    {ent.name} ({ent.event_count} events)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Zoom Level Pills */}
          <div className="flex items-center gap-1 bg-secondary/60 p-0.5 rounded-md border border-border">
            <span className="text-[9px] font-bold text-muted-foreground uppercase px-1.5 tracking-wider">
              Zoom:
            </span>
            {ZOOMS.map(z => (
              <button
                key={z.id}
                onClick={() => setZoomLevel(z.id)}
                title={z.tooltip}
                className={cn(
                  "px-2 py-0.5 rounded text-[11px] font-mono transition-colors",
                  zoomLevel === z.id
                    ? "bg-card text-primary font-bold shadow-xs border border-border/80"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {z.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
};
export default TimelineHeader;
