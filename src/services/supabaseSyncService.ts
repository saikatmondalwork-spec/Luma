import { supabase } from '@/src/lib/supabase';
import {
  CycleRecord,
  DailyLog,
  LumaDataSnapshot,
  UserSettings,
} from '@/src/types/luma';
import {
  createDefaultSettings,
  cycleRecordSchema,
  dailyLogSchema,
  userSettingsSchema,
} from '@/src/utils/validation';

export type CloudSyncStatus =
  | 'local-only'
  | 'syncing'
  | 'synced'
  | 'conflict'
  | 'tables-missing'
  | 'error';

export interface ExplicitSyncDeletions {
  deletedCycles: Record<string, string>; // cycleId -> deletedAt ISO
  deletedDailyLogIds: Record<string, string>; // logId -> deletedAt ISO
  deletedDailyLogDates: Record<string, string>; // YYYY-MM-DD -> deletedAt ISO
}

export interface CloudFetchResult {
  status: 'ready' | 'empty' | 'tables-missing' | 'error';
  snapshot: LumaDataSnapshot | null;
  serverRevision: number | null;
  error?: string;
}

export interface CloudWriteResult {
  status: 'synced' | 'conflict' | 'tables-missing' | 'error';
  serverRevision?: number | null;
  mergedSnapshot?: LumaDataSnapshot;
  remainingDeletions?: ExplicitSyncDeletions;
  error?: string;
}

interface SupabaseErrorLike {
  code?: string;
  message?: string;
  details?: string;
}

function isMissingTableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as SupabaseErrorLike;
  const code = e.code ?? '';
  const msg = `${e.message ?? ''} ${e.details ?? ''}`.toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    ((msg.includes('does not exist') ||
      msg.includes('could not find the table') ||
      msg.includes('schema cache')) &&
      !msg.includes('luma_sync_user_data') &&
      !msg.includes('sync_revision'))
  );
}

function isMissingRpcOrRevisionColumnError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as SupabaseErrorLike;
  const code = e.code ?? '';
  const msg = `${e.message ?? ''} ${e.details ?? ''}`.toLowerCase();
  return (
    code === '42883' ||
    code === '42703' ||
    code === 'PGRST202' ||
    msg.includes('luma_sync_user_data') ||
    msg.includes('sync_revision')
  );
}

function formatSyncError(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === 'string' && msg.trim()) return msg;
  }
  if (err instanceof Error) return err.message;
  return 'Unable to sync with Supabase.';
}

export function createEmptyDeletions(): ExplicitSyncDeletions {
  return {
    deletedCycles: {},
    deletedDailyLogIds: {},
    deletedDailyLogDates: {},
  };
}

export function hasPendingDeletions(del: ExplicitSyncDeletions): boolean {
  return (
    Object.keys(del.deletedCycles).length > 0 ||
    Object.keys(del.deletedDailyLogIds).length > 0 ||
    Object.keys(del.deletedDailyLogDates).length > 0
  );
}

/**
 * Reconciles local and remote snapshots per record using updatedAt timestamps
 * and explicit deletion tombstones. Never deletes a remote record merely because
 * it is absent from the local snapshot.
 */
