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
import { useAuth } from '@/src/context/AuthContext';
import {
  ActiveVaultSession,
  createDefaultSyncMetadata,
  disableEncryptedVault,
  enableEncryptedVault,
  loadInitialStorage,
  LocalSyncMetadata,
  saveSnapshot,
  saveSyncMetadata,
  unlockEncryptedVault,
  wipeAllLocalData,
} from '@/src/services/storageService';
import {
  CloudSyncStatus,
  createEmptyDeletions,
  deleteUserCloudData,
  ensureUserRecord,
  ExplicitSyncDeletions,
  fetchUserCloudSnapshot,
  hasPendingDeletions,
  reconcileSnapshots,
  syncSnapshotToCloud,
} from '@/src/services/supabaseSyncService';
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
  cloudSyncStatus: CloudSyncStatus;
  cloudSyncError: string | null;
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
  retryCloudSync: () => Promise<void>;
  dismissCorruptionWarning: () => void;
  dismissReminder: (id: string) => void;
}

const LumaContext = createContext<LumaContextValue | null>(null);

export const LumaProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user, authLoading } = useAuth();
  const storageScope = user?.id ?? 'guest';

  const [loading, setLoading] = useState(true);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [corruptionWarning, setCorruptionWarning] = useState<string | null>(null);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>('local-only');
  const [cloudSyncError, setCloudSyncError] = useState<string | null>(null);
  const [vaultLocked, setVaultLocked] = useState(false);
  const [vaultEnabled, setVaultEnabled] = useState(false);
  const vaultSessionRef = useRef<ActiveVaultSession | null>(null);

  const [settings, setSettings] = useState<UserSettings>(() =>
    createDefaultSettings()
  );
  const [cycles, setCycles] = useState<CycleRecord[]>([]);
  const [dailyLogs, setDailyLogs] = useState<DailyLog[]>([]);

  const latestSnapshotRef = useRef<LumaDataSnapshot>({
    settings,
    cycles,
    dailyLogs,
  });
  const syncMetaRef = useRef<LocalSyncMetadata>(createDefaultSyncMetadata());
  const syncInFlightRef = useRef(false);
  const syncQueuedRef = useRef(false);
  const activeScopeRef = useRef(storageScope);
  activeScopeRef.current = storageScope;

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

  const applySnapshotToState = useCallback((snap: LumaDataSnapshot) => {
    latestSnapshotRef.current = snap;
    setSettings(snap.settings);
    setCycles(snap.cycles);
    setDailyLogs(snap.dailyLogs);
  }, []);

  /**
   * Serialized in-session cloud sync worker.
   * Coalesces rapid local edits so overlapping requests never execute out of order.
   */
  const drainCloudSyncQueue = useCallback(async () => {
    if (!user) return;
    if (syncInFlightRef.current) {
      syncQueuedRef.current = true;
      return;
    }

    syncInFlightRef.current = true;
    const targetScope = storageScope;
    const targetUser = { id: user.id, email: user.email };

    try {
      do {
        syncQueuedRef.current = false;
        if (activeScopeRef.current !== targetScope) break;

        setCloudSyncStatus('syncing');
        setCloudSyncError(null);

        const snapshotToPush = latestSnapshotRef.current;
        const metaBeforePush = syncMetaRef.current;
        const deletionsToPush: ExplicitSyncDeletions = {
          deletedCycles: { ...metaBeforePush.deletedCycles },
          deletedDailyLogIds: { ...metaBeforePush.deletedDailyLogIds },
          deletedDailyLogDates: { ...metaBeforePush.deletedDailyLogDates },
        };

        try {
          const res = await syncSnapshotToCloud(targetUser, snapshotToPush, {
            expectedRevision: metaBeforePush.lastSyncedRevision,
            deletions: deletionsToPush,
          });

          if (activeScopeRef.current !== targetScope) break;

          if (res.status === 'synced') {
            // Remove only the tombstones that were already present when this push started
            const currentMeta = syncMetaRef.current;
            const nextDeletedCycles = { ...currentMeta.deletedCycles };
            for (const id of Object.keys(deletionsToPush.deletedCycles)) {
              if (nextDeletedCycles[id] === deletionsToPush.deletedCycles[id]) {
                delete nextDeletedCycles[id];
              }
            }
            const nextDeletedLogIds = { ...currentMeta.deletedDailyLogIds };
            for (const id of Object.keys(deletionsToPush.deletedDailyLogIds)) {
              if (
                nextDeletedLogIds[id] === deletionsToPush.deletedDailyLogIds[id]
              ) {
                delete nextDeletedLogIds[id];
              }
            }
            const nextDeletedLogDates = { ...currentMeta.deletedDailyLogDates };
            for (const d of Object.keys(deletionsToPush.deletedDailyLogDates)) {
              if (
                nextDeletedLogDates[d] ===
                deletionsToPush.deletedDailyLogDates[d]
              ) {
                delete nextDeletedLogDates[d];
              }
            }

            const updatedMeta: LocalSyncMetadata = {
              id: 'sync_meta',
              lastSyncedRevision:
                res.serverRevision !== undefined
                  ? res.serverRevision
                  : currentMeta.lastSyncedRevision,
              deletedCycles: nextDeletedCycles,
              deletedDailyLogIds: nextDeletedLogIds,
              deletedDailyLogDates: nextDeletedLogDates,
            };
            syncMetaRef.current = updatedMeta;
            await saveSyncMetadata(updatedMeta, targetScope);

            // If server returned reconciled records (e.g. from fallback table merge) and no newer local write is queued, apply them
            if (!syncQueuedRef.current && res.mergedSnapshot) {
              const { merged } = reconcileSnapshots(
                latestSnapshotRef.current,
                res.mergedSnapshot,
                updatedMeta
              );
              applySnapshotToState(merged);
              await saveSnapshot(merged, vaultSessionRef.current, targetScope);
            }

            setCloudSyncStatus('synced');
            setCloudSyncError(null);
          } else if (res.status === 'conflict') {
            // Preserve both local and remote data non-destructively
            if (res.mergedSnapshot) {
              const { merged, effectiveDeletions } = reconcileSnapshots(
                latestSnapshotRef.current,
                res.mergedSnapshot,
                syncMetaRef.current
              );
              const conflictMeta: LocalSyncMetadata = {
                id: 'sync_meta',
                lastSyncedRevision:
                  res.serverRevision !== undefined
                    ? res.serverRevision
                    : syncMetaRef.current.lastSyncedRevision,
                deletedCycles: effectiveDeletions.deletedCycles,
                deletedDailyLogIds: effectiveDeletions.deletedDailyLogIds,
                deletedDailyLogDates: effectiveDeletions.deletedDailyLogDates,
              };
              syncMetaRef.current = conflictMeta;
              applySnapshotToState(merged);
              await saveSnapshot(merged, vaultSessionRef.current, targetScope);
              await saveSyncMetadata(conflictMeta, targetScope);
            } else if (res.serverRevision !== undefined) {
              const conflictMeta: LocalSyncMetadata = {
                ...syncMetaRef.current,
                lastSyncedRevision: res.serverRevision,
              };
              syncMetaRef.current = conflictMeta;
              await saveSyncMetadata(conflictMeta, targetScope);
            }

            setCloudSyncStatus('conflict');
            setCloudSyncError(
              res.error ??
                'Concurrent changes from another tab or device were merged safely. Click Sync Now to complete synchronization.'
            );
          } else {
            setCloudSyncStatus(res.status);
            setCloudSyncError(res.error ?? null);
          }
        } catch (err) {
          if (activeScopeRef.current !== targetScope) break;
          setCloudSyncStatus('error');
          setCloudSyncError(
            err instanceof Error ? err.message : 'Unable to sync to Supabase.'
          );
        }
      } while (syncQueuedRef.current);
    } finally {
      syncInFlightRef.current = false;
    }
  }, [user, storageScope, applySnapshotToState]);

  // Load scoped IndexedDB & hydrate from Supabase when authenticated
  useEffect(() => {
    if (authLoading) return;
    let active = true;

    vaultSessionRef.current = null;
    syncInFlightRef.current = false;
    syncQueuedRef.current = false;
    setLoading(true);
    setStorageError(null);
    setCorruptionWarning(null);
    setCloudSyncError(null);
    setCloudSyncStatus(user ? 'syncing' : 'local-only');

    (async () => {
      try {
        const localResult = await loadInitialStorage(storageScope);
        if (!active) return;

        setVaultLocked(localResult.locked);
        setVaultEnabled(localResult.vaultExists);
        syncMetaRef.current = localResult.syncMeta;
        applySnapshotToState(localResult.snapshot);
        setCorruptionWarning(localResult.corruptionWarning);

        if (!user) {
          setCloudSyncStatus('local-only');
          return;
        }

        if (localResult.locked) {
          return;
        }

        const userCheck = await ensureUserRecord({
          id: user.id,
          email: user.email,
        });
        if (!active) return;
        if (userCheck.status === 'tables-missing') {
          setCloudSyncStatus('tables-missing');
          setCloudSyncError(userCheck.error ?? null);
          return;
        }
        if (userCheck.status === 'error') {
          setCloudSyncStatus('error');
          setCloudSyncError(userCheck.error ?? null);
          return;
        }

        const cloudRes = await fetchUserCloudSnapshot(user.id);
        if (!active) return;

        if (cloudRes.status === 'tables-missing') {
          setCloudSyncStatus('tables-missing');
          setCloudSyncError(cloudRes.error ?? null);
          return;
        }
        if (cloudRes.status === 'error') {
          setCloudSyncStatus('error');
          setCloudSyncError(cloudRes.error ?? null);
          return;
        }

        if (cloudRes.status === 'ready' && cloudRes.snapshot) {
          // Record-level non-destructive merge of local + remote data and tombstones
          const { merged, effectiveDeletions } = reconcileSnapshots(
            localResult.snapshot,
            cloudRes.snapshot,
            localResult.syncMeta
          );

          const hydratedMeta: LocalSyncMetadata = {
            id: 'sync_meta',
            lastSyncedRevision: cloudRes.serverRevision,
            deletedCycles: effectiveDeletions.deletedCycles,
            deletedDailyLogIds: effectiveDeletions.deletedDailyLogIds,
            deletedDailyLogDates: effectiveDeletions.deletedDailyLogDates,
          };
          syncMetaRef.current = hydratedMeta;
          applySnapshotToState(merged);
          await saveSnapshot(merged, null, storageScope);
          await saveSyncMetadata(hydratedMeta, storageScope);

          const localHasUnpushedChanges =
            hasPendingDeletions(effectiveDeletions) ||
            merged.cycles.length !== cloudRes.snapshot.cycles.length ||
            merged.dailyLogs.length !== cloudRes.snapshot.dailyLogs.length ||
            merged.settings.updatedAt > cloudRes.snapshot.settings.updatedAt ||
            merged.cycles.some((mc) => {
              const rc = cloudRes.snapshot!.cycles.find((c) => c.id === mc.id);
              return !rc || mc.updatedAt > rc.updatedAt;
            }) ||
            merged.dailyLogs.some((ml) => {
              const rl = cloudRes.snapshot!.dailyLogs.find(
                (l) => l.date === ml.date
              );
              return !rl || ml.updatedAt > rl.updatedAt;
            });

          if (localHasUnpushedChanges) {
            await drainCloudSyncQueue();
          } else {
            setCloudSyncStatus('synced');
          }
        } else if (cloudRes.status === 'empty') {
          const hydratedMeta: LocalSyncMetadata = {
            ...localResult.syncMeta,
            lastSyncedRevision: cloudRes.serverRevision ?? 0,
          };
          syncMetaRef.current = hydratedMeta;
          await saveSyncMetadata(hydratedMeta, storageScope);

          const localHasData =
            localResult.snapshot.settings.onboardingCompleted ||
            localResult.snapshot.cycles.length > 0 ||
            localResult.snapshot.dailyLogs.length > 0;

          if (localHasData) {
            await drainCloudSyncQueue();
          } else {
            setCloudSyncStatus('synced');
          }
        }
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
  }, [authLoading, user, storageScope, applySnapshotToState, drainCloudSyncQueue]);

  const persist = useCallback(
    async (
      next: LumaDataSnapshot,
      explicitDeletions?: Partial<ExplicitSyncDeletions>
    ) => {
      latestSnapshotRef.current = next;

      // Update sync metadata tombstones: add any explicit deletions and clear tombstones for active rows
      const currentMeta = syncMetaRef.current;
      const nextDeletedCycles = {
        ...currentMeta.deletedCycles,
        ...(explicitDeletions?.deletedCycles ?? {}),
      };
      for (const c of next.cycles) {
        delete nextDeletedCycles[c.id];
      }

      const nextDeletedLogIds = {
        ...currentMeta.deletedDailyLogIds,
        ...(explicitDeletions?.deletedDailyLogIds ?? {}),
      };
      const nextDeletedLogDates = {
        ...currentMeta.deletedDailyLogDates,
        ...(explicitDeletions?.deletedDailyLogDates ?? {}),
      };
      for (const l of next.dailyLogs) {
        delete nextDeletedLogIds[l.id];
        delete nextDeletedLogDates[l.date];
      }

      const nextMeta: LocalSyncMetadata = {
        ...currentMeta,
        deletedCycles: nextDeletedCycles,
        deletedDailyLogIds: nextDeletedLogIds,
        deletedDailyLogDates: nextDeletedLogDates,
      };
      syncMetaRef.current = nextMeta;

      try {
        await saveSnapshot(next, vaultSessionRef.current, storageScope);
        await saveSyncMetadata(nextMeta, storageScope);
        setStorageError(null);
      } catch (err) {
        setStorageError(
          err instanceof Error
            ? err.message
            : 'Failed saving changes to local storage.'
        );
        throw err;
      }

      if (user) {
        void drainCloudSyncQueue();
      }
    },
    [storageScope, user, drainCloudSyncQueue]
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
      const current = latestSnapshotRef.current;
      const now = new Date().toISOString();
      const nextSettings: UserSettings = {
        ...current.settings,
        onboardingCompleted: true,
        averageCycleLength: payload.averageCycleLength,
        averagePeriodLength: payload.averagePeriodLength,
        theme: payload.theme,
        trackingPreferences: payload.trackingPreferences,
        reminderPreferences: {
          ...current.settings.reminderPreferences,
          enabled: payload.reminderEnabled,
          dailyLog: payload.reminderEnabled,
          dailyLogTime: payload.dailyLogTime,
        },
        updatedAt: now,
      };

      const candidateStarts = new Set<string>(
        current.cycles.map((c) => c.startDate)
      );
      const newCycles: CycleRecord[] = [...current.cycles];

      if (
        payload.lastPeriodStartDate &&
        !candidateStarts.has(payload.lastPeriodStartDate)
      ) {
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
      const nextSnap: LumaDataSnapshot = {
        settings: nextSettings,
        cycles: sortedCycles,
        dailyLogs: current.dailyLogs,
      };
      applySnapshotToState(nextSnap);
      await persist(nextSnap);
    },
    [applySnapshotToState, persist]
  );

  const updateSettings = useCallback(
    async (
      updater: Partial<UserSettings> | ((prev: UserSettings) => UserSettings)
    ) => {
      const current = latestSnapshotRef.current;
      const nextBase =
        typeof updater === 'function'
          ? updater(current.settings)
          : { ...current.settings, ...updater };
      const nextSettings: UserSettings = {
        ...nextBase,
        updatedAt: new Date().toISOString(),
      };
      const nextSnap: LumaDataSnapshot = {
        settings: nextSettings,
        cycles: current.cycles,
        dailyLogs: current.dailyLogs,
      };
      applySnapshotToState(nextSnap);
      await persist(nextSnap);
    },
    [applySnapshotToState, persist]
  );

  const addPeriod = useCallback(
    async (input: {
      startDate: string;
      endDate: string | null;
      notes?: string;
      initialFlow?: DailyLog['bleedingFlow'];
    }): Promise<{ ok: boolean; error?: string; cycle?: CycleRecord }> => {
      const current = latestSnapshotRef.current;
      const check = validatePeriodInput(
        { startDate: input.startDate, endDate: input.endDate },
        current.cycles
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

      const nextCycles = sortCyclesChronological([...current.cycles, created]);
      let nextLogs = current.dailyLogs;

      if (input.initialFlow && input.initialFlow !== 'none') {
        const existingIdx = current.dailyLogs.findIndex(
          (l) => l.date === input.startDate
        );
        if (existingIdx >= 0) {
          nextLogs = current.dailyLogs.map((l, i) =>
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
          nextLogs = [newLog, ...current.dailyLogs].sort((a, b) =>
            b.date.localeCompare(a.date)
          );
        }
      }

      const nextSnap: LumaDataSnapshot = {
        settings: current.settings,
        cycles: nextCycles,
        dailyLogs: nextLogs,
      };
      applySnapshotToState(nextSnap);
      await persist(nextSnap);
      return { ok: true, cycle: created };
    },
    [applySnapshotToState, persist]
  );

  const updatePeriod = useCallback(
    async (
      id: string,
      input: { startDate: string; endDate: string | null; notes: string }
    ): Promise<{ ok: boolean; error?: string }> => {
      const current = latestSnapshotRef.current;
      const check = validatePeriodInput(
        { id, startDate: input.startDate, endDate: input.endDate },
        current.cycles
      );
      if (!check.valid) {
        return { ok: false, error: check.error };
      }

      const now = new Date().toISOString();
      const nextCycles = sortCyclesChronological(
        current.cycles.map((c) =>
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

      const nextSnap: LumaDataSnapshot = {
        settings: current.settings,
        cycles: nextCycles,
        dailyLogs: current.dailyLogs,
      };
      applySnapshotToState(nextSnap);
      await persist(nextSnap);
      return { ok: true };
    },
    [applySnapshotToState, persist]
  );

  const deletePeriod = useCallback(
    async (id: string) => {
      const current = latestSnapshotRef.current;
      const now = new Date().toISOString();
      const nextCycles = current.cycles.filter((c) => c.id !== id);
      const nextSnap: LumaDataSnapshot = {
        settings: current.settings,
        cycles: nextCycles,
        dailyLogs: current.dailyLogs,
      };
      applySnapshotToState(nextSnap);
      await persist(nextSnap, {
        deletedCycles: { [id]: now },
      });
    },
    [applySnapshotToState, persist]
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
      const current = latestSnapshotRef.current;
      const now = new Date().toISOString();
      const existing = current.dailyLogs.find((l) => l.date === date);

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
      let explicitDeletions: Partial<ExplicitSyncDeletions> | undefined;

      if (!hasAnyDailyLogContent(merged)) {
        nextLogs = current.dailyLogs.filter((l) => l.date !== date);
        if (existing) {
          explicitDeletions = {
            deletedDailyLogIds: { [existing.id]: now },
            deletedDailyLogDates: { [date]: now },
          };
        }
      } else if (existing) {
        nextLogs = current.dailyLogs.map((l) => (l.date === date ? merged : l));
      } else {
        nextLogs = [merged, ...current.dailyLogs].sort((a, b) =>
          b.date.localeCompare(a.date)
        );
      }

      const nextSnap: LumaDataSnapshot = {
        settings: current.settings,
        cycles: current.cycles,
        dailyLogs: nextLogs,
      };
      applySnapshotToState(nextSnap);
      await persist(nextSnap, explicitDeletions);
    },
    [applySnapshotToState, persist]
  );

  const deleteDailyLog = useCallback(
    async (date: string) => {
      const current = latestSnapshotRef.current;
      const now = new Date().toISOString();
      const existing = current.dailyLogs.find((l) => l.date === date);
      const nextLogs = current.dailyLogs.filter((l) => l.date !== date);
      const nextSnap: LumaDataSnapshot = {
        settings: current.settings,
        cycles: current.cycles,
        dailyLogs: nextLogs,
      };
      applySnapshotToState(nextSnap);
      await persist(nextSnap, {
        deletedDailyLogIds: existing ? { [existing.id]: now } : {},
        deletedDailyLogDates: { [date]: now },
      });
    },
    [applySnapshotToState, persist]
  );

  const addCustomSymptom = useCallback(
    async (symptom: string) => {
      const current = latestSnapshotRef.current;
      const trimmed = symptom.trim();
      if (!trimmed) return;
      if (
        current.settings.customSymptoms.some(
          (s) => s.toLowerCase() === trimmed.toLowerCase()
        )
      ) {
        return;
      }
      const nextSettings: UserSettings = {
        ...current.settings,
        customSymptoms: [...current.settings.customSymptoms, trimmed],
        updatedAt: new Date().toISOString(),
      };
      const nextSnap: LumaDataSnapshot = {
        settings: nextSettings,
        cycles: current.cycles,
        dailyLogs: current.dailyLogs,
      };
      applySnapshotToState(nextSnap);
      await persist(nextSnap);
    },
    [applySnapshotToState, persist]
  );

  const enableVault = useCallback(
    async (passphrase: string) => {
      const current = latestSnapshotRef.current;
      const session = await enableEncryptedVault(
        current,
        passphrase,
        storageScope
      );
      vaultSessionRef.current = session;
      setVaultEnabled(true);
      setVaultLocked(false);
    },
    [storageScope]
  );

  const unlockVault = useCallback(
    async (passphrase: string) => {
      const res = await unlockEncryptedVault(passphrase, storageScope);
      vaultSessionRef.current = res.session;
      applySnapshotToState(res.snapshot);
      setCorruptionWarning(res.corruptionWarning);
      setVaultEnabled(true);
      setVaultLocked(false);
    },
    [storageScope, applySnapshotToState]
  );

  const lockVault = useCallback(() => {
    if (!vaultEnabled) return;
    vaultSessionRef.current = null;
    setVaultLocked(true);
    setCycles([]);
    setDailyLogs([]);
  }, [vaultEnabled]);

  const disableVault = useCallback(
    async (passphrase: string) => {
      const snapshot = await disableEncryptedVault(passphrase, storageScope);
      vaultSessionRef.current = null;
      setVaultEnabled(false);
      setVaultLocked(false);
      applySnapshotToState(snapshot);
    },
    [storageScope, applySnapshotToState]
  );

  const importSnapshot = useCallback(
    async (incoming: LumaDataSnapshot, mode: 'replace' | 'merge') => {
      const current = latestSnapshotRef.current;
      const now = new Date().toISOString();
      let nextSettings = incoming.settings;
      let nextCycles = incoming.cycles;
      let nextLogs = incoming.dailyLogs;
      let explicitDeletions: Partial<ExplicitSyncDeletions> | undefined;

      if (mode === 'merge') {
        nextSettings = {
          ...current.settings,
          customSymptoms: Array.from(
            new Set([
              ...current.settings.customSymptoms,
              ...incoming.settings.customSymptoms,
            ])
          ),
          onboardingCompleted: true,
          updatedAt: now,
        };

        const cycleMap = new Map<string, CycleRecord>();
        for (const c of current.cycles) cycleMap.set(c.startDate, c);
        for (const c of incoming.cycles) {
          const existing = cycleMap.get(c.startDate);
          if (!existing || c.updatedAt > existing.updatedAt) {
            cycleMap.set(c.startDate, c);
          }
        }
        nextCycles = sortCyclesChronological(Array.from(cycleMap.values()));

        const logMap = new Map<string, DailyLog>();
        for (const l of current.dailyLogs) logMap.set(l.date, l);
        for (const l of incoming.dailyLogs) {
          const existing = logMap.get(l.date);
          if (!existing || l.updatedAt > existing.updatedAt) {
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
          updatedAt: now,
        };
        const incomingCycleIds = new Set(incoming.cycles.map((c) => c.id));
        const deletedCycles: Record<string, string> = {};
        for (const c of current.cycles) {
          if (!incomingCycleIds.has(c.id)) {
            deletedCycles[c.id] = now;
          }
        }

        const incomingLogIds = new Set(incoming.dailyLogs.map((l) => l.id));
        const incomingLogDates = new Set(incoming.dailyLogs.map((l) => l.date));
        const deletedDailyLogIds: Record<string, string> = {};
        const deletedDailyLogDates: Record<string, string> = {};
        for (const l of current.dailyLogs) {
          if (!incomingLogIds.has(l.id)) {
            deletedDailyLogIds[l.id] = now;
          }
          if (!incomingLogDates.has(l.date)) {
            deletedDailyLogDates[l.date] = now;
          }
        }
        explicitDeletions = {
          deletedCycles,
          deletedDailyLogIds,
          deletedDailyLogDates,
        };
      }

      const nextSnap: LumaDataSnapshot = {
        settings: nextSettings,
        cycles: nextCycles,
        dailyLogs: nextLogs,
      };
      applySnapshotToState(nextSnap);
      await persist(nextSnap, explicitDeletions);
    },
    [applySnapshotToState, persist]
  );

  const deleteAllData = useCallback(async () => {
    await wipeAllLocalData(storageScope);
    syncMetaRef.current = createDefaultSyncMetadata();
    if (user) {
      await deleteUserCloudData(user.id);
    }
    vaultSessionRef.current = null;
    setVaultEnabled(false);
    setVaultLocked(false);
    const defaultSnap: LumaDataSnapshot = {
      settings: createDefaultSettings(),
      cycles: [],
      dailyLogs: [],
    };
    applySnapshotToState(defaultSnap);
    setCorruptionWarning(null);
    setStorageError(null);
  }, [storageScope, user, applySnapshotToState]);

  const retryCloudSync = useCallback(async () => {
    if (!user) return;
    setCloudSyncStatus('syncing');
    setCloudSyncError(null);

    const cloudRes = await fetchUserCloudSnapshot(user.id);
    if (cloudRes.status === 'tables-missing') {
      setCloudSyncStatus('tables-missing');
      setCloudSyncError(cloudRes.error ?? null);
      return;
    }
    if (cloudRes.status === 'error') {
      setCloudSyncStatus('error');
      setCloudSyncError(cloudRes.error ?? null);
      return;
    }

    // Reconcile local + remote non-destructively and adopt latest serverRevision before pushing
    const { merged, effectiveDeletions } = reconcileSnapshots(
      latestSnapshotRef.current,
      cloudRes.snapshot,
      syncMetaRef.current
    );

    const refreshedMeta: LocalSyncMetadata = {
      id: 'sync_meta',
      lastSyncedRevision: cloudRes.serverRevision,
      deletedCycles: effectiveDeletions.deletedCycles,
      deletedDailyLogIds: effectiveDeletions.deletedDailyLogIds,
      deletedDailyLogDates: effectiveDeletions.deletedDailyLogDates,
    };
    syncMetaRef.current = refreshedMeta;
    applySnapshotToState(merged);
    await saveSnapshot(merged, vaultSessionRef.current, storageScope);
    await saveSyncMetadata(refreshedMeta, storageScope);

    await drainCloudSyncQueue();
  }, [user, storageScope, applySnapshotToState, drainCloudSyncQueue]);

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
    cloudSyncStatus,
    cloudSyncError,
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
    retryCloudSync,
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
