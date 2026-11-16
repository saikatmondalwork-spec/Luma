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
  | 'tables-missing'
  | 'error';

export interface CloudFetchResult {
  status: 'ready' | 'empty' | 'tables-missing' | 'error';
  snapshot: LumaDataSnapshot | null;
  error?: string;
}

export interface CloudWriteResult {
  status: 'synced' | 'tables-missing' | 'error';
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
    msg.includes('does not exist') ||
    msg.includes('could not find the table') ||
    msg.includes('schema cache')
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
  const [settingsRes, cyclesRes, logsRes] = await Promise.all([
    supabase
      .from('luma_user_settings')
      .select('settings, updated_at')
      .eq('user_id', userId)
      .maybeSingle(),
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
        error: formatSyncError(firstError),
      };
    }
    return {
      status: 'error',
      snapshot: null,
      error: formatSyncError(firstError),
    };
  }

  const rawSettings = settingsRes.data?.settings ?? null;
  const rawCycles = cyclesRes.data ?? [];
  const rawLogs = logsRes.data ?? [];

  if (!rawSettings && rawCycles.length === 0 && rawLogs.length === 0) {
    return { status: 'empty', snapshot: null };
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
  };
}

export async function syncSnapshotToCloud(
  user: { id: string; email?: string | null },
  snapshot: LumaDataSnapshot
): Promise<CloudWriteResult> {
  const userRes = await ensureUserRecord(user);
  if (userRes.status !== 'synced') {
    return userRes;
  }

  const now = new Date().toISOString();

  const settingsWrite = await supabase.from('luma_user_settings').upsert(
    {
      user_id: user.id,
      settings: snapshot.settings,
      updated_at: snapshot.settings.updatedAt || now,
    },
    { onConflict: 'user_id' }
  );

  if (settingsWrite.error) {
    return {
      status: isMissingTableError(settingsWrite.error) ? 'tables-missing' : 'error',
      error: formatSyncError(settingsWrite.error),
    };
  }

  // Reconcile cycles
  const existingCyclesRes = await supabase
    .from('luma_cycles')
    .select('id')
    .eq('user_id', user.id);

  if (existingCyclesRes.error) {
    return {
      status: isMissingTableError(existingCyclesRes.error)
        ? 'tables-missing'
        : 'error',
      error: formatSyncError(existingCyclesRes.error),
    };
  }

  const currentCycleIds = new Set(snapshot.cycles.map((c) => c.id));
  const removedCycleIds = (existingCyclesRes.data ?? [])
    .map((r) => r.id as string)
    .filter((id) => !currentCycleIds.has(id));

  if (removedCycleIds.length > 0) {
    const delCycles = await supabase
      .from('luma_cycles')
      .delete()
      .eq('user_id', user.id)
      .in('id', removedCycleIds);
    if (delCycles.error) {
      return { status: 'error', error: formatSyncError(delCycles.error) };
    }
  }

  if (snapshot.cycles.length > 0) {
    const cycleRows = snapshot.cycles.map((c) => ({
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
      .upsert(cycleRows, { onConflict: 'user_id,id' });
    if (upsertCycles.error) {
      return { status: 'error', error: formatSyncError(upsertCycles.error) };
    }
  }

  // Reconcile daily logs
  const existingLogsRes = await supabase
    .from('luma_daily_logs')
    .select('id')
    .eq('user_id', user.id);

  if (existingLogsRes.error) {
    return {
      status: isMissingTableError(existingLogsRes.error)
        ? 'tables-missing'
        : 'error',
      error: formatSyncError(existingLogsRes.error),
    };
  }

  const currentLogIds = new Set(snapshot.dailyLogs.map((l) => l.id));
  const removedLogIds = (existingLogsRes.data ?? [])
    .map((r) => r.id as string)
    .filter((id) => !currentLogIds.has(id));

  if (removedLogIds.length > 0) {
    const delLogs = await supabase
      .from('luma_daily_logs')
      .delete()
      .eq('user_id', user.id)
      .in('id', removedLogIds);
    if (delLogs.error) {
      return { status: 'error', error: formatSyncError(delLogs.error) };
    }
  }

  if (snapshot.dailyLogs.length > 0) {
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
    const upsertLogs = await supabase
      .from('luma_daily_logs')
      .upsert(logRows, { onConflict: 'user_id,id' });
    if (upsertLogs.error) {
      return { status: 'error', error: formatSyncError(upsertLogs.error) };
    }
  }

  return { status: 'synced' };
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

  return { status: 'synced' };
}
