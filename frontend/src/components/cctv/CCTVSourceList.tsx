'use client';
import React, { useState, useMemo } from 'react';
import { Search, Filter, Camera, Building2, ShieldCheck, MapPin } from 'lucide-react';
import { CCTVSource } from '../../services/apiClient';
import { CCTVSourceCard } from './CCTVSourceCard';
import { cn } from '../../utils/cn';

interface Props {
  sources: CCTVSource[];
  selectedSource: CCTVSource | null;
  onSelectSource: (source: CCTVSource) => void;
  onVerifySource: (source: CCTVSource) => void;
  onAddToCase: (source: CCTVSource) => void;
}

export const CCTVSourceList: React.FC<Props> = ({
  sources,
  selectedSource,
  onSelectSource,
  onVerifySource,
  onAddToCase
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'GOVT' | 'PRIVATE' | 'VERIFIED' | 'NEAR'>('ALL');

  const filteredSources = useMemo(() => {
    return sources.filter((s) => {
      // Category / Type filter
      if (activeFilter === 'GOVT' && s.type !== 'GOVERNMENT_CCTV' && s.type !== 'GOVERNMENT_DEPLOYMENT') return false;
      if (activeFilter === 'PRIVATE' && s.type !== 'POTENTIAL_PRIVATE') return false;
      if (activeFilter === 'VERIFIED' && s.type !== 'INVESTIGATOR_VERIFIED') return false;
      if (activeFilter === 'NEAR' && s.distance_meters > 500) return false;

      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = s.name.toLowerCase().includes(q);
        const matchCategory = s.category.toLowerCase().includes(q);
        const matchAddr = (s.address || '').toLowerCase().includes(q);
        const matchWhy = s.why_relevant.toLowerCase().includes(q);
        if (!matchName && !matchCategory && !matchAddr && !matchWhy) return false;
      }

      return true;
    });
  }, [sources, activeFilter, searchQuery]);

  return (
    <div className="space-y-4">
      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-2.5">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search CCTV sources by name, sector, or category..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-secondary/70 border border-border rounded-xl text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto scrollbar-hide py-1">
          <button
            type="button"
            onClick={() => setActiveFilter('ALL')}
            className={cn(
              "text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors whitespace-nowrap",
              activeFilter === 'ALL'
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-secondary text-muted-foreground border-border hover:text-foreground"
            )}
          >
            All ({sources.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('GOVT')}
            className={cn(
              "text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors whitespace-nowrap flex items-center gap-1",
              activeFilter === 'GOVT'
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-secondary text-muted-foreground border-border hover:text-foreground"
            )}
          >
            <Camera className="w-3 h-3" />
            Government
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('PRIVATE')}
            className={cn(
              "text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors whitespace-nowrap flex items-center gap-1",
              activeFilter === 'PRIVATE'
                ? "bg-amber-600 text-white border-amber-600"
                : "bg-secondary text-muted-foreground border-border hover:text-foreground"
            )}
          >
            <Building2 className="w-3 h-3" />
            Private / Potential
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('VERIFIED')}
            className={cn(
              "text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors whitespace-nowrap flex items-center gap-1",
              activeFilter === 'VERIFIED'
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-secondary text-muted-foreground border-border hover:text-foreground"
            )}
          >
            <ShieldCheck className="w-3 h-3" />
            Verified
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('NEAR')}
            className={cn(
              "text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors whitespace-nowrap flex items-center gap-1",
              activeFilter === 'NEAR'
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-secondary text-muted-foreground border-border hover:text-foreground"
            )}
          >
            <MapPin className="w-3 h-3" />
            &lt; 500m
          </button>
        </div>
      </div>

      {/* Results Count */}
      <div className="text-xs text-muted-foreground font-medium flex items-center justify-between px-1">
        <span>Displaying {filteredSources.length} surveillance opportunities</span>
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="text-primary hover:underline text-[11px]"
          >
            Clear Search
          </button>
        )}
      </div>

      {/* Cards Grid */}
      {filteredSources.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredSources.map((source) => (
            <CCTVSourceCard
              key={source.id}
              source={source}
              isSelected={selectedSource?.id === source.id}
              onSelect={() => onSelectSource(source)}
              onVerify={() => onVerifySource(source)}
              onAddToCase={() => onAddToCase(source)}
            />
          ))}
        </div>
      ) : (
        <div className="p-12 text-center border border-dashed border-border rounded-2xl space-y-2">
          <Camera className="w-8 h-8 text-muted-foreground mx-auto" />
          <h4 className="text-sm font-bold text-foreground">No known CCTV sources identified</h4>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            We could not find matching CCTV sources with the current filter. Try expanding the search distance or clearing filters.
          </p>
        </div>
      )}
    </div>
  );
};
