import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  Lock,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useLuma } from '@/src/context/LumaContext';
import { ThemeMode, TrackingPreferences } from '@/src/types/luma';
import {
  addDaysLocal,
  formatDisplayDate,
  isValidYmd,
  todayLocalDate,
} from '@/src/utils/dateUtils';
import { LumaMark } from '@/src/components/common/LumaMark';
import { requestNotificationPermission } from '@/src/services/reminderService';

export const OnboardingFlow: React.FC = () => {
  const { completeOnboarding, updateSettings, settings } = useLuma();
  const today = todayLocalDate();

  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [hasPeriodDate, setHasPeriodDate] = useState(true);
  const [lastStart, setLastStart] = useState(addDaysLocal(today, -12));
  const [isOngoing, setIsOngoing] = useState(false);
  const [lastEnd, setLastEnd] = useState(addDaysLocal(today, -8));
  const [avgCycle, setAvgCycle] = useState(28);
  const [avgPeriod, setAvgPeriod] = useState(5);
  const [step1Error, setStep1Error] = useState<string | null>(null);

  const [historicalInput, setHistoricalInput] = useState('');
  const [historicalDates, setHistoricalDates] = useState<string[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeMode>(settings.theme);
  const [trackingPrefs, setTrackingPrefs] = useState<TrackingPreferences>(
    settings.trackingPreferences
  );

  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [dailyTime, setDailyTime] = useState('20:00');
  const [submitting, setSubmitting] = useState(false);

  const handleThemePreview = (mode: ThemeMode) => {
    setTheme(mode);
    void updateSettings({ theme: mode });
  };

  const validateAndNextStep1 = () => {
    setStep1Error(null);
    if (hasPeriodDate) {
      if (!isValidYmd(lastStart)) {
        setStep1Error('Please enter a valid start date.');
        return;
      }
      if (lastStart > today) {
        setStep1Error('Start date cannot be in the future.');
        return;
      }
      if (!isOngoing) {
        if (!isValidYmd(lastEnd)) {
          setStep1Error('Please enter a valid end date or mark as ongoing.');
          return;
        }
        if (lastEnd < lastStart) {
          setStep1Error('End date cannot be earlier than start date.');
          return;
        }
        if (lastEnd > today) {
          setStep1Error('End date cannot be in the future.');
          return;
        }
      }
    }
    setStep(2);
  };

  const handleAddHistoricalDate = () => {
    setHistoryError(null);
    if (!historicalInput || !isValidYmd(historicalInput)) {
      setHistoryError('Select a valid past period start date.');
      return;
    }
    if (historicalInput > today) {
      setHistoryError('Historical dates cannot be in the future.');
      return;
    }
    if (hasPeriodDate && historicalInput === lastStart) {
      setHistoryError('This matches your most recent period start date.');
      return;
    }
    if (historicalDates.includes(historicalInput)) {
      setHistoryError('This date is already added.');
      return;
    }
    setHistoricalDates((prev) =>
      [...prev, historicalInput].sort((a, b) => b.localeCompare(a))
    );
    setHistoricalInput('');
  };

  const handleReminderToggle = async (checked: boolean) => {
    setReminderEnabled(checked);
    if (checked) {
      await requestNotificationPermission();
    }
  };

  const handleFinish = async (skipOptional = false) => {
    setSubmitting(true);
    try {
      await completeOnboarding({
        lastPeriodStartDate: hasPeriodDate ? lastStart : null,
        lastPeriodEndDate: hasPeriodDate && !isOngoing ? lastEnd : null,
        historicalStartDates: skipOptional ? [] : historicalDates,
        averageCycleLength: avgCycle,
        averagePeriodLength: avgPeriod,
        theme,
        trackingPreferences: trackingPrefs,
        reminderEnabled: skipOptional ? false : reminderEnabled,
        dailyLogTime: dailyTime,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-dvh bg-[var(--luma-canvas)] text-[var(--luma-text)] flex flex-col justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-2xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl luma-violet-gradient text-white flex items-center justify-center shadow-md">
              <LumaMark size={22} />
            </div>
            <span className="text-2xl font-bold tracking-tight">Luma</span>
          </div>
          <span className="px-3 py-1 rounded-full bg-[var(--luma-plum-soft)] text-xs font-semibold text-[var(--luma-plum)] tabular-nums">
            Step {step} of 3
          </span>
        </div>

        <div
          className="h-2 w-full rounded-full bg-[var(--luma-subtle)] overflow-hidden mb-6"
          aria-hidden="true"
        >
          <div
            className="h-full rounded-full luma-violet-gradient transition-all duration-300"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>

        <div className="luma-card rounded-[28px] p-6 sm:p-8">
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-[var(--luma-text)] tracking-tight text-balance">
                  Calm, private cycle tracking
                </h1>
                <p className="mt-2 text-sm sm:text-base text-[var(--luma-muted)] leading-relaxed">
                  Share a few basics to initialize your calendar. No account,
                  email, or personal identity is ever required.
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <label
                    htmlFor="onboard-last-start"
                    className="text-sm font-semibold text-[var(--luma-text)]"
                  >
                    First day of your most recent period
                  </label>
                  <button
                    type="button"
                    onClick={() => setHasPeriodDate((v) => !v)}
                    className="text-xs font-semibold text-[var(--luma-plum)] hover:underline whitespace-nowrap"
                  >
                    {hasPeriodDate ? "I'm not sure yet" : 'Enter start date'}
                  </button>
                </div>

                {hasPeriodDate ? (
                  <div className="rounded-2xl border border-[var(--luma-border)] bg-[var(--luma-canvas)] p-4 space-y-4">
                    <input
                      id="onboard-last-start"
                      type="date"
                      max={today}
                      value={lastStart}
                      onChange={(e) => {
                        const val = e.target.value;
                        setLastStart(val);
                        if (!isOngoing && lastEnd < val) {
                          setLastEnd(val);
                        }
                      }}
                      className="w-full min-h-[44px] rounded-2xl border border-[var(--luma-border)] bg-[var(--luma-surface)] px-3.5 py-2 text-sm text-[var(--luma-text)] tabular-nums"
                    />

                    <label className="flex items-center justify-between gap-3 cursor-pointer">
                      <span className="text-sm text-[var(--luma-text)]">
                        This period is currently ongoing
                      </span>
                      <input
                        type="checkbox"
                        checked={isOngoing}
                        onChange={(e) => {
                          setIsOngoing(e.target.checked);
                          if (!e.target.checked && lastEnd < lastStart) {
                            setLastEnd(lastStart);
                          }
                        }}
                        className="w-5 h-5 accent-[var(--luma-plum)]"
                      />
                    </label>

                    {!isOngoing && (
                      <div className="pt-2 border-t border-[var(--luma-border)]">
                        <label
                          htmlFor="onboard-last-end"
                          className="block text-xs font-semibold text-[var(--luma-muted)] mb-1.5"
                        >
                          Last day of that period
                        </label>
                        <input
                          id="onboard-last-end"
                          type="date"
                          min={lastStart}
                          max={today}
                          value={lastEnd}
                          onChange={(e) => setLastEnd(e.target.value)}
                          className="w-full min-h-[44px] rounded-2xl border border-[var(--luma-border)] bg-[var(--luma-surface)] px-3.5 py-2 text-sm text-[var(--luma-text)] tabular-nums"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-[var(--luma-border)] bg-[var(--luma-canvas)] p-4 text-sm text-[var(--luma-muted)]">
                    That is completely fine. You can explore Luma first and log
                    your next period whenever it begins.
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <div className="rounded-2xl border border-[var(--luma-border)] bg-[var(--luma-canvas)] p-4">
                    <div className="flex items-baseline justify-between gap-2">
                      <label
                        htmlFor="onboard-cycle-len"
                        className="text-sm font-semibold text-[var(--luma-text)]"
                      >
                        Typical cycle length
                      </label>
                      <span className="text-lg font-bold text-[var(--luma-plum)] tabular-nums">
                        {avgCycle} days
                      </span>
                    </div>
                    <input
                      id="onboard-cycle-len"
                      type="range"
                      min={18}
                      max={45}
                      value={avgCycle}
                      onChange={(e) => setAvgCycle(Number(e.target.value))}
                      className="w-full mt-3 accent-[var(--luma-plum)]"
                    />
                    <p className="mt-1.5 text-xs text-[var(--luma-muted)]">
                      Days from one period start to the next. Adapts as you
                      log.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-[var(--luma-border)] bg-[var(--luma-canvas)] p-4">
                    <div className="flex items-baseline justify-between gap-2">
                      <label
                        htmlFor="onboard-period-len"
                        className="text-sm font-semibold text-[var(--luma-text)]"
                      >
                        Typical period duration
                      </label>
                      <span className="text-lg font-bold text-[var(--luma-rose-deep)] tabular-nums">
                        {avgPeriod} days
                      </span>
                    </div>
                    <input
                      id="onboard-period-len"
                      type="range"
                      min={1}
                      max={10}
                      value={avgPeriod}
                      onChange={(e) => setAvgPeriod(Number(e.target.value))}
                      className="w-full mt-3 accent-[var(--luma-rose)]"
                    />
                    <p className="mt-1.5 text-xs text-[var(--luma-muted)]">
                      Used only as an initial estimate until real logs accrue.
                    </p>
                  </div>
                </div>
              </div>

              {step1Error && (
                <p
                  role="alert"
                  className="rounded-2xl border border-[#F3B5C5] bg-[var(--luma-rose-soft)] px-3.5 py-2.5 text-sm text-[#B82851] dark:text-[#FFA6BE]"
                >
                  {step1Error}
                </p>
              )}

              <div className="flex items-center justify-end pt-2">
                <button
                  type="button"
                  onClick={validateAndNextStep1}
                  className="min-h-[46px] inline-flex items-center gap-2 px-6 py-2.5 rounded-2xl luma-violet-gradient text-white text-sm font-semibold hover:opacity-95 shadow-md"
                >
                  <span>Continue</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-[var(--luma-text)] tracking-tight">
                  Personalize your tracking
                </h2>
                <p className="mt-1.5 text-sm text-[var(--luma-muted)]">
                  Everything on this screen is optional and can be adjusted in
                  Settings anytime.
                </p>
              </div>

              <div className="rounded-2xl border border-[var(--luma-border)] bg-[var(--luma-canvas)] p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--luma-text)]">
                  <Calendar className="w-4 h-4 text-[var(--luma-plum)]" />
                  <span>Add earlier period start dates (optional)</span>
                </div>
                <p className="text-xs text-[var(--luma-muted)]">
                  Adding 2 or more past start dates helps Luma reflect your true
                  cycle variation right away.
                </p>

                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    max={today}
                    value={historicalInput}
                    onChange={(e) => setHistoricalInput(e.target.value)}
                    aria-label="Historical period start date"
                    className="flex-1 min-h-[44px] rounded-2xl border border-[var(--luma-border)] bg-[var(--luma-surface)] px-3 py-2 text-sm text-[var(--luma-text)] tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={handleAddHistoricalDate}
                    className="min-h-[44px] px-4 py-2 rounded-2xl border border-[var(--luma-border)] bg-[var(--luma-surface)] text-sm font-semibold text-[var(--luma-text)] hover:bg-[var(--luma-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Date</span>
                  </button>
                </div>

                {historyError && (
                  <p className="text-xs text-[var(--luma-rose-deep)]">
                    {historyError}
                  </p>
                )}

                {historicalDates.length > 0 && (
                  <ul className="divide-y divide-[var(--luma-border)] pt-1">
                    {historicalDates.map((d) => (
                      <li
                        key={d}
                        className="py-2 flex items-center justify-between text-sm"
                      >
                        <span className="tabular-nums">
                          {formatDisplayDate(d)}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setHistoricalDates((prev) =>
                              prev.filter((item) => item !== d)
                            )
                          }
                          aria-label={`Remove ${d}`}
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-[var(--luma-muted)] hover:text-[var(--luma-rose-deep)]"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <span className="block text-sm font-semibold text-[var(--luma-text)] mb-2">
                  Appearance
                </span>
                <div className="grid grid-cols-3 gap-2.5">
                  {(
                    [
                      { value: 'light', label: 'Warm Light' },
                      { value: 'dark', label: 'Evening Dark' },
                      { value: 'system', label: 'Match Device' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleThemePreview(opt.value)}
                      className={`min-h-[44px] px-3 py-2 rounded-2xl text-xs sm:text-sm font-semibold border transition-colors ${
                        theme === opt.value
                          ? 'border-[var(--luma-plum)] bg-[var(--luma-plum-soft)] text-[var(--luma-plum)]'
                          : 'border-[var(--luma-border)] bg-[var(--luma-canvas)] text-[var(--luma-muted)] hover:text-[var(--luma-text)]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="block text-sm font-semibold text-[var(--luma-text)] mb-2">
                  What would you like in your daily check-in?
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(
                    [
                      { key: 'trackFlow', label: 'Bleeding flow' },
                      { key: 'trackSymptoms', label: 'Symptoms' },
                      { key: 'trackMood', label: 'Mood' },
                      { key: 'trackEnergy', label: 'Energy level' },
                      { key: 'trackSleep', label: 'Sleep' },
                    ] as const
                  ).map((item) => {
                    const active = trackingPrefs[item.key];
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() =>
                          setTrackingPrefs((prev) => ({
                            ...prev,
                            [item.key]: !prev[item.key],
                          }))
                        }
                        className={`min-h-[44px] px-3 py-2 rounded-2xl text-xs sm:text-sm font-semibold border flex items-center justify-between gap-2 transition-colors ${
                          active
                            ? 'border-[var(--luma-plum)] bg-[var(--luma-plum-soft)] text-[var(--luma-text)]'
                            : 'border-[var(--luma-border)] bg-[var(--luma-canvas)] text-[var(--luma-muted)]'
                        }`}
                      >
                        <span>{item.label}</span>
                        {active && (
                          <Check className="w-4 h-4 text-[var(--luma-plum)] shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="min-h-[44px] inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl border border-[var(--luma-border)] text-sm font-semibold text-[var(--luma-text)] hover:bg-[var(--luma-subtle)]"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleFinish(true)}
                    disabled={submitting}
                    className="min-h-[44px] px-4 py-2 rounded-2xl text-sm font-semibold text-[var(--luma-muted)] hover:text-[var(--luma-text)]"
                  >
                    Skip &amp; Finish
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2 rounded-2xl luma-violet-gradient text-white text-sm font-semibold hover:opacity-95 shadow-md"
                  >
                    <span>Continue</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-[var(--luma-text)] tracking-tight">
                  Reminders &amp; local privacy
                </h2>
                <p className="mt-1.5 text-sm text-[var(--luma-muted)]">
                  Optionally set a discreet check-in reminder, or jump straight
                  to your dashboard.
                </p>
              </div>

              <div className="rounded-2xl border border-[var(--luma-border)] bg-[var(--luma-canvas)] p-4 space-y-4">
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <div>
                    <span className="block text-sm font-semibold text-[var(--luma-text)]">
                      Enable discreet daily check-in reminder
                    </span>
                    <span className="block text-xs text-[var(--luma-muted)]">
                      Uses neutral phrasing while Luma is active. You can also
                      export native calendar alerts in Settings.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={reminderEnabled}
                    onChange={(e) => handleReminderToggle(e.target.checked)}
                    className="w-5 h-5 accent-[var(--luma-plum)]"
                  />
                </label>

                {reminderEnabled && (
                  <div className="pt-3 border-t border-[var(--luma-border)] flex items-center justify-between gap-4">
                    <label
                      htmlFor="onboard-reminder-time"
                      className="text-sm text-[var(--luma-text)]"
                    >
                      Preferred reminder time
                    </label>
                    <input
                      id="onboard-reminder-time"
                      type="time"
                      value={dailyTime}
                      onChange={(e) => setDailyTime(e.target.value)}
                      className="min-h-[42px] rounded-xl border border-[var(--luma-border)] bg-[var(--luma-surface)] px-3 py-1.5 text-sm text-[var(--luma-text)] tabular-nums"
                    />
                  </div>
                )}
              </div>

              <div className="rounded-2xl luma-violet-gradient text-white p-5 space-y-2.5">
                <div className="flex items-center gap-2 text-sm font-bold">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>Stored locally on this device only</span>
                </div>
                <p className="text-xs sm:text-sm text-white/85 leading-relaxed">
                  Luma stores your cycle dates, symptoms, and journal entries
                  inside your browser&apos;s local IndexedDB database. Nothing
                  is sent to servers or third parties. You can also enable
                  passphrase-based AES-GCM encryption in Settings.
                </p>
                <div className="flex items-center gap-2 text-xs text-white/75 pt-1">
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Estimates are informational only and never medical advice or
                    contraception.
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="min-h-[44px] inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl border border-[var(--luma-border)] text-sm font-semibold text-[var(--luma-text)] hover:bg-[var(--luma-subtle)]"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleFinish(false)}
                  disabled={submitting}
                  className="min-h-[46px] inline-flex items-center gap-2 px-6 py-2.5 rounded-2xl luma-pink-gradient text-white text-sm font-semibold hover:opacity-95 disabled:opacity-50 shadow-md"
                >
                  <span>{submitting ? 'Setting up...' : 'Open Dashboard'}</span>
                  <Check className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
