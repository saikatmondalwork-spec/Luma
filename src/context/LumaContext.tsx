import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  CycleObservation,
  CycleRecord,
  CycleSummary,
  DailyLog,
  LumaDataSnapshot,
  TrackingPreferences,
  UserSettings,
} from '@/src/types/luma';
import {
  createDefaultSettings,
  hasAnyDailyLogContent,
  validatePeriodInput,
} from '@/src/utils/validation';
import {
  ActiveVaultSession,
  disableEncryptedVault,
  enableEncryptedVault,
  loadInitialStorage,
  saveSnapshot,
  unlockEncryptedVault,
  wipeAllLocalData,
} from '@/src/services/storageService';
import {
  computeCycleSummary,
  generatePersonalizedObservations,
  sortCyclesChronological,
} from '@/src/services/cycleEngine';
import {
  DueReminder,
  evaluateDueReminders,
  triggerBrowserNotification,
} from '@/src/services/reminderService';
import { todayLocalDate } from '@/src/utils/dateUtils';

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `luma-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export interface OnboardingPayload {
  lastPeriodStartDate: string | null;
  lastPeriodEndDate: string | null;
  historicalStartDates: string[];
  averageCycleLength: number;
  averagePeriodLength: number;
  theme: UserSettings['theme'];
  trackingPreferences: TrackingPreferences;
  reminderEnabled: boolean;
  dailyLogTime: string;
}

interface LumaContextValue {
  loading: boolean;
  storageError: string | null;
  corruptionWarning: string | null;
  vaultLocked: boolean;
  vaultEnabled: boolean;
  resolvedTheme: 'light' | 'dark';
  settings: UserSettings;
  cycles: CycleRecord[];
  dailyLogs: DailyLog[];
  summary: CycleSummary;
  observations: CycleObservation[];
  dueReminders: DueReminder[];
  completeOnboarding: (payload: OnboardingPayload) => Promise<void>;
  updateSettings: (
    updater: Partial<UserSettings> | ((prev: UserSettings) => UserSettings)
  ) => Promise<void>;
  addPeriod: (input: {
    startDate: string;
    endDate: string | null;
    notes?: string;
    initialFlow?: DailyLog['bleedingFlow'];
  }) => Promise<{ ok: boolean; error?: string; cycle?: CycleRecord }>;
  updatePeriod: (
    id: string,
    input: { startDate: string; endDate: string | null; notes: string }
  ) => Promise<{ ok: boolean; error?: string }>;
  deletePeriod: (id: string) => Promise<void>;
  upsertDailyLog: (
    date: string,
    patch: Partial<
      Pick<
        DailyLog,
        'bleedingFlow' | 'symptoms' | 'mood' | 'energyLevel' | 'sleep' | 'notes'
      >
    >
  ) => Promise<void>;
  deleteDailyLog: (date: string) => Promise<void>;
  addCustomSymptom: (symptom: string) => Promise<void>;
  enableVault: (passphrase: string) => Promise<void>;
  unlockVault: (passphrase: string) => Promise<void>;
  lockVault: () => void;
  disableVault: (passphrase: string) => Promise<void>;
  importSnapshot: (
    incoming: LumaDataSnapshot,
    mode: 'replace' | 'merge'
  ) => Promise<void>;
  deleteAllData: () => Promise<void>;
  dismissCorruptionWarning: () => void;
  dismissReminder: (id: string) => void;
}

const LumaContext = createContext<LumaContextValue | null>(null);

export const LumaProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [loading, setLoading] = useState(true);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [corruptionWarning, setCorruptionWarning] = useState<string | null>(null);
  const [vaultLocked, setVaultLocked] = useState(false);
  const [vaultEnabled, setVaultEnabled] = useState(false);
  const vaultSessionRef = useRef<ActiveVaultSession | null>(null);

  const [settings, setSettings] = useState<UserSettings>(() =>
    createDefaultSettings()
  );
  const [cycles, setCycles] = useState<CycleRecord[]>([]);
  const [dailyLogs, setDailyLogs] = useState<DailyLog[]>([]);
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [dismissedReminderIds, setDismissedReminderIds] = useState<string[]>([]);
  const notifiedIdsRef = useRef<Set<string>>(new Set());

  // Listen to OS color scheme changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolvedTheme: 'light' | 'dark' = useMemo(() => {
    if (settings.theme === 'system') {
      return systemPrefersDark ? 'dark' : 'light';
    }
    return settings.theme;
  }, [settings.theme, systemPrefersDark]);

  // Apply .dark class to <html> and update meta theme-color
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.classList.toggle('dark', resolvedTheme === 'dark');
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute(
        'content',
        resolvedTheme === 'dark' ? '#131221' : '#F5F7FC'
      );
    }
  }, [resolvedTheme]);

  // Initial IndexedDB load
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const result = await loadInitialStorage();
        if (!active) return;
        setVaultLocked(result.locked);
        setVaultEnabled(result.vaultExists);
        setSettings(result.snapshot.settings);
        setCycles(result.snapshot.cycles);
        setDailyLogs(result.snapshot.dailyLogs);
        setCorruptionWarning(result.corruptionWarning);
      } catch (err) {
        if (!active) return;
        setStorageError(
          err instanceof Error
            ? err.message
            : 'Unable to access local browser storage.'
        );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const persist = useCallback(
    async (next: LumaDataSnapshot) => {
      try {
        await saveSnapshot(next, vaultSessionRef.current);
        setStorageError(null);
      } catch (err) {
        setStorageError(
          err instanceof Error
            ? err.message
            : 'Failed saving changes to local storage.'
        );
        throw err;
      }
    },
    []
  );

  const summary = useMemo(
    () => computeCycleSummary(cycles, settings, todayLocalDate()),
    [cycles, settings]
  );

  const observations = useMemo(
    () => generatePersonalizedObservations(cycles, dailyLogs, summary),
    [cycles, dailyLogs, summary]
  );

  const dueReminders = useMemo(() => {
    if (loading || vaultLocked || !settings.onboardingCompleted) return [];
    const today = todayLocalDate();
    const hasLoggedToday = dailyLogs.some((l) => l.date === today);
    return evaluateDueReminders(
      settings.reminderPreferences,
      summary,
      hasLoggedToday
    ).filter((r) => !dismissedReminderIds.includes(r.id));
  }, [
    loading,
    vaultLocked,
    settings.onboardingCompleted,
    settings.reminderPreferences,
    summary,
    dailyLogs,
    dismissedReminderIds,
  ]);

  useEffect(() => {
    for (const r of dueReminders) {
      if (!notifiedIdsRef.current.has(r.id)) {
        notifiedIdsRef.current.add(r.id);
        triggerBrowserNotification(r);
      }
    }
  }, [dueReminders]);

  const completeOnboarding = useCallback(
    async (payload: OnboardingPayload) => {
      const now = new Date().toISOString();
      const nextSettings: UserSettings = {
        ...settings,
        onboardingCompleted: true,
        averageCycleLength: payload.averageCycleLength,
        averagePeriodLength: payload.averagePeriodLength,
        theme: payload.theme,
        trackingPreferences: payload.trackingPreferences,
        reminderPreferences: {
          ...settings.reminderPreferences,
          enabled: payload.reminderEnabled,
          dailyLog: payload.reminderEnabled,
          dailyLogTime: payload.dailyLogTime,
        },
        updatedAt: now,
      };

      const candidateStarts = new Set<string>();
      const newCycles: CycleRecord[] = [];

      if (payload.lastPeriodStartDate) {
        candidateStarts.add(payload.lastPeriodStartDate);
        newCycles.push({
          id: createId(),
          startDate: payload.lastPeriodStartDate,
          endDate: payload.lastPeriodEndDate,
          notes: '',
          createdAt: now,
          updatedAt: now,
        });
      }

      for (const histDate of payload.historicalStartDates) {
        if (!candidateStarts.has(histDate)) {
          candidateStarts.add(histDate);
          newCycles.push({
            id: createId(),
            startDate: histDate,
            endDate: null,
            notes: '',
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      const sortedCycles = sortCyclesChronological(newCycles);
      setSettings(nextSettings);
      setCycles(sortedCycles);
      await persist({
        settings: nextSettings,
        cycles: sortedCycles,
        dailyLogs,
      });
    },
    [settings, dailyLogs, persist]
  );

  const updateSettings = useCallback(
    async (
      updater: Partial<UserSettings> | ((prev: UserSettings) => UserSettings)
    ) => {
      const nextBase =
        typeof updater === 'function' ? updater(settings) : { ...settings, ...updater };
      const nextSettings: UserSettings = {
        ...nextBase,
        updatedAt: new Date().toISOString(),
      };
      setSettings(nextSettings);
      await persist({
        settings: nextSettings,
        cycles,
        dailyLogs,
      });
    },
    [settings, cycles, dailyLogs, persist]
  );

  const addPeriod = useCallback(
    async (input: {
      startDate: string;
      endDate: string | null;
      notes?: string;
      initialFlow?: DailyLog['bleedingFlow'];
    }): Promise<{ ok: boolean; error?: string; cycle?: CycleRecord }> => {
      const check = validatePeriodInput(
        { startDate: input.startDate, endDate: input.endDate },
        cycles
      );
      if (!check.valid) {
        return { ok: false, error: check.error };
      }

      const now = new Date().toISOString();
      const created: CycleRecord = {
        id: createId(),
        startDate: input.startDate,
        endDate: input.endDate,
        notes: input.notes?.trim() ?? '',
        createdAt: now,
        updatedAt: now,
      };

      const nextCycles = sortCyclesChronological([...cycles, created]);
      let nextLogs = dailyLogs;

      if (input.initialFlow && input.initialFlow !== 'none') {
        const existingIdx = dailyLogs.findIndex((l) => l.date === input.startDate);
        if (existingIdx >= 0) {
          nextLogs = dailyLogs.map((l, i) =>
            i === existingIdx
              ? { ...l, bleedingFlow: input.initialFlow!, updatedAt: now }
              : l
          );
        } else {
          const newLog: DailyLog = {
            id: createId(),
            date: input.startDate,
            bleedingFlow: input.initialFlow,
            symptoms: [],
            mood: null,
            energyLevel: null,
            sleep: null,
            notes: '',
            createdAt: now,
            updatedAt: now,
          };
          nextLogs = [newLog, ...dailyLogs].sort((a, b) =>
            b.date.localeCompare(a.date)
          );
        }
      }

      setCycles(nextCycles);
      setDailyLogs(nextLogs);
      await persist({
        settings,
        cycles: nextCycles,
        dailyLogs: nextLogs,
      });
      return { ok: true, cycle: created };
    },
    [cycles, dailyLogs, settings, persist]
  );

  const updatePeriod = useCallback(
    async (
      id: string,
      input: { startDate: string; endDate: string | null; notes: string }
    ): Promise<{ ok: boolean; error?: string }> => {
      const check = validatePeriodInput(
        { id, startDate: input.startDate, endDate: input.endDate },
        cycles
      );
      if (!check.valid) {
        return { ok: false, error: check.error };
      }

      const now = new Date().toISOString();
      const nextCycles = sortCyclesChronological(
        cycles.map((c) =>
          c.id === id
            ? {
                ...c,
                startDate: input.startDate,
                endDate: input.endDate,
                notes: input.notes.trim(),
                updatedAt: now,
              }
            : c
        )
      );

      setCycles(nextCycles);
      await persist({
        settings,
        cycles: nextCycles,
        dailyLogs,
      });
      return { ok: true };
    },
    [cycles, dailyLogs, settings, persist]
  );

  const deletePeriod = useCallback(
    async (id: string) => {
      const nextCycles = cycles.filter((c) => c.id !== id);
      setCycles(nextCycles);
      await persist({
        settings,
        cycles: nextCycles,
        dailyLogs,
      });
    },
    [cycles, dailyLogs, settings, persist]
  );

  const upsertDailyLog = useCallback(
    async (
      date: string,
      patch: Partial<
        Pick<
          DailyLog,
          'bleedingFlow' | 'symptoms' | 'mood' | 'energyLevel' | 'sleep' | 'notes'
        >
      >
    ) => {
      const now = new Date().toISOString();
      const existing = dailyLogs.find((l) => l.date === date);

      const merged: DailyLog = existing
        ? {
            ...existing,
            ...patch,
            updatedAt: now,
          }
        : {
            id: createId(),
            date,
            bleedingFlow: patch.bleedingFlow ?? null,
            symptoms: patch.symptoms ?? [],
            mood: patch.mood ?? null,
            energyLevel: patch.energyLevel ?? null,
            sleep: patch.sleep ?? null,
            notes: patch.notes ?? '',
            createdAt: now,
            updatedAt: now,
          };

      let nextLogs: DailyLog[];
      if (!hasAnyDailyLogContent(merged)) {
        nextLogs = dailyLogs.filter((l) => l.date !== date);
      } else if (existing) {
        nextLogs = dailyLogs.map((l) => (l.date === date ? merged : l));
      } else {
        nextLogs = [merged, ...dailyLogs].sort((a, b) =>
          b.date.localeCompare(a.date)
        );
      }

      setDailyLogs(nextLogs);
      await persist({
        settings,
        cycles,
        dailyLogs: nextLogs,
      });
    },
    [dailyLogs, settings, cycles, persist]
  );

  const deleteDailyLog = useCallback(
    async (date: string) => {
      const nextLogs = dailyLogs.filter((l) => l.date !== date);
      setDailyLogs(nextLogs);
      await persist({
        settings,
        cycles,
        dailyLogs: nextLogs,
      });
    },
    [dailyLogs, settings, cycles, persist]
  );

  const addCustomSymptom = useCallback(
    async (symptom: string) => {
      const trimmed = symptom.trim();
      if (!trimmed) return;
      if (
        settings.customSymptoms.some(
          (s) => s.toLowerCase() === trimmed.toLowerCase()
        )
      ) {
        return;
      }
      const nextSettings: UserSettings = {
        ...settings,
        customSymptoms: [...settings.customSymptoms, trimmed],
        updatedAt: new Date().toISOString(),
      };
      setSettings(nextSettings);
      await persist({
        settings: nextSettings,
        cycles,
        dailyLogs,
      });
    },
    [settings, cycles, dailyLogs, persist]
  );

  const enableVault = useCallback(
    async (passphrase: string) => {
      const session = await enableEncryptedVault(
        { settings, cycles, dailyLogs },
        passphrase
      );
      vaultSessionRef.current = session;
      setVaultEnabled(true);
      setVaultLocked(false);
    },
    [settings, cycles, dailyLogs]
  );

  const unlockVault = useCallback(async (passphrase: string) => {
    const res = await unlockEncryptedVault(passphrase);
    vaultSessionRef.current = res.session;
    setSettings(res.snapshot.settings);
    setCycles(res.snapshot.cycles);
    setDailyLogs(res.snapshot.dailyLogs);
    setCorruptionWarning(res.corruptionWarning);
    setVaultEnabled(true);
    setVaultLocked(false);
  }, []);

  const lockVault = useCallback(() => {
    if (!vaultEnabled) return;
    vaultSessionRef.current = null;
    setVaultLocked(true);
    setCycles([]);
    setDailyLogs([]);
  }, [vaultEnabled]);

  const disableVault = useCallback(async (passphrase: string) => {
    const snapshot = await disableEncryptedVault(passphrase);
    vaultSessionRef.current = null;
    setVaultEnabled(false);
    setVaultLocked(false);
    setSettings(snapshot.settings);
    setCycles(snapshot.cycles);
    setDailyLogs(snapshot.dailyLogs);
  }, []);

  const importSnapshot = useCallback(
    async (incoming: LumaDataSnapshot, mode: 'replace' | 'merge') => {
      let nextSettings = incoming.settings;
      let nextCycles = incoming.cycles;
      let nextLogs = incoming.dailyLogs;

      if (mode === 'merge') {
        nextSettings = {
          ...settings,
          customSymptoms: Array.from(
            new Set([...settings.customSymptoms, ...incoming.settings.customSymptoms])
          ),
          onboardingCompleted: true,
          updatedAt: new Date().toISOString(),
        };

        const cycleMap = new Map<string, CycleRecord>();
        for (const c of cycles) cycleMap.set(c.startDate, c);
        for (const c of incoming.cycles) {
          if (!cycleMap.has(c.startDate)) {
            cycleMap.set(c.startDate, c);
          }
        }
        nextCycles = sortCyclesChronological(Array.from(cycleMap.values()));

        const logMap = new Map<string, DailyLog>();
        for (const l of dailyLogs) logMap.set(l.date, l);
        for (const l of incoming.dailyLogs) {
          if (!logMap.has(l.date)) {
            logMap.set(l.date, l);
          }
        }
        nextLogs = Array.from(logMap.values()).sort((a, b) =>
          b.date.localeCompare(a.date)
        );
      } else {
        nextSettings = {
          ...incoming.settings,
          onboardingCompleted: true,
        };
      }

      setSettings(nextSettings);
      setCycles(nextCycles);
      setDailyLogs(nextLogs);
      await persist({
        settings: nextSettings,
        cycles: nextCycles,
        dailyLogs: nextLogs,
      });
    },
    [settings, cycles, dailyLogs, persist]
  );

  const deleteAllData = useCallback(async () => {
    await wipeAllLocalData();
    vaultSessionRef.current = null;
    setVaultEnabled(false);
    setVaultLocked(false);
    setSettings(createDefaultSettings());
    setCycles([]);
    setDailyLogs([]);
    setCorruptionWarning(null);
    setStorageError(null);
  }, []);

  const dismissCorruptionWarning = useCallback(() => {
    setCorruptionWarning(null);
  }, []);

  const dismissReminder = useCallback((id: string) => {
    setDismissedReminderIds((prev) => [...prev, id]);
  }, []);

  const value: LumaContextValue = {
    loading,
    storageError,
    corruptionWarning,
    vaultLocked,
    vaultEnabled,
    resolvedTheme,
    settings,
    cycles,
    dailyLogs,
    summary,
    observations,
    dueReminders,
    completeOnboarding,
    updateSettings,
    addPeriod,
    updatePeriod,
    deletePeriod,
    upsertDailyLog,
    deleteDailyLog,
    addCustomSymptom,
    enableVault,
    unlockVault,
    lockVault,
    disableVault,
    importSnapshot,
    deleteAllData,
    dismissCorruptionWarning,
    dismissReminder,
  };

  return <LumaContext.Provider value={value}>{children}</LumaContext.Provider>;
};

export function useLuma(): LumaContextValue {
  const ctx = useContext(LumaContext);
  if (!ctx) {
    throw new Error('useLuma must be used inside a LumaProvider');
  }
  return ctx;
}
