import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowLeftRight, Users, Plus, X, Clock, MapPin, Smartphone, CreditCard
} from 'lucide-react';
import { apiClient, TimelineCanonicalEvent } from '../../services/apiClient';
import { useTimelineStore } from '../../store/useTimelineStore';
import { TimelineEventMarker } from './TimelineEventMarker';
import { cn } from '../../utils/cn';

interface CompareViewProps {
  caseId?: string;
  availableEntities: Array<{ id: string; name: string; cluster_id?: string; event_count: number }>;
  onSelectEvent: (event: TimelineCanonicalEvent) => void;
}

export const TimelineCompareView: React.FC<CompareViewProps> = ({
  caseId,
  availableEntities,
  onSelectEvent
}) => {
  const {
    compareEntities,
    setCompareEntities,
    toggleCompareEntity,
    timeRange,
    currentTime,
    selectedEventId
  } = useTimelineStore();

  const [streams, setStreams] = useState<Record<string, TimelineCanonicalEvent[]>>({});
  const [loading, setLoading] = useState<boolean>(false);

  // Default comparison to first 2 entities if empty
  useEffect(() => {
    if (compareEntities.length === 0 && availableEntities.length >= 2) {
      setCompareEntities([availableEntities[0].name, availableEntities[1].name]);
    }
  }, [availableEntities, compareEntities, setCompareEntities]);

  useEffect(() => {
    if (compareEntities.length === 0) {
      setStreams({});
      return;
    }

    setLoading(true);
    apiClient.getTimelineCompare(compareEntities, caseId)
      .then(res => {
        setStreams(res || {});
      })
      .catch(err => {
        console.error("Failed to load compare streams:", err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [compareEntities, caseId]);

  const minMs = timeRange[0];
  const maxMs = timeRange[1];
  const timeSpan = Math.max(1, maxMs - minMs);

  const cursorXPct = Math.min(100, Math.max(0, ((currentTime - minMs) / timeSpan) * 100));

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden select-none">
      {/* Compare Header & Entity Picker Strip */}
      <div className="flex items-center justify-between px-6 py-2.5 border-b border-border bg-card/60 backdrop-blur-md gap-4">
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="w-4 h-4 text-primary" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
            Entity Temporal Trajectory Comparison
          </h3>
        </div>

        {/* Selected Compare Entities */}
        <div className="flex flex-wrap items-center gap-2">
          {compareEntities.map(ent => (
            <div
              key={ent}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 border border-primary/30 text-primary text-xs font-semibold rounded-md shadow-xs"
            >
              <span>{ent}</span>
              <button
                onClick={() => toggleCompareEntity(ent)}
                className="p-0.5 hover:text-destructive rounded transition-colors"
                title="Remove from comparison"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}

          {/* Add Entity Dropdown */}
          <select
            onChange={(e) => {
              if (e.target.value) {
                toggleCompareEntity(e.target.value);
                e.target.value = '';
              }
            }}
            defaultValue=""
            className="bg-secondary text-xs text-muted-foreground hover:text-foreground border border-border rounded-md px-2.5 py-1 cursor-pointer outline-none font-semibold"
          >
            <option value="" disabled>+ Add Entity to Compare</option>
            {availableEntities.filter(e => !compareEntities.includes(e.name)).map(e => (
              <option key={e.id} value={e.name} className="bg-card text-foreground">
                {e.name} ({e.event_count} events)
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Synchronized Parallel Comparison Lanes */}
      <div className="flex-1 overflow-y-auto relative p-6 space-y-4">
        {loading ? (
          <div className="py-12 text-center text-xs text-muted-foreground animate-pulse space-y-2">
            <div className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin mx-auto" />
            <span>Synchronizing comparison streams across temporal axis...</span>
          </div>
        ) : compareEntities.length === 0 ? (
          <div className="py-12 text-center text-xs text-muted-foreground">
            Select 2 or more entities above to compare temporal trajectories.
          </div>
        ) : (
          <div className="space-y-4 relative">
            {/* Global Scrubber Line across all compare lanes */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-cyan-400 z-30 pointer-events-none shadow-[0_0_10px_rgba(6,182,212,0.8)]"
              style={{ left: `${cursorXPct}%` }}
            />

            {compareEntities.map((entName, laneIdx) => {
              const streamEvents = streams[entName] || [];

              return (
                <div key={entName} className="bg-card border border-border rounded-xl p-3.5 shadow-sm space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                      <span className="font-bold text-foreground text-sm">{entName}</span>
                    </div>
                    <span className="font-mono text-muted-foreground text-[11px]">{streamEvents.length} events</span>
                  </div>

                  {/* Lane Canvas Track */}
                  <div className="h-16 bg-secondary/30 rounded-lg border border-border/40 relative flex items-center overflow-hidden">
                    <div className="w-full h-px border-t border-dashed border-border/30 absolute pointer-events-none" />

                    {streamEvents.map(ev => {
                      const xPct = Math.min(100, Math.max(0, ((ev.timestamp_ms - minMs) / timeSpan) * 100));
                      return (
                        <TimelineEventMarker
                          key={ev.event_id}
                          event={ev}
                          xPosition={xPct}
                          laneIndex={laneIdx}
                          isSelected={selectedEventId === ev.event_id}
                          onSelect={onSelectEvent}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
export default TimelineCompareView;
