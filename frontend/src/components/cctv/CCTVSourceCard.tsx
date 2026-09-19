'use client';
import React, { useState } from 'react';
import { 
  Camera, Building2, Phone, Globe, ShieldCheck, 
  MapPin, Check, Plus, AlertCircle, ChevronDown, ChevronUp, CheckCircle2 
} from 'lucide-react';
import { CCTVSource } from '../../services/apiClient';
import { cn } from '../../utils/cn';

interface Props {
  source: CCTVSource;
  isSelected?: boolean;
  onSelect?: () => void;
  onVerify?: () => void;
  onAddToCase?: () => void;
}

export const CCTVSourceCard: React.FC<Props> = ({
  source,
  isSelected,
  onSelect,
  onVerify,
  onAddToCase
}) => {
  const [showWhy, setShowWhy] = useState(false);

  const getTypeStyle = () => {
    switch (source.type) {
      case 'GOVERNMENT_CCTV':
        return {
          badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
          label: 'Government CCTV',
          dot: 'bg-blue-500'
        };
      case 'GOVERNMENT_DEPLOYMENT':
        return {
          badge: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
          label: 'Govt Deployment Evidence',
          dot: 'bg-indigo-500'
        };
      case 'INVESTIGATOR_VERIFIED':
        return {
          badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
          label: 'Investigator Verified',
          dot: 'bg-emerald-500'
        };
      default:
        return {
          badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
          label: 'Potential Private CCTV',
          dot: 'bg-amber-500'
        };
    }
  };

  const style = getTypeStyle();

  return (
    <div 
      onClick={onSelect}
      className={cn(
        "p-4 rounded-xl border transition-all duration-200 cursor-pointer bg-card/80 hover:bg-card relative group shadow-sm",
        isSelected ? "border-primary ring-1 ring-primary/40 shadow-md bg-card" : "border-border hover:border-border/80"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border flex items-center gap-1.5", style.badge)}>
              <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", style.dot)} />
              {style.label}
            </span>
            <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
              <MapPin className="w-3 h-3 text-primary/70" />
              {source.distance_meters < 1000 
                ? `${Math.round(source.distance_meters)}m from scene` 
                : `${(source.distance_meters / 1000).toFixed(2)}km from scene`}
            </span>
          </div>

          <h4 className="text-sm font-semibold text-foreground tracking-tight line-clamp-1 group-hover:text-primary transition-colors">
            {source.name}
          </h4>

          {source.address && (
            <p className="text-xs text-muted-foreground line-clamp-1">
              {source.address}
            </p>
          )}
        </div>

        {source.is_verified && (
          <span title="Verified by investigator" className="text-emerald-400 flex-shrink-0">
            <CheckCircle2 className="w-4 h-4" />
          </span>
        )}
      </div>

      {/* Details & Contacts */}
      <div className="mt-3 pt-2.5 border-t border-border/50 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        {source.phone ? (
          <a 
            href={`tel:${source.phone}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 text-foreground hover:text-primary transition-colors font-medium truncate"
            title={`Call ${source.phone}`}
          >
            <Phone className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
            <span className="truncate">{source.phone}</span>
          </a>
        ) : (
          <div className="flex items-center gap-1.5 text-muted-foreground/70 truncate">
            <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{source.category.replace(/_/g, ' ').toLowerCase()}</span>
          </div>
        )}

        <div className="text-right text-[11px] text-muted-foreground truncate" title={source.source_provenance}>
          Source: <span className="text-foreground/90 font-medium">{source.source_provenance}</span>
        </div>
      </div>

      {/* "Why Relevant?" Section */}
      <div className="mt-2.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowWhy(!showWhy);
          }}
          className="w-full flex items-center justify-between text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors py-1 px-1.5 rounded hover:bg-secondary/60"
        >
          <span>Why relevant?</span>
          {showWhy ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        {showWhy && (
          <div className="mt-1.5 p-2.5 rounded-lg bg-secondary/50 border border-border/40 text-xs text-foreground/90 space-y-1 animate-in fade-in duration-200">
            {source.why_relevant.split('\n').map((line, idx) => (
              <div key={idx} className={cn(
                "leading-relaxed",
                line.startsWith('✓') ? "text-emerald-400 font-medium" : (line.startsWith('⚠') ? "text-amber-400/90" : "text-muted-foreground")
              )}>
                {line}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="mt-3 pt-2.5 border-t border-border/40 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onVerify && onVerify();
          }}
          className="text-xs font-medium px-2.5 py-1 rounded-md border border-border text-foreground hover:bg-secondary hover:border-border/80 transition-colors flex items-center gap-1"
        >
          <ShieldCheck className="w-3 h-3 text-primary" />
          Verify
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAddToCase && onAddToCase();
          }}
          className={cn(
            "text-xs font-semibold px-2.5 py-1 rounded-md transition-colors flex items-center gap-1",
            source.is_added_to_case
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
        >
          {source.is_added_to_case ? (
            <>
              <Check className="w-3 h-3" />
              In Case
            </>
          ) : (
            <>
              <Plus className="w-3 h-3" />
              Add to Case
            </>
          )}
        </button>
      </div>
    </div>
  );
};
