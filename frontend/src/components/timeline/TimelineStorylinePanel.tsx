import React, { useState, useEffect } from 'react';
import { 
  Sparkles, Clock, ArrowDown, Smartphone, CreditCard, MessagesSquare, 
  MapPin, Globe, AlertTriangle, ShieldCheck, Download, Share2, Link2, ExternalLink
} from 'lucide-react';
import { StorylineSequence, StorylineStep, apiClient } from '../../services/apiClient';
import { useTimelineStore } from '../../store/useTimelineStore';
import { getDomainTheme, formatINR } from './timelineAdapters';
import { cn } from '../../utils/cn';

interface StorylinePanelProps {
  caseId?: string;
  onSelectEvent?: (eventId: string) => void;
}

export const TimelineStorylinePanel: React.FC<StorylinePanelProps> = ({
  caseId,
  onSelectEvent
}) => {
  const [storylines, setStorylines] = useState<StorylineSequence[]>([]);
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const { setSelectedEventId } = useTimelineStore();

  useEffect(() => {
    setLoading(true);
    apiClient.getTimelineStorylines(caseId)
      .then(data => {
        setStorylines(data);
        if (data.length > 0) {
          setSelectedStoryId(data[0].sequence_id);
        }
      })
      .catch(err => {
        console.error("Failed to load storylines:", err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [caseId]);

  const activeStory = storylines.find(s => s.sequence_id === selectedStoryId) || storylines[0];

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-muted-foreground text-xs space-y-2">
        <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        <span>Synthesizing multi-domain temporal storylines...</span>
      </div>
    );
  }

  if (storylines.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
        <Sparkles className="w-8 h-8 text-primary/40 mb-3" />
        <h4 className="text-sm font-bold text-foreground">No Storylines Reconstructed Yet</h4>
        <p className="text-xs max-w-md mt-1 text-muted-foreground">
          Storylines are generated when tightly coupled multi-domain temporal correlations (calls, transfers, location movements) are identified.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden bg-background select-none">
      {/* Mobile Episode Selector Strip (md:hidden) */}
      <div className="md:hidden border-b border-border bg-card/90 p-2.5 flex items-center gap-2 overflow-x-auto scrollbar-hide touch-scroll flex-shrink-0">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground pl-1 pr-2 border-r border-border/60 flex-shrink-0">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span>Episodes</span>
        </div>
        {storylines.map((story) => (
          <button
            key={story.sequence_id}
            onClick={() => setSelectedStoryId(story.sequence_id)}
            className={cn(
              "flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all whitespace-nowrap",
              story.sequence_id === selectedStoryId
                ? "bg-primary text-primary-foreground border-primary shadow-xs"
                : "bg-secondary/60 text-muted-foreground border-border hover:text-foreground"
            )}
          >
            {story.title}
          </button>
        ))}
      </div>

      {/* Storyline Master List Sidebar (Desktop) */}
      <div className="hidden md:flex w-80 flex-shrink-0 border-r border-border bg-card/40 flex-col h-full">
        <div className="px-4 py-3 border-b border-border bg-card">
          <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span>Reconstructed Episodes ({storylines.length})</span>
          </h3>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {storylines.map((story) => {
            const isSelected = story.sequence_id === selectedStoryId;
            return (
              <button
                key={story.sequence_id}
                onClick={() => setSelectedStoryId(story.sequence_id)}
                className={cn(
                  "w-full text-left p-3 rounded-lg border transition-all shadow-xs",
                  isSelected
                    ? "bg-primary/10 border-primary text-primary shadow-sm font-medium"
                    : "bg-card hover:bg-secondary/40 border-border text-foreground"
                )}
              >
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-bold truncate">{story.title}</span>
                  <span className="font-mono text-[10px] text-muted-foreground ml-2">{story.total_duration_formatted}</span>
                </div>
                <p className="text-[11px] text-muted-foreground line-clamp-2">{story.summary}</p>
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/40 text-[10px] text-muted-foreground">
                  <span className="bg-secondary px-1.5 py-0.5 rounded font-mono">{story.steps.length} steps</span>
                  <span className="bg-secondary px-1.5 py-0.5 rounded font-mono truncate">{story.domain_span.join(', ')}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Storyline Detail Flow */}
      {activeStory && (
        <div className="flex-1 flex flex-col h-full overflow-y-auto p-3 sm:p-6 space-y-4 sm:space-y-6">
          {/* Header Card */}
          <div className="bg-card border border-border rounded-xl p-3.5 sm:p-5 shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase text-primary tracking-wider">{activeStory.category}</span>
                <h2 className="text-base sm:text-lg font-bold text-foreground mt-0.5">{activeStory.title}</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono bg-secondary border border-border px-2.5 py-1 rounded-md text-foreground">
                  Duration: <strong className="text-primary">{activeStory.total_duration_formatted}</strong>
                </span>
              </div>
            </div>

            {/* Evidence-Grounded System Intelligence */}
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3.5 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
                <ShieldCheck className="w-4 h-4" />
                <span>Deterministic Intelligence Assessment</span>
              </div>
              <p className="text-xs text-foreground/90 leading-relaxed">
                {activeStory.intelligence_assessment}
              </p>
            </div>
          </div>

          {/* Sequential Step Cards with Delta Connectors */}
          <div className="max-w-2xl mx-auto w-full space-y-2 relative pb-12">
            {activeStory.steps.map((step, idx) => {
              const domainCfg = getDomainTheme(step.domain);
              const Icon = domainCfg.icon;

              return (
                <React.Fragment key={step.step_index}>
                  {/* Delta Connector */}
                  {idx > 0 && (
                    <div className="flex items-center justify-center py-1">
                      <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-secondary border border-border text-[10px] font-mono font-bold text-muted-foreground shadow-xs">
                        <ArrowDown className="w-3 h-3 text-primary" />
                        <span>{step.time_offset_from_prev} later</span>
                      </div>
                    </div>
                  )}

                  {/* Step Card */}
                  <div
                    onClick={() => {
                      setSelectedEventId(step.event_id);
                      if (onSelectEvent) onSelectEvent(step.event_id);
                    }}
                    className={cn(
                      "bg-card hover:bg-secondary/40 border border-border hover:border-primary/50 rounded-xl p-4 shadow-sm transition-all cursor-pointer group relative",
                      step.is_anomaly && "border-destructive/40 bg-destructive/5"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <div className={cn("w-6 h-6 rounded-md border flex items-center justify-center", domainCfg.bg, domainCfg.border)}>
                          <Icon className={cn("w-3.5 h-3.5", domainCfg.color)} />
                        </div>
                        <span className="text-xs font-bold text-foreground uppercase tracking-wider">{step.event_type}</span>
                        {step.is_anomaly && (
                          <span className="text-[9px] bg-destructive text-destructive-foreground font-bold px-1.5 py-0.5 rounded">
                            ANOMALY
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-mono text-muted-foreground">
                        {step.timestamp.replace('T', ' ').slice(0, 19)} UTC
                      </span>
                    </div>

                    <p className="text-sm text-foreground font-medium mb-2">
                      {step.summary}
                    </p>

                    <div className="flex flex-wrap items-center justify-between text-xs gap-2 pt-2 border-t border-border/40 text-muted-foreground">
                      <div className="flex items-center gap-2">
                        {step.amount_inr && step.amount_inr > 0 && (
                          <span className="font-mono text-emerald-400 font-bold">
                            {formatINR(step.amount_inr)}
                          </span>
                        )}
                        {step.location && (
                          <span className="flex items-center gap-1 text-amber-400">
                            <MapPin className="w-3 h-3" /> {step.location}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-primary group-hover:underline flex items-center gap-1">
                        <span>Inspect Evidence Dossier</span>
                        <ExternalLink className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
export default TimelineStorylinePanel;
