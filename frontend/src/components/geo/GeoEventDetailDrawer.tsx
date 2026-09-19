'use client';
import React, { useState, useEffect } from 'react';
import { 
  X, MapPin, Shield, Clock, FileText, Activity, AlertTriangle, 
  ExternalLink, Copy, Check, ArrowLeftRight, Phone, CreditCard, Radio
} from 'lucide-react';
import { GeoCanonicalEvent, api } from '../../services/apiClient';

interface GeoEventDetailDrawerProps {
  event: GeoCanonicalEvent | null;
  onClose: () => void;
  onViewOnGraph?: (entityId: string) => void;
}

export const GeoEventDetailDrawer: React.FC<GeoEventDetailDrawerProps> = ({
  event,
  onClose,
  onViewOnGraph,
}) => {
  const [contextData, setContextData] = useState<any>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);
  const [copiedCoords, setCopiedCoords] = useState(false);

  useEffect(() => {
    if (!event) {
      setContextData(null);
      return;
    }

    setLoadingContext(true);
    api.getGeoSegmentContext(event.case_id, event.event_id, 1800)
      .then(res => setContextData(res))
      .catch(err => console.error("Error fetching geo context:", err))
      .finally(() => setLoadingContext(false));
  }, [event]);

  if (!event) return null;

  const copyToClipboard = (text: string, type: 'hash' | 'coords') => {
    navigator.clipboard.writeText(text);
    if (type === 'hash') {
      setCopiedHash(true);
      setTimeout(() => setCopiedHash(false), 2000);
    } else {
      setCopiedCoords(true);
      setTimeout(() => setCopiedCoords(false), 2000);
    }
  };

  const coordsString = `${event.latitude.toFixed(5)}, ${event.longitude.toFixed(5)}`;

  return (
    <div className="fixed top-14 right-0 bottom-0 w-96 bg-card/98 border-l border-border/80 shadow-2xl z-40 flex flex-col backdrop-blur-xl animate-in slide-in-from-right duration-200">
      {/* Drawer Header */}
      <div className="p-4 border-b border-border/70 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-primary" />
          <span className="font-bold text-sm text-foreground">Forensic Geo Event</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {/* Title & Entity Badge */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-primary/20 text-primary font-mono text-[10px] font-bold uppercase">
              {event.domain}
            </span>
            <span className="px-2 py-0.5 rounded bg-secondary text-foreground font-mono text-[10px] font-medium">
              {event.event_type}
            </span>
            <span className="ml-auto text-[10px] font-mono text-muted-foreground">
              {event.location_type}
            </span>
          </div>

          <h3 className="font-bold text-base text-foreground">
            {event.entity_name || event.entity_id || 'Unknown Subject'}
          </h3>
          <p className="text-muted-foreground flex items-center gap-1 text-[11px]">
            <MapPin className="w-3 h-3 flex-shrink-0" />
            <span>{event.location_name || event.address || 'Recorded Location'}</span>
          </p>
        </div>

        {/* Anomaly Badge if present */}
        {event.anomaly_score > 0 && (
          <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-300 space-y-1">
            <div className="flex items-center gap-1.5 font-bold">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
              <span>Spatial Anomaly Detected (Score: {event.anomaly_score})</span>
            </div>
            {event.anomaly_reasons.map((r, i) => (
              <p key={i} className="text-[11px] text-rose-200/90 pl-5">
                • {r}
              </p>
            ))}
          </div>
        )}

        {/* Spatial Precision Card */}
        <div className="p-3 rounded-lg bg-secondary/40 border border-border/60 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">Geographic Coordinates</span>
            <button
              onClick={() => copyToClipboard(coordsString, 'coords')}
              className="text-primary hover:underline flex items-center gap-1"
            >
              {copiedCoords ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              <span>{coordsString}</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-border/40 text-[11px]">
            <div>
              <span className="text-muted-foreground block text-[10px]">Precision Radius</span>
              <span className="font-mono text-foreground font-semibold">
                ~{event.accuracy_radius_meters}m
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px]">Confidence</span>
              <span className="font-mono text-primary font-semibold">
                {Math.round(event.location_confidence * 100)}%
              </span>
            </div>
          </div>

          {event.cell_tower_id && (
            <div className="pt-1.5 border-t border-border/40 text-[11px]">
              <span className="text-muted-foreground block text-[10px]">Cell Sector ID</span>
              <span className="font-mono text-amber-400 font-semibold flex items-center gap-1">
                <Radio className="w-3 h-3" />
                <span>{event.cell_tower_id}</span>
              </span>
            </div>
          )}
        </div>

        {/* Forensic Timestamp & Chronology */}
        <div className="p-3 rounded-lg bg-secondary/40 border border-border/60 space-y-1.5">
          <div className="flex items-center gap-1.5 font-bold text-foreground text-[11px]">
            <Clock className="w-3.5 h-3.5 text-primary" />
            <span>Temporal Lineage</span>
          </div>
          <div className="text-[11px] space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">ISO UTC:</span>
              <span className="font-mono text-foreground">{event.timestamp}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Verbatim Raw:</span>
              <span className="font-mono text-muted-foreground">{event.raw_timestamp}</span>
            </div>
            {event.timezone_offset && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Timezone:</span>
                <span className="font-mono text-muted-foreground">{event.timezone_offset}</span>
              </div>
            )}
          </div>
        </div>

        {/* Provenance & Cryptographic Chain of Custody */}
        <div className="p-3 rounded-lg bg-secondary/40 border border-border/60 space-y-1.5">
          <div className="flex items-center gap-1.5 font-bold text-foreground text-[11px]">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span>Evidence Provenance</span>
          </div>
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Evidence File:</span>
              <span className="font-mono text-foreground">{event.evidence_filename || 'source.csv'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Record ID:</span>
              <span className="font-mono text-muted-foreground">{event.event_id}</span>
            </div>
            {event.evidence_sha256 && (
              <div className="pt-1 border-t border-border/40">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-0.5">
                  <span>SHA-256 Digest:</span>
                  <button
                    onClick={() => copyToClipboard(event.evidence_sha256!, 'hash')}
                    className="text-primary hover:underline flex items-center gap-0.5"
                  >
                    {copiedHash ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
                    <span>Copy</span>
                  </button>
                </div>
                <p className="font-mono text-[9px] text-emerald-600 dark:text-emerald-400 break-all bg-secondary/70 p-1.5 rounded border border-border/50">
                  {event.evidence_sha256}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Before / After Activity Context */}
        <div className="p-3 rounded-lg bg-secondary/40 border border-border/60 space-y-2">
          <div className="flex items-center gap-1.5 font-bold text-foreground text-[11px]">
            <ArrowLeftRight className="w-3.5 h-3.5 text-cyan-400" />
            <span>Before & After Activity Context (±30m)</span>
          </div>

          {loadingContext ? (
            <div className="text-center py-3 text-muted-foreground text-xs">
              Analyzing temporal neighborhood...
            </div>
          ) : contextData ? (
            <div className="space-y-2">
              <p className="text-[11px] text-muted-foreground italic bg-secondary/50 p-2 rounded border border-border/40">
                {contextData.context_summary}
              </p>

              {/* Prior Events */}
              {contextData.prior_events?.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-cyan-500 dark:text-cyan-400 uppercase tracking-wider block">
                    Pre-Departure Activity ({contextData.prior_events.length})
                  </span>
                  <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                    {contextData.prior_events.slice(-3).map((pe: any, i: number) => (
                      <div key={i} className="p-1.5 rounded bg-secondary/60 border border-border/40 text-[10px]">
                        <div className="flex justify-between font-mono text-muted-foreground">
                          <span>{pe.event_type}</span>
                          <span>{pe.timestamp?.substring(11, 19)}</span>
                        </div>
                        <div className="text-foreground truncate">{pe.location_name || pe.domain}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Posterior Events */}
              {contextData.posterior_events?.length > 0 && (
                <div className="space-y-1 pt-1 border-t border-border/40">
                  <span className="text-[10px] font-bold text-emerald-500 dark:text-emerald-400 uppercase tracking-wider block">
                    Post-Arrival Activity ({contextData.posterior_events.length})
                  </span>
                  <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                    {contextData.posterior_events.slice(0, 3).map((pe: any, i: number) => (
                      <div key={i} className="p-1.5 rounded bg-secondary/60 border border-border/40 text-[10px]">
                        <div className="flex justify-between font-mono text-muted-foreground">
                          <span>{pe.event_type}</span>
                          <span>{pe.timestamp?.substring(11, 19)}</span>
                        </div>
                        <div className="text-foreground truncate">{pe.location_name || pe.domain}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-muted-foreground text-[11px]">No adjacent activity observed.</div>
          )}
        </div>

        {/* View on Graph Button */}
        {event.entity_id && onViewOnGraph && (
          <button
            onClick={() => onViewOnGraph(event.entity_id!)}
            className="w-full py-2 px-3 rounded-lg bg-primary/20 border border-primary/50 text-primary hover:bg-primary/30 font-medium text-xs flex items-center justify-center gap-1.5 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Investigate Entity on Graph</span>
          </button>
        )}
      </div>
    </div>
  );
};
