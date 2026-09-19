import React from 'react';
import { TimelineCanonicalEvent } from '../../services/apiClient';
import { TimelineContextPanel } from './TimelineContextPanel';

interface EventDrawerProps {
  event: TimelineCanonicalEvent | null;
  onClose: () => void;
  onNavigateToGraph?: (entityId: string) => void;
  onNavigateToMap?: () => void;
}

export const TimelineEventDrawer: React.FC<EventDrawerProps> = ({
  event,
  onClose,
  onNavigateToGraph,
  onNavigateToMap
}) => {
  if (!event) return null;

  return (
    <TimelineContextPanel
      event={event}
      events={[event]}
      correlations={[]}
      bursts={[]}
      inconsistencies={[]}
      summary={{
        total_events: 1,
        total_entities: 1,
        total_anomalies: event.anomaly_score > 0 ? 1 : 0,
        total_correlations: 0,
        total_bursts: 0,
        total_inconsistencies: 0,
        domain_breakdown: { [event.domain]: 1 }
      }}
      onClose={onClose}
      onNavigateToGraph={onNavigateToGraph}
      onNavigateToMap={onNavigateToMap}
    />
  );
};
export default TimelineEventDrawer;
