import React, { useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Droplets,
  Edit3,
  FileText,
  Plus,
} from 'lucide-react';
import { useLuma } from '@/src/context/LumaContext';
import {
  BLEEDING_FLOW_OPTIONS,
  BleedingFlow,
  CycleRecord,
} from '@/src/types/luma';
import {
  formatDisplayDate,
  getCalendarMonthGrid,
  getMonthKey,
  stepMonthAnchor,
  todayLocalDate,
} from '@/src/utils/dateUtils';
import { getCalendarDayInfo } from '@/src/services/cycleEngine';

interface CalendarPageProps {
  onOpenPeriodModal: (cycle?: CycleRecord | null, defaultStartDate?: string) => void;
  onOpenDailyLogModal: (date: string) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const CalendarPage: React.FC<CalendarPageProps> = ({
  onOpenPeriodModal,
  onOpenDailyLogModal,
}) => {
  const { cycles, dailyLogs, summary, upsertDailyLog } = useLuma();
  const today = todayLocalDate();

  const [monthAnchor, setMonthAnchor] = useState(`${today.slice(0, 7)}-01`);
  const [selectedDate, setSelectedDate] = useState(today);

  const gridDays = useMemo(
    () => getCalendarMonthGrid(monthAnchor),
    [monthAnchor]
  );

  const logsByDate = useMemo(() => {
    const map = new Map<string, (typeof dailyLogs)[number]>();
    for (const log of dailyLogs) map.set(log.date, log);
    return map;
  }, [dailyLogs]);

  const currentMonthKey = getMonthKey(monthAnchor);
  const selectedLog = logsByDate.get(selectedDate) ?? null;
  const selectedDayInfo = getCalendarDayInfo(
    selectedDate,
    cycles,
    summary,
    today
  );
  const isFutureSelected = selectedDate > today;

  const handleQuickFlowChange = async (flow: BleedingFlow) => {
    if (isFutureSelected) return;
    const nextFlow = selectedLog?.bleedingFlow === flow ? null : flow;
    await upsertDailyLog(selectedDate, { bleedingFlow: nextFlow });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-[var(--luma-muted)]">
          Tap any date to inspect recorded periods, estimates, or update your
          daily check-in.
        </p>

        <button
          type="button"
          onClick={() =>
            onOpenPeriodModal(null, selectedDate <= today ? selectedDate : today)
          }
          className="min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2 rounded-2xl luma-pink-gradient text-white text-sm font-semibold hover:opacity-95 shadow-[0_12px_24px_-10px_rgba(242,85,125,0.45)] whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Log Period</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Monthly Calendar Card */}
        <section
          aria-label="Monthly calendar"
          className="lg:col-span-7 xl:col-span-8 luma-card rounded-[28px] p-4 sm:p-6"
        >
          <div className="flex items-center justify-between gap-2 mb-5">
            <h2 className="text-xl sm:text-2xl font-bold text-[var(--luma-text)] tracking-tight">
              {formatDisplayDate(monthAnchor, 'MMMM yyyy')}
            </h2>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setMonthAnchor(`${today.slice(0, 7)}-01`);
                  setSelectedDate(today);
                }}
                className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[var(--luma-plum-soft)] text-xs font-semibold text-[var(--luma-plum)] hover:opacity-90 whitespace-nowrap"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setMonthAnchor((m) => stepMonthAnchor(m, -1))}
                aria-label="Previous month"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-[var(--luma-border)] bg-[var(--luma-surface)] text-[var(--luma-text)] hover:bg-[var(--luma-subtle)]"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setMonthAnchor((m) => stepMonthAnchor(m, 1))}
                aria-label="Next month"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-[var(--luma-border)] bg-[var(--luma-surface)] text-[var(--luma-text)] hover:bg-[var(--luma-subtle)]"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-2 text-center">
            {WEEKDAYS.map((wd) => (
              <div
                key={wd}
                className="py-1 text-[11px] sm:text-xs font-semibold text-[var(--luma-muted)]"
              >
                {wd}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {gridDays.map((ymd) => {
              const inMonth = getMonthKey(ymd) === currentMonthKey;
              const isToday = ymd === today;
              const isSelected = ymd === selectedDate;
              const info = getCalendarDayInfo(ymd, cycles, summary, today);
              const log = logsByDate.get(ymd);
              const hasLog = Boolean(log);
              const hasSymptomsOrMood = Boolean(
                log && (log.symptoms.length > 0 || log.mood || log.energyLevel)
              );
              const hasJournal = Boolean(log && log.notes.trim().length > 0);
              const dayNum = Number(ymd.slice(8, 10));

              let cellSurface =
                'bg-[var(--luma-canvas)]/60 hover:bg-[var(--luma-subtle)] border-transparent';
              if (info.kind === 'recorded-period') {
                cellSurface =
                  'bg-[var(--luma-rose-soft)] border-[#F4BAC9] dark:border-[#6E3446]';
              } else if (info.kind === 'estimated-period') {
                cellSurface =
                  'bg-[var(--luma-plum-soft)]/70 border-dashed border-[var(--luma-lavender)]';
              } else if (info.kind === 'fertile-estimate') {
                cellSurface =
                  'bg-[#E7F8EE] dark:bg-[#1A3527] border-[#B4E7C9] dark:border-[#2C5B42]';
              }

              const ariaTags = [
                formatDisplayDate(ymd, 'MMMM d, yyyy'),
                isToday ? 'Today' : '',
                info.kind === 'recorded-period' ? 'Recorded period' : '',
                info.kind === 'estimated-period' ? 'Estimated period' : '',
                info.kind === 'fertile-estimate' ? 'Estimated fertile window' : '',
                hasLog ? 'Has daily entry' : '',
              ]
                .filter(Boolean)
                .join(', ');

              return (
                <button
                  key={ymd}
                  type="button"
                  onClick={() => setSelectedDate(ymd)}
                  aria-label={ariaTags}
                  aria-pressed={isSelected}
                  className={`relative min-h-[54px] sm:min-h-[66px] rounded-2xl border p-1 sm:p-1.5 flex flex-col items-center justify-between transition-all ${cellSurface} ${
                    isSelected
                      ? 'ring-2 ring-[var(--luma-plum)] ring-offset-2 ring-offset-[var(--luma-surface)]'
                      : ''
                  } ${!inMonth ? 'opacity-40' : ''}`}
                >
                  <span
                    className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs sm:text-sm tabular-nums ${
                      isToday
                        ? 'luma-violet-gradient text-white font-bold shadow-xs'
                        : info.kind === 'recorded-period'
                        ? 'text-[var(--luma-rose-deep)] font-bold'
                        : 'text-[var(--luma-text)] font-semibold'
                    }`}
                  >
                    {dayNum}
                  </span>

                  <div className="flex items-center justify-center gap-1 min-h-[10px]">
                    {info.kind === 'recorded-period' && (
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-[var(--luma-rose)]"
                        title="Recorded period"
                      />
                    )}
                    {info.kind === 'estimated-period' && (
                      <span
                        className="w-2 h-0 border-t-2 border-dashed border-[var(--luma-plum)]"
                        title="Estimated period"
                      />
                    )}
                    {info.isEstimatedOvulationDay && (
                      <span
                        className="w-1.5 h-1.5 rotate-45 bg-[var(--luma-sage)]"
                        title="Estimated ovulation"
                      />
                    )}
                    {hasSymptomsOrMood && (
                      <span
                        className="w-1.5 h-1.5 rounded-sm bg-[var(--luma-plum)]"
                        title="Symptoms or mood logged"
                      />
                    )}
                    {hasJournal && (
                      <span
                        className="w-2.5 h-[2px] rounded-full bg-[var(--luma-text)]/60"
                        title="Journal note"
                      />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-5 pt-4 border-t border-[var(--luma-border)] flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--luma-muted)]">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-md bg-[var(--luma-rose-soft)] border border-[#F4BAC9]" />
              <span>Recorded period</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-md bg-[var(--luma-plum-soft)] border border-dashed border-[var(--luma-lavender)]" />
              <span>Estimated period</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm bg-[var(--luma-plum)]" />
              <span>Symptoms / mood</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-[2px] rounded-full bg-[var(--luma-text)]/60" />
              <span>Journal note</span>
            </span>
            {summary.prediction.fertileWindow && (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-md bg-[#E7F8EE] border border-[#B4E7C9]" />
                <span>Fertile window (est.)</span>
              </span>
            )}
          </div>
        </section>

        {/* Day Detail Panel */}
        <aside
          aria-label="Selected day details"
          className="lg:col-span-5 xl:col-span-4 luma-card rounded-[28px] p-5 sm:p-6 space-y-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-[var(--luma-muted)]">
                {selectedDate === today
                  ? 'Today'
                  : isFutureSelected
                  ? 'Upcoming date'
                  : 'Past date'}
                {selectedDayInfo.cycleDayNumber !== null && (
                  <>
                    <span className="mx-1.5" aria-hidden="true">
                      ·
                    </span>
                    <span className="tabular-nums text-[var(--luma-plum)] font-semibold">
                      Cycle Day {selectedDayInfo.cycleDayNumber}
                    </span>
                  </>
                )}
              </p>
              <h2 className="text-xl font-bold text-[var(--luma-text)] mt-0.5 tracking-tight">
                {formatDisplayDate(selectedDate, 'EEEE, MMM d')}
              </h2>
            </div>

            {!isFutureSelected && (
              <button
                type="button"
                onClick={() => onOpenDailyLogModal(selectedDate)}
                className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[var(--luma-plum-soft)] text-xs font-semibold text-[var(--luma-plum)] hover:opacity-90 whitespace-nowrap shrink-0"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>{selectedLog ? 'Edit Day' : 'Log Day'}</span>
              </button>
            )}
          </div>

          <div className="rounded-2xl border border-[var(--luma-border)] bg-[var(--luma-canvas)] p-4 space-y-2">
            {selectedDayInfo.kind === 'recorded-period' &&
            selectedDayInfo.cycleRecord ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--luma-rose-deep)]">
                    <Droplets className="w-4 h-4" />
                    <span>Recorded period day</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenPeriodModal(selectedDayInfo.cycleRecord)}
                    className="text-xs font-semibold text-[var(--luma-plum)] hover:underline"
                  >
                    Edit dates
                  </button>
                </div>
                <p className="text-xs text-[var(--luma-muted)] tabular-nums">
                  Started{' '}
                  {formatDisplayDate(
                    selectedDayInfo.cycleRecord.startDate,
                    'MMM d'
                  )}
                  {selectedDayInfo.cycleRecord.endDate
                    ? ` · Ended ${formatDisplayDate(
                        selectedDayInfo.cycleRecord.endDate,
                        'MMM d'
                      )}`
                    : ' · Currently ongoing'}
                </p>
              </>
            ) : selectedDayInfo.kind === 'estimated-period' ? (
              <>
                <p className="text-sm font-semibold text-[var(--luma-plum)]">
                  Estimated period window
                </p>
                <p className="text-xs text-[var(--luma-muted)]">
                  Projected from your cycle pattern. Not a guaranteed date.
                </p>
              </>
            ) : selectedDayInfo.kind === 'fertile-estimate' ? (
              <>
                <p className="text-sm font-semibold text-[#16A34A] dark:text-[#34D399]">
                  {selectedDayInfo.isEstimatedOvulationDay
                    ? 'Estimated ovulation day'
                    : 'Estimated fertile window'}
                </p>
                <p className="text-xs text-[var(--luma-muted)]">
                  Calendar-based estimate only. Cannot reliably prevent pregnancy.
                </p>
              </>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-[var(--luma-muted)]">
                  No period recorded on this date.
                </span>
                {!isFutureSelected && (
                  <button
                    type="button"
                    onClick={() => onOpenPeriodModal(null, selectedDate)}
                    className="text-xs font-semibold text-[var(--luma-plum)] hover:underline whitespace-nowrap"
                  >
                    Start period here
                  </button>
                )}
              </div>
            )}
          </div>

          {!isFutureSelected && (
            <div>
              <span className="block text-xs font-semibold text-[var(--luma-muted)] mb-2">
                Bleeding flow on this date
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {BLEEDING_FLOW_OPTIONS.map((opt) => {
                  const active = selectedLog?.bleedingFlow === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleQuickFlowChange(opt.value)}
                      className={`min-h-[40px] px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                        active
                          ? 'border-[var(--luma-rose)] bg-[var(--luma-rose-soft)] text-[var(--luma-rose-deep)]'
                          : 'border-[var(--luma-border)] bg-[var(--luma-canvas)] text-[var(--luma-muted)] hover:text-[var(--luma-text)]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {selectedLog ? (
            <div className="space-y-4 pt-3 border-t border-[var(--luma-border)]">
              {selectedLog.symptoms.length > 0 && (
                <div>
                  <span className="block text-xs font-semibold text-[var(--luma-muted)] mb-1">
                    Symptoms
                  </span>
                  <p className="text-sm text-[var(--luma-text)]">
                    {selectedLog.symptoms.join(' · ')}
                  </p>
                </div>
              )}

              {(selectedLog.mood || selectedLog.energyLevel) && (
                <div className="grid grid-cols-2 gap-3">
                  {selectedLog.mood && (
                    <div>
                      <span className="block text-xs font-semibold text-[var(--luma-muted)]">
                        Mood
                      </span>
                      <span className="text-sm font-semibold text-[var(--luma-text)]">
                        {selectedLog.mood}
                      </span>
                    </div>
                  )}
                  {selectedLog.energyLevel && (
                    <div>
                      <span className="block text-xs font-semibold text-[var(--luma-muted)]">
                        Energy
                      </span>
                      <span className="text-sm font-semibold text-[var(--luma-text)] capitalize">
                        {selectedLog.energyLevel.replace('-', ' ')}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {selectedLog.sleep &&
                (selectedLog.sleep.hours !== null ||
                  selectedLog.sleep.quality !== null) && (
                  <div>
                    <span className="block text-xs font-semibold text-[var(--luma-muted)]">
                      Sleep
                    </span>
                    <p className="text-sm text-[var(--luma-text)] capitalize tabular-nums">
                      {[
                        selectedLog.sleep.hours !== null
                          ? `${selectedLog.sleep.hours} hrs`
                          : null,
                        selectedLog.sleep.quality,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                )}

              {selectedLog.notes.trim().length > 0 && (
                <div>
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--luma-muted)] mb-1">
                    <FileText className="w-3.5 h-3.5" />
                    <span>Journal note</span>
                  </span>
                  <p className="text-sm text-[var(--luma-text)] whitespace-pre-wrap leading-relaxed">
                    {selectedLog.notes}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="pt-3 border-t border-[var(--luma-border)]">
              <p className="text-sm text-[var(--luma-muted)]">
                {isFutureSelected
                  ? 'Future dates cannot have symptom or journal logs yet.'
                  : 'No symptoms, mood, or journal notes recorded for this date.'}
              </p>
              {!isFutureSelected && (
                <button
                  type="button"
                  onClick={() => onOpenDailyLogModal(selectedDate)}
                  className="mt-3 w-full min-h-[44px] rounded-2xl luma-violet-gradient text-white text-sm font-semibold hover:opacity-95 transition-opacity"
                >
                  Add Check-in for {formatDisplayDate(selectedDate, 'MMM d')}
                </button>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
