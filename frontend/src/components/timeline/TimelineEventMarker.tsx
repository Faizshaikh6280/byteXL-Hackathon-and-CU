import React, { useState } from 'react';
import { 
  Smartphone, CreditCard, MessagesSquare, MapPin, Globe, AlertTriangle, 
  Sparkles, Link2, ShieldAlert, Phone, ArrowUpRight, RadioTower, HelpCircle,
  FileSearch, UserCheck, Activity
} from 'lucide-react';
import { TimelineCanonicalEvent } from '../../services/apiClient';
import { 
  getDomainTheme, 
  getEpistemicConfig, 
  getRiskConfig, 
  isPrimaryEvent,
  formatINR, 
  formatEventDateTime 
} from './timelineAdapters';
import { cn } from '../../utils/cn';

interface TimelineEventMarkerProps {
  event: TimelineCanonicalEvent;
  xPosition: number; // percentage along time axis (0 - 100)
  laneIndex: number;
  isSelected: boolean;
  isCorrelatedActive?: boolean;
  yOffset?: number; // vertical pixel stagger to prevent overlapping events
  onSelect: (event: TimelineCanonicalEvent) => void;
}

/* ── Domain-specific marker styling: hardcoded hex colors + icons ── */
const DOMAIN_MARKER_STYLE: Record<string, { bg: string; hoverBg: string; text: string }> = {
  FINANCIAL:  { bg: '#059669', hoverBg: '#10b981', text: '#ffffff' },  // emerald
  TELECOM:    { bg: '#4f46e5', hoverBg: '#6366f1', text: '#ffffff' },  // indigo
  LOCATION:   { bg: '#d97706', hoverBg: '#f59e0b', text: '#000000' },  // amber
  SOCIAL:     { bg: '#db2777', hoverBg: '#ec4899', text: '#ffffff' },  // pink
  NETWORK:    { bg: '#0891b2', hoverBg: '#06b6d4', text: '#ffffff' },  // cyan
  GENERAL:    { bg: '#7c3aed', hoverBg: '#8b5cf6', text: '#ffffff' },  // violet
  KYC:        { bg: '#0d9488', hoverBg: '#14b8a6', text: '#ffffff' },  // teal
  ANALYTICAL: { bg: '#e11d48', hoverBg: '#f43f5e', text: '#ffffff' },  // rose
};

const DEFAULT_MARKER_STYLE = { bg: '#64748b', hoverBg: '#94a3b8', text: '#ffffff' };

function getDomainMarkerStyle(domain?: string) {
  if (!domain) return DEFAULT_MARKER_STYLE;
  return DOMAIN_MARKER_STYLE[domain.toUpperCase()] || DEFAULT_MARKER_STYLE;
}

