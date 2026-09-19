import React, { useState, useMemo } from 'react';
import { cn } from '../../utils/cn';
import { TimelineCanonicalEvent } from '../../services/apiClient';
import { DASHBOARD_DOMAIN_STYLES } from './dashboardAdapters';

interface ActivityOverviewProps {
  events: TimelineCanonicalEvent[];
  minTimestamp?: string;
  maxTimestamp?: string;
  onFocusTimeWindow?: (startMs: number, endMs: number) => void;
}

type TimeFilter = '24H' | '7D' | '30D' | 'ALL';

interface ActivityBin {
  binId: number;
  label: string;
  subLabel: string;
  startMs: number;
  endMs: number;
  total: number;
  telecom: number;
  financial: number;
  location: number;
  social: number;
  network: number;
  others: number;
}

export const ActivityOverview: React.FC<ActivityOverviewProps> = ({
  events,
  minTimestamp,
  maxTimestamp,
  onFocusTimeWindow
}) => {
  const [activeFilter, setActiveFilter] = useState<TimeFilter>('30D');
  const [hoveredBin, setHoveredBin] = useState<ActivityBin | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Compute time range based on active filter
  const timeBounds = useMemo(() => {
    if (events.length === 0) {
      const now = Date.now();
      return { start: now - 30 * 24 * 3600 * 1000, end: now };
    }
    const timestamps = events.map(e => e.timestamp_ms);
    const minMs = Math.min(...timestamps);
    const maxMs = Math.max(...timestamps);
    const latest = maxMs;

    if (activeFilter === '24H') {
      return { start: Math.max(minMs, latest - 24 * 3600 * 1000), end: latest };
    }
    if (activeFilter === '7D') {
      return { start: Math.max(minMs, latest - 7 * 24 * 3600 * 1000), end: latest };
    }
    if (activeFilter === '30D') {
      return { start: Math.max(minMs, latest - 30 * 24 * 3600 * 1000), end: latest };
    }
    return { start: minMs, end: maxMs };
  }, [events, activeFilter]);

  // Aggregate into 32 stacked bins
  const { bins, maxBinTotal } = useMemo(() => {
    const binCount = 36;
    const span = Math.max(1000, timeBounds.end - timeBounds.start);
    const binSpan = span / binCount;

    const bList: ActivityBin[] = [];
    for (let i = 0; i < binCount; i++) {
      const bStart = timeBounds.start + i * binSpan;
      const bEnd = bStart + binSpan;
      const d = new Date(bStart);
      const label = `${d.getUTCDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()]}, ${String(d.getUTCHours()).padStart(2, '0')}:00`;
      const subLabel = `${String(d.getUTCHours()).padStart(2, '0')}:00`;

      bList.push({
        binId: i,
        label,
        subLabel,
        startMs: bStart,
        endMs: bEnd,
        total: 0,
        telecom: 0,
        financial: 0,
        location: 0,
        social: 0,
        network: 0,
        others: 0
      });
    }

    events.forEach(ev => {
      if (ev.timestamp_ms >= timeBounds.start && ev.timestamp_ms <= timeBounds.end) {
        const binIdx = Math.min(binCount - 1, Math.max(0, Math.floor((ev.timestamp_ms - timeBounds.start) / binSpan)));
        const bin = bList[binIdx];
        bin.total++;
        const dom = (ev.domain || '').toUpperCase();
        if (dom === 'TELECOM') bin.telecom++;
        else if (dom === 'FINANCIAL') bin.financial++;
        else if (dom === 'LOCATION' || dom === 'GENERAL') bin.location++;
        else if (dom === 'SOCIAL') bin.social++;
        else if (dom === 'NETWORK') bin.network++;
        else bin.others++;
      }
    });

    const maxVal = Math.max(1, ...bList.map(b => b.total));
    return { bins: bList, maxBinTotal: maxVal };
  }, [events, timeBounds]);

  const yTicks = [100, 75, 50, 25, 0];

  return (
    <div className="bg-card/70 border border-border/80 rounded-2xl p-5 flex flex-col justify-between shadow-xs relative select-none">
      {/* Top Header: Title & Time Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold font-mono">
              2
            </span>
            <h3 className="text-sm font-bold tracking-tight text-foreground">
              Activity Overview
            </h3>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Event volume across all investigative domains
          </p>
        </div>

        {/* Domain Legend & Filter Buttons */}
        <div className="flex items-center gap-4 flex-wrap">
          {/* Domain Legend */}
          <div className="hidden md:flex items-center gap-2.5 text-[10px] font-mono">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-indigo-500" /> Telecom
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" /> Financial
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500" /> Location
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-pink-500" /> Social
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-cyan-500" /> Network
            </span>
          </div>

          {/* Time Filter Pills */}
          <div className="flex items-center bg-secondary/80 p-0.5 rounded-lg border border-border/60">
            {(['24H', '7D', '30D', 'ALL'] as TimeFilter[]).map((filter) => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={cn(
                  "px-2.5 py-0.5 rounded-md text-[11px] font-mono font-bold transition-all",
                  activeFilter === filter
                    ? "bg-card text-foreground shadow-xs border border-border/80"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {filter === 'ALL' ? 'Custom' : filter}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Chart Area */}
      <div className="relative h-48 sm:h-56 flex">
        {/* Left Y-Axis */}
        <div className="w-8 flex-shrink-0 flex flex-col justify-between text-[10px] font-mono text-muted-foreground/80 pr-2 border-r border-border/40 pb-5">
          {yTicks.map(pct => {
            const count = Math.round((pct / 100) * maxBinTotal);
            return (
              <span key={pct} className="text-right leading-none">
                {count}
              </span>
            );
          })}
        </div>

        {/* Center SVG Track */}
        <div 
          className="flex-1 relative flex flex-col justify-between pl-2 min-w-0"
          onMouseLeave={() => setHoveredBin(null)}
        >
          {/* Horizontal Gridlines */}
          <div className="absolute inset-0 pl-2 pb-5 flex flex-col justify-between pointer-events-none z-0">
            {yTicks.map(pct => (
              <div key={pct} className="w-full h-px border-b border-dashed border-border/30" />
            ))}
          </div>

          {/* Bars Container */}
          <div className="flex-1 flex items-end gap-1 relative z-10 pb-5">
            {bins.map((bin) => {
              const heightPct = bin.total > 0 ? Math.max(6, (bin.total / maxBinTotal) * 100) : 2;
              
              // Segment heights proportional to domain breakdown
              const tPct = bin.total > 0 ? (bin.telecom / bin.total) * 100 : 0;
              const fPct = bin.total > 0 ? (bin.financial / bin.total) * 100 : 0;
              const lPct = bin.total > 0 ? (bin.location / bin.total) * 100 : 0;
              const sPct = bin.total > 0 ? (bin.social / bin.total) * 100 : 0;
              const nPct = bin.total > 0 ? (bin.network / bin.total) * 100 : 0;
              const oPct = bin.total > 0 ? (bin.others / bin.total) * 100 : 0;

              return (
                <div
                  key={bin.binId}
                  className="flex-1 h-full flex items-end cursor-pointer group"
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setHoverPos({ x: Math.max(110, Math.min(window.innerWidth - 110, rect.left + rect.width / 2)), y: rect.top });
                    setHoveredBin(bin);
                  }}
                  onTouchStart={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setHoverPos({ x: Math.max(110, Math.min(window.innerWidth - 110, rect.left + rect.width / 2)), y: rect.top });
                    setHoveredBin(bin);
                  }}
                  onClick={() => {
                    if (onFocusTimeWindow && bin.total > 0) {
                      onFocusTimeWindow(bin.startMs, bin.endMs);
                    }
                  }}
                >
                  <div 
                    className={cn(
                      "w-full rounded-t-sm flex flex-col-reverse overflow-hidden transition-all duration-150",
                      bin.total > 0 
                        ? "group-hover:scale-y-105 group-hover:brightness-125" 
                        : "bg-muted/30"
                    )}
                    style={{ height: `${heightPct}%` }}
                  >
                    {bin.total > 0 ? (
                      <>
                        {bin.telecom > 0 && <div style={{ height: `${tPct}%` }} className="w-full bg-indigo-500" />}
                        {bin.financial > 0 && <div style={{ height: `${fPct}%` }} className="w-full bg-emerald-500" />}
                        {bin.location > 0 && <div style={{ height: `${lPct}%` }} className="w-full bg-amber-500" />}
                        {bin.social > 0 && <div style={{ height: `${sPct}%` }} className="w-full bg-pink-500" />}
                        {bin.network > 0 && <div style={{ height: `${nPct}%` }} className="w-full bg-cyan-500" />}
                        {bin.others > 0 && <div style={{ height: `${oPct}%` }} className="w-full bg-violet-500" />}
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom X-Axis Ticks */}
          <div className="h-5 flex items-center justify-between text-[9px] font-mono text-muted-foreground border-t border-border/50 pt-1">
            {bins.filter((_, idx) => idx % Math.floor(bins.length / 6) === 0).map((b, idx) => (
              <span key={idx}>{b.subLabel}</span>
            ))}
          </div>
        </div>

        {/* Floating Interactive Tooltip */}
        {hoveredBin && hoveredBin.total > 0 && (
          <div 
            className="fixed z-50 bg-card/95 backdrop-blur-md border border-border rounded-xl p-3 shadow-2xl pointer-events-none text-xs w-52 -translate-x-1/2 -translate-y-full mb-3"
            style={{ left: hoverPos.x, top: hoverPos.y }}
          >
            <div className="text-[11px] font-bold text-foreground border-b border-border/60 pb-1 mb-1.5">
              {hoveredBin.label}
            </div>
            <div className="text-sm font-black font-mono text-primary mb-2">
              {hoveredBin.total} {hoveredBin.total === 1 ? 'event' : 'events'}
            </div>
            <div className="space-y-1 text-[11px]">
              {hoveredBin.telecom > 0 && (
                <div className="flex justify-between items-center text-indigo-400">
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" /> Telecom
                  </span>
                  <span className="font-mono font-bold">{hoveredBin.telecom}</span>
                </div>
              )}
              {hoveredBin.financial > 0 && (
                <div className="flex justify-between items-center text-emerald-400">
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Financial
                  </span>
                  <span className="font-mono font-bold">{hoveredBin.financial}</span>
                </div>
              )}
              {hoveredBin.location > 0 && (
                <div className="flex justify-between items-center text-amber-400">
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Location
                  </span>
                  <span className="font-mono font-bold">{hoveredBin.location}</span>
                </div>
              )}
              {hoveredBin.social > 0 && (
                <div className="flex justify-between items-center text-pink-400">
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-pink-500" /> Social
                  </span>
                  <span className="font-mono font-bold">{hoveredBin.social}</span>
                </div>
              )}
              {hoveredBin.network > 0 && (
                <div className="flex justify-between items-center text-cyan-400">
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" /> Network
                  </span>
                  <span className="font-mono font-bold">{hoveredBin.network}</span>
                </div>
              )}
              {hoveredBin.others > 0 && (
                <div className="flex justify-between items-center text-violet-400">
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-500" /> Others
                  </span>
                  <span className="font-mono font-bold">{hoveredBin.others}</span>
                </div>
              )}
            </div>
            <div className="text-[9px] text-muted-foreground/70 mt-2 pt-1 border-t border-border/40 text-center font-mono">
              Click bar to focus in Timeline
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
export default ActivityOverview;
