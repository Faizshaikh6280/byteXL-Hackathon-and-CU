'use client';
import React, { useState, useMemo } from 'react';
import { 
  Filter, Users, Phone, CreditCard, Radio, MessageSquare, 
  Laptop, Crosshair, Calendar, RefreshCw, Search, X, Check,
  ChevronDown, ShieldCheck
} from 'lucide-react';

export interface EntityFilterItem {
  id: string;
  name: string;
  color: [number, number, number];
  eventCount?: number;
  entityType?: string;
}

interface GeoFilterPanelProps {
  availableEntities: EntityFilterItem[];
  selectedEntities: string[];
  setSelectedEntities: (entities: string[]) => void;
  availableDomains: string[];
  selectedDomains: string[];
  setSelectedDomains: (domains: string[]) => void;
  minConfidence: number;
  setMinConfidence: (c: number) => void;
  timeRange: [number, number];
  onTimeRangeChange: (startMs: number, endMs: number) => void;
  onResetFilters: () => void;
  selectedLocationTypes?: string[];
  setSelectedLocationTypes?: (types: string[]) => void;
  onClose?: () => void;
}

export const GeoFilterPanel: React.FC<GeoFilterPanelProps> = ({
  availableEntities,
  selectedEntities,
  setSelectedEntities,
  availableDomains,
  selectedDomains,
  setSelectedDomains,
  minConfidence,
  setMinConfidence,
  timeRange,
  onTimeRangeChange,
  onResetFilters,
  onClose,
}) => {
  const [entitySearch, setEntitySearch] = useState('');
  const [activeTimePreset, setActiveTimePreset] = useState<'24H' | '7D' | '30D' | 'Custom'>('30D');

  // Filter entities by search term
  const filteredEntities = useMemo(() => {
    if (!entitySearch.trim()) return availableEntities;
    const q = entitySearch.toLowerCase();
    return availableEntities.filter(e => 
      e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q)
    );
  }, [availableEntities, entitySearch]);

  const toggleEntity = (entId: string) => {
    if (selectedEntities.includes(entId)) {
      setSelectedEntities(selectedEntities.filter(id => id !== entId));
    } else {
      setSelectedEntities([...selectedEntities, entId]);
    }
  };

  const selectAllEntities = () => {
    setSelectedEntities(availableEntities.map(e => e.id));
  };

  const clearEntities = () => {
    setSelectedEntities([]);
  };

  const isAllEntitiesSelected = selectedEntities.length === 0 || selectedEntities.length === availableEntities.length;

  const domainMetadata: Record<string, { label: string; icon: any; color: string }> = {
    TELECOM: { label: 'Call Records', icon: Phone, color: 'text-cyan-500' },
    FINANCIAL: { label: 'Transactions', icon: CreditCard, color: 'text-amber-500' },
    LOCATION: { label: 'Location / Cell Tower', icon: Radio, color: 'text-purple-500' },
    SOCIAL: { label: 'Social Media', icon: MessageSquare, color: 'text-pink-500' },
    NETWORK: { label: 'IP Logs', icon: Laptop, color: 'text-emerald-500' },
  };

  const allKnownDomains = ['TELECOM', 'FINANCIAL', 'LOCATION', 'SOCIAL', 'NETWORK'];

  const toggleDomain = (dom: string) => {
    if (selectedDomains.includes(dom)) {
      setSelectedDomains(selectedDomains.filter(d => d !== dom));
    } else {
      setSelectedDomains([...selectedDomains, dom]);
    }
  };

  const handlePresetSelect = (preset: '24H' | '7D' | '30D' | 'Custom') => {
    setActiveTimePreset(preset);
    const end = timeRange[1] || Date.now();
    if (preset === '24H') {
      onTimeRangeChange(end - 24 * 3600 * 1000, end);
    } else if (preset === '7D') {
      onTimeRangeChange(end - 7 * 24 * 3600 * 1000, end);
    } else if (preset === '30D') {
      onTimeRangeChange(end - 30 * 24 * 3600 * 1000, end);
    }
  };

  const formatDateShort = (ms: number) => {
    if (!ms || isNaN(ms)) return '';
    try {
      const d = new Date(ms);
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    } catch {
      return '';
    }
  };

  return (
    <div className="w-full flex flex-col h-full bg-card border-r border-border/70 select-none overflow-y-auto custom-scrollbar flex-shrink-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between sticky top-0 bg-card/95 backdrop-blur-md z-10">
        <div className="flex items-center gap-2 font-bold text-foreground text-xs uppercase tracking-wider">
          <Filter className="w-3.5 h-3.5 text-primary" />
          <span>Filters & Controls</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onResetFilters}
            className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
          >
            Reset All
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 text-muted-foreground hover:text-foreground rounded-md hover:bg-secondary transition-colors"
              title="Close filters"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="p-3 space-y-3 text-xs">
        {/* ================= ENTITIES SECTION ================= */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-foreground flex items-center gap-1.5 text-xs">
              <Users className="w-3.5 h-3.5 text-primary" />
              <span>Entities</span>
            </span>
            <div className="flex items-center gap-1.5 text-[11px]">
              <button onClick={selectAllEntities} className="text-primary hover:underline font-medium">All</button>
              <span className="text-border">|</span>
              <button onClick={clearEntities} className="text-muted-foreground hover:underline">Clear</button>
            </div>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-3 h-3 absolute left-2.5 top-2.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search entities..."
              value={entitySearch}
              onChange={e => setEntitySearch(e.target.value)}
              className="w-full bg-secondary/50 border border-border/70 rounded-lg pl-7 pr-6 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
            {entitySearch && (
              <button
                onClick={() => setEntitySearch('')}
                className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* All Entities Checkbox */}
          <label className="flex items-center gap-2 px-1.5 py-0.5 rounded-md hover:bg-secondary/50 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={isAllEntitiesSelected}
              onChange={() => isAllEntitiesSelected ? clearEntities() : selectAllEntities()}
              className="rounded border-border text-primary focus:ring-primary w-3.5 h-3.5 accent-primary cursor-pointer"
            />
            <span className="font-medium text-foreground text-xs flex-1">
              All Entities ({availableEntities.length})
            </span>
          </label>

          {/* Entities List */}
          <div className="space-y-0.5 max-h-28 overflow-y-auto pr-1 custom-scrollbar">
            {filteredEntities.map(ent => {
              const isChecked = selectedEntities.length === 0 || selectedEntities.includes(ent.id);
              const rgbStr = `rgb(${ent.color[0]}, ${ent.color[1]}, ${ent.color[2]})`;
              return (
                <label
                  key={ent.id}
                  className={`flex items-center gap-2 px-1.5 py-1 rounded-md cursor-pointer transition-all ${
                    isChecked ? 'bg-secondary/40 text-foreground' : 'opacity-60 text-muted-foreground hover:opacity-100 hover:bg-secondary/20'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleEntity(ent.id)}
                    className="rounded border-border text-primary focus:ring-primary w-3.5 h-3.5 accent-primary cursor-pointer"
                  />
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: rgbStr }}
                  />
                  <span className="font-medium truncate flex-1 text-xs">
                    {ent.name}
                  </span>
                  {ent.eventCount !== undefined && (
                    <span className="text-[10px] font-mono text-muted-foreground bg-secondary/80 px-1.5 py-0.2 rounded">
                      {ent.eventCount}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </div>

        {/* ================= TIME RANGE SECTION ================= */}
        <div className="space-y-2 pt-2.5 border-t border-border/60">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-foreground text-xs flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-primary" />
              <span>Time Range</span>
            </span>
          </div>

          {/* Presets */}
          <div className="grid grid-cols-4 gap-1 bg-secondary/40 p-1 rounded-lg border border-border/60">
            {(['24H', '7D', '30D', 'Custom'] as const).map(preset => (
              <button
                key={preset}
                onClick={() => handlePresetSelect(preset)}
                className={`py-0.5 text-[10px] font-medium rounded transition-all ${
                  activeTimePreset === preset
                    ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>

          {/* Dates Display / Inputs */}
          <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono">
            <div className="bg-secondary/40 border border-border/60 rounded-lg p-1.5 flex items-center gap-1">
              <Calendar className="w-3 h-3 text-muted-foreground flex-shrink-0" />
              <span className="truncate text-foreground">{formatDateShort(timeRange[0]) || '01/01/2026'}</span>
            </div>
            <div className="bg-secondary/40 border border-border/60 rounded-lg p-1.5 flex items-center gap-1">
              <Calendar className="w-3 h-3 text-muted-foreground flex-shrink-0" />
              <span className="truncate text-foreground">{formatDateShort(timeRange[1]) || '07/09/2026'}</span>
            </div>
          </div>
        </div>

        {/* ================= DATA TYPES SECTION ================= */}
        <div className="space-y-2 pt-2.5 border-t border-border/60">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-foreground text-xs">Data Types</span>
            <button
              onClick={() => setSelectedDomains([])}
              className="text-[11px] text-primary hover:underline font-medium"
            >
              Select All
            </button>
          </div>

          <div className="space-y-1">
            {allKnownDomains.map(dom => {
              const meta = domainMetadata[dom] || { label: dom, icon: Radio, color: 'text-primary' };
              const Icon = meta.icon;
              const isChecked = selectedDomains.length === 0 || selectedDomains.includes(dom);

              return (
                <label
                  key={dom}
                  className={`flex items-center gap-2 px-1.5 py-1 rounded-md cursor-pointer transition-all ${
                    isChecked ? 'bg-secondary/40 text-foreground' : 'opacity-50 text-muted-foreground hover:opacity-100 hover:bg-secondary/20'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleDomain(dom)}
                    className="rounded border-border text-primary focus:ring-primary w-3.5 h-3.5 accent-primary cursor-pointer"
                  />
                  <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
                  <span className="text-xs font-medium flex-1 truncate">{meta.label}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* ================= LOCATION TYPE ================= */}
        <div className="space-y-1.5 pt-2.5 border-t border-border/60">
          <span className="font-semibold text-foreground text-xs">Location Type</span>
          <select className="w-full bg-secondary/50 border border-border/70 rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary">
            <option value="ALL">All Locations</option>
            <option value="GPS">Exact (GPS)</option>
            <option value="TOWER">Area Level (Cell Tower)</option>
            <option value="IP">Approximate (IP)</option>
          </select>
        </div>

        {/* ================= CONFIDENCE SLIDER ================= */}
        <div className="space-y-1.5 pt-2.5 border-t border-border/60">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-primary" />
              <span>Confidence Level</span>
            </span>
            <span className="font-mono text-primary font-bold text-xs">
              {Math.round(minConfidence * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={minConfidence}
            onChange={e => setMinConfidence(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
};
