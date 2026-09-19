import React, { useState } from 'react';
import { 
  Search, Filter, Smartphone, CreditCard, MessagesSquare, MapPin, 
  Globe, AlertTriangle, ShieldCheck, X, Check, RotateCcw,
  ChevronDown, ChevronRight, User, Hash, Zap
} from 'lucide-react';
import { useTimelineStore } from '../../store/useTimelineStore';
import { DOMAIN_THEMES } from './timelineAdapters';
import { cn } from '../../utils/cn';

interface FilterSidebarProps {
  entities: Array<{ id: string; name: string; cluster_id?: string; event_count: number; risk_score?: number }>;
  domainCounts: Record<string, number>;
}

const RISK_LEVELS = [
  { id: 'CRITICAL', label: 'Critical', color: 'text-rose-500 bg-rose-500/10 border-rose-500/30' },
  { id: 'HIGH', label: 'High', color: 'text-orange-500 bg-orange-500/10 border-orange-500/30' },
  { id: 'MEDIUM', label: 'Medium', color: 'text-amber-500 bg-amber-500/10 border-amber-500/30' },
  { id: 'LOW', label: 'Low', color: 'text-blue-500 bg-blue-500/10 border-blue-500/30' }
];

export const TimelineFilterSidebar: React.FC<FilterSidebarProps> = ({
  entities,
  domainCounts
}) => {
  const {
    isFilterOpen,
    setIsFilterOpen,
    searchQuery,
    setSearchQuery,
    selectedDomains,
    toggleDomain,
    selectedRiskLevels,
    toggleRiskLevel,
    onlyAnomalies,
    setOnlyAnomalies,
    selectedEntityIds,
    toggleEntityId,
    setSelectedEntityIds,
    resetFilters
  } = useTimelineStore();

  const [entitySearch, setEntitySearch] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    domains: false,
    entities: false,
    risk: false
  });

  if (!isFilterOpen) return null;

  const toggleSection = (key: string) => {
    setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const filteredEntities = entities.filter(ent => 
    !entitySearch.trim() || ent.name.toLowerCase().includes(entitySearch.toLowerCase().trim())
  );

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      <div 
        onClick={() => setIsFilterOpen(false)}
        className="fixed inset-0 bg-black/50 z-30 md:hidden backdrop-blur-xs" 
      />
      <aside className="fixed md:static inset-y-0 left-0 z-40 md:z-15 w-72 max-w-[85vw] flex-shrink-0 border-r border-border bg-card md:bg-card/95 flex flex-col h-full shadow-2xl md:shadow-none animate-in slide-in-from-left duration-200 select-none">
      {/* Sidebar Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-primary" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
            Forensic Filters
          </h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={resetFilters}
            className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground rounded hover:bg-secondary transition-colors"
            title="Reset all filters to default"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>
          <button
            onClick={() => setIsFilterOpen(false)}
            className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-secondary transition-colors"
            title="Close sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter Options Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Keyword Search */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Corpus Search
          </label>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter actors, accounts, notes..."
              className="w-full bg-secondary/70 border border-border rounded-md pl-8 pr-7 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Forensic Anomaly Toggle */}
        <div className="flex items-center justify-between p-2.5 bg-destructive/5 border border-destructive/20 rounded-lg">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            <div>
              <div className="text-xs font-bold text-foreground">Anomalies Only</div>
              <div className="text-[10px] text-muted-foreground">Isolate flagged signals</div>
            </div>
          </div>
          <button
            onClick={() => setOnlyAnomalies(!onlyAnomalies)}
            className={cn(
              "w-9 h-5 rounded-full transition-colors relative p-0.5",
              onlyAnomalies ? "bg-destructive" : "bg-muted border border-border"
            )}
          >
            <div className={cn(
              "w-4 h-4 rounded-full bg-white transition-transform",
              onlyAnomalies ? "translate-x-4" : "translate-x-0"
            )} />
          </button>
        </div>

        {/* Investigative Domains Filter */}
        <div className="space-y-1.5 border-t border-border/40 pt-3">
          <button
            onClick={() => toggleSection('domains')}
            className="w-full flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            <span>Evidence Domains</span>
            {collapsedSections.domains ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {!collapsedSections.domains && (
            <div className="space-y-1 pt-1">
              {Object.entries(DOMAIN_THEMES).map(([domKey, cfg]) => {
                const isSelected = selectedDomains.includes(domKey);
                const count = domainCounts[domKey] || 0;
                const Icon = cfg.icon;

                return (
                  <button
                    key={domKey}
                    onClick={() => toggleDomain(domKey)}
                    className={cn(
                      "w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-all border",
                      isSelected
                        ? "bg-secondary/90 text-foreground border-border/80 font-medium"
                        : "bg-transparent text-muted-foreground border-transparent hover:bg-secondary/40 opacity-60"
                    )}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Icon className={cn("w-3.5 h-3.5 flex-shrink-0", cfg.color)} />
                      <span className="truncate text-[11px]">{cfg.shortLabel}</span>
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground bg-card/60 px-1.5 py-0.5 rounded border border-border/50 flex-shrink-0 ml-1">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Resolved Golden Entities Filter */}
        {entities.length > 0 && (
          <div className="space-y-1.5 border-t border-border/40 pt-3">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <button
                onClick={() => toggleSection('entities')}
                className="flex items-center gap-1 hover:text-foreground"
              >
                <span>Entities ({entities.length})</span>
                {collapsedSections.entities ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {selectedEntityIds.length > 0 && (
                <button
                  onClick={() => setSelectedEntityIds([])}
                  className="text-[10px] text-primary hover:underline font-normal capitalize"
                >
                  Clear ({selectedEntityIds.length})
                </button>
              )}
            </div>

            {!collapsedSections.entities && (
              <div className="space-y-2 pt-1">
                {/* Entity Search Input */}
                {entities.length > 5 && (
                  <div className="relative">
                    <input
                      type="text"
                      value={entitySearch}
                      onChange={(e) => setEntitySearch(e.target.value)}
                      placeholder="Search subject..."
                      className="w-full bg-secondary/50 border border-border rounded px-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                )}

                <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                  {filteredEntities.map(ent => {
                    const isSelected = selectedEntityIds.includes(ent.id);

                    return (
                      <button
                        key={ent.id}
                        onClick={() => toggleEntityId(ent.id)}
                        className={cn(
                          "w-full flex items-center justify-between px-2.5 py-1 rounded-md text-xs transition-all border",
                          isSelected
                            ? "bg-primary/15 border-primary/40 text-primary font-bold shadow-xs"
                            : "bg-transparent text-foreground border-transparent hover:bg-secondary/50"
                        )}
                      >
                        <span className="truncate max-w-[150px] text-left text-[11px]">{ent.name}</span>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {ent.risk_score !== undefined && ent.risk_score > 50 && (
                            <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
                          )}
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {ent.event_count}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Severity / Risk Filter */}
        <div className="space-y-1.5 border-t border-border/40 pt-3">
          <button
            onClick={() => toggleSection('risk')}
            className="w-full flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            <span>Severity Level</span>
            {collapsedSections.risk ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {!collapsedSections.risk && (
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              {RISK_LEVELS.map(r => {
                const isSelected = selectedRiskLevels.includes(r.id);
                return (
                  <button
                    key={r.id}
                    onClick={() => toggleRiskLevel(r.id)}
                    className={cn(
                      "flex items-center justify-between px-2 py-1 rounded text-[11px] font-semibold border transition-all",
                      isSelected ? r.color : "border-border text-muted-foreground hover:text-foreground bg-secondary/30"
                    )}
                  >
                    <span>{r.label}</span>
                    {isSelected && <Check className="w-3 h-3" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </aside>
  </>
);
};
export default TimelineFilterSidebar;
