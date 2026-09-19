import React from 'react';
import { Share2, ArrowRight, Phone, CreditCard, MessagesSquare, Clock, Sparkles } from 'lucide-react';
import { cn } from '../../utils/cn';
import { TemporalCorrelation } from '../../services/apiClient';

interface CrossDomainIntelligenceProps {
  correlations: TemporalCorrelation[];
  onNavigateTab: (tabId: string) => void;
  onFocusCorrelation?: (correlationId: string) => void;
}

export const CrossDomainIntelligence: React.FC<CrossDomainIntelligenceProps> = ({
  correlations,
  onNavigateTab,
  onFocusCorrelation
}) => {
  const topCorrelation = correlations.length > 0
    ? [...correlations].sort((a, b) => (b.correlation_score || 0) - (a.correlation_score || 0))[0]
    : null;

  return (
    <div className="bg-card/70 border border-border/80 rounded-2xl p-5 flex flex-col justify-between shadow-xs select-none">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold font-mono">
              8
            </span>
            <h3 className="text-sm font-bold tracking-tight text-foreground">
              Cross-Domain Intelligence
            </h3>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Detected temporal correlations and multi-domain sequences
          </p>
        </div>

        <button
          onClick={() => onNavigateTab('timeline')}
          className="text-xs font-bold text-primary hover:text-primary/80 transition-colors inline-flex items-center gap-1"
        >
          <span>View All</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Sequence Diagram Body */}
      {topCorrelation ? (
        <div className="flex flex-col gap-4 py-2">
          {/* Step Sequence Flow Nodes */}
          <div className="flex items-center justify-around gap-2 bg-secondary/40 border border-border/70 rounded-xl p-4">
            {/* Step 1: Telecom Call */}
            <div className="flex flex-col items-center text-center">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 flex items-center justify-center shadow-xs">
                <Phone className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-foreground mt-1.5">
                {topCorrelation.domain_a === 'TELECOM' ? 'Call' : topCorrelation.domain_a || 'Event A'}
              </span>
              <span className="text-[10px] font-mono text-muted-foreground">
                {topCorrelation.timestamp_a ? new Date(topCorrelation.timestamp_a).toISOString().slice(11, 16) : '09:42'}
              </span>
            </div>

            {/* Sequence Arrow 1 */}
            <div className="flex flex-col items-center text-muted-foreground/60">
              <span className="text-xs font-mono text-primary font-bold">
                {topCorrelation.time_delta_formatted || '7m'}
              </span>
              <span className="text-base font-bold">→</span>
            </div>

            {/* Step 2: Financial Transfer */}
            <div className="flex flex-col items-center text-center">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shadow-xs">
                <CreditCard className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-foreground mt-1.5">
                {topCorrelation.domain_b === 'FINANCIAL' ? 'Transfer' : topCorrelation.domain_b || 'Event B'}
              </span>
              <span className="text-[10px] font-mono text-muted-foreground">
                {topCorrelation.timestamp_b ? new Date(topCorrelation.timestamp_b).toISOString().slice(11, 16) : '09:48'}
              </span>
            </div>

            {/* Sequence Arrow 2 */}
            <div className="flex flex-col items-center text-muted-foreground/60">
              <span className="text-xs font-mono text-primary font-bold">
                +6m
              </span>
              <span className="text-base font-bold">→</span>
            </div>

            {/* Step 3: Social / Telemetry */}
            <div className="flex flex-col items-center text-center">
              <div className="w-10 h-10 rounded-xl bg-pink-500/15 border border-pink-500/30 text-pink-400 flex items-center justify-center shadow-xs">
                <MessagesSquare className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-foreground mt-1.5">
                Social
              </span>
              <span className="text-[10px] font-mono text-muted-foreground">
                09:55
              </span>
            </div>
          </div>

          {/* Correlation Description & Action */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-foreground">
                  3 events • {topCorrelation.time_delta_formatted ? `${topCorrelation.time_delta_formatted} delta` : '13 minutes'}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                  {topCorrelation.correlation_score ? `${Math.round(topCorrelation.correlation_score * 100)}% Relevance` : 'High Relevance'}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5 max-w-md">
                {topCorrelation.description || 'Temporal correlation sequence across telecom, financial, and social domains.'}
              </p>
            </div>

            <button
              onClick={() => {
                if (onFocusCorrelation) {
                  onFocusCorrelation(topCorrelation.correlation_id);
                } else {
                  onNavigateTab('timeline');
                }
              }}
              className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded-xl hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shadow-xs self-start sm:self-auto"
            >
              <span>View in Timeline</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="p-8 text-center text-xs text-muted-foreground italic">
          No cross-domain correlations detected yet.
        </div>
      )}
    </div>
  );
};
export default CrossDomainIntelligence;
