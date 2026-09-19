import React from 'react';
import { ArrowRight, ChevronRight, ExternalLink } from 'lucide-react';
import { cn } from '../../utils/cn';
import { TimelineCanonicalEvent } from '../../services/apiClient';
import { getDashboardDomainStyle, formatINR, formatTimestamp } from './dashboardAdapters';

interface RecentIntelligenceTableProps {
  events: TimelineCanonicalEvent[];
  onNavigateTab: (tabId: string) => void;
  onSelectEvent?: (eventId: string) => void;
}

export const RecentIntelligenceTable: React.FC<RecentIntelligenceTableProps> = ({
  events,
  onNavigateTab,
  onSelectEvent
}) => {
  // Sort latest events descending and take top 6
  const latestEvents = React.useMemo(() => {
    return [...events]
      .sort((a, b) => b.timestamp_ms - a.timestamp_ms)
      .slice(0, 6);
  }, [events]);

  return (
    <div className="bg-card/70 border border-border/80 rounded-2xl p-5 flex flex-col justify-between shadow-xs select-none">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold font-mono">
              7
            </span>
            <h3 className="text-sm font-bold tracking-tight text-foreground">
              Recent Intelligence
            </h3>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Latest cross-domain events recorded in canonical stream
          </p>
        </div>

        <button
          onClick={() => onNavigateTab('timeline')}
          className="text-xs font-bold text-primary hover:text-primary/80 transition-colors inline-flex items-center gap-1"
        >
          <span>View Full Timeline</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Forensic Table Container */}
      <div className="overflow-x-auto touch-scroll -mx-2 px-2 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[580px] text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-border/60 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              <th className="pb-2 font-mono">Time</th>
              <th className="pb-2">Event</th>
              <th className="pb-2">Details</th>
              <th className="pb-2">Entities</th>
              <th className="pb-2">Domain</th>
              <th className="pb-2">Risk</th>
              <th className="pb-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {latestEvents.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-xs text-muted-foreground italic">
                  No canonical events recorded yet. Ingest evidence files to populate timeline.
                </td>
              </tr>
            ) : (
              latestEvents.map((ev) => {
                const domStyle = getDashboardDomainStyle(ev.domain);
                const DomIcon = domStyle.icon;
                const timeInfo = formatTimestamp(ev.normalized_timestamp);

                // Risk configuration
                const isCritical = ev.risk_level === 'CRITICAL' || (ev.anomaly_score || 0) >= 80;
                const isHigh = ev.risk_level === 'HIGH' || (ev.anomaly_score || 0) >= 60;
                const isMed = ev.risk_level === 'MEDIUM' || (ev.anomaly_score || 0) >= 30;

                const riskClass = isCritical
                  ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                  : isHigh
                    ? 'bg-orange-500/15 text-orange-400 border-orange-500/30'
                    : isMed
                      ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                      : 'bg-blue-500/15 text-blue-400 border-blue-500/30';
                const riskLabel = isCritical ? 'Critical' : isHigh ? 'High' : isMed ? 'Medium' : 'Low';

                // Details string
                let detailsStr = ev.narration || '';
                if (ev.amount_inr && ev.amount_inr > 0) {
                  detailsStr = `${formatINR(ev.amount_inr)} ${ev.counterparty ? `→ ${ev.counterparty}` : ''} ${ev.channel ? `(${ev.channel})` : ''}`;
                } else if (ev.location_name) {
                  detailsStr = ev.location_name;
                } else if (ev.client_ip) {
                  detailsStr = `IP: ${ev.client_ip} ${ev.destination_ip ? `→ ${ev.destination_ip}` : ''}`;
                } else if (ev.duration_seconds) {
                  detailsStr = `Duration: ${Math.round(ev.duration_seconds)}s`;
                }

                const entityStr = ev.entity_name || (ev.actor_entities && ev.actor_entities[0]) || 'Unknown Entity';

                return (
                  <tr 
                    key={ev.event_id} 
                    className="hover:bg-secondary/40 transition-colors group cursor-pointer"
                    onClick={() => {
                      if (onSelectEvent) onSelectEvent(ev.event_id);
                      onNavigateTab('timeline');
                    }}
                  >
                    {/* Time */}
                    <td className="py-2.5 font-mono text-muted-foreground whitespace-nowrap">
                      {timeInfo.time}
                    </td>

                    {/* Event Type with Icon */}
                    <td className="py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <div className={cn("p-1 rounded-md border flex-shrink-0", domStyle.bgClass, domStyle.borderClass, domStyle.textClass)}>
                          <DomIcon className="w-3 h-3" />
                        </div>
                        <span className="font-bold text-foreground">
                          {ev.event_type?.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </td>

                    {/* Details */}
                    <td className="py-2.5 max-w-[200px] truncate text-muted-foreground" title={detailsStr}>
                      {detailsStr || 'Standard canonical record'}
                    </td>

                    {/* Entities */}
                    <td className="py-2.5 max-w-[130px] truncate font-semibold text-foreground" title={entityStr}>
                      {entityStr}
                    </td>

                    {/* Domain Pill */}
                    <td className="py-2.5 whitespace-nowrap">
                      <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-bold border", domStyle.bgClass, domStyle.borderClass, domStyle.textClass)}>
                        {domStyle.label}
                      </span>
                    </td>

                    {/* Risk Pill */}
                    <td className="py-2.5 whitespace-nowrap">
                      <span className={cn("px-1.5 py-0.5 rounded-full text-[10px] font-bold border", riskClass)}>
                        {riskLabel}
                      </span>
                    </td>

                    {/* Action */}
                    <td className="py-2.5 text-right whitespace-nowrap">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onSelectEvent) onSelectEvent(ev.event_id);
                          onNavigateTab('timeline');
                        }}
                        className="text-[11px] font-bold text-primary hover:text-primary/80 inline-flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform"
                      >
                        <span>View</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
export default RecentIntelligenceTable;
