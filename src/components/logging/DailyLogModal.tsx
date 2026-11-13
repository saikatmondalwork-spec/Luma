import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useLuma } from '@/src/context/LumaContext';
import {
  BLEEDING_FLOW_OPTIONS,
  BleedingFlow,
  ENERGY_OPTIONS,
  EnergyLevel,
  MOOD_OPTIONS,
  MoodOption,
  PRESET_SYMPTOMS,
  SleepQuality,
} from '@/src/types/luma';
import { formatDisplayDate, todayLocalDate } from '@/src/utils/dateUtils';
import { Modal } from '@/src/components/common/Modal';
import { ConfirmDialog } from '@/src/components/common/ConfirmDialog';

interface DailyLogModalProps {
  open: boolean;
  onClose: () => void;
  date: string;
  initialFocus?: 'symptoms' | 'journal' | 'all';
}

const SLEEP_QUALITIES: Array<{ value: SleepQuality; label: string }> = [
  { value: 'poor', label: 'Poor' },
  { value: 'fair', label: 'Fair' },
  { value: 'good', label: 'Good' },
  { value: 'restful', label: 'Restful' },
];

export const DailyLogModal: React.FC<DailyLogModalProps> = ({
  open,
  onClose,
  date,
  initialFocus = 'all',
}) => {
  const {
    dailyLogs,
    settings,
    upsertDailyLog,
    deleteDailyLog,
    addCustomSymptom,
  } = useLuma();

  const existing = dailyLogs.find((l) => l.date === date);
  const today = todayLocalDate();

  const [selectedDate, setSelectedDate] = useState(date);
  const [bleedingFlow, setBleedingFlow] = useState<BleedingFlow | null>(null);
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState('');
  const [mood, setMood] = useState<MoodOption | null>(null);
  const [energyLevel, setEnergyLevel] = useState<EnergyLevel | null>(null);
  const [sleepHours, setSleepHours] = useState<string>('');
  const [sleepQuality, setSleepQuality] = useState<SleepQuality | null>(null);
  const [notes, setNotes] = useState('');
  const [showAllSections, setShowAllSections] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedDate(date);
    setShowAllSections(false);
  }, [open, date]);

  useEffect(() => {
    if (!open) return;
    const target = dailyLogs.find((l) => l.date === selectedDate);
    setBleedingFlow(target?.bleedingFlow ?? null);
    setSymptoms(target?.symptoms ?? []);
    setMood(target?.mood ?? null);
    setEnergyLevel(target?.energyLevel ?? null);
    setSleepHours(
      target?.sleep?.hours !== null && target?.sleep?.hours !== undefined
        ? String(target.sleep.hours)
        : ''
    );
    setSleepQuality(target?.sleep?.quality ?? null);
    setNotes(target?.notes ?? '');
    setCustomInput('');
  }, [open, selectedDate, dailyLogs]);

  const allSymptomChoices = Array.from(
    new Set([...PRESET_SYMPTOMS, ...settings.customSymptoms, ...symptoms])
  );

  const toggleSymptom = (name: string) => {
    setSymptoms((prev) =>
      prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name]
    );
  };

  const handleAddCustomSymptom = async () => {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    await addCustomSymptom(trimmed);
    setSymptoms((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    setCustomInput('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const parsedHours =
        sleepHours.trim() === ''
          ? null
          : Math.max(0, Math.min(24, Number(sleepHours)));
      const sleepObj =
        parsedHours !== null || sleepQuality !== null
          ? {
              hours: Number.isNaN(parsedHours) ? null : parsedHours,
              quality: sleepQuality,
            }
          : null;

      await upsertDailyLog(selectedDate, {
        bleedingFlow,
        symptoms,
        mood,
        energyLevel,
        sleep: sleepObj,
        notes,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    await deleteDailyLog(selectedDate);
    setConfirmDeleteOpen(false);
    onClose();
  };

  const prefs = settings.trackingPreferences;
  const showFlow = showAllSections || prefs.trackFlow;
  const showSymptoms = showAllSections || prefs.trackSymptoms;
  const showMood = showAllSections || prefs.trackMood;
  const showEnergy = showAllSections || prefs.trackEnergy;
  const showSleep = showAllSections || prefs.trackSleep;

  const hasHiddenPrefs =
    !prefs.trackFlow ||
    !prefs.trackSymptoms ||
    !prefs.trackMood ||
    !prefs.trackEnergy ||
    !prefs.trackSleep;

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={existing ? 'Edit daily check-in' : 'Daily check-in'}
        subtitle={`${formatDisplayDate(selectedDate, 'EEEE, MMM d, yyyy')} · All fields optional`}
        maxWidthClass="max-w-xl"
      >
        <form onSubmit={handleSave} className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <label
                htmlFor="daily-log-date"
                className="block text-xs font-semibold text-[var(--luma-muted)] mb-1"
              >
                Entry date
              </label>
              <input
                id="daily-log-date"
                type="date"
                max={today}
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="min-h-[42px] rounded-2xl border border-[var(--luma-border)] bg-[var(--luma-canvas)] px-3.5 py-1.5 text-sm text-[var(--luma-text)] tabular-nums"
              />
            </div>

            {hasHiddenPrefs && (
              <button
                type="button"
                onClick={() => setShowAllSections((v) => !v)}
                className="min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-semibold text-[var(--luma-plum)] hover:bg-[var(--luma-plum-soft)] transition-colors self-end whitespace-nowrap"
              >
                {showAllSections ? 'Use my preferences' : 'Show all fields'}
              </button>
            )}
          </div>

          {showFlow && (
            <section>
              <h3 className="text-sm font-semibold text-[var(--luma-text)] mb-2.5">
                Bleeding flow
              </h3>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {BLEEDING_FLOW_OPTIONS.map((opt) => {
                  const active = bleedingFlow === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        setBleedingFlow(active ? null : opt.value)
                      }
                      className={`min-h-[44px] px-2.5 py-2 rounded-2xl text-xs sm:text-sm font-semibold border transition-colors whitespace-nowrap ${
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
            </section>
          )}

          {showSymptoms && (
            <section>
              <h3 className="text-sm font-semibold text-[var(--luma-text)] mb-2.5">
                Symptoms
              </h3>
              <div className="flex flex-wrap gap-2">
                {allSymptomChoices.map((sym) => {
                  const active = symptoms.includes(sym);
                  return (
                    <button
                      key={sym}
                      type="button"
                      onClick={() => toggleSymptom(sym)}
                      className={`min-h-[40px] px-3.5 py-1.5 rounded-2xl text-xs sm:text-sm font-semibold border transition-colors whitespace-nowrap ${
                        active
                          ? 'border-[var(--luma-plum)] bg-[var(--luma-plum-soft)] text-[var(--luma-plum)]'
                          : 'border-[var(--luma-border)] bg-[var(--luma-canvas)] text-[var(--luma-muted)] hover:text-[var(--luma-text)]'
                      }`}
                    >
                      {sym}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 flex items-center gap-2">
                <input
                  type="text"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomSymptom();
                    }
                  }}
                  placeholder="Add custom symptom..."
                  maxLength={40}
                  className="flex-1 min-h-[42px] rounded-2xl border border-[var(--luma-border)] bg-[var(--luma-canvas)] px-3.5 py-2 text-sm text-[var(--luma-text)]"
                />
                <button
                  type="button"
                  onClick={handleAddCustomSymptom}
                  disabled={!customInput.trim()}
                  className="min-h-[42px] px-3.5 py-2 rounded-2xl border border-[var(--luma-border)] bg-[var(--luma-subtle)] text-sm font-semibold text-[var(--luma-text)] hover:opacity-90 disabled:opacity-40 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add</span>
                </button>
              </div>
            </section>
          )}

          {showMood && (
            <section>
              <h3 className="text-sm font-semibold text-[var(--luma-text)] mb-2.5">
                Mood
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {MOOD_OPTIONS.map((m) => {
                  const active = mood === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMood(active ? null : m)}
                      className={`min-h-[42px] px-3 py-2 rounded-2xl text-xs sm:text-sm font-semibold border transition-colors whitespace-nowrap ${
                        active
                          ? 'border-[var(--luma-plum)] bg-[var(--luma-plum-soft)] text-[var(--luma-plum)]'
                          : 'border-[var(--luma-border)] bg-[var(--luma-canvas)] text-[var(--luma-muted)] hover:text-[var(--luma-text)]'
                      }`}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {showEnergy && (
            <section>
              <h3 className="text-sm font-semibold text-[var(--luma-text)] mb-2.5">
                Energy level
              </h3>
              <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                {ENERGY_OPTIONS.map((opt) => {
                  const active = energyLevel === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        setEnergyLevel(active ? null : opt.value)
                      }
                      className={`min-h-[44px] px-1.5 py-2 rounded-2xl text-[11px] sm:text-xs font-semibold border transition-colors text-center ${
                        active
                          ? 'border-[#1EC26D] bg-[#E7F8EE] dark:bg-[#1A3527] text-[#15803D] dark:text-[#6EE7B7]'
                          : 'border-[var(--luma-border)] bg-[var(--luma-canvas)] text-[var(--luma-muted)] hover:text-[var(--luma-text)]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {showSleep && (
            <section>
              <h3 className="text-sm font-semibold text-[var(--luma-text)] mb-2.5">
                Sleep (optional)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                <div>
                  <label
                    htmlFor="sleep-hours"
                    className="block text-xs text-[var(--luma-muted)] mb-1"
                  >
                    Hours slept
                  </label>
                  <input
                    id="sleep-hours"
                    type="number"
                    min="0"
                    max="24"
                    step="0.5"
                    placeholder="e.g. 7.5"
                    value={sleepHours}
                    onChange={(e) => setSleepHours(e.target.value)}
                    className="w-full min-h-[42px] rounded-2xl border border-[var(--luma-border)] bg-[var(--luma-canvas)] px-3 py-2 text-sm text-[var(--luma-text)] tabular-nums"
                  />
                </div>
                <div className="sm:col-span-2">
                  <span className="block text-xs text-[var(--luma-muted)] mb-1">
                    Sleep quality
                  </span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {SLEEP_QUALITIES.map((q) => {
                      const active = sleepQuality === q.value;
                      return (
                        <button
                          key={q.value}
                          type="button"
                          onClick={() =>
                            setSleepQuality(active ? null : q.value)
                          }
                          className={`min-h-[42px] px-2 py-1.5 rounded-2xl text-xs font-semibold border transition-colors ${
                            active
                              ? 'border-[var(--luma-plum)] bg-[var(--luma-plum-soft)] text-[var(--luma-plum)]'
                              : 'border-[var(--luma-border)] bg-[var(--luma-canvas)] text-[var(--luma-muted)] hover:text-[var(--luma-text)]'
                          }`}
                        >
                          {q.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
          )}

          <section>
            <label
              htmlFor="daily-journal-notes"
              className="block text-sm font-semibold text-[var(--luma-text)] mb-2"
            >
              Private journal note
            </label>
            <textarea
              id="daily-journal-notes"
              rows={4}
              autoFocus={initialFocus === 'journal'}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Write freely about how you are feeling today. Everything stays strictly on this device..."
              className="w-full rounded-2xl border border-[var(--luma-border)] bg-[var(--luma-canvas)] px-3.5 py-2.5 text-sm text-[var(--luma-text)] leading-relaxed resize-y"
            />
          </section>

          <div className="flex items-center justify-between gap-3 pt-2 border-t border-[var(--luma-border)]">
            {existing ? (
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(true)}
                className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-sm font-semibold text-[var(--luma-rose-deep)] hover:bg-[var(--luma-rose-soft)] transition-colors whitespace-nowrap shrink-0"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Entry</span>
              </button>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] px-4 py-2 rounded-2xl border border-[var(--luma-border)] text-sm font-semibold text-[var(--luma-text)] hover:bg-[var(--luma-subtle)] transition-colors whitespace-nowrap shrink-0"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="min-h-[44px] px-5 py-2 rounded-2xl luma-violet-gradient text-white text-sm font-semibold hover:opacity-95 transition-opacity disabled:opacity-50 whitespace-nowrap shrink-0 shadow-sm"
              >
                {saving ? 'Saving...' : 'Save Check-in'}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete this daily log?"
        description={`This removes your symptoms, mood, flow, and journal note recorded for ${formatDisplayDate(
          selectedDate
        )}.`}
        confirmLabel="Delete Entry"
        destructive
      />
    </>
  );
};
