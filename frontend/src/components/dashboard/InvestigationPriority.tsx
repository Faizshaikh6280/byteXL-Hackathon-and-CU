import React from 'react';
import { 
  AlertTriangle, Share2, AlertCircle, Users, ArrowRight,
  Sparkles, ExternalLink, Zap
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { AnomalyFinding, TemporalCorrelation, ActivityBurst, GoldenProfile } from '../../services/apiClient';
import { formatTimestamp } from './dashboardAdapters';

export interface PrioritySignal {
  id: string;
  category: 'CRITICAL_ANOMALY' | 'CROSS_DOMAIN' | 'INCONSISTENCY_BURST' | 'ENTITY_INTEREST';
  badgeLabel: string;
  badgeClass: string;
  badgeIcon: any;
  title: string;
  subtitle: string;
  timestampStr: string;
  domainLabel: string;
  domainClass: string;
  riskLabel: string;
  riskClass: string;
  actionLabel: string;
  onAction: () => void;
}

interface InvestigationPriorityProps {
  anomalies: AnomalyFinding[];
  correlations: TemporalCorrelation[];
  bursts: ActivityBurst[];
  profiles: GoldenProfile[];
  onNavigateTab: (tabId: string) => void;
  onFocusCorrelation?: (correlationId: string) => void;
  onFocusEntity?: (entityId: string) => void;
}

export const InvestigationPriority: React.FC<InvestigationPriorityProps> = ({
  anomalies,
  correlations,
  bursts,
  profiles,
  onNavigateTab,
  onFocusCorrelation,
  onFocusEntity
}) => {
  // Synthesize up to 4 real prioritized signals from real backend data
  const signals = React.useMemo<PrioritySignal[]>(() => {
    const list: PrioritySignal[] = [];

    // 1. Top Critical Anomaly
    if (anomalies.length > 0) {
      const topAnom = [...anomalies].sort((a, b) => (b.score || 0) - (a.score || 0))[0];
      const timeInfo = formatTimestamp(topAnom.detectedAt || Date.now());
      list.push({
        id: `sig-anom-${topAnom.id}`,
        category: 'CRITICAL_ANOMALY',
        badgeLabel: 'Critical Anomaly',
        badgeClass: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
        badgeIcon: AlertTriangle,
        title: topAnom.title || 'Unusual operational pattern detected',
        subtitle: (topAnom.whatHappened || topAnom.whyUnusual || 'High-severity investigative anomaly identified by detection engine.').slice(0, 85) + '...',
        timestampStr: `${timeInfo.date}, ${timeInfo.time.slice(0, 5)}`,
        domainLabel: topAnom.category || 'Multi-Domain',
        domainClass: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
        riskLabel: topAnom.severity === 'CRITICAL' ? 'Critical' : 'High Risk',
        riskClass: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
        actionLabel: 'Investigate',
        onAction: () => onNavigateTab('anomalies')
      });
    }

    // 2. Top Cross-Domain Correlation
    if (correlations.length > 0) {
      const topCorr = [...correlations].sort((a, b) => (b.correlation_score || 0) - (a.correlation_score || 0))[0];
      const timeInfo = formatTimestamp(topCorr.timestamp_a || Date.now());
      list.push({
        id: `sig-corr-${topCorr.correlation_id}`,
        category: 'CROSS_DOMAIN',
        badgeLabel: 'Cross-Domain',
        badgeClass: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
        badgeIcon: Share2,
        title: `${topCorr.domain_a || 'Telecom'} → ${topCorr.domain_b || 'Financial'} Temporal Link`,
        subtitle: topCorr.description || `Correlation (${topCorr.time_delta_formatted || 'short time'}) involving ${topCorr.actor_a || 'target'}.`,
        timestampStr: `${timeInfo.date}, ${timeInfo.time.slice(0, 5)}`,
        domainLabel: 'Multi-Domain',
        domainClass: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
        riskLabel: 'High Relevance',
        riskClass: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
        actionLabel: 'View Sequence',
        onAction: () => {
          if (onFocusCorrelation) {
            onFocusCorrelation(topCorr.correlation_id);
          } else {
            onNavigateTab('timeline');
          }
        }
      });
    }

    // 3. High-Velocity Burst / Inconsistency
    if (bursts.length > 0) {
      const topBurst = [...bursts].sort((a, b) => (b.event_count || 0) - (a.event_count || 0))[0];
      const timeInfo = formatTimestamp(topBurst.start_time || Date.now());
      list.push({
        id: `sig-burst-${topBurst.burst_id}`,
        category: 'INCONSISTENCY_BURST',
        badgeLabel: 'Activity Burst',
        badgeClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
        badgeIcon: Zap,
        title: `High-Density Episode: ${topBurst.event_count} events in ${Math.round(topBurst.duration_seconds / 60)}m`,
        subtitle: topBurst.description || `Simultaneous activity across ${topBurst.entity_count || 'multiple'} entities in tight window.`,
        timestampStr: `${timeInfo.date}, ${timeInfo.time.slice(0, 5)}`,
        domainLabel: 'Multi-Domain',
        domainClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
        riskLabel: topBurst.severity || 'Medium Risk',
        riskClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
        actionLabel: 'View Details',
        onAction: () => onNavigateTab('timeline')
      });
    }

    // 4. Key Target Entity of Interest
    if (profiles.length > 0) {
      const topTarget = [...profiles].sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0))[0];
      const identCount = (topTarget.known_phones?.length || 0) + (topTarget.known_accounts?.length || 0) + (topTarget.known_aliases?.length || 0);
      list.push({
        id: `sig-ent-${topTarget.z_cluster_id}`,
        category: 'ENTITY_INTEREST',
        badgeLabel: 'Entity of Interest',
        badgeClass: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
        badgeIcon: Users,
        title: `${topTarget.primary_name || topTarget.z_cluster_id} (Resolved Cluster)`,
        subtitle: `${identCount} linked identifiers (phones, accounts, aliases) exhibiting elevated risk.`,
        timestampStr: 'Resolved Active',
        domainLabel: 'Entity Target',
        domainClass: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
        riskLabel: `${Math.round((topTarget.risk_score || 0.8) * 100)}% Risk`,
        riskClass: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
        actionLabel: 'View Entity',
        onAction: () => {
          if (onFocusEntity) {
            onFocusEntity(topTarget.z_cluster_id);
          } else {
            onNavigateTab('entity-explorer');
          }
        }
      });
    }

    return list.slice(0, 4);
  }, [anomalies, correlations, bursts, profiles, onNavigateTab, onFocusCorrelation, onFocusEntity]);

  return (
    <div className="bg-card/70 border border-border/80 rounded-2xl p-5 flex flex-col justify-between shadow-xs select-none">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold font-mono">
              5
            </span>
            <h3 className="text-sm font-bold tracking-tight text-foreground">
              Investigation Priority
            </h3>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Top actionable signals requiring immediate investigator attention
          </p>
        </div>

        <button
          onClick={() => onNavigateTab('anomalies')}
          className="text-xs font-bold text-primary hover:text-primary/80 transition-colors inline-flex items-center gap-1"
        >
          <span>View All</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Signals List */}
      <div className="flex flex-col gap-2.5">
        {signals.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground italic">
            No critical investigation signals pending review. Case telemetry within baseline thresholds.
          </div>
        ) : (
          signals.map((sig) => {
            const BadgeIcon = sig.badgeIcon;
            return (
              <div
                key={sig.id}
                className="bg-secondary/40 hover:bg-secondary/70 border border-border/70 hover:border-primary/40 rounded-xl p-3 flex flex-col md:flex-row md:items-center justify-between gap-3 transition-colors shadow-2xs"
              >
                {/* Left: Category Badge */}
                <div className="flex items-center gap-2 flex-shrink-0 w-auto md:w-36">
                  <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold border whitespace-nowrap", sig.badgeClass)}>
                    <BadgeIcon className="w-3 h-3 flex-shrink-0" />
                    <span>{sig.badgeLabel}</span>
                  </div>
                </div>

                {/* Center: Title & Description */}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-foreground truncate">
                    {sig.title}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate mt-0.5" title={sig.subtitle}>
                    {sig.subtitle}
                  </div>
                </div>

                {/* Meta & Actions Row on Mobile */}
                <div className="flex items-center justify-between md:justify-end gap-2.5 flex-wrap pt-2 md:pt-0 border-t border-border/30 md:border-t-0">
                  {/* Meta: Timestamp & Domain */}
                  <div className="flex items-center gap-2 text-[10px] flex-shrink-0">
                    <span className="font-mono text-muted-foreground whitespace-nowrap">
                      {sig.timestampStr}
                    </span>
                    <span className={cn("px-1.5 py-0.5 rounded border text-[10px] font-medium whitespace-nowrap", sig.domainClass)}>
                      {sig.domainLabel}
                    </span>
                  </div>

                  {/* Right: Risk Badge & Action Button */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap", sig.riskClass)}>
                      {sig.riskLabel}
                    </span>

                    <button
                      onClick={sig.onAction}
                      className="flex items-center gap-1 px-2.5 py-1 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-bold rounded-lg transition-colors shadow-xs"
                    >
                      <span>{sig.actionLabel}</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
export default InvestigationPriority;