export const TimelineEventMarker: React.FC<TimelineEventMarkerProps> = ({
  event,
  xPosition,
  laneIndex,
  isSelected,
  isCorrelatedActive = false,
  yOffset = 0,
  onSelect
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const domainCfg = getDomainTheme(event.domain);
  const epistemicCfg = getEpistemicConfig(event.epistemic_status);
  const riskCfg = getRiskConfig(event.risk_level, event.anomaly_score);
  const isPrimary = isPrimaryEvent(event);
  // Only flag genuinely elevated anomalies (>= 40) — avoid marking 80%+ of events
  const isAnomaly = (event.anomaly_score || 0) >= 40 || event.risk_level === 'CRITICAL';
  const isCriticalAnomaly = event.risk_level === 'CRITICAL' || (event.anomaly_score || 0) >= 80;
  const hasCorrelation = event.correlation_ids && event.correlation_ids.length > 0;
  const isDerived = event.epistemic_status === 'DERIVED';
  const isHypothesis = event.epistemic_status === 'HYPOTHESIS';

  const timeInfo = formatEventDateTime(event.normalized_timestamp, event.timezone_offset);
  const markerStyle = getDomainMarkerStyle(event.domain);

  // Pick specific forensic icon based on event type & domain
  const getEventGlyph = () => {
    const typeUpper = (event.event_type || '').toUpperCase();
    const domainUpper = (event.domain || '').toUpperCase();
    if (typeUpper.includes('CALL') || typeUpper.includes('TELECOM')) return Phone;
    if (typeUpper.includes('SMS') || typeUpper.includes('MESSAGE') || typeUpper.includes('SOCIAL')) return MessagesSquare;
    if (typeUpper.includes('TRANSFER') || typeUpper.includes('BANK') || typeUpper.includes('PAY') || typeUpper.includes('DEBIT') || typeUpper.includes('CREDIT')) return CreditCard;
    if (typeUpper.includes('LOCATION') || typeUpper.includes('TOWER') || typeUpper.includes('GPS') || typeUpper.includes('NFC')) return MapPin;
    if (typeUpper.includes('IP') || typeUpper.includes('NETWORK') || typeUpper.includes('SESSION')) return Globe;
    if (typeUpper.includes('ANOMALY') || typeUpper.includes('ALERT')) return AlertTriangle;
    if (typeUpper.includes('IDENTITY') || typeUpper.includes('KYC')) return UserCheck;
    if (domainUpper === 'GENERAL') return Activity;
    if (domainUpper === 'KYC') return UserCheck;
    return domainCfg.icon;
  };

  const EventIcon = getEventGlyph();

  // Size: smaller markers to prevent overwhelming overlap
  const markerSize = isDerived ? 20 : isHypothesis ? 18 : isPrimary ? 22 : 16;
  const iconSize = isPrimary ? 11 : 9;

  return (
    <div
      className={cn(
        "absolute top-1/2 cursor-pointer transition-all duration-150 select-none",
        isSelected ? "z-40" : isHovered ? "z-50" : isCorrelatedActive ? "z-30" : "z-10"
      )}
      style={{ 
        left: `${Math.min(99.5, Math.max(0.5, xPosition))}%`,
        transform: `translate(-50%, calc(-50% + ${yOffset}px))`
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(event);
      }}
      role="button"
      tabIndex={0}
      aria-label={`${event.event_type} (${event.domain}) at ${event.normalized_timestamp}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(event);
        }
      }}
    >
      {/* Visual Marker Node — using inline styles for guaranteed domain color rendering */}
      <div
        className={cn(
          "flex items-center justify-center transition-all duration-200 relative group",
          isDerived && "rotate-45 rounded-sm border-2 border-amber-400",
          isHypothesis && "rounded-full border-2 border-dashed",
          !isDerived && !isHypothesis && "rounded-md border border-white/30",
          // Selection & hover glow
          isSelected && "ring-3 ring-white ring-offset-1 ring-offset-background",
          isHovered && !isSelected && "brightness-110",
          isCorrelatedActive && !isSelected && "ring-2 ring-primary/70 ring-offset-1 ring-offset-background"
        )}
        style={{
          width: markerSize,
          height: markerSize,
          backgroundColor: isDerived
            ? 'rgba(245,158,11,0.2)'
            : isHypothesis
              ? 'rgba(168,85,247,0.15)'
              : isHovered ? markerStyle.hoverBg : markerStyle.bg,
          color: isDerived ? '#f59e0b' : isHypothesis ? '#a855f7' : markerStyle.text,
          boxShadow: isSelected
            ? '0 0 0 3px rgba(99,102,241,0.8), 0 0 12px rgba(99,102,241,0.5)'
            : isCriticalAnomaly
              ? '0 0 6px rgba(244,63,94,0.5)'
              : isHovered
                ? '0 2px 8px rgba(0,0,0,0.3)'
                : '0 1px 3px rgba(0,0,0,0.2)',
          transform: isSelected ? 'scale(1.3)' : isHovered ? 'scale(1.15)' : 'scale(1)',
        }}
      >
        {/* Core Domain Icon inside the marker */}
        {isDerived ? (
          <Sparkles style={{ width: iconSize, height: iconSize }} className="-rotate-45" />
        ) : (
          <EventIcon style={{ width: iconSize, height: iconSize }} />
        )}

        {/* Anomaly Flag Pip — only for genuinely flagged anomalies */}
        {isAnomaly && (
          <div 
            className="absolute -top-1 -right-1 rounded-full bg-rose-500 ring-1 ring-white/80 flex items-center justify-center"
            style={{ width: 8, height: 8 }}
            title={`Anomaly Score: ${event.anomaly_score?.toFixed(0) || '?'}/100`}
          >
            <span className="w-1 h-1 rounded-full bg-white" />
          </div>
        )}

        {/* Correlation ring indicator */}
        {hasCorrelation && !isDerived && (
          <span 
            className="absolute rounded-md border border-dashed border-indigo-400/60 pointer-events-none" 
            style={{ inset: -3 }}
          />
        )}
      </div>

      {/* Floating Hover Tooltip */}
      {isHovered && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-card/95 backdrop-blur-md border border-border rounded-lg shadow-xl p-2.5 z-50 pointer-events-none animate-in fade-in zoom-in-95 duration-150 text-left">
          {/* Tooltip Header */}
          <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-1 mb-1.5">
            <div className="flex items-center gap-1.5">
              <div 
                className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                style={{ backgroundColor: markerStyle.bg }} 
              />
              <span className="text-[10px] font-bold uppercase tracking-wider text-foreground truncate">
                {event.event_type}
              </span>
            </div>
            <span className="text-[9px] font-mono text-muted-foreground whitespace-nowrap">
              {timeInfo.time} {timeInfo.tz}
            </span>
          </div>

          {/* Tooltip Body */}
          <div className="space-y-0.5 text-[11px]">
            {event.entity_name && (
              <div className="font-semibold text-foreground truncate">
                {event.entity_name}
              </div>
            )}

            {event.amount_inr !== undefined && event.amount_inr !== null && event.amount_inr > 0 ? (
              <div className="text-emerald-400 font-mono font-bold text-xs">
                {formatINR(event.amount_inr)} {event.channel ? `via ${event.channel}` : ''}
              </div>
            ) : null}

            {event.counterparty && (
              <div className="text-[10px] text-muted-foreground truncate">
                → <span className="text-foreground font-mono">{event.counterparty}</span>
              </div>
            )}

            {event.location_name && (
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground truncate">
                <MapPin className="w-2.5 h-2.5 flex-shrink-0 text-amber-400" />
                <span className="truncate">{event.location_name}</span>
              </div>
            )}

            {/* Epistemic + Evidence Row */}
            <div className="flex items-center justify-between pt-0.5 border-t border-border/40 text-[9px]">
              <span className={cn("font-semibold uppercase tracking-wider px-1 rounded", epistemicCfg.badgeClass)}>
                {epistemicCfg.label}
              </span>
              <span className="font-mono text-muted-foreground truncate ml-1">
                {event.evidence_id}
              </span>
            </div>

            {/* Anomaly Flag */}
            {isAnomaly && (
              <div className="pt-0.5 border-t border-destructive/20 text-destructive text-[10px] font-bold flex items-center gap-1">
                <AlertTriangle className="w-2.5 h-2.5 flex-shrink-0" />
                <span className="truncate">{event.anomaly_reasons?.[0] || `Score: ${event.anomaly_score?.toFixed(0) || '?'}/100`}</span>
              </div>
            )}

            {/* Correlation Notice */}
            {hasCorrelation && (
              <div className="text-[9px] text-primary flex items-center gap-1 mt-0.5">
                <Link2 className="w-2.5 h-2.5 flex-shrink-0" />
                <span>{event.correlation_ids.length} Correlation(s)</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
export default TimelineEventMarker;
