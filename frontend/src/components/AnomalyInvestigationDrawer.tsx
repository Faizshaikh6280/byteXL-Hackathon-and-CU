'use client';

import React, { useState } from 'react';
import { 
  X, Network, ExternalLink, ShieldAlert, FileText, Activity, 
  Clock, MapPin, Hash, Sparkles, CheckCircle2, ChevronRight, Layers,
  Compass, AlertCircle, Phone, ArrowLeftRight, Landmark, ChevronDown,
  User, ShieldCheck, Cpu, Database
} from 'lucide-react';
import { AnomalyFinding } from '../services/apiClient';
import { cn } from '../utils/cn';

interface AnomalyInvestigationDrawerProps {
  anomaly: AnomalyFinding | null;
  onClose: () => void;
  onViewOnGraph: (entityId: string) => void;
  onViewInTimeline?: (entityId: string) => void;
  onViewOnMap?: (entityId: string) => void;
}

export default function AnomalyInvestigationDrawer({
  anomaly,
  onClose,
  onViewOnGraph,
  onViewInTimeline,
  onViewOnMap,
}: AnomalyInvestigationDrawerProps) {
  const [showTechnical, setShowTechnical] = useState(false);

  if (!anomaly) return null;

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case 'CRITICAL':
        return 'text-destructive bg-destructive/10 border-destructive/30';
      case 'HIGH':
        return 'text-orange-500 bg-orange-500/10 border-orange-500/30';
      case 'MEDIUM':
        return 'text-amber-500 bg-amber-500/10 border-amber-500/30';
      default:
        return 'text-blue-500 bg-blue-500/10 border-blue-500/30';
    }
  };

  const contributing = anomaly.contributingDetectors || anomaly.detectors || [anomaly.type];
  const detectorSummary = anomaly.detectorSummary || [];
  const primaryEntities = anomaly.primaryEntities || [];
  const relatedEntities = anomaly.relatedEntities || [];
  const supportingEvents = anomaly.supportingEvents || [];
  const timeline = anomaly.timelineContext?.sequence_steps || [];
  const spatial = anomaly.spatialContext;
  const graph = anomaly.graphContext;
  const whatHappened = anomaly.whatHappened || anomaly.reasons?.[0] || 'Pattern observed across telemetry lenses.';
  const whyUnusual = anomaly.whyUnusual || 'Observed sequence deviates from historical frequency baselines.';
  const whyRelevant = anomaly.whyRelevant || 'Relevant to core case targets and investigation timeline.';
  const priority = anomaly.investigativePriority || 'MEDIUM';
  const caseRel = anomaly.caseRelevance || 'HIGH';

  return (
    <>
      {/* Mobile Backdrop */}
      <div 
        onClick={onClose}
        className="fixed inset-0 bg-black/60 z-35 md:hidden backdrop-blur-xs" 
      />
      <div className="fixed inset-y-0 right-0 w-full sm:w-[600px] bg-background border-l border-border shadow-2xl z-40 flex flex-col animate-in slide-in-from-right duration-300">
        {/* Drawer Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border bg-card">
          <div className="flex items-center gap-3">
            <div className={cn("p-2 rounded-lg border", getSeverityBadge(anomaly.severity))}>
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-foreground text-sm leading-tight">
                {anomaly.title || 'Investigative Intelligence Finding'}
              </h3>
              <span className="text-[11px] font-mono text-muted-foreground">{anomaly.id}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Target Entity Overview Card */}
        <div className="bg-card border border-border p-5 rounded-xl space-y-4 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                Target Entity &amp; Identity
              </div>
              <div className="text-xl font-black text-foreground flex items-center gap-2">
                {anomaly.primaryEntities?.[0]?.display_name || anomaly.entityId}
                {anomaly.primaryEntities?.[0]?.display_name && anomaly.primaryEntities[0].display_name !== anomaly.entityId && (
                  <span className="text-xs font-mono font-bold text-muted-foreground bg-secondary px-2 py-0.5 rounded border border-border">
                    {anomaly.entityId}
                  </span>
                )}
              </div>
              {anomaly.primaryEntities?.[0]?.aliases && anomaly.primaryEntities[0].aliases.length > 0 && (
                <div className="text-xs text-primary font-medium mt-1">
                  Known Aliases: <span className="text-foreground font-semibold">{anomaly.primaryEntities[0].aliases.join(', ')}</span>
                </div>
              )}
              <div className="text-xs text-muted-foreground mt-1.5 flex flex-wrap items-center gap-3">
                <span>Type: <strong className="text-foreground">{anomaly.entityType || 'Person'}</strong></span>
                {anomaly.primaryEntities?.[0]?.phones && anomaly.primaryEntities[0].phones.length > 0 && (
                  <span>Phone: <strong className="text-foreground font-mono">{anomaly.primaryEntities[0].phones[0]}</strong></span>
                )}
                {anomaly.primaryEntities?.[0]?.accounts && anomaly.primaryEntities[0].accounts.length > 0 && (
                  <span>Account: <strong className="text-foreground font-mono">{anomaly.primaryEntities[0].accounts[0]}</strong></span>
                )}
                {anomaly.category && <span>Category: <strong className="text-foreground">{anomaly.category}</strong></span>}
              </div>
            </div>

            <div className="text-right">
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                Unified Score
              </div>
              <div className={cn("text-3xl font-black", 
                anomaly.severity === 'CRITICAL' ? 'text-destructive' :
                anomaly.severity === 'HIGH' ? 'text-orange-500' : 'text-amber-500'
              )}>
                {anomaly.score?.toFixed(0) || 0}
                <span className="text-xs font-bold text-muted-foreground">/100</span>
              </div>
              {anomaly.confidence && (
                <div className="text-[11px] font-mono text-emerald-500 font-bold">
                  {(anomaly.confidence * 100).toFixed(0)}% Confidence
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
            <span className={cn("text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded border", getSeverityBadge(anomaly.severity))}>
              {anomaly.severity}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-secondary text-foreground border border-border">
              Priority: {priority}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-secondary text-primary border border-primary/20">
              Case Relevance: {caseRel}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-secondary text-muted-foreground border border-border">
              Status: {anomaly.status || 'DETECTED'}
            </span>
          </div>

          {/* Quick Deep Navigation Actions */}
          <div className="grid grid-cols-3 gap-2 pt-2">
            <button
              onClick={() => onViewOnGraph(anomaly.entityId)}
              className="py-2 px-3 bg-primary text-primary-foreground text-xs font-bold rounded-lg hover:bg-primary/90 transition-all flex items-center justify-center gap-1.5 shadow-sm"
            >
              <Network className="w-3.5 h-3.5" /> Subgraph
            </button>

            {onViewInTimeline && (
              <button
                onClick={() => onViewInTimeline(anomaly.entityId)}
                className="py-2 px-3 bg-secondary text-foreground text-xs font-bold rounded-lg hover:bg-secondary/80 border border-border transition-all flex items-center justify-center gap-1.5"
              >
                <Clock className="w-3.5 h-3.5 text-primary" /> Timeline
              </button>
            )}

            {onViewOnMap && (
              <button
                onClick={() => onViewOnMap(anomaly.entityId)}
                className="py-2 px-3 bg-secondary text-foreground text-xs font-bold rounded-lg hover:bg-secondary/80 border border-border transition-all flex items-center justify-center gap-1.5"
              >
                <Compass className="w-3.5 h-3.5 text-emerald-500" /> Spatial Map
              </button>
            )}
          </div>
        </div>

        {/* SECTION 1: WHAT HAPPENED */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <FileText className="w-4 h-4 text-primary" />
            1. What Happened (Factual Event Sequence)
          </div>
          <div className="bg-secondary/30 border border-border rounded-xl p-4 text-xs text-foreground leading-relaxed font-medium">
            {whatHappened}
          </div>
        </div>

        {/* SECTION 2: WHY UNUSUAL */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Activity className="w-4 h-4 text-amber-500" />
            2. Why It Is Unusual (Baseline Comparison)
          </div>
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 text-xs text-foreground leading-relaxed">
            {whyUnusual}
          </div>
        </div>

        {/* SECTION 3: WHY RELEVANT TO THIS CASE */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            3. Why Relevant to This Investigation
          </div>
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 text-xs text-foreground leading-relaxed">
            {whyRelevant}
            {anomaly.relevanceReasons && anomaly.relevanceReasons.length > 0 && (
              <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                {anomaly.relevanceReasons.map((r, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-emerald-500 font-bold">•</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* SECTION 4: DETECTED BY (Engine Breakdown) */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Cpu className="w-4 h-4 text-primary" />
            4. Detected By ({contributing.length} Analytical Lenses)
          </div>
          <div className="bg-card border border-border rounded-xl p-3 space-y-2">
            {detectorSummary.length > 0 ? (
              detectorSummary.map((d, i) => (
                <div key={i} className="p-2.5 bg-secondary/40 rounded-lg text-xs space-y-1 border border-border/50">
                  <div className="flex items-center justify-between font-mono font-bold text-foreground">
                    <span>{d.detector_id}</span>
                    <span className="text-emerald-500">{(d.confidence * 100).toFixed(0)}% Conf</span>
                  </div>
                  {d.observations && Object.keys(d.observations).length > 0 && (
                    <div className="text-[11px] text-muted-foreground">
                      Observations: {JSON.stringify(d.observations)}
                    </div>
                  )}
                </div>
              ))
            ) : (
              contributing.map((det, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b border-border/50 last:border-none">
                  <span className="font-mono font-bold text-foreground">{det}</span>
                  <span className="text-emerald-500 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Corroborated
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* SECTION 5: SUPPORTING EVIDENCE & PROVENANCE */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Database className="w-4 h-4 text-primary" />
            5. Supporting Evidence & Cryptographic Provenance
          </div>

          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            {supportingEvents.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Verified Canonical Events ({supportingEvents.length})
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {supportingEvents.slice(0, 8).map((ev, i) => (
                    <div key={i} className="p-2 bg-secondary/30 rounded border border-border/50 text-xs flex justify-between items-center">
                      <div>
                        <span className="font-bold text-foreground">{ev.event_type}</span>
                        {ev.amount_inr ? <span className="text-primary font-bold"> • ₹{ev.amount_inr.toLocaleString()}</span> : null}
                        {ev.location ? <span className="text-muted-foreground"> ({ev.location})</span> : null}
                      </div>
                      <span className="font-mono text-[10px] text-muted-foreground">{ev.timestamp}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {anomaly.evidence_refs && anomaly.evidence_refs.length > 0 && (
              <div className="space-y-1 pt-2 border-t border-border">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Linked Evidence Files & Integrity Hashes
                </div>
                <div className="space-y-1 text-xs font-mono text-muted-foreground">
                  {anomaly.evidence_refs.map((ref, i) => (
                    <div key={i} className="truncate flex items-center gap-1.5">
                      <Hash className="w-3 h-3 text-primary flex-shrink-0" />
                      <span>{ref}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* SECTION 6: TIMELINE CONTEXT */}
        {timeline.length > 0 && (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <Clock className="w-4 h-4 text-primary" />
              6. Chronological Sequence ({timeline.length} Steps)
            </div>
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              {timeline.map((step, i) => (
                <div key={i} className="flex items-start gap-3 text-xs relative">
                  <div className="w-5 h-5 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center flex-shrink-0 text-[10px] border border-primary/20">
                    {step.step_index || i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-foreground">
                      {step.description}
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                      Offset: <span className="text-primary font-bold">{step.time_offset}</span> • {step.timestamp}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SECTION 7: GRAPH CONTEXT */}
        {graph && (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <Network className="w-4 h-4 text-primary" />
              7. Graph Structural Context
            </div>
            <div className="bg-card border border-border rounded-xl p-4 text-xs space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Structural Role:</span>
                <span className="font-bold text-foreground bg-secondary px-2 py-0.5 rounded border border-border">
                  {graph.structural_role || 'Participant'}
                </span>
              </div>
              {graph.role_description && (
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {graph.role_description}
                </p>
              )}
              {graph.betweenness_centrality ? (
                <div className="flex justify-between text-[11px] font-mono text-muted-foreground pt-1 border-t border-border">
                  <span>Betweenness Centrality:</span>
                  <span className="font-bold text-primary">{graph.betweenness_centrality.toFixed(4)}</span>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* SECTION 8: SPATIAL CONTEXT */}
        {spatial && spatial.available && (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <Compass className="w-4 h-4 text-emerald-500" />
              8. Geospatial Movement Context
            </div>
            <div className="bg-card border border-border rounded-xl p-4 text-xs space-y-2">
              <div className="text-foreground font-semibold">
                {spatial.movement_description}
              </div>
              {spatial.waypoints && spatial.waypoints.length > 0 && (
                <div className="space-y-1 pt-2">
                  <div className="text-[10px] font-bold uppercase text-muted-foreground">Recorded Coordinates</div>
                  {spatial.waypoints.map((wp: any, i: number) => (
                    <div key={i} className="text-[11px] font-mono text-muted-foreground flex justify-between">
                      <span>{wp.name || `Point ${i+1}`}</span>
                      <span>({wp.lat.toFixed(4)}, {wp.lng.toFixed(4)})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* SECTION 9: RELATED ENTITIES & ALIASES */}
        {(primaryEntities.length > 0 || relatedEntities.length > 0) && (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <User className="w-4 h-4 text-primary" />
              9. Resolved Entities & Co-Conspirators
            </div>
            <div className="bg-card border border-border rounded-xl p-4 space-y-2 text-xs">
              {primaryEntities.map((e, i) => (
                <div key={i} className="flex justify-between items-center py-1 border-b border-border/50 last:border-none">
                  <div>
                    <div className="font-bold text-foreground">{e.display_name}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{e.entity_id}</div>
                  </div>
                  <span className="text-[10px] font-bold uppercase bg-primary/10 text-primary px-2 py-0.5 rounded">
                    Primary Target
                  </span>
                </div>
              ))}
              {relatedEntities.map((e, i) => (
                <div key={i} className="flex justify-between items-center py-1">
                  <div>
                    <div className="font-bold text-foreground">{e.display_name}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{e.entity_id}</div>
                  </div>
                  <span className="text-[10px] font-bold uppercase bg-secondary text-muted-foreground px-2 py-0.5 rounded">
                    Related
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SECTION 10: TECHNICAL DETAILS (Collapsible) */}
        <div className="space-y-2 border-t border-border pt-4">
          <button
            onClick={() => setShowTechnical(!showTechnical)}
            className="w-full flex items-center justify-between p-3 bg-secondary/40 hover:bg-secondary/70 rounded-xl text-xs font-bold text-muted-foreground transition-colors"
          >
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" />
              10. Advanced Technical & Algorithm Parameters
            </div>
            <ChevronDown className={cn("w-4 h-4 transition-transform", showTechnical && "rotate-180")} />
          </button>

          {showTechnical && (
            <div className="bg-card border border-border rounded-xl p-4 space-y-3 text-xs font-mono">
              <table className="w-full text-left">
                <tbody className="divide-y divide-border">
                  <tr className="hover:bg-secondary/30">
                    <td className="py-1.5 text-muted-foreground">Pattern ID</td>
                    <td className="py-1.5 text-foreground font-bold text-right">{anomaly.patternType || anomaly.type}</td>
                  </tr>
                  <tr className="hover:bg-secondary/30">
                    <td className="py-1.5 text-muted-foreground">Fingerprint</td>
                    <td className="py-1.5 text-foreground font-bold text-right">{anomaly.id}</td>
                  </tr>
                  <tr className="hover:bg-secondary/30">
                    <td className="py-1.5 text-muted-foreground">Evidence Quality</td>
                    <td className="py-1.5 text-emerald-500 font-bold text-right">{anomaly.evidenceQuality || 'HIGH'}</td>
                  </tr>
                </tbody>
              </table>

              {anomaly.metrics && Object.keys(anomaly.metrics).length > 0 && (
                <div className="pt-2 border-t border-border">
                  <div className="text-[10px] font-bold text-muted-foreground mb-1">Raw Features JSON:</div>
                  <pre className="p-2.5 bg-secondary/40 rounded text-[10px] overflow-x-auto text-foreground">
                    {JSON.stringify(anomaly.metrics, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  </>
);
}

export { AnomalyInvestigationDrawer };