export function reconcileSnapshots(
  local: LumaDataSnapshot,
  remote: LumaDataSnapshot | null,
  deletions: ExplicitSyncDeletions = createEmptyDeletions()
): {
  merged: LumaDataSnapshot;
  effectiveDeletions: ExplicitSyncDeletions;
  hasRemoteAdditionsOrNewerEdits: boolean;
} {
  const effectiveDeletions: ExplicitSyncDeletions = {
    deletedCycles: { ...deletions.deletedCycles },
    deletedDailyLogIds: { ...deletions.deletedDailyLogIds },
    deletedDailyLogDates: { ...deletions.deletedDailyLogDates },
  };

  if (!remote) {
    return {
      merged: local,
      effectiveDeletions,
      hasRemoteAdditionsOrNewerEdits: false,
    };
  }

  let hasRemoteAdditionsOrNewerEdits = false;

  // 1. Reconcile settings by updatedAt while preserving onboardingCompleted & customSymptoms union
  const localHasMeaningfulSettings =
    local.settings.onboardingCompleted ||
    local.cycles.length > 0 ||
    local.dailyLogs.length > 0;
  const remoteSettingsNewer =
    !localHasMeaningfulSettings ||
    remote.settings.updatedAt > local.settings.updatedAt;

  if (remote.settings.updatedAt > local.settings.updatedAt) {
    hasRemoteAdditionsOrNewerEdits = true;
  }

  const baseSettings = remoteSettingsNewer ? remote.settings : local.settings;
  const mergedCustomSymptoms = Array.from(
    new Set([
      ...local.settings.customSymptoms,
      ...remote.settings.customSymptoms,
    ])
  );
  const mergedSettings: UserSettings = {
    ...baseSettings,
    onboardingCompleted:
      local.settings.onboardingCompleted || remote.settings.onboardingCompleted,
    customSymptoms: mergedCustomSymptoms,
    updatedAt:
      remote.settings.updatedAt > local.settings.updatedAt
        ? remote.settings.updatedAt
        : local.settings.updatedAt,
  };

  // 2. Reconcile cycles by ID (and startDate fallback) with explicit tombstones
  const cyclesById = new Map<string, CycleRecord>();
  for (const lc of local.cycles) {
    const tombstoneAt = effectiveDeletions.deletedCycles[lc.id];
    if (tombstoneAt && tombstoneAt >= lc.updatedAt) {
      continue;
    }
    delete effectiveDeletions.deletedCycles[lc.id];
    cyclesById.set(lc.id, lc);
  }

  for (const rc of remote.cycles) {
    const tombstoneAt = effectiveDeletions.deletedCycles[rc.id];
    if (tombstoneAt) {
      if (rc.updatedAt > tombstoneAt) {
        // Remote record was edited after local deletion: preserve newer remote record
        delete effectiveDeletions.deletedCycles[rc.id];
        cyclesById.set(rc.id, rc);
        hasRemoteAdditionsOrNewerEdits = true;
      }
      continue;
    }

    const existingById = cyclesById.get(rc.id);
    if (!existingById) {
      // Check if local has a cycle with the exact same startDate
      const existingByStart = Array.from(cyclesById.values()).find(
        (c) => c.startDate === rc.startDate
      );
      if (!existingByStart) {
        cyclesById.set(rc.id, rc);
        hasRemoteAdditionsOrNewerEdits = true;
      } else if (rc.updatedAt > existingByStart.updatedAt) {
        cyclesById.delete(existingByStart.id);
        cyclesById.set(rc.id, rc);
        hasRemoteAdditionsOrNewerEdits = true;
      }
    } else if (rc.updatedAt > existingById.updatedAt) {
      cyclesById.set(rc.id, rc);
      hasRemoteAdditionsOrNewerEdits = true;
    }
  }

  const mergedCycles = Array.from(cyclesById.values()).sort((a, b) =>
    a.startDate.localeCompare(b.startDate)
  );

  // 3. Reconcile dailyLogs by unique calendar date with explicit tombstones
  const logsByDate = new Map<string, DailyLog>();
  for (const ll of local.dailyLogs) {
    const tombstoneById = effectiveDeletions.deletedDailyLogIds[ll.id];
    const tombstoneByDate = effectiveDeletions.deletedDailyLogDates[ll.date];
    const tombstoneAt =
      tombstoneById && tombstoneByDate
        ? tombstoneById > tombstoneByDate
          ? tombstoneById
          : tombstoneByDate
        : tombstoneById ?? tombstoneByDate;

    if (tombstoneAt && tombstoneAt >= ll.updatedAt) {
      continue;
    }
    delete effectiveDeletions.deletedDailyLogIds[ll.id];
    delete effectiveDeletions.deletedDailyLogDates[ll.date];
    logsByDate.set(ll.date, ll);
  }

  for (const rl of remote.dailyLogs) {
    const tombstoneById = effectiveDeletions.deletedDailyLogIds[rl.id];
    const tombstoneByDate = effectiveDeletions.deletedDailyLogDates[rl.date];
    const tombstoneAt =
      tombstoneById && tombstoneByDate
        ? tombstoneById > tombstoneByDate
          ? tombstoneById
          : tombstoneByDate
        : tombstoneById ?? tombstoneByDate;

    if (tombstoneAt) {
      if (rl.updatedAt > tombstoneAt) {
        // Remote daily log was modified after local deletion: keep newer remote log
        delete effectiveDeletions.deletedDailyLogIds[rl.id];
        delete effectiveDeletions.deletedDailyLogDates[rl.date];
        logsByDate.set(rl.date, rl);
        hasRemoteAdditionsOrNewerEdits = true;
      }
      continue;
    }

    const existing = logsByDate.get(rl.date);
    if (!existing) {
      logsByDate.set(rl.date, rl);
      hasRemoteAdditionsOrNewerEdits = true;
    } else if (rl.updatedAt > existing.updatedAt) {
      logsByDate.set(rl.date, rl);
      hasRemoteAdditionsOrNewerEdits = true;
    }
  }

  const mergedLogs = Array.from(logsByDate.values()).sort((a, b) =>
    b.date.localeCompare(a.date)
  );

  return {
    merged: {
      settings: mergedSettings,
      cycles: mergedCycles,
      dailyLogs: mergedLogs,
    },
    effectiveDeletions,
    hasRemoteAdditionsOrNewerEdits,
  };
}

