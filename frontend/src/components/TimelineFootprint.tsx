import React from 'react';
import TimelineWorkspace from './timeline/TimelineWorkspace';

interface TimelineFootprintProps {
  caseId?: string;
  caseReference?: string;
  caseTitle?: string;
  onNavigateToGraph?: (entityId: string) => void;
  onNavigateToMap?: (entityId?: string) => void;
}

export default function TimelineFootprint(props: TimelineFootprintProps) {
  return <TimelineWorkspace {...props} />;
}
