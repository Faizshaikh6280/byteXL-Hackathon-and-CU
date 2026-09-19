'use client';

import React from 'react';
import { 
  AlertTriangle, ShieldAlert, Phone, Landmark, Globe, Radio, Cpu, 
  Zap, Share2, CheckCircle, XCircle, Clock, ShieldCheck, ArrowRight
} from 'lucide-react';
import { CEPAlert, CEPAlertMicroTimelineItem } from '../services/apiClient';
import { cn } from '../utils/cn';

interface AlertTriageCardProps {
  alert: CEPAlert;
  onTriage: (alertId: string, status: 'INVESTIGATING' | 'ASSIGNED' | 'DISMISSED') => void;
  onPivotToGraph?: (entityId: string) => void;
  isProcessing?: boolean;
}

export const AlertTriageCard: React.FC<AlertTriageCardProps> = ({
  alert,
  onTriage,
  onPivotToGraph,
  isProcessing = false
}) => {
  const getRiskBadge = (level: string, score: number) => {
    switch (level) {
      case 'CRITICAL':
        return {
          badge: 'bg-rose-500/10 text-rose-500 border-rose-500/30',
          dot: 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)] animate-pulse',
          border: 'border-rose-500/30 hover:border-rose-500/60'
        };
      case 'HIGH':
        return {
          badge: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
          dot: 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]',
          border: 'border-amber-500/30 hover:border-amber-500/60'
        };
      case 'MEDIUM':
        return {
          badge: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
          dot: 'bg-blue-400',
          border: 'border-blue-500/30 hover:border-blue-500/60'
        };
      default:
        return {
          badge: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
          dot: 'bg-slate-400',
          border: 'border-border'
        };
    }
  };

  const getStepIcon = (iconName: string, type: string) => {
    switch (iconName.toLowerCase()) {
      case 'phone':
        return <Phone className="w-3.5 h-3.5 text-blue-400" />;
      case 'landmark':
      case 'arrow-left-right':
        return <Landmark className="w-3.5 h-3.5 text-emerald-400" />;
      case 'send':
      case 'globe':
        return <Globe className="w-3.5 h-3.5 text-cyan-400" />;
      case 'radio-tower':
        return <Radio className="w-3.5 h-3.5 text-purple-400" />;
      case 'zap':
        return <Zap className="w-3.5 h-3.5 text-amber-400" />;
      case 'cpu':
        return <Cpu className="w-3.5 h-3.5 text-rose-400" />;
      default:
        return <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />;
    }
  };

  const riskStyle = getRiskBadge(alert.risk_level, alert.risk_score);

  return (
    <div className={cn(
      "bg-card/70 backdrop-blur-md rounded-2xl p-5 border transition-all duration-200 shadow-md",
      riskStyle.border,
      alert.status === 'DISMISSED' && "opacity-60 bg-secondary/30",
      alert.status === 'ASSIGNED' && "border-emerald-500/40 bg-emerald-950/10"
    )}>
      {/* Top Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <span className={cn("w-2.5 h-2.5 rounded-full", riskStyle.dot)} />
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-base font-bold text-foreground tracking-tight">
                {alert.pattern_name}
              </h4>
              <span className={cn("text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border", riskStyle.badge)}>
                {alert.risk_level} • {alert.risk_score}/100
              </span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
              <span className="font-mono text-primary font-semibold">{alert.alert_id}</span>
              {alert.entity_name && (
                <>
                  <span>•</span>
                  <span className="font-medium text-foreground">{alert.entity_name}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Current Triage Status */}
        <div className="flex items-center gap-2">
          <span className={cn(
            "text-[10px] font-bold px-2.5 py-1 rounded-lg border uppercase tracking-wider",
            alert.status === 'PENDING' && "bg-amber-500/10 text-amber-400 border-amber-500/30",
            alert.status === 'INVESTIGATING' && "bg-blue-500/10 text-blue-400 border-blue-500/30 animate-pulse",
            alert.status === 'ASSIGNED' && "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
            alert.status === 'DISMISSED' && "bg-slate-500/10 text-slate-400 border-slate-500/30 line-through"
          )}>
            {alert.status}
          </span>
        </div>
      </div>

      {/* Evidence Narrative */}
      <div className="p-3 rounded-xl bg-background/60 border border-border/80 text-xs text-foreground/90 leading-relaxed mb-4">
        {alert.evidence_narrative}
      </div>

      {/* Horizontal Micro-Timeline */}
      {alert.micro_timeline && alert.micro_timeline.length > 0 && (
        <div className="mb-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-primary" /> Multi-Source Micro-Timeline Window
          </div>
          <div className="relative flex items-center gap-2 overflow-x-auto pb-2 pt-1 scrollbar-thin">
            {alert.micro_timeline.map((item, idx) => (
              <React.Fragment key={idx}>
                <div className="flex-1 min-w-[170px] bg-secondary/60 border border-border/70 rounded-xl p-2.5 relative group hover:border-primary/50 transition-colors">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="p-1 rounded-md bg-background border border-border">
                      {getStepIcon(item.icon, item.type)}
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground">{item.timestamp}</span>
                  </div>
                  <div className="text-xs font-bold text-foreground truncate">{item.label}</div>
                  {item.details && (
                    <div className="text-[10px] text-muted-foreground truncate mt-0.5" title={item.details}>
                      {item.details}
                    </div>
                  )}
                </div>
                {idx < alert.micro_timeline.length - 1 && (
                  <div className="shrink-0 flex items-center justify-center text-muted-foreground">
                    <ArrowRight className="w-3.5 h-3.5 opacity-60" />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* Action Triggers Footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-border/60">
        <div className="flex items-center gap-2">
          {alert.entity_id && onPivotToGraph && (
            <button
              type="button"
              onClick={() => onPivotToGraph(alert.entity_id!)}
              className="px-3 py-1.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5" /> Pivot to Graph Visualizer
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {alert.status !== 'INVESTIGATING' && (
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => onTriage(alert.alert_id, 'INVESTIGATING')}
              className="px-3 py-1.5 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground border border-border text-xs font-medium transition-colors cursor-pointer"
            >
              Investigate
            </button>
          )}

          {alert.status !== 'ASSIGNED' && (
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => onTriage(alert.alert_id, 'ASSIGNED')}
              className="px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
            >
              <CheckCircle className="w-3.5 h-3.5" /> Assign to Active Case
            </button>
          )}

          {alert.status !== 'DISMISSED' && (
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => onTriage(alert.alert_id, 'DISMISSED')}
              className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
            >
              <XCircle className="w-3.5 h-3.5" /> Dismiss / False Positive
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
