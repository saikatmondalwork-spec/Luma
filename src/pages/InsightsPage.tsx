import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  CalendarDays,
  Droplets,
  Edit3,
  Plus,
  Sparkles,
} from 'lucide-react';
import { useLuma } from '@/src/context/LumaContext';
import {
  CycleRecord,
  ENERGY_OPTIONS,
  MOOD_OPTIONS,
} from '@/src/types/luma';
import { diffDaysLocal, formatDisplayDate } from '@/src/utils/dateUtils';
import { sortCyclesChronological } from '@/src/services/cycleEngine';

interface InsightsPageProps {
  onOpenPeriodModal: (cycle?: CycleRecord | null) => void;
  onOpenDailyLogModal: (date: string) => void;
}

export const InsightsPage: React.FC<InsightsPageProps> = ({
  onOpenPeriodModal,
}) => {
  const { cycles, dailyLogs, summary, observations, settings } = useLuma();

  const cycleLengthChartData = useMemo(
    () =>
      summary.completedIntervals.map((item) => ({
        label: formatDisplayDate(item.startDate, 'MMM d'),
        days: item.lengthDays,
      })),
    [summary.completedIntervals]
  );

  const periodDurationChartData = useMemo(() => {
    return sortCyclesChronological(cycles)
      .filter((c) => c.endDate !== null)
      .map((c) => ({
        label: formatDisplayDate(c.startDate, 'MMM d'),
        days: diffDaysLocal(c.startDate, c.endDate!) + 1,
      }));
  }, [cycles]);

  const symptomChartData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const log of dailyLogs) {
      for (const s of log.symptoms) {
        counts.set(s, (counts.get(s) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));
  }, [dailyLogs]);

  const moodChartData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of MOOD_OPTIONS) counts.set(m, 0);
    for (const log of dailyLogs) {
      if (log.mood) {
        counts.set(log.mood, (counts.get(log.mood) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([mood, count]) => ({ mood, count }));
  }, [dailyLogs]);

  const energyChartData = useMemo(() => {
    return [...dailyLogs]
      .filter((l) => l.energyLevel !== null)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-20)
      .map((l) => {
        const found = ENERGY_OPTIONS.find((e) => e.value === l.energyLevel);
        return {
          label: formatDisplayDate(l.date, 'MMM d'),
          score: found?.score ?? 3,
        };
      });
  }, [dailyLogs]);

  const sortedCyclesDesc = useMemo(
    () => [...cycles].sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [cycles]
  );

  const tooltipStyle = {
    backgroundColor: 'var(--luma-surface)',
    border: '1px solid var(--luma-border)',
    borderRadius: '14px',
    color: 'var(--luma-text)',
    fontSize: '12px',
    boxShadow: '0 10px 24px -8px rgba(74, 59, 158, 0.16)',
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-[var(--luma-muted)]">
          All statistics reflect only your actual recorded cycles and daily logs.
        </p>
        <button
          type="button"
          onClick={() => onOpenPeriodModal(null)}
          className="min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2 rounded-2xl luma-violet-gradient text-white text-sm font-semibold hover:opacity-95 shadow-[0_12px_24px_-10px_rgba(88,71,184,0.45)] whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add Historical Period</span>
        </button>
      </div>

      {/* Top KPI Row matching reference card style */}
      <section
        aria-label="Cycle statistics"
        className="grid grid-cols-2 lg:grid-cols-4 gap-5 pt-2"
      >
        <div className="luma-card rounded-[24px] p-5 relative mt-2">
          <div className="w-10 h-10 rounded-2xl luma-violet-gradient text-white flex items-center justify-center -mt-9 mb-3 shadow-md">
            <CalendarDays className="w-4 h-4" />
          </div>
          <span className="block text-xs font-medium text-[var(--luma-muted)]">
            Average cycle length
          </span>
          <span className="mt-1 block text-2xl sm:text-3xl font-bold text-[var(--luma-text)] tabular-nums">
            {summary.averageCycleLength !== null
              ? `${summary.averageCycleLength}d`
              : '—'}
          </span>
          <span className="mt-1 block text-xs text-[var(--luma-muted)]">
            {summary.completedIntervals.length > 0
              ? `Across ${summary.completedIntervals.length} cycle(s)`
              : `Baseline ${settings.averageCycleLength} days`}
          </span>
        </div>

        <div className="luma-card rounded-[24px] p-5 relative mt-2">
          <div className="w-10 h-10 rounded-2xl luma-pink-gradient text-white flex items-center justify-center -mt-9 mb-3 shadow-md">
            <Activity className="w-4 h-4" />
          </div>
          <span className="block text-xs font-medium text-[var(--luma-muted)]">
            Cycle length range
          </span>
          <span className="mt-1 block text-2xl sm:text-3xl font-bold text-[var(--luma-text)] tabular-nums">
            {summary.shortestCycleLength !== null &&
            summary.longestCycleLength !== null
              ? summary.shortestCycleLength === summary.longestCycleLength
                ? `${summary.shortestCycleLength}d`
                : `${summary.shortestCycleLength}–${summary.longestCycleLength}d`
              : '—'}
          </span>
          <span className="mt-1 block text-xs text-[var(--luma-muted)]">
            Shortest to longest
          </span>
        </div>

        <div className="luma-card rounded-[24px] p-5 relative mt-2">
          <div className="w-10 h-10 rounded-2xl luma-violet-gradient text-white flex items-center justify-center -mt-9 mb-3 shadow-md">
            <Droplets className="w-4 h-4" />
          </div>
          <span className="block text-xs font-medium text-[var(--luma-muted)]">
            Average period duration
          </span>
          <span className="mt-1 block text-2xl sm:text-3xl font-bold text-[var(--luma-text)] tabular-nums">
            {summary.averagePeriodDuration !== null
              ? `${summary.averagePeriodDuration}d`
              : '—'}
          </span>
          <span className="mt-1 block text-xs text-[var(--luma-muted)]">
            {periodDurationChartData.length > 0
              ? `From ${periodDurationChartData.length} period(s)`
              : 'Needs end dates'}
          </span>
        </div>

        <div className="luma-card rounded-[24px] p-5 relative mt-2">
          <div className="w-10 h-10 rounded-2xl luma-pink-gradient text-white flex items-center justify-center -mt-9 mb-3 shadow-md">
            <Sparkles className="w-4 h-4" />
          </div>
          <span className="block text-xs font-medium text-[var(--luma-muted)]">
            Prediction confidence
          </span>
          <span className="mt-1 block text-lg sm:text-xl font-bold text-[var(--luma-plum)]">
            {summary.prediction.confidenceLabel}
          </span>
          <span className="mt-1 block text-xs text-[var(--luma-muted)]">
            Estimates are not guarantees
          </span>
        </div>
      </section>

      {/* Personalized Observations */}
      <section
        aria-label="Personalized observations"
        className="rounded-[28px] luma-violet-gradient text-white p-6 shadow-[0_18px_36px_-14px_rgba(88,71,184,0.45)] space-y-3"
      >
        <h2 className="text-lg sm:text-xl font-bold tracking-tight">
          Personal observations
        </h2>
        {observations.length > 0 ? (
          <ul className="space-y-2 text-sm sm:text-base text-white/90 leading-relaxed">
            {observations.map((obs) => (
              <li key={obs.id} className="flex items-start gap-2.5">
                <span
                  className="w-2 h-2 rounded-full bg-[#FF89A8] mt-2 shrink-0"
                  aria-hidden="true"
                />
                <span>{obs.text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-white/80 leading-relaxed">
            There is not enough recorded history yet to generate personal
            pattern observations. Logging at least two period start dates and a
            few daily symptom or mood entries will unlock tailored summaries.
          </p>
        )}
        <p className="text-xs text-white/65 pt-2 border-t border-white/15">
          Luma summarizes trends solely from your entries and does not diagnose
          hormonal or medical conditions.
        </p>
      </section>

      {/* Visual Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="luma-card rounded-[28px] p-5 sm:p-6">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-[var(--luma-text)]">
              Cycle length over time
            </h2>
            <p className="text-xs text-[var(--luma-muted)] mt-0.5">
              Days between consecutive recorded period start dates
            </p>
          </div>
          {cycleLengthChartData.length >= 1 ? (
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={cycleLengthChartData}
                  margin={{ top: 10, right: 16, left: -16, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--luma-border)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12, fill: 'var(--luma-muted)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={['dataMin - 3', 'dataMax + 3']}
                    tick={{ fontSize: 12, fill: 'var(--luma-muted)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(val) => [`${val} days`, 'Cycle length']}
                  />
                  <ReferenceLine
                    y={settings.averageCycleLength}
                    stroke="var(--luma-muted)"
                    strokeDasharray="4 4"
                  />
                  <Line
                    type="monotone"
                    dataKey="days"
                    stroke="var(--luma-plum)"
                    strokeWidth={3}
                    dot={{ r: 5, fill: 'var(--luma-rose)', stroke: '#fff', strokeWidth: 2 }}
                    activeDot={{ r: 7 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-52 flex items-center justify-center text-center px-6 rounded-2xl bg-[var(--luma-canvas)] border border-[var(--luma-border)]">
              <p className="text-sm text-[var(--luma-muted)]">
                Record at least two period start dates to chart cycle lengths
                over time.
              </p>
            </div>
          )}
        </section>

        <section className="luma-card rounded-[28px] p-5 sm:p-6">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-[var(--luma-text)]">
              Period duration over time
            </h2>
            <p className="text-xs text-[var(--luma-muted)] mt-0.5">
              Recorded bleeding days for periods with an end date
            </p>
          </div>
          {periodDurationChartData.length >= 1 ? (
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={periodDurationChartData}
                  margin={{ top: 10, right: 16, left: -16, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--luma-border)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12, fill: 'var(--luma-muted)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 12, fill: 'var(--luma-muted)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(val) => [`${val} days`, 'Period length']}
                  />
                  <Bar
                    dataKey="days"
                    fill="var(--luma-rose)"
                    radius={[10, 10, 0, 0]}
                    maxBarSize={42}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-52 flex items-center justify-center text-center px-6 rounded-2xl bg-[var(--luma-canvas)] border border-[var(--luma-border)]">
              <p className="text-sm text-[var(--luma-muted)]">
                Add an end date to a recorded period to view period duration
                history.
              </p>
            </div>
          )}
        </section>

        <section className="luma-card rounded-[28px] p-5 sm:p-6">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-[var(--luma-text)]">
              Symptom frequency
            </h2>
            <p className="text-xs text-[var(--luma-muted)] mt-0.5">
              Most commonly logged symptoms across all daily entries
            </p>
          </div>
          {symptomChartData.length >= 1 ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={symptomChartData}
                  layout="vertical"
                  margin={{ top: 4, right: 20, left: 12, bottom: 4 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--luma-border)"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 12, fill: 'var(--luma-muted)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={110}
                    tick={{ fontSize: 12, fill: 'var(--luma-text)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(val) => [`${val} day(s)`, 'Logged']}
                  />
                  <Bar
                    dataKey="count"
                    fill="var(--luma-plum)"
                    radius={[0, 10, 10, 0]}
                    maxBarSize={26}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-52 flex items-center justify-center text-center px-6 rounded-2xl bg-[var(--luma-canvas)] border border-[var(--luma-border)]">
              <p className="text-sm text-[var(--luma-muted)]">
                Log symptoms in your daily check-in to uncover which symptoms
                appear most often.
              </p>
            </div>
          )}
        </section>

        <section className="luma-card rounded-[28px] p-5 sm:p-6 space-y-6">
          <div>
            <h2 className="text-lg font-bold text-[var(--luma-text)]">
              Mood &amp; energy patterns
            </h2>
            <p className="text-xs text-[var(--luma-muted)] mt-0.5">
              Distribution of logged moods and recent energy levels (1–5)
            </p>
          </div>

          {moodChartData.length === 0 && energyChartData.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-center px-6 rounded-2xl bg-[var(--luma-canvas)] border border-[var(--luma-border)]">
              <p className="text-sm text-[var(--luma-muted)]">
                Record your mood and energy levels during daily check-ins to
                track emotional and energy patterns over time.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {moodChartData.length > 0 && (
                <div className="h-36 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={moodChartData}
                      margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                    >
                      <XAxis
                        dataKey="mood"
                        tick={{ fontSize: 11, fill: 'var(--luma-muted)' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 11, fill: 'var(--luma-muted)' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(val) => [`${val} day(s)`, 'Mood']}
                      />
                      <Bar
                        dataKey="count"
                        fill="var(--luma-lavender)"
                        radius={[8, 8, 0, 0]}
                        maxBarSize={32}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {energyChartData.length > 0 && (
                <div className="h-32 w-full pt-2 border-t border-[var(--luma-border)]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={energyChartData}
                      margin={{ top: 8, right: 12, left: -20, bottom: 0 }}
                    >
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: 'var(--luma-muted)' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        domain={[1, 5]}
                        ticks={[1, 3, 5]}
                        tick={{ fontSize: 11, fill: 'var(--luma-muted)' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(val) => [`${val} / 5`, 'Energy']}
                      />
                      <Line
                        type="monotone"
                        dataKey="score"
                        stroke="#1EC26D"
                        strokeWidth={2.5}
                        dot={{ r: 3.5, fill: '#1EC26D' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Full Cycle & Period History */}
      <section className="luma-card rounded-[28px] p-5 sm:p-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <h2 className="text-lg sm:text-xl font-bold text-[var(--luma-text)]">
            All recorded periods
          </h2>
          <span className="px-3 py-1 rounded-full bg-[var(--luma-plum-soft)] text-xs font-semibold text-[var(--luma-plum)] tabular-nums">
            {sortedCyclesDesc.length} total
          </span>
        </div>

        {sortedCyclesDesc.length === 0 ? (
          <p className="text-sm text-[var(--luma-muted)] py-4">
            No period records stored yet.
          </p>
        ) : (
          <div className="divide-y divide-[var(--luma-border)]">
            {sortedCyclesDesc.map((cycle) => {
              const duration = cycle.endDate
                ? diffDaysLocal(cycle.startDate, cycle.endDate) + 1
                : null;
              const interval = summary.completedIntervals.find(
                (i) => i.cycleId === cycle.id
              );

              return (
                <div
                  key={cycle.id}
                  className="py-3.5 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm sm:text-base font-semibold text-[var(--luma-text)] tabular-nums">
                      {formatDisplayDate(cycle.startDate, 'MMM d, yyyy')}
                      {cycle.endDate
                        ? ` – ${formatDisplayDate(cycle.endDate, 'MMM d, yyyy')}`
                        : ' · Ongoing'}
                    </p>
                    <p className="text-xs text-[var(--luma-muted)] tabular-nums">
                      {duration !== null
                        ? `${duration} day period`
                        : 'End date open'}
                      {interval ? ` · ${interval.lengthDays} day cycle` : ''}
                      {cycle.notes ? ` · ${cycle.notes}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenPeriodModal(cycle)}
                    aria-label={`Edit period ${cycle.startDate}`}
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[var(--luma-muted)] hover:text-[var(--luma-plum)] hover:bg-[var(--luma-subtle)] shrink-0"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
