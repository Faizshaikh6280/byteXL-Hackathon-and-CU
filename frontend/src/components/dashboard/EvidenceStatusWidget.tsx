import React from 'react';
import { Database, FileText, ArrowRight, CheckCircle2, Clock } from 'lucide-react';
import { cn } from '../../utils/cn';
import { EvidenceItem } from '../../services/apiClient';
import { computeDonutSegments, formatRelativeTime } from './dashboardAdapters';

interface EvidenceStatusWidgetProps {
  evidenceList: EvidenceItem[];
  totalEvidenceCount: number;
  onNavigateTab: (tabId: string) => void;
}

export const EvidenceStatusWidget: React.FC<EvidenceStatusWidgetProps> = ({
  evidenceList,
  totalEvidenceCount,
  onNavigateTab
}) => {
  const total = totalEvidenceCount || evidenceList.length || 0;

  // Compute status counts from real evidence items
  const processed = evidenceList.filter(e => e.status === 'COMPLETED' || e.status === 'PROCESSED').length;
  const recentlyAdded = evidenceList.filter(e => e.status === 'NEEDS_REVIEW' || e.status === 'PENDING').length;
  const processing = evidenceList.filter(e => e.status === 'PROCESSING' || e.status === 'INGESTING').length;
  const failed = evidenceList.filter(e => e.status === 'FAILED' || e.status === 'ERROR').length;

  const items = [
    { key: 'processed', label: 'Processed', value: processed || (total > 0 ? total : 0), color: '#10b981' }, // green
    { key: 'recentlyAdded', label: 'Recently Added', value: recentlyAdded, color: '#06b6d4' }, // cyan
    { key: 'processing', label: 'Processing', value: processing, color: '#94a3b8' }, // slate
    { key: 'failed', label: 'Failed', value: failed, color: '#ef4444' } // red
  ];

  const segments = computeDonutSegments(items, 50, 50, 36);

  // Latest evidence file
  const latestEvidence = evidenceList.length > 0 ? evidenceList[evidenceList.length - 1] : null;

  return (
    <div className="bg-card/70 border border-border/80 rounded-2xl p-5 flex flex-col justify-between shadow-xs select-none">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold font-mono">
              4
            </span>
            <h3 className="text-sm font-bold tracking-tight text-foreground">
              Evidence Status
            </h3>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Ingestion and processing state
          </p>
        </div>
        <Database className="w-4 h-4 text-teal-500" />
      </div>

      {/* Donut Gauge + Status Counters */}
      <div className="flex flex-col xs:flex-row items-center justify-around gap-3 sm:gap-4 py-2">
        {/* SVG Ring Gauge */}
        <div className="relative w-28 h-28 flex-shrink-0 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="36"
              fill="transparent"
              stroke="var(--border)"
              strokeWidth="9"
              className="opacity-40"
            />
            {segments.map((seg) => (
              <path
                key={seg.key}
                d={seg.path}
                fill="transparent"
                stroke={seg.color}
                strokeWidth="9"
                strokeLinecap="round"
                className="transition-all duration-300"
              >
                <title>{`${seg.label}: ${seg.value}`}</title>
              </path>
            ))}
          </svg>

          {/* Center Value */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-2xl font-black font-mono tracking-tight text-foreground leading-none">
              {total}
            </span>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-0.5">
              Total
            </span>
          </div>
        </div>

        {/* Breakdown List */}
        <div className="flex flex-col gap-1.5 text-xs min-w-[130px]">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
              <span>Processed</span>
            </span>
            <span className="font-mono font-bold text-foreground">{processed}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-cyan-500 flex-shrink-0" />
              <span>Recently Added</span>
            </span>
            <span className="font-mono font-bold text-foreground">{recentlyAdded}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-slate-400 flex-shrink-0" />
              <span>Processing</span>
            </span>
            <span className="font-mono font-bold text-foreground">{processing}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-rose-500 flex-shrink-0" />
              <span>Failed</span>
            </span>
            <span className="font-mono font-bold text-foreground">{failed}</span>
          </div>
        </div>
      </div>

      {/* Latest Evidence Card */}
      <div className="pt-3 border-t border-border/50">
        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
          Latest Evidence
        </div>

        <div className="bg-secondary/50 border border-border/70 rounded-xl p-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20 flex-shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-bold text-foreground truncate" title={latestEvidence?.filename || 'Evidence File'}>
                {latestEvidence?.filename || 'bank_statement_03.pdf'}
              </span>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className="text-emerald-400 font-medium">
                  {latestEvidence?.status === 'COMPLETED' ? 'Processed' : latestEvidence?.status || 'Processed'}
                </span>
                <span>•</span>
                <span>{latestEvidence?.records ? `${latestEvidence.records} records` : 'Verified'}</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => onNavigateTab('data-sources')}
            className="flex items-center gap-1 text-[11px] font-bold text-primary hover:text-primary/80 transition-colors whitespace-nowrap flex-shrink-0"
          >
            <span>Open Evidence</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};
export default EvidenceStatusWidget;
