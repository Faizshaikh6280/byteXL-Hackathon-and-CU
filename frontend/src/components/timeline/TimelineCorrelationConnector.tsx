import React, { useState } from 'react';
import { TemporalCorrelation } from '../../services/apiClient';
import { cn } from '../../utils/cn';

interface CorrelationConnectorProps {
  correlation: TemporalCorrelation;
  x1: number; // px from canvas left
  y1: number; // px from canvas top
  x2: number;
  y2: number;
  isSelected?: boolean;
  onSelect?: (correlation: TemporalCorrelation) => void;
}

export const TimelineCorrelationConnector: React.FC<CorrelationConnectorProps> = ({
  correlation,
  x1,
  y1,
  x2,
  y2,
  isSelected = false,
  onSelect
}) => {
  const [isHovered, setIsHovered] = useState(false);

  // Compute curved Bezier control points
  const dx = x2 - x1;
  const dy = y2 - y1;
  const curvature = Math.min(60, Math.max(20, Math.abs(dx) * 0.12));
  
  // Midpoint for badge
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2 - curvature * 0.4;

  const pathD = `M ${x1} ${y1} Q ${midX} ${midY - curvature * 0.4} ${x2} ${y2}`;

  const showBadge = isSelected || isHovered;

  return (
    <g 
      className="cursor-pointer select-none group" 
      onMouseEnter={() => setIsHovered(true)} 
      onMouseLeave={() => setIsHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        if (onSelect) onSelect(correlation);
      }}
    >
      {/* Invisible thick path for generous hit detection */}
      <path
        d={pathD}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
      />

      {/* Visible Dashed Arc */}
      <path
        d={pathD}
        fill="none"
        className={cn(
          "transition-all duration-200 pointer-events-none",
          showBadge
            ? "stroke-primary stroke-[2.5px] opacity-100 filter drop-shadow-[0_0_8px_rgba(99,102,241,0.8)]"
            : "stroke-primary/30 stroke-[1.5px] opacity-40 hover:opacity-100"
        )}
        strokeDasharray="4 4"
      />

      {/* Midpoint Pill: ONLY rendered when hovered or selected to prevent text pile-up */}
      {showBadge && (
        <foreignObject 
          x={midX - 55} 
          y={midY - 14} 
          width={110} 
          height={28} 
          className="overflow-visible pointer-events-none animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold text-center border shadow-md bg-primary text-primary-foreground border-primary scale-110 ring-2 ring-primary/30 whitespace-nowrap mx-auto w-max">
            {correlation.time_delta_formatted}
          </div>
        </foreignObject>
      )}
    </g>
  );
};
export default TimelineCorrelationConnector;