export async function ensureUserRecord(user: {
  id: string;
  email?: string | null;
}): Promise<CloudWriteResult> {
  const now = new Date().toISOString();
  const { error } = await supabase.from('luma_users').upsert(
    {
      id: user.id,
      email: user.email ?? '',
      last_login_at: now,
      updated_at: now,
    },
    { onConflict: 'id' }
  );

  if (error) {
    if (isMissingTableError(error)) {
      return { status: 'tables-missing', error: formatSyncError(error) };
    }
    return { status: 'error', error: formatSyncError(error) };
  }
  return { status: 'synced' };
}

export async function fetchUserCloudSnapshot(
  userId: string
): Promise<CloudFetchResult> {
  let settingsRes = await supabase
    .from('luma_user_settings')
    .select('settings, updated_at, sync_revision')
    .eq('user_id', userId)
    .maybeSingle();

  // Graceful fallback if sync_revision column has not been migrated yet
  if (settingsRes.error && isMissingRpcOrRevisionColumnError(settingsRes.error)) {
    settingsRes = (await supabase
      .from('luma_user_settings')
      .select('settings, updated_at')
      .eq('user_id', userId)
      .maybeSingle()) as typeof settingsRes;
  }

  const [cyclesRes, logsRes] = await Promise.all([
    supabase
      .from('luma_cycles')
      .select('id, start_date, end_date, notes, created_at, updated_at')
      .eq('user_id', userId)
      .order('start_date', { ascending: true }),
    supabase
      .from('luma_daily_logs')
      .select(
        'id, date, bleeding_flow, symptoms, mood, energy_level, sleep, notes, created_at, updated_at'
      )
      .eq('user_id', userId)
      .order('date', { ascending: false }),
  ]);

  const firstError = settingsRes.error ?? cyclesRes.error ?? logsRes.error;
  if (firstError) {
    if (isMissingTableError(firstError)) {
      return {
        status: 'tables-missing',
        snapshot: null,
        serverRevision: null,
        error: formatSyncError(firstError),
      };
    }
    return {
      status: 'error',
      snapshot: null,
      serverRevision: null,
      error: formatSyncError(firstError),
    };
  }

  const settingsData = settingsRes.data as
    | {
        settings?: unknown;
        updated_at?: string;
        sync_revision?: number | string | null;
      }
    | null
    | undefined;

  const rawSettings = settingsData?.settings ?? null;
  const rawRevision = settingsData?.sync_revision;
  const serverRevision =
    typeof rawRevision === 'number'
      ? rawRevision
      : typeof rawRevision === 'string' && rawRevision.trim() !== ''
      ? Number(rawRevision)
      : null;

  const rawCycles = cyclesRes.data ?? [];
  const rawLogs = logsRes.data ?? [];

  if (!rawSettings && rawCycles.length === 0 && rawLogs.length === 0) {
    return { status: 'empty', snapshot: null, serverRevision: serverRevision ?? 0 };
  }

  const parsedSettings = userSettingsSchema.safeParse(rawSettings);
  const settings: UserSettings = parsedSettings.success
    ? parsedSettings.data
    : createDefaultSettings();

  const cycles: CycleRecord[] = [];
  for (const row of rawCycles) {
    const candidate = {
      id: row.id,
      startDate: row.start_date,
      endDate: row.end_date ?? null,
      notes: row.notes ?? '',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    const res = cycleRecordSchema.safeParse(candidate);
    if (res.success) {
      cycles.push(res.data);
    }
  }
  cycles.sort((a, b) => a.startDate.localeCompare(b.startDate));

  const dailyLogs: DailyLog[] = [];
  for (const row of rawLogs) {
    const candidate = {
      id: row.id,
      date: row.date,
      bleedingFlow: row.bleeding_flow ?? null,
      symptoms: Array.isArray(row.symptoms) ? row.symptoms : [],
      mood: row.mood ?? null,
      energyLevel: row.energy_level ?? null,
      sleep: row.sleep ?? null,
      notes: row.notes ?? '',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    const res = dailyLogSchema.safeParse(candidate);
    if (res.success) {
      dailyLogs.push(res.data);
    }
  }
  dailyLogs.sort((a, b) => b.date.localeCompare(a.date));

  return {
    status: 'ready',
    snapshot: { settings, cycles, dailyLogs },
    serverRevision,
  };
}

export interface SyncToCloudOptions {
  expectedRevision?: number | null;
  deletions?: ExplicitSyncDeletions;
}

export async function syncSnapshotToCloud(
  user: { id: string; email?: string | null },
  snapshot: LumaDataSnapshot,
  options: SyncToCloudOptions = {}
): Promise<CloudWriteResult> {
  const deletions = options.deletions ?? createEmptyDeletions();
  const expectedRevision =
    options.expectedRevision !== undefined ? options.expectedRevision : null;

  const now = new Date().toISOString();
  const cycleRows = snapshot.cycles.map((c) => ({
    user_id: user.id,
    id: c.id,
    start_date: c.startDate,
    end_date: c.endDate,
    notes: c.notes ?? '',
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  }));

  const logRows = snapshot.dailyLogs.map((l) => ({
    user_id: user.id,
    id: l.id,
    date: l.date,
    bleeding_flow: l.bleedingFlow,
    symptoms: l.symptoms,
    mood: l.mood,
    energy_level: l.energyLevel,
    sleep: l.sleep,
    notes: l.notes ?? '',
    created_at: l.createdAt,
    updated_at: l.updatedAt,
  }));

  // 1. Prefer atomic server-side RPC if available on the Supabase instance
  if (typeof (supabase as { rpc?: unknown }).rpc === 'function') {
    const rpcRes = await supabase.rpc('luma_sync_user_data', {
      p_email: user.email ?? '',
      p_expected_revision: expectedRevision,
      p_settings: snapshot.settings,
      p_settings_updated_at: snapshot.settings.updatedAt || now,
      p_cycles: cycleRows,
      p_daily_logs: logRows,
      p_deleted_cycle_ids: Object.keys(deletions.deletedCycles),
      p_deleted_log_ids: Object.keys(deletions.deletedDailyLogIds),
      p_deleted_log_dates: Object.keys(deletions.deletedDailyLogDates),
    });

    if (!rpcRes.error) {
      const payload = rpcRes.data as
        | { status?: string; server_revision?: number }
        | null;

      if (payload?.status === 'conflict') {
        // Fetch remote state and non-destructively reconcile both sides
        const latestRemote = await fetchUserCloudSnapshot(user.id);
        if (latestRemote.status === 'ready' || latestRemote.status === 'empty') {
          const { merged, effectiveDeletions } = reconcileSnapshots(
            snapshot,
            latestRemote.snapshot,
            deletions
          );
          return {
            status: 'conflict',
            serverRevision:
              latestRemote.serverRevision ?? payload.server_revision ?? null,
            mergedSnapshot: merged,
            remainingDeletions: effectiveDeletions,
            error:
              'Detected newer changes from another tab or device. Local and cloud records were safely merged—click Sync Now to finalize.',
          };
        }
        return {
          status: 'conflict',
          serverRevision: payload.server_revision ?? null,
          error:
            'Sync conflict detected with another session. Your local data is preserved.',
        };
      }

      return {
        status: 'synced',
        serverRevision:
          typeof payload?.server_revision === 'number'
            ? payload.server_revision
            : expectedRevision !== null
            ? expectedRevision + 1
            : 1,
        mergedSnapshot: snapshot,
        remainingDeletions: createEmptyDeletions(),
      };
    }

    if (isMissingTableError(rpcRes.error)) {
      return {
        status: 'tables-missing',
        error: formatSyncError(rpcRes.error),
      };
    }

    if (!isMissingRpcOrRevisionColumnError(rpcRes.error)) {
      return {
        status: 'error',
        error: formatSyncError(rpcRes.error),
      };
    }
    // Otherwise fall through to non-destructive table-level reconciliation
  }

  // 2. Fallback table-level conflict-safe sync (when RPC is not yet deployed)
  const userRes = await ensureUserRecord(user);
  if (userRes.status !== 'synced') {
    return userRes;
  }

  // Read current remote state first so we never clobber newer remote records or delete absent rows
  const remoteRes = await fetchUserCloudSnapshot(user.id);
  if (remoteRes.status === 'tables-missing') {
    return { status: 'tables-missing', error: remoteRes.error };
  }
  if (remoteRes.status === 'error') {
    return { status: 'error', error: remoteRes.error };
  }

  const revisionMismatch =
    expectedRevision !== null &&
    remoteRes.serverRevision !== null &&
    remoteRes.serverRevision !== expectedRevision &&
    remoteRes.status === 'ready';

  const { merged, effectiveDeletions } = reconcileSnapshots(
    snapshot,
    remoteRes.snapshot,
    deletions
  );

  if (revisionMismatch) {
    return {
      status: 'conflict',
      serverRevision: remoteRes.serverRevision,
      mergedSnapshot: merged,
      remainingDeletions: effectiveDeletions,
      error:
        'Detected concurrent updates from another tab or device. Both local and remote records have been preserved.',
    };
  }

  const nextRevision =
    remoteRes.serverRevision !== null
      ? remoteRes.serverRevision + 1
      : expectedRevision !== null
      ? expectedRevision + 1
      : 1;

  // Write merged settings (never regressing updatedAt)
  let settingsWrite = await supabase.from('luma_user_settings').upsert(
    {
      user_id: user.id,
      settings: merged.settings,
      sync_revision: nextRevision,
      updated_at: merged.settings.updatedAt || now,
    },
    { onConflict: 'user_id' }
  );

  if (
    settingsWrite.error &&
    isMissingRpcOrRevisionColumnError(settingsWrite.error)
  ) {
    settingsWrite = await supabase.from('luma_user_settings').upsert(
      {
        user_id: user.id,
        settings: merged.settings,
        updated_at: merged.settings.updatedAt || now,
      },
      { onConflict: 'user_id' }
    );
  }

  if (settingsWrite.error) {
    return {
      status: isMissingTableError(settingsWrite.error)
        ? 'tables-missing'
        : 'error',
      error: formatSyncError(settingsWrite.error),
    };
  }

  // Delete ONLY explicitly deleted cycle IDs whose deletion timestamp >= remote updatedAt
  const remoteCyclesById = new Map(
    (remoteRes.snapshot?.cycles ?? []).map((c) => [c.id, c])
  );
  const cycleIdsToDelete = Object.entries(effectiveDeletions.deletedCycles)
    .filter(([id, deletedAt]) => {
      const remoteCycle = remoteCyclesById.get(id);
      return !remoteCycle || remoteCycle.updatedAt <= deletedAt;
    })
    .map(([id]) => id);

  if (cycleIdsToDelete.length > 0) {
    const delCycles = await supabase
      .from('luma_cycles')
      .delete()
      .eq('user_id', user.id)
      .in('id', cycleIdsToDelete);
    if (delCycles.error) {
      return { status: 'error', error: formatSyncError(delCycles.error) };
    }
  }

  // Upsert only cycles that are new or at least as recent as remote
  const cyclesToUpsert = merged.cycles.filter((c) => {
    const remoteCycle = remoteCyclesById.get(c.id);
    return !remoteCycle || c.updatedAt >= remoteCycle.updatedAt;
  });

  if (cyclesToUpsert.length > 0) {
    const rows = cyclesToUpsert.map((c) => ({
      user_id: user.id,
      id: c.id,
      start_date: c.startDate,
      end_date: c.endDate,
      notes: c.notes ?? '',
      created_at: c.createdAt,
      updated_at: c.updatedAt,
    }));
    const upsertCycles = await supabase
      .from('luma_cycles')
      .upsert(rows, { onConflict: 'user_id,id' });
    if (upsertCycles.error) {
      return { status: 'error', error: formatSyncError(upsertCycles.error) };
    }
  }

  // Delete ONLY explicitly deleted daily logs whose deletion timestamp >= remote updatedAt
  const remoteLogsByDate = new Map(
    (remoteRes.snapshot?.dailyLogs ?? []).map((l) => [l.date, l])
  );
  const remoteLogsById = new Map(
    (remoteRes.snapshot?.dailyLogs ?? []).map((l) => [l.id, l])
  );

  const logIdsToDelete = new Set<string>();
  for (const [id, deletedAt] of Object.entries(
    effectiveDeletions.deletedDailyLogIds
  )) {
    const remoteLog = remoteLogsById.get(id);
    if (!remoteLog || remoteLog.updatedAt <= deletedAt) {
      logIdsToDelete.add(id);
    }
  }
  for (const [date, deletedAt] of Object.entries(
    effectiveDeletions.deletedDailyLogDates
  )) {
    const remoteLog = remoteLogsByDate.get(date);
    if (remoteLog && remoteLog.updatedAt <= deletedAt) {
      logIdsToDelete.add(remoteLog.id);
    }
  }

  if (logIdsToDelete.size > 0) {
    const delLogs = await supabase
      .from('luma_daily_logs')
      .delete()
      .eq('user_id', user.id)
      .in('id', Array.from(logIdsToDelete));
    if (delLogs.error) {
      return { status: 'error', error: formatSyncError(delLogs.error) };
    }
  }

  // Upsert only daily logs that are new or at least as recent as remote.
  // Align ID with remote row if same date already exists remotely to satisfy both (user_id, id) and (user_id, date) constraints.
  const logsToUpsert = merged.dailyLogs
    .filter((l) => {
      const remoteLog = remoteLogsByDate.get(l.date);
      return !remoteLog || l.updatedAt >= remoteLog.updatedAt;
    })
    .map((l) => {
      const remoteLog = remoteLogsByDate.get(l.date);
      const effectiveId = remoteLog ? remoteLog.id : l.id;
      return {
        user_id: user.id,
        id: effectiveId,
        date: l.date,
        bleeding_flow: l.bleedingFlow,
        symptoms: l.symptoms,
        mood: l.mood,
        energy_level: l.energyLevel,
        sleep: l.sleep,
        notes: l.notes ?? '',
        created_at: l.createdAt,
        updated_at: l.updatedAt,
      };
    });

  if (logsToUpsert.length > 0) {
    const upsertLogs = await supabase
      .from('luma_daily_logs')
      .upsert(logsToUpsert, { onConflict: 'user_id,id' });
    if (upsertLogs.error) {
      return { status: 'error', error: formatSyncError(upsertLogs.error) };
    }
  }

  return {
    status: 'synced',
    serverRevision: nextRevision,
    mergedSnapshot: merged,
    remainingDeletions: createEmptyDeletions(),
  };
}

export async function deleteUserCloudData(
  userId: string
): Promise<CloudWriteResult> {
  const [cyclesDel, logsDel, settingsDel] = await Promise.all([
    supabase.from('luma_cycles').delete().eq('user_id', userId),
    supabase.from('luma_daily_logs').delete().eq('user_id', userId),
    supabase.from('luma_user_settings').delete().eq('user_id', userId),
  ]);

  const firstError = cyclesDel.error ?? logsDel.error ?? settingsDel.error;
  if (firstError) {
    if (isMissingTableError(firstError)) {
      return { status: 'tables-missing', error: formatSyncError(firstError) };
    }
    return { status: 'error', error: formatSyncError(firstError) };
  }

  return { status: 'synced', serverRevision: 0 };
}
