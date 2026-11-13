import React from 'react';
import { CycleSummary } from '@/src/types/luma';

interface CycleRingProps {
  summary: CycleSummary;
  compact?: boolean;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string {
  const clampedEnd = Math.min(startAngle + 359.2, endAngle);
  if (clampedEnd <= startAngle) return '';
  const start = polarToCartesian(cx, cy, r, clampedEnd);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = clampedEnd - startAngle <= 180 ? '0' : '1';
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 0 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

export const CycleRing: React.FC<CycleRingProps> = ({
  summary,
  compact = false,
}) => {
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 76;
  const strokeWidth = 13;

  const cycleLen = summary.prediction.effectiveCycleLength;
  const periodLen = summary.prediction.effectivePeriodLength;
  const hasBaseline = summary.currentCycleDay !== null;

  const dayToAngle = (dayZeroBased: number) =>
    Math.max(0, Math.min(360, (dayZeroBased / Math.max(1, cycleLen)) * 360));

  const recordedDaysInCurrent = summary.latestPeriod
    ? summary.latestPeriod.endDate
      ? Math.max(
          1,
          Math.min(
            cycleLen,
            Math.round(
              (new Date(summary.latestPeriod.endDate + 'T12:00:00').getTime() -
                new Date(summary.latestPeriod.startDate + 'T12:00:00').getTime()) /
                86_400_000
            ) + 1
          )
        )
      : Math.min(cycleLen, summary.currentCycleDay ?? 1)
    : 0;

  const recordedArcEnd = dayToAngle(recordedDaysInCurrent);
  const currentAngle = hasBaseline
    ? dayToAngle(Math.min(cycleLen, summary.currentCycleDay!))
    : 0;
  const estPeriodEndAngle = dayToAngle(Math.min(cycleLen, periodLen));

  let fertileStartAngle: number | null = null;
  let fertileEndAngle: number | null = null;
  if (summary.prediction.fertileWindow && summary.latestPeriod) {
    const ovStartDay = Math.max(1, cycleLen - 18);
    const ovEndDay = Math.max(ovStartDay + 1, cycleLen - 13);
    fertileStartAngle = dayToAngle(ovStartDay - 1);
    fertileEndAngle = dayToAngle(ovEndDay);
  }

  const markerPoint = hasBaseline
    ? polarToCartesian(cx, cy, radius, Math.min(359, currentAngle))
    : null;

  return (
    <div className="flex flex-col items-center">
      <div
        className={`relative ${
          compact ? 'w-[148px] h-[148px]' : 'w-[184px] h-[184px]'
        }`}
      >
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="w-full h-full"
          role="img"
          aria-label={
            hasBaseline
              ? `Cycle day ${summary.currentCycleDay} of estimated ${cycleLen}-day cycle`
              : 'Cycle ring awaiting your first recorded period'
          }
        >
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke="var(--luma-border)"
            strokeWidth={strokeWidth}
            strokeDasharray={hasBaseline ? '4 4' : '2 6'}
          />

          {hasBaseline &&
            fertileStartAngle !== null &&
            fertileEndAngle !== null &&
            fertileEndAngle > fertileStartAngle && (
              <path
                d={describeArc(cx, cy, radius, fertileStartAngle, fertileEndAngle)}
                fill="none"
                stroke="var(--luma-sage)"
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeOpacity="0.7"
              />
            )}

          {hasBaseline && currentAngle > recordedArcEnd && (
            <path
              d={describeArc(cx, cy, radius, recordedArcEnd, currentAngle)}
              fill="none"
              stroke="var(--luma-plum)"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
          )}

          {hasBaseline &&
            summary.activePeriod &&
            summary.activePeriod.endDate === null &&
            estPeriodEndAngle > recordedArcEnd && (
              <path
                d={describeArc(cx, cy, radius, recordedArcEnd, estPeriodEndAngle)}
                fill="none"
                stroke="var(--luma-lavender)"
                strokeWidth={strokeWidth}
                strokeDasharray="4 4"
              />
            )}

          {hasBaseline && recordedArcEnd > 0 && (
            <path
              d={describeArc(cx, cy, radius, 0, recordedArcEnd)}
              fill="none"
              stroke="var(--luma-rose)"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
          )}

          {markerPoint && (
            <circle
              cx={markerPoint.x}
              cy={markerPoint.y}
              r={8.5}
              fill="var(--luma-surface)"
              stroke="var(--luma-rose)"
              strokeWidth={3.5}
            />
          )}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
          {hasBaseline ? (
            <>
              <span className="text-[11px] font-medium text-[var(--luma-muted)]">
                Cycle Day
              </span>
              <span
                className={`font-bold text-[var(--luma-text)] tabular-nums leading-none mt-0.5 ${
                  compact ? 'text-2xl' : 'text-3xl'
                }`}
              >
                {summary.currentCycleDay}
              </span>
              <span className="text-[11px] text-[var(--luma-muted)] mt-1 tabular-nums">
                of ~{cycleLen}d
              </span>
            </>
          ) : (
            <span className="text-xs font-semibold text-[var(--luma-muted)]">
              No logs yet
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
