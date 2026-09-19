'use client';
import React from 'react';
import { GeoWorkspace } from './geo/GeoWorkspace';

interface GeospatialMapProps {
  onViewOnGraph?: (entityId: string) => void;
}

export default function GeospatialMap({ onViewOnGraph }: GeospatialMapProps) {
  return <GeoWorkspace onViewOnGraph={onViewOnGraph} />;
}
