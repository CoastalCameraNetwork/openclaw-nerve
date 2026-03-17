import { useRef, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { fmtK } from '@/lib/formatting';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { CONTEXT_WARNING_THRESHOLD, CONTEXT_CRITICAL_THRESHOLD } from '@/lib/constants';
import { PROGRESS_BAR_TRANSITION } from '@/lib/progress-colors';

// Pre-defined color configs to avoid object creation during render
const COLOR_CRITICAL = {
  bar: 'bg-red',
  glow: 'rgba(231, 76, 60, 0.4)',
  growGlow: 'rgba(231, 76, 60, 0.6)',
  text: 'text-red',
} as const;

const COLOR_WARNING = {
  bar: 'bg-orange',
  glow: 'rgba(232, 168, 56, 0.4)',
  growGlow: 'rgba(232, 168, 56, 0.6)',
  text: 'text-orange',
} as const;

const COLOR_NORMAL = {
  bar: 'bg-green',
  glow: 'rgba(76, 175, 80, 0.3)',
  growGlow: 'rgba(76, 175, 80, 0.5)',
  text: 'text-muted-foreground',
} as const;

/** Props for {@link ContextMeter}. */
interface ContextMeterProps {
  /** Number of context tokens consumed so far. */
  used: number;
  /** Maximum context window size in tokens. */
  limit: number;
}

/**
 * Compact progress bar showing context-window token usage.
 *
 * Transitions through green → orange → red as usage crosses warning/critical
 * thresholds, and includes an animated token counter and glow effects.
 * Displayed in the {@link StatusBar}.
 */
export function ContextMeter({ used, limit }: ContextMeterProps) {
  const percent = Math.min(100, (used / limit) * 100);
  const [isGrowing, setIsGrowing] = useState(false);
  const prevPercentRef = useRef(percent);

  useEffect(() => {
    setIsGrowing(percent > prevPercentRef.current);
    prevPercentRef.current = percent;
  }, [percent]);

  const isWarning = percent >= CONTEXT_WARNING_THRESHOLD;
  const isCritical = percent >= CONTEXT_CRITICAL_THRESHOLD;

  const colors = isCritical ? COLOR_CRITICAL : isWarning ? COLOR_WARNING : COLOR_NORMAL;
  
  // Enhanced glow when growing
  const boxShadow = isGrowing 
    ? `0 0 8px ${colors.growGlow}, 0 0 4px ${colors.glow}`
    : `0 0 4px ${colors.glow}`;

  const tooltipText = `Context: ${fmtK(used)} / ${fmtK(limit)} tokens (${percent.toFixed(0)}%)${
    isCritical
      ? ' — CRITICAL: Consider starting a new session'
      : isWarning
      ? ' — Warning: Approaching context limit'
      : ''
  }`;

  return (
    <div
      className="flex items-center gap-1.5 cursor-default"
      title={tooltipText}
    >
      {/* Warning icon - only show when warning/critical */}
      {(isWarning || isCritical) && (
        <AlertTriangle
          size={10}
          className={`${colors.text} ${isCritical ? 'animate-pulse' : ''}`}
        />
      )}

      {/* Progress bar with smooth width and color transitions */}
      <div className="w-12 h-1.5 bg-background border border-border/60 overflow-hidden">
        <div
          className={`h-full ${colors.bar}`}
          style={{ 
            width: `${percent}%`,
            boxShadow,
            transition: PROGRESS_BAR_TRANSITION,
          }}
        />
      </div>

      {/* Animated token count */}
      <AnimatedNumber 
        value={used} 
        format={fmtK}
        className={`text-[9px] ${colors.text}`}
        duration={700}
      />

      {/* Label - changes based on state */}
      <span className={`text-[8px] uppercase tracking-wider ${colors.text}`}>
        CTX
      </span>
    </div>
  );
}
