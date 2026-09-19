'use client';
import React, { useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, FastForward, Rewind, Clock } from 'lucide-react';

interface GeoPlaybackControlsProps {
  currentTime: number;
  setCurrentTime: (t: number) => void;
  timeRange: [number, number];
  isPlaying: boolean;
  setIsPlaying: (p: boolean) => void;
  playbackSpeed: number;
  setPlaybackSpeed: (s: number) => void;
}

export const GeoPlaybackControls: React.FC<GeoPlaybackControlsProps> = ({
  currentTime,
  setCurrentTime,
  timeRange,
  isPlaying,
  setIsPlaying,
  playbackSpeed,
  setPlaybackSpeed,
}) => {
  const [minTime, maxTime] = timeRange;
  const animationFrameRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(Date.now());
  const currentTimeRef = useRef<number>(currentTime);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying) {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      return;
    }

    lastTickRef.current = Date.now();

    const loop = () => {
      const now = Date.now();
      const deltaMs = now - lastTickRef.current;
      lastTickRef.current = now;

      // Advance time according to playback speed (1 sec real = playbackSpeed * 1 sec simulation)
      const nextTime = currentTimeRef.current + deltaMs * playbackSpeed;
      if (nextTime >= maxTime) {
        setIsPlaying(false);
        setCurrentTime(maxTime);
        return;
      }
      setCurrentTime(nextTime);

      animationFrameRef.current = requestAnimationFrame(loop);
    };

    animationFrameRef.current = requestAnimationFrame(loop);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isPlaying, playbackSpeed, maxTime, setCurrentTime, setIsPlaying]);

  const stepTime = (deltaSeconds: number) => {
    setCurrentTime(Math.min(maxTime, Math.max(minTime, currentTime + deltaSeconds * 1000)));
  };

  const formatTimestamp = (ms: number) => {
    if (!ms || isNaN(ms)) return 'N/A';
    try {
      return new Date(ms).toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
    } catch {
      return 'N/A';
    }
  };

  const progressPercent = maxTime > minTime ? ((currentTime - minTime) / (maxTime - minTime)) * 100 : 0;

  return (
    <div className="bg-card/95 border border-border/80 rounded-xl p-3 backdrop-blur-lg shadow-2xl flex flex-col gap-2.5 max-w-2xl w-full">
      {/* Top row: Status & Scrubber */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-primary" />
          <span className="font-mono font-semibold text-primary">
            {formatTimestamp(currentTime)}
          </span>
        </div>
        <div className="text-[11px] font-mono text-muted-foreground">
          <span>{formatTimestamp(minTime).substring(5, 16)}</span>
          <span className="mx-1.5 opacity-40">/</span>
          <span>{formatTimestamp(maxTime).substring(5, 16)}</span>
        </div>
      </div>

      {/* Progress Scrubber Slider */}
      <div className="relative flex items-center w-full group">
        <input
          type="range"
          min={minTime}
          max={maxTime || minTime + 1}
          value={currentTime}
          onChange={e => setCurrentTime(Number(e.target.value))}
          className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary focus:outline-none"
        />
        <div
          className="absolute left-0 top-0 h-1.5 bg-primary/80 rounded-lg pointer-events-none transition-all"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Bottom controls row */}
      <div className="flex items-center justify-between pt-1">
        {/* Playback Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentTime(minTime)}
            title="Reset to Start"
            className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => stepTime(-1800)} // -30 min
            title="Step Back 30m"
            className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <Rewind className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`px-3 py-1.5 rounded-md font-medium text-xs flex items-center gap-1.5 transition-all shadow-md ${
              isPlaying
                ? 'bg-amber-500/20 border border-amber-500/50 text-amber-300 hover:bg-amber-500/30'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            }`}
          >
            {isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Play</span>
              </>
            )}
          </button>

          <button
            onClick={() => stepTime(1800)} // +30 min
            title="Step Forward 30m"
            className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <FastForward className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Speed Multiplier Options */}
        <div className="flex items-center gap-1 bg-secondary/50 p-0.5 rounded-lg border border-border/50 text-[11px]">
          {[1, 5, 10, 50, 100].map(s => (
            <button
              key={s}
              onClick={() => setPlaybackSpeed(s)}
              className={`px-2 py-0.5 rounded font-mono font-medium transition-colors ${
                playbackSpeed === s
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
