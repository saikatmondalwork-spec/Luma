import React, { useMemo, useState } from 'react';
import {
  Activity,
  BookOpen,
  CalendarDays,
  ChevronRight,
  Droplets,
  Edit3,
  HeartPulse,
  MoreVertical,
  Plus,
  Sparkles,
} from 'lucide-react';
import { useLuma } from '@/src/context/LumaContext';
import { CycleRecord, NavTab } from '@/src/types/luma';
import { diffDaysLocal, formatDisplayDate, todayLocalDate } from '@/src/utils/dateUtils';
import { CycleRing } from '@/src/components/cycle/CycleRing';

interface HomePageProps {
  onNavigate: (tab: NavTab) => void;
  onOpenPeriodModal: (cycle?: CycleRecord | null) => void;
  onOpenDailyLogModal: (date: string, focus?: 'symptoms' | 'journal' | 'all') => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  onNavigate,
  onOpenPeriodModal,
  onOpenDailyLogModal,
}) => {
  const { cycles, dailyLogs, summary, settings, observations } = useLuma();
  const today = todayLocalDate();
  const todayLog = dailyLogs.find((l) => l.date === today);

  const [overviewMode, setOverviewMode] = useState<'cycle' | 'history'>('cycle');
  const [rightTab, setRightTab] = useState<'logs' | 'periods'>('logs');

  // Build smooth SVG wave points either across current cycle phases or across historical cycle lengths
  const waveChart = useMemo(() => {
    const width = 460;
    const height = 132;
    const padX = 24;

    if (overviewMode === 'history' && summary.completedIntervals.length >= 2) {
      const items = summary.completedIntervals.slice(-7);
      const minVal = Math.min(...items.map((i) => i.lengthDays)) - 2;
      const maxVal = Math.max(...items.map((i) => i.lengthDays)) + 2;
      const span = Math.max(4, maxVal - minVal);
      const pts = items.map((item, idx) => {
        const x =
          padX + (idx / Math.max(1, items.length - 1)) * (width - padX * 2);
        const norm = (item.lengthDays - minVal) / span;
        const y = height - 26 - norm * (height - 54);
        return {
          x,
          y,
          label: formatDisplayDate(item.startDate, 'MMM'),
          callout: `${item.lengthDays} Days`,
          subCallout: formatDisplayDate(item.startDate, 'MMM d'),
        };
      });
      return {
        pts,
        activeIndex: pts.length - 1,
        width,
        height,
      };
    }

    // Current Cycle wave: 7 cycle checkpoints (Day 1 -> Period -> Follicular -> Mid -> Luteal -> Late -> Next Est)
    const cycleLen = summary.prediction.effectiveCycleLength;
    const currentDay = summary.currentCycleDay ?? 0;
    const dayPoints = [
      { day: 1, label: 'D1', val: 0.42 },
      { day: Math.max(2, Math.round(cycleLen * 0.16)), label: `D${Math.max(2, Math.round(cycleLen * 0.16))}`, val: 0.58 },
      { day: Math.round(cycleLen * 0.34), label: `D${Math.round(cycleLen * 0.34)}`, val: 0.36 },
      { day: Math.round(cycleLen * 0.5), label: `D${Math.round(cycleLen * 0.5)}`, val: 0.78 },
      { day: Math.round(cycleLen * 0.68), label: `D${Math.round(cycleLen * 0.68)}`, val: 0.52 },
      { day: Math.round(cycleLen * 0.84), label: `D${Math.round(cycleLen * 0.84)}`, val: 0.65 },
      { day: cycleLen, label: `D${cycleLen}`, val: 0.46 },
    ];

    let activeIndex = 0;
    if (currentDay > 0) {
      let bestDist = Infinity;
      dayPoints.forEach((p, idx) => {
        const d = Math.abs(p.day - Math.min(cycleLen, currentDay));
        if (d < bestDist) {
          bestDist = d;
          activeIndex = idx;
        }
      });
    }

    const pts = dayPoints.map((p, idx) => {
      const x =
        padX + (idx / Math.max(1, dayPoints.length - 1)) * (width - padX * 2);
      const y = height - 22 - p.val * (height - 48);
      return {
        x,
        y,
        label: p.label,
        callout:
          summary.currentCycleDay !== null
            ? `Day ${summary.currentCycleDay}`
            : 'No Data',
        subCallout:
          summary.currentPhase === 'Unknown'
            ? 'Log period'
            : summary.phaseIsEstimated
            ? `${summary.currentPhase} (est.)`
            : summary.currentPhase,
      };
    });

    return { pts, activeIndex, width, height };
  }, [overviewMode, summary]);

  // Smooth cubic bezier SVG path generator
  const { linePath, areaPath, activePt } = useMemo(() => {
    const pts = waveChart.pts;
    if (pts.length === 0) return { linePath: '', areaPath: '', activePt: null };
    let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const curr = pts[i];
      const next = pts[i + 1];
      const cx = (curr.x + next.x) / 2;
      d += ` C ${cx.toFixed(1)} ${curr.y.toFixed(1)}, ${cx.toFixed(1)} ${next.y.toFixed(1)}, ${next.x.toFixed(1)} ${next.y.toFixed(1)}`;
    }
    const last = pts[pts.length - 1];
    const first = pts[0];
    const area = `${d} L ${last.x.toFixed(1)} ${waveChart.height} L ${first.x.toFixed(1)} ${waveChart.height} Z`;
    return {
      linePath: d,
      areaPath: area,
      activePt: pts[waveChart.activeIndex] ?? pts[0],
    };
  }, [waveChart]);

  const countdownShort = useMemo(() => {
    if (summary.daysUntilNextPeriod === null) return 'Pending';
    if (summary.periodStatus === 'current') return 'Active';
    if (summary.daysUntilNextPeriod === 0) return 'Today';
    if (summary.daysUntilNextPeriod > 0) return `In ${summary.daysUntilNextPeriod}d`;
    return `${Math.abs(summary.daysUntilNextPeriod)}d past`;
  }, [summary.daysUntilNextPeriod, summary.periodStatus]);

  const cycleProgressPct = useMemo(() => {
    if (summary.currentCycleDay === null) return 0;
    return Math.max(
      4,
      Math.min(
        100,
        Math.round(
          (summary.currentCycleDay /
            Math.max(1, summary.prediction.effectiveCycleLength)) *
            100
        )
      )
    );
  }, [summary.currentCycleDay, summary.prediction.effectiveCycleLength]);

  const periodProgressPct = useMemo(() => {
    if (!summary.latestPeriod) return 0;
    if (summary.activePeriod) {
      const dayIn =
        diffDaysLocal(summary.activePeriod.startDate, today) + 1;
      return Math.min(
        100,
        Math.round(
          (dayIn / Math.max(1, summary.prediction.effectivePeriodLength)) * 100
        )
      );
    }
    return 100;
  }, [summary.latestPeriod, summary.activePeriod, summary.prediction.effectivePeriodLength, today]);

  const recentLogs = useMemo(() => dailyLogs.slice(0, 5), [dailyLogs]);
  const recentCycles = useMemo(
    () =>
      [...cycles]
        .sort((a, b) => b.startDate.localeCompare(a.startDate))
        .slice(0, 5),
    [cycles]
  );

  // Recent top symptom
  const topSymptomSummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const log of dailyLogs.slice(0, 30)) {
      for (const s of log.symptoms) {
        counts.set(s, (counts.get(s) ?? 0) + 1);
      }
    }
    const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
    return top ? `${top[0]} (${top[1]}d)` : 'No symptoms yet';
  }, [dailyLogs]);

  const todayCountLabel = useMemo(() => {
    if (!todayLog) return 'Ready to log';
    const pieces: string[] = [];
    if (todayLog.symptoms.length > 0) {
      pieces.push(
        `${todayLog.symptoms.length} ${
          todayLog.symptoms.length === 1 ? 'symptom' : 'symptoms'
        }`
      );
    }
    if (todayLog.mood) pieces.push(todayLog.mood);
    if (pieces.length > 0) return pieces.join(' · ');
    if (todayLog.notes.trim()) return 'Note saved';
    return 'Logged today';
  }, [todayLog]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Left/Center Main Bento Column */}
      <div className="xl:col-span-8 space-y-8">
        {/* Hero Split: Violet Overview Card + Stacked Right Accent Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          {/* Large Violet Gradient Overview Card */}
          <section
            aria-label="Current cycle summary"
            className="lg:col-span-8 rounded-[28px] luma-violet-gradient text-white p-5 sm:p-6 shadow-[0_20px_42px_-16px_rgba(84,67,179,0.5)] flex flex-col justify-between relative overflow-hidden"
          >
            {/* Header row */}
            <div className="flex items-center justify-between gap-3 relative z-10">
              <div>
                <h2 className="text-lg sm:text-xl font-semibold tracking-tight">
                  Overview
                </h2>
                <p className="text-xs text-white/75 mt-0.5">
                  {summary.statusTitle}
                </p>
              </div>

              <div className="flex items-center gap-1 p-1 rounded-full bg-white/14 border border-white/15">
                <button
                  type="button"
                  onClick={() => setOverviewMode('cycle')}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                    overviewMode === 'cycle'
                      ? 'bg-white text-[#5B49BE]'
                      : 'text-white/80 hover:text-white'
                  }`}
                >
                  Cycle
                </button>
                <button
                  type="button"
                  onClick={() => setOverviewMode('history')}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                    overviewMode === 'history'
                      ? 'bg-white text-[#5B49BE]'
                      : 'text-white/80 hover:text-white'
                  }`}
                >
                  Monthly
                </button>
              </div>
            </div>

            {/* Smooth Wave Area Visualization with Highlight Marker */}
            <div className="my-4 relative z-10">
              <div className="relative w-full h-[140px]">
                <svg
                  viewBox={`0 0 ${waveChart.width} ${waveChart.height}`}
                  preserveAspectRatio="none"
                  className="w-full h-full overflow-visible"
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient id="lumaWaveFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#FF89A8" stopOpacity="0.32" />
                      <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.02" />
                    </linearGradient>
                    <linearGradient id="lumaPillar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.24" />
                      <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.03" />
                    </linearGradient>
                  </defs>

                  {activePt && (
                    <rect
                      x={activePt.x - 16}
                      y={Math.max(8, activePt.y - 16)}
                      width={32}
                      height={waveChart.height - Math.max(8, activePt.y - 16)}
                      rx={16}
                      fill="url(#lumaPillar)"
                    />
                  )}

                  {areaPath && <path d={areaPath} fill="url(#lumaWaveFill)" />}
                  {linePath && (
                    <path
                      d={linePath}
                      fill="none"
                      stroke="#FF9BB5"
                      strokeWidth="2.8"
                      strokeLinecap="round"
                    />
                  )}

                  {activePt && (
                    <g>
                      <circle
                        cx={activePt.x}
                        cy={activePt.y}
                        r={8}
                        fill="#FF7194"
                        stroke="#FFFFFF"
                        strokeWidth={3}
                      />
                    </g>
                  )}
                </svg>

                {/* Floating Readout Pill next to marker */}
                {activePt && (
                  <div
                    className="absolute top-2 pointer-events-none rounded-xl bg-[#2E2661]/90 backdrop-blur-sm border border-white/15 px-3 py-1.5 shadow-lg"
                    style={{
                      left: `clamp(12px, ${(activePt.x / waveChart.width) * 100}%, calc(100% - 140px))`,
                    }}
                  >
                    <p className="text-xs font-bold text-white tabular-nums leading-tight">
                      {activePt.callout}
                    </p>
                    <p className="text-[10px] text-white/75 leading-tight mt-0.5">
                      {activePt.subCallout}
                    </p>
                  </div>
                )}
              </div>

              {/* Bottom Axis Labels with Active White Pill */}
              <div className="flex items-center justify-between px-2 mt-1">
                {waveChart.pts.map((p, idx) => {
                  const isActive = idx === waveChart.activeIndex;
                  return (
                    <span
                      key={`${p.label}-${idx}`}
                      className={`text-[11px] font-medium px-2.5 py-0.5 rounded-lg tabular-nums ${
                        isActive
                          ? 'bg-white text-[#5B49BE] font-semibold shadow-xs'
                          : 'text-white/75'
                      }`}
                    >
                      {p.label}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Bottom 3-Column Metrics inside Violet Card */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3 items-stretch pt-2 relative z-10">
              <div className="rounded-2xl py-2.5 px-2 sm:px-3 text-center flex flex-col justify-center">
                <span className="text-[11px] text-white/75">Last Period</span>
                <span className="text-base sm:text-lg font-bold tabular-nums mt-0.5 truncate">
                  {summary.latestPeriod
                    ? formatDisplayDate(summary.latestPeriod.startDate, 'MMM d')
                    : 'Not set'}
                </span>
                <span className="text-[11px] text-white/70">Start date</span>
              </div>

              <div className="rounded-2xl bg-white/15 border border-white/18 py-2.5 px-2 sm:px-3 text-center flex flex-col justify-center">
                <span className="text-[11px] text-white/85">Cycle Day</span>
                <span className="text-xl sm:text-2xl font-bold tabular-nums mt-0.5">
                  {summary.currentCycleDay !== null
                    ? `Day ${summary.currentCycleDay}`
                    : '—'}
                </span>
                <span className="text-[11px] text-white/80 truncate">
                  {summary.currentPhase === 'Unknown'
                    ? 'Awaiting log'
                    : summary.phaseIsEstimated
                    ? `${summary.currentPhase} est.`
                    : summary.currentPhase}
                </span>
              </div>

              <div className="rounded-2xl py-2.5 px-2 sm:px-3 text-center flex flex-col justify-center">
                <span className="text-[11px] text-white/75">Next Est.</span>
                <span className="text-base sm:text-lg font-bold tabular-nums mt-0.5 truncate">
                  {summary.prediction.estimatedNextStartDate
                    ? formatDisplayDate(
                        summary.prediction.estimatedNextStartDate,
                        'MMM d'
                      )
                    : '—'}
                </span>
                <span className="text-[11px] text-white/70 tabular-nums">
                  {countdownShort}
                </span>
              </div>
            </div>

            {summary.needsEndDatePrompt && summary.activePeriod && (
              <div className="mt-3 rounded-2xl bg-white/16 border border-white/20 px-3.5 py-2.5 flex items-center justify-between gap-3 relative z-10">
                <span className="text-xs text-white">
                  Period started{' '}
                  {formatDisplayDate(summary.activePeriod.startDate, 'MMM d')} is
                  still open.
                </span>
                <button
                  type="button"
                  onClick={() => onOpenPeriodModal(summary.activePeriod)}
                  className="px-3 py-1 rounded-xl bg-white text-[#5B49BE] text-xs font-semibold whitespace-nowrap shrink-0"
                >
                  Set End Date
                </button>
              </div>
            )}
          </section>

          {/* Right Stacked Quick-Action Cards (matching Daily Jogging + My Jogging) */}
          <div className="lg:col-span-4 flex flex-col gap-5">
            {/* Top Violet Action Card */}
            <button
              type="button"
              onClick={() =>
                onOpenPeriodModal(summary.activePeriod ? summary.activePeriod : null)
              }
              className="rounded-[24px] luma-violet-gradient text-white p-5 shadow-[0_14px_30px_-12px_rgba(88,71,184,0.45)] flex items-center gap-4 text-left hover:brightness-105 transition-all min-h-[96px]"
            >
              <span className="w-12 h-12 rounded-2xl bg-white/18 border border-white/15 flex items-center justify-center shrink-0">
                <Droplets className="w-6 h-6 text-white" />
              </span>
              <span className="min-w-0">
                <span className="block text-base font-semibold leading-snug">
                  {summary.activePeriod ? 'Update Period' : 'Log Period'}
                </span>
                <span className="block text-xs text-white/75 mt-0.5 truncate">
                  {summary.activePeriod
                    ? 'Edit dates or mark ended'
                    : 'Record start or past cycle'}
                </span>
              </span>
            </button>

            {/* Bottom Coral-Pink Gradient Action Card */}
            <div className="flex-1 rounded-[24px] luma-pink-gradient text-white p-5 shadow-[0_18px_36px_-12px_rgba(242,85,125,0.45)] flex flex-col justify-between relative overflow-hidden min-h-[196px]">
              {/* Subtle translucent wave */}
              <svg
                viewBox="0 0 260 90"
                preserveAspectRatio="none"
                className="absolute bottom-0 left-0 right-0 w-full h-24 pointer-events-none"
                aria-hidden="true"
              >
                <path
                  d="M0 55 Q 65 20, 130 48 T 260 32 L 260 90 L 0 90 Z"
                  fill="rgba(255,255,255,0.14)"
                />
              </svg>

              <div className="flex items-center gap-3.5 relative z-10">
                <span className="w-12 h-12 rounded-2xl bg-white/22 border border-white/20 flex items-center justify-center shrink-0">
                  <HeartPulse className="w-6 h-6 text-white" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold leading-snug">
                    Daily Check-in
                  </h3>
                  <p className="text-xs text-white/80">
                    Symptoms, mood &amp; notes
                  </p>
                </div>
              </div>

              <div className="flex items-end justify-between gap-3 pt-6 relative z-10">
                <div className="min-w-0">
                  <span className="block text-xs text-white/85">
                    Today&apos;s log
                  </span>
                  <span className="block text-xl sm:text-2xl font-bold tracking-tight mt-0.5 truncate">
                    {todayCountLabel}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => onOpenDailyLogModal(today, 'symptoms')}
                  aria-label="Open daily check-in"
                  className="w-11 h-11 rounded-full border-2 border-white/85 bg-white/15 hover:bg-white/25 flex items-center justify-center shrink-0 transition-colors"
                >
                  <ChevronRight className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom 3-Card Metric Row with Floating Top Violet Icon Badges */}
        <section aria-label="Cycle metrics" className="pt-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-4 lg:gap-5">
            {/* Card 1: Cycle Progress / Avg Cycle Length */}
            <div className="luma-card rounded-[24px] px-5 pb-5 pt-8 relative mt-3">
              <div className="w-12 h-12 rounded-2xl luma-violet-gradient text-white flex items-center justify-center shadow-[0_10px_20px_-6px_rgba(88,71,184,0.45)] absolute -top-5 left-1/2 -translate-x-1/2">
                <CalendarDays className="w-5 h-5" />
              </div>
              <button
                type="button"
                onClick={() => onNavigate('calendar')}
                aria-label="Open Calendar"
                className="absolute top-3.5 right-3.5 w-8 h-8 rounded-xl flex items-center justify-center text-[var(--luma-muted)] hover:bg-[var(--luma-subtle)]"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              <div className="text-center">
                <h3 className="text-base font-bold text-[var(--luma-text)]">
                  Cycle Rhythm
                </h3>
                <p className="text-xs text-[var(--luma-muted)] mt-0.5 tabular-nums">
                  {summary.averageCycleLength !== null
                    ? `${summary.averageCycleLength}d avg · ${summary.completedIntervals.length} cycle(s)`
                    : `Baseline ${settings.averageCycleLength} days`}
                </p>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between text-xs font-medium mb-1.5">
                  <span className="text-[var(--luma-muted)]">Progress</span>
                  <span className="text-[var(--luma-text)] tabular-nums">
                    {cycleProgressPct}%
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-[var(--luma-subtle)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#1EC26D] transition-all"
                    style={{ width: `${cycleProgressPct}%` }}
                  />
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-2">
                <span className="text-xs text-[var(--luma-muted)] tabular-nums">
                  {summary.currentCycleDay !== null
                    ? `Day ${summary.currentCycleDay} / ${summary.prediction.effectiveCycleLength}d`
                    : 'Awaiting start'}
                </span>
                <span className="px-2.5 py-1 rounded-full bg-[var(--luma-rose-soft)] text-[var(--luma-rose-deep)] text-[11px] font-semibold tabular-nums whitespace-nowrap">
                  {countdownShort}
                </span>
              </div>
            </div>

            {/* Card 2: Period Duration */}
            <div className="luma-card rounded-[24px] px-5 pb-5 pt-8 relative mt-3">
              <div className="w-12 h-12 rounded-2xl luma-violet-gradient text-white flex items-center justify-center shadow-[0_10px_20px_-6px_rgba(88,71,184,0.45)] absolute -top-5 left-1/2 -translate-x-1/2">
                <Droplets className="w-5 h-5" />
              </div>
              <button
                type="button"
                onClick={() => onNavigate('insights')}
                aria-label="View Insights"
                className="absolute top-3.5 right-3.5 w-8 h-8 rounded-xl flex items-center justify-center text-[var(--luma-muted)] hover:bg-[var(--luma-subtle)]"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              <div className="text-center">
                <h3 className="text-base font-bold text-[var(--luma-text)]">
                  Period Duration
                </h3>
                <p className="text-xs text-[var(--luma-muted)] mt-0.5 tabular-nums">
                  {summary.averagePeriodDuration !== null
                    ? `${summary.averagePeriodDuration} days average`
                    : 'Set end dates to calculate'}
                </p>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between text-xs font-medium mb-1.5">
                  <span className="text-[var(--luma-muted)]">Confidence</span>
                  <span className="text-[var(--luma-text)] tabular-nums">
                    {summary.completedIntervals.length >= 4
                      ? 'High'
                      : summary.completedIntervals.length >= 2
                      ? 'Growing'
                      : 'Early'}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-[var(--luma-subtle)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#1EC26D] transition-all"
                    style={{ width: `${periodProgressPct}%` }}
                  />
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-2">
                <span className="text-xs text-[var(--luma-muted)] tabular-nums">
                  {cycles.length} {cycles.length === 1 ? 'period' : 'periods'}
                </span>
                <span className="px-2.5 py-1 rounded-full bg-[var(--luma-rose-soft)] text-[var(--luma-rose-deep)] text-[11px] font-semibold whitespace-nowrap">
                  {summary.prediction.confidenceLabel}
                </span>
              </div>
            </div>

            {/* Card 3: Symptoms & Journal */}
            <div className="luma-card rounded-[24px] px-5 pb-5 pt-8 relative mt-3">
              <div className="w-12 h-12 rounded-2xl luma-violet-gradient text-white flex items-center justify-center shadow-[0_10px_20px_-6px_rgba(88,71,184,0.45)] absolute -top-5 left-1/2 -translate-x-1/2">
                <BookOpen className="w-5 h-5" />
              </div>
              <button
                type="button"
                onClick={() => onNavigate('journal')}
                aria-label="Open Journal"
                className="absolute top-3.5 right-3.5 w-8 h-8 rounded-xl flex items-center justify-center text-[var(--luma-muted)] hover:bg-[var(--luma-subtle)]"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              <div className="text-center">
                <h3 className="text-base font-bold text-[var(--luma-text)]">
                  Wellness Notes
                </h3>
                <p className="text-xs text-[var(--luma-muted)] mt-0.5 truncate">
                  {topSymptomSummary}
                </p>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between text-xs font-medium mb-1.5">
                  <span className="text-[var(--luma-muted)]">Check-ins</span>
                  <span className="text-[var(--luma-text)] tabular-nums">
                    {dailyLogs.length} total
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-[var(--luma-subtle)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#1EC26D] transition-all"
                    style={{
                      width: `${Math.min(100, dailyLogs.length * 10)}%`,
                    }}
                  />
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-2">
                <span className="text-xs text-[var(--luma-muted)] truncate">
                  {observations[0]?.text
                    ? 'Pattern ready'
                    : 'Private on device'}
                </span>
                <button
                  type="button"
                  onClick={() => onOpenDailyLogModal(today, 'journal')}
                  className="px-2.5 py-1 rounded-full bg-[var(--luma-rose-soft)] text-[var(--luma-rose-deep)] text-[11px] font-semibold whitespace-nowrap hover:opacity-90"
                >
                  Write Note
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Subtle Truthful Personal Observation Bar (only when real observations exist) */}
        {observations.length > 0 && (
          <section className="luma-card rounded-[24px] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="w-9 h-9 rounded-xl bg-[var(--luma-plum-soft)] text-[var(--luma-plum)] flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-[var(--luma-text)]">
                  Personal insight
                </h3>
                <p className="text-xs sm:text-sm text-[var(--luma-muted)] mt-0.5 leading-relaxed">
                  {observations[0].text}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('insights')}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-[var(--luma-subtle)] text-xs font-semibold text-[var(--luma-plum)] hover:opacity-90 whitespace-nowrap shrink-0 self-start sm:self-center"
            >
              View Insights
            </button>
          </section>
        )}
      </div>

      {/* Right Docked Panel (matching Friends + Live Map sidebar in reference) */}
      <aside className="xl:col-span-4 space-y-6 xl:border-l xl:border-[var(--luma-border)] xl:pl-6">
        {/* Recent Check-ins / Periods List */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[var(--luma-plum)]" />
              <h2 className="text-base font-bold text-[var(--luma-text)]">
                Recent Logs
              </h2>
            </div>
            <button
              type="button"
              onClick={() =>
                onNavigate(rightTab === 'logs' ? 'journal' : 'insights')
              }
              className="text-xs font-semibold text-[var(--luma-plum)] hover:underline"
            >
              View All
            </button>
          </div>

          {/* Segmented Switch (Activities | Online style) */}
          <div className="grid grid-cols-2 p-1 rounded-2xl bg-[var(--luma-subtle)] mb-4">
            <button
              type="button"
              onClick={() => setRightTab('logs')}
              className={`min-h-[38px] rounded-xl text-xs font-semibold transition-all ${
                rightTab === 'logs'
                  ? 'bg-[var(--luma-plum)] text-white shadow-sm'
                  : 'text-[var(--luma-muted)] hover:text-[var(--luma-text)]'
              }`}
            >
              Check-ins
            </button>
            <button
              type="button"
              onClick={() => setRightTab('periods')}
              className={`min-h-[38px] rounded-xl text-xs font-semibold transition-all ${
                rightTab === 'periods'
                  ? 'bg-[var(--luma-plum)] text-white shadow-sm'
                  : 'text-[var(--luma-muted)] hover:text-[var(--luma-text)]'
              }`}
            >
              Periods
            </button>
          </div>

          {rightTab === 'logs' ? (
            recentLogs.length === 0 ? (
              <div className="rounded-2xl bg-[var(--luma-subtle)]/70 p-4 text-center space-y-2.5">
                <p className="text-xs text-[var(--luma-muted)]">
                  No daily check-ins yet. Log mood, symptoms, or private notes.
                </p>
                <button
                  type="button"
                  onClick={() => onOpenDailyLogModal(today, 'all')}
                  className="min-h-[38px] px-4 py-1.5 rounded-xl bg-[var(--luma-plum)] text-white text-xs font-semibold inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Check-in</span>
                </button>
              </div>
            ) : (
              <ul className="space-y-3">
                {recentLogs.map((log) => {
                  const summaryText = [
                    log.bleedingFlow && log.bleedingFlow !== 'none'
                      ? `${log.bleedingFlow} flow`
                      : null,
                    log.mood,
                    log.symptoms[0],
                  ]
                    .filter(Boolean)
                    .join(' · ');

                  return (
                    <li
                      key={log.id}
                      className="flex items-center justify-between gap-3"
                    >
                      <button
                        type="button"
                        onClick={() => onOpenDailyLogModal(log.date, 'all')}
                        className="flex items-center gap-3 min-w-0 text-left group flex-1"
                      >
                        <span className="w-10 h-10 rounded-full bg-[var(--luma-plum-soft)] text-[var(--luma-plum)] flex items-center justify-center text-xs font-bold shrink-0 tabular-nums">
                          {log.date.slice(8, 10)}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-[var(--luma-text)] group-hover:text-[var(--luma-plum)] truncate">
                            {formatDisplayDate(log.date, 'MMM d, yyyy')}
                          </span>
                          <span className="block text-xs text-[var(--luma-muted)] truncate">
                            {summaryText || 'Journal note'}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenDailyLogModal(log.date, 'all')}
                        aria-label={`Edit log for ${log.date}`}
                        className="w-8 h-8 rounded-xl border border-[var(--luma-border)] flex items-center justify-center text-[var(--luma-muted)] hover:text-[var(--luma-plum)] shrink-0"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )
          ) : recentCycles.length === 0 ? (
            <div className="rounded-2xl bg-[var(--luma-subtle)]/70 p-4 text-center space-y-2.5">
              <p className="text-xs text-[var(--luma-muted)]">
                No periods recorded yet.
              </p>
              <button
                type="button"
                onClick={() => onOpenPeriodModal(null)}
                className="min-h-[38px] px-4 py-1.5 rounded-xl bg-[var(--luma-plum)] text-white text-xs font-semibold inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Log Period</span>
              </button>
            </div>
          ) : (
            <ul className="space-y-3">
              {recentCycles.map((cycle) => {
                const dur = cycle.endDate
                  ? diffDaysLocal(cycle.startDate, cycle.endDate) + 1
                  : null;
                return (
                  <li
                    key={cycle.id}
                    className="flex items-center justify-between gap-3"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenPeriodModal(cycle)}
                      className="flex items-center gap-3 min-w-0 text-left group flex-1"
                    >
                      <span className="w-10 h-10 rounded-full bg-[var(--luma-rose-soft)] text-[var(--luma-rose-deep)] flex items-center justify-center shrink-0">
                        <Droplets className="w-4 h-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-[var(--luma-text)] group-hover:text-[var(--luma-plum)] truncate tabular-nums">
                          {formatDisplayDate(cycle.startDate, 'MMM d, yyyy')}
                        </span>
                        <span className="block text-xs text-[var(--luma-muted)] tabular-nums">
                          {dur !== null
                            ? `${dur} day duration`
                            : 'Ongoing / open end'}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenPeriodModal(cycle)}
                      aria-label={`Edit period ${cycle.startDate}`}
                      className="w-8 h-8 rounded-xl border border-[var(--luma-border)] flex items-center justify-center text-[var(--luma-muted)] hover:text-[var(--luma-plum)] shrink-0"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Bottom Cycle Ring Snapshot Card (matching Live map + View card in reference) */}
        <div className="pt-4 border-t border-[var(--luma-border)]">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-[var(--luma-plum)]" />
              <h2 className="text-base font-bold text-[var(--luma-text)]">
                Cycle Wheel
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('calendar')}
              className="text-xs font-semibold text-[var(--luma-plum)] hover:underline"
            >
              View
            </button>
          </div>

          <div className="rounded-[24px] bg-[var(--luma-subtle)]/75 border border-[var(--luma-border)] p-4 flex flex-col items-center">
            <CycleRing summary={summary} compact />
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-[var(--luma-muted)]">
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-1.5 rounded-sm bg-[var(--luma-rose)]" />
                Period
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-1.5 rounded-sm bg-[var(--luma-plum)]" />
                Elapsed
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-0 border-t-2 border-dashed border-[var(--luma-muted)]" />
                Estimate
              </span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
};
