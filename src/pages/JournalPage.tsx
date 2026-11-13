import React, { useEffect, useMemo, useState } from 'react';
import { Edit3, Plus, Search, Trash2 } from 'lucide-react';
import { useLuma } from '@/src/context/LumaContext';
import { MOOD_OPTIONS, PRESET_SYMPTOMS } from '@/src/types/luma';
import {
  addDaysLocal,
  formatDisplayDate,
  todayLocalDate,
} from '@/src/utils/dateUtils';
import { ConfirmDialog } from '@/src/components/common/ConfirmDialog';

interface JournalPageProps {
  onOpenDailyLogModal: (date: string, focus?: 'symptoms' | 'journal' | 'all') => void;
  externalSearchQuery?: string;
}

type DateRangeFilter = 'all' | '30d' | '90d' | 'current-cycle';

export const JournalPage: React.FC<JournalPageProps> = ({
  onOpenDailyLogModal,
  externalSearchQuery = '',
}) => {
  const { dailyLogs, settings, summary, deleteDailyLog } = useLuma();
  const today = todayLocalDate();

  const [searchQuery, setSearchQuery] = useState(externalSearchQuery);
  const [dateRange, setDateRange] = useState<DateRangeFilter>('all');
  const [symptomFilter, setSymptomFilter] = useState<string>('all');
  const [moodFilter, setMoodFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [pendingDeleteDate, setPendingDeleteDate] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (externalSearchQuery) {
      setSearchQuery(externalSearchQuery);
    }
  }, [externalSearchQuery]);

  const allKnownSymptoms = useMemo(() => {
    const set = new Set<string>([...PRESET_SYMPTOMS, ...settings.customSymptoms]);
    for (const log of dailyLogs) {
      for (const s of log.symptoms) set.add(s);
    }
    return Array.from(set).sort();
  }, [dailyLogs, settings.customSymptoms]);

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const minDate30 = addDaysLocal(today, -30);
    const minDate90 = addDaysLocal(today, -90);
    const cycleStart = summary.latestPeriod?.startDate ?? null;

    return dailyLogs
      .filter((log) => {
        if (dateRange === '30d' && log.date < minDate30) return false;
        if (dateRange === '90d' && log.date < minDate90) return false;
        if (
          dateRange === 'current-cycle' &&
          cycleStart &&
          log.date < cycleStart
        ) {
          return false;
        }
        if (symptomFilter !== 'all' && !log.symptoms.includes(symptomFilter)) {
          return false;
        }
        if (moodFilter !== 'all' && log.mood !== moodFilter) {
          return false;
        }
        if (q) {
          const haystack = [
            log.notes,
            log.mood ?? '',
            log.bleedingFlow ?? '',
            ...log.symptoms,
          ]
            .join(' ')
            .toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) =>
        sortOrder === 'desc'
          ? b.date.localeCompare(a.date)
          : a.date.localeCompare(b.date)
      );
  }, [
    dailyLogs,
    searchQuery,
    dateRange,
    symptomFilter,
    moodFilter,
    sortOrder,
    today,
    summary.latestPeriod,
  ]);

  const hasFilters =
    searchQuery.trim() !== '' ||
    dateRange !== 'all' ||
    symptomFilter !== 'all' ||
    moodFilter !== 'all';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-[var(--luma-muted)]">
          Your private chronological record of notes, symptoms, mood, and
          energy.
        </p>

        <button
          type="button"
          onClick={() => onOpenDailyLogModal(today, 'journal')}
          className="min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2 rounded-2xl luma-pink-gradient text-white text-sm font-semibold hover:opacity-95 shadow-[0_12px_24px_-10px_rgba(242,85,125,0.45)] whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>New Entry</span>
        </button>
      </div>

      <section
        aria-label="Filter journal entries"
        className="luma-card rounded-[24px] p-4 space-y-3"
      >
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-5 relative">
            <Search className="w-4 h-4 text-[var(--luma-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notes, symptoms, mood..."
              aria-label="Search journal entries"
              className="w-full min-h-[42px] rounded-2xl border border-[var(--luma-border)] bg-[var(--luma-canvas)] pl-10 pr-3.5 py-2 text-sm text-[var(--luma-text)]"
            />
          </div>

          <div className="md:col-span-2">
            <select
              aria-label="Filter by date range"
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as DateRangeFilter)}
              className="w-full min-h-[42px] rounded-2xl border border-[var(--luma-border)] bg-[var(--luma-canvas)] px-3 py-2 text-sm text-[var(--luma-text)]"
            >
              <option value="all">All dates</option>
              <option value="current-cycle">Current cycle</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <select
              aria-label="Filter by symptom"
              value={symptomFilter}
              onChange={(e) => setSymptomFilter(e.target.value)}
              className="w-full min-h-[42px] rounded-2xl border border-[var(--luma-border)] bg-[var(--luma-canvas)] px-3 py-2 text-sm text-[var(--luma-text)]"
            >
              <option value="all">All symptoms</option>
              {allKnownSymptoms.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <select
              aria-label="Filter by mood"
              value={moodFilter}
              onChange={(e) => setMoodFilter(e.target.value)}
              className="w-full min-h-[42px] rounded-2xl border border-[var(--luma-border)] bg-[var(--luma-canvas)] px-3 py-2 text-sm text-[var(--luma-text)]"
            >
              <option value="all">All moods</option>
              {MOOD_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-1">
            <button
              type="button"
              onClick={() =>
                setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'))
              }
              className="w-full min-h-[42px] px-2.5 rounded-2xl bg-[var(--luma-plum-soft)] text-xs font-semibold text-[var(--luma-plum)] hover:opacity-90 whitespace-nowrap"
            >
              {sortOrder === 'desc' ? 'Newest' : 'Oldest'}
            </button>
          </div>
        </div>

        {hasFilters && (
          <div className="flex items-center justify-between text-xs text-[var(--luma-muted)] pt-1">
            <span className="tabular-nums">
              Showing {filteredLogs.length} of {dailyLogs.length} entries
            </span>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setDateRange('all');
                setSymptomFilter('all');
                setMoodFilter('all');
              }}
              className="font-semibold text-[var(--luma-plum)] hover:underline"
            >
              Clear filters
            </button>
          </div>
        )}
      </section>

      {filteredLogs.length === 0 ? (
        <div className="luma-card rounded-[28px] p-8 sm:p-12 text-center space-y-3">
          <h2 className="text-xl font-bold text-[var(--luma-text)]">
            {dailyLogs.length === 0
              ? 'Your journal is ready'
              : 'No matching entries'}
          </h2>
          <p className="text-sm text-[var(--luma-muted)] max-w-md mx-auto">
            {dailyLogs.length === 0
              ? 'Record daily notes, symptoms, mood, or sleep whenever you like. All entries stay privately on your device.'
              : 'Try broadening your search or clearing one of the active filters.'}
          </p>
          {dailyLogs.length === 0 && (
            <button
              type="button"
              onClick={() => onOpenDailyLogModal(today, 'journal')}
              className="mt-2 min-h-[44px] px-5 py-2 rounded-2xl luma-violet-gradient text-white text-sm font-semibold"
            >
              Write First Entry
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredLogs.map((log) => {
            const metaBits = [
              log.bleedingFlow && log.bleedingFlow !== 'none'
                ? `Flow: ${log.bleedingFlow}`
                : null,
              log.mood ? `Mood: ${log.mood}` : null,
              log.energyLevel
                ? `Energy: ${log.energyLevel.replace('-', ' ')}`
                : null,
              log.sleep &&
              (log.sleep.hours !== null || log.sleep.quality !== null)
                ? `Sleep: ${[
                    log.sleep.hours !== null ? `${log.sleep.hours}h` : null,
                    log.sleep.quality,
                  ]
                    .filter(Boolean)
                    .join(' ')}`
                : null,
            ].filter(Boolean);

            return (
              <article
                key={log.id}
                className="luma-card rounded-[24px] p-5 sm:p-6 space-y-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3.5 min-w-0">
                    <span className="w-11 h-11 rounded-2xl bg-[var(--luma-plum-soft)] text-[var(--luma-plum)] flex items-center justify-center text-sm font-bold tabular-nums shrink-0">
                      {log.date.slice(8, 10)}
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-base sm:text-lg font-bold text-[var(--luma-text)]">
                        {formatDisplayDate(log.date, 'EEEE, MMMM d, yyyy')}
                      </h2>
                      {metaBits.length > 0 && (
                        <p className="mt-0.5 text-xs sm:text-sm text-[var(--luma-muted)] capitalize">
                          {metaBits.join(' · ')}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onOpenDailyLogModal(log.date, 'all')}
                      aria-label={`Edit entry for ${log.date}`}
                      className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[var(--luma-muted)] hover:text-[var(--luma-plum)] hover:bg-[var(--luma-subtle)]"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDeleteDate(log.date)}
                      aria-label={`Delete entry for ${log.date}`}
                      className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[var(--luma-muted)] hover:text-[var(--luma-rose-deep)] hover:bg-[var(--luma-rose-soft)]"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {log.symptoms.length > 0 && (
                  <p className="text-xs sm:text-sm font-medium text-[var(--luma-plum)]">
                    Symptoms: {log.symptoms.join(' · ')}
                  </p>
                )}

                {log.notes.trim().length > 0 && (
                  <p className="text-sm sm:text-base text-[var(--luma-text)] leading-relaxed whitespace-pre-wrap pt-2 border-t border-[var(--luma-border)]">
                    {log.notes}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={pendingDeleteDate !== null}
        onClose={() => setPendingDeleteDate(null)}
        onConfirm={async () => {
          if (pendingDeleteDate) {
            await deleteDailyLog(pendingDeleteDate);
            setPendingDeleteDate(null);
          }
        }}
        title="Delete this journal entry?"
        description={
          pendingDeleteDate
            ? `This permanently deletes your daily record for ${formatDisplayDate(
                pendingDeleteDate
              )}.`
            : ''
        }
        confirmLabel="Delete Entry"
        destructive
      />
    </div>
  );
};
