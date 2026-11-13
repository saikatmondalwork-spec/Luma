import {
  AppExportPayload,
  CycleRecord,
  DailyLog,
  EncryptedVaultRecord,
  LumaDataSnapshot,
  UserSettings,
} from '@/src/types/luma';
import {
  createDefaultSettings,
  cycleRecordSchema,
  dailyLogSchema,
  exportPayloadSchema,
  userSettingsSchema,
} from '@/src/utils/validation';
import {
  decryptVaultRecord,
  encryptSnapshotWithKey,
  encryptSnapshotWithPassphrase,
} from '@/src/services/cryptoService';

const DB_NAME = 'luma-health-db';
const DB_VERSION = 1;

const STORE_SETTINGS = 'settings';
const STORE_CYCLES = 'cycles';
const STORE_LOGS = 'dailyLogs';
const STORE_VAULT = 'vault';

export interface ActiveVaultSession {
  key: CryptoKey;
  salt: Uint8Array<ArrayBuffer>;
  iterations: number;
}

export interface StorageLoadResult {
  locked: boolean;
  vaultExists: boolean;
  snapshot: LumaDataSnapshot;
  corruptionWarning: string | null;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable in this browser context.'));
      return;
    }

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_CYCLES)) {
        const cyclesStore = db.createObjectStore(STORE_CYCLES, { keyPath: 'id' });
        cyclesStore.createIndex('by_startDate', 'startDate', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_LOGS)) {
        const logsStore = db.createObjectStore(STORE_LOGS, { keyPath: 'date' });
        logsStore.createIndex('by_id', 'id', { unique: true });
      }
      if (!db.objectStoreNames.contains(STORE_VAULT)) {
        db.createObjectStore(STORE_VAULT, { keyPath: 'id' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open local database.'));
  });
}

function getAllFromStore<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result as T[]) ?? []);
    req.onerror = () => reject(req.error ?? new Error(`Failed reading ${storeName}`));
  });
}

function getOneFromStore<T>(
  db: IDBDatabase,
  storeName: string,
  key: IDBValidKey
): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
    req.onerror = () => reject(req.error ?? new Error(`Failed reading key from ${storeName}`));
  });
}

function sanitizeRecords(raw: {
  settings: unknown;
  cycles: unknown[];
  dailyLogs: unknown[];
}): { snapshot: LumaDataSnapshot; droppedCount: number } {
  let droppedCount = 0;
  const parsedSettings = userSettingsSchema.safeParse(raw.settings);
  const settings: UserSettings = parsedSettings.success
    ? parsedSettings.data
    : createDefaultSettings();

  if (raw.settings && !parsedSettings.success) {
    droppedCount += 1;
  }

  const cyclesMap = new Map<string, CycleRecord>();
  for (const item of raw.cycles) {
    const res = cycleRecordSchema.safeParse(item);
    if (res.success) {
      cyclesMap.set(res.data.startDate, res.data);
    } else {
      droppedCount += 1;
    }
  }

  const logsMap = new Map<string, DailyLog>();
  for (const item of raw.dailyLogs) {
    const res = dailyLogSchema.safeParse(item);
    if (res.success) {
      logsMap.set(res.data.date, res.data);
    } else {
      droppedCount += 1;
    }
  }

  const cycles = Array.from(cyclesMap.values()).sort((a, b) =>
    a.startDate.localeCompare(b.startDate)
  );
  const dailyLogs = Array.from(logsMap.values()).sort((a, b) =>
    b.date.localeCompare(a.date)
  );

  return {
    snapshot: { settings, cycles, dailyLogs },
    droppedCount,
  };
}

export async function loadInitialStorage(): Promise<StorageLoadResult> {
  const db = await openDatabase();
  try {
    const vault = await getOneFromStore<EncryptedVaultRecord>(db, STORE_VAULT, 'vault');
    if (vault && vault.encrypted) {
      return {
        locked: true,
        vaultExists: true,
        snapshot: {
          settings: createDefaultSettings(),
          cycles: [],
          dailyLogs: [],
        },
        corruptionWarning: null,
      };
    }

    const [settingsRow, cyclesRows, logRows] = await Promise.all([
      getOneFromStore<UserSettings>(db, STORE_SETTINGS, 'default'),
      getAllFromStore<CycleRecord>(db, STORE_CYCLES),
      getAllFromStore<DailyLog>(db, STORE_LOGS),
    ]);

    const { snapshot, droppedCount } = sanitizeRecords({
      settings: settingsRow,
      cycles: cyclesRows,
      dailyLogs: logRows,
    });

    return {
      locked: false,
      vaultExists: false,
      snapshot,
      corruptionWarning:
        droppedCount > 0
          ? `${droppedCount} malformed local record(s) were safely skipped during validation.`
          : null,
    };
  } finally {
    db.close();
  }
}

async function writePlaintextSnapshot(
  db: IDBDatabase,
  snapshot: LumaDataSnapshot
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      [STORE_SETTINGS, STORE_CYCLES, STORE_LOGS, STORE_VAULT],
      'readwrite'
    );
    const settingsStore = tx.objectStore(STORE_SETTINGS);
    const cyclesStore = tx.objectStore(STORE_CYCLES);
    const logsStore = tx.objectStore(STORE_LOGS);
    const vaultStore = tx.objectStore(STORE_VAULT);

    vaultStore.clear();
    settingsStore.put(snapshot.settings);

    cyclesStore.clear();
    for (const cycle of snapshot.cycles) {
      cyclesStore.put(cycle);
    }

    logsStore.clear();
    for (const log of snapshot.dailyLogs) {
      logsStore.put(log);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed writing local database.'));
  });
}

async function writeEncryptedVaultOnly(
  db: IDBDatabase,
  vaultRecord: EncryptedVaultRecord
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      [STORE_SETTINGS, STORE_CYCLES, STORE_LOGS, STORE_VAULT],
      'readwrite'
    );
    tx.objectStore(STORE_SETTINGS).clear();
    tx.objectStore(STORE_CYCLES).clear();
    tx.objectStore(STORE_LOGS).clear();
    tx.objectStore(STORE_VAULT).put(vaultRecord);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed writing encrypted vault.'));
  });
}

export async function saveSnapshot(
  snapshot: LumaDataSnapshot,
  vaultSession: ActiveVaultSession | null
): Promise<void> {
  const db = await openDatabase();
  try {
    if (vaultSession) {
      const vaultRecord = await encryptSnapshotWithKey(
        snapshot,
        vaultSession.key,
        vaultSession.salt,
        vaultSession.iterations
      );
      await writeEncryptedVaultOnly(db, vaultRecord);
    } else {
      await writePlaintextSnapshot(db, snapshot);
    }
  } finally {
    db.close();
  }
}

export async function enableEncryptedVault(
  snapshot: LumaDataSnapshot,
  passphrase: string
): Promise<ActiveVaultSession> {
  const { record, key, salt } = await encryptSnapshotWithPassphrase(snapshot, passphrase);
  const db = await openDatabase();
  try {
    await writeEncryptedVaultOnly(db, record);
    return { key, salt, iterations: record.iterations };
  } finally {
    db.close();
  }
}

export async function unlockEncryptedVault(
  passphrase: string
): Promise<{ snapshot: LumaDataSnapshot; session: ActiveVaultSession; corruptionWarning: string | null }> {
  const db = await openDatabase();
  try {
    const vault = await getOneFromStore<EncryptedVaultRecord>(db, STORE_VAULT, 'vault');
    if (!vault || !vault.encrypted) {
      throw new Error('No encrypted vault found.');
    }
    const { snapshot: rawSnapshot, key, salt } = await decryptVaultRecord(vault, passphrase);
    const { snapshot, droppedCount } = sanitizeRecords(rawSnapshot);
    return {
      snapshot,
      session: { key, salt, iterations: vault.iterations },
      corruptionWarning:
        droppedCount > 0
          ? `${droppedCount} malformed record(s) were safely skipped.`
          : null,
    };
  } finally {
    db.close();
  }
}

export async function disableEncryptedVault(passphrase: string): Promise<LumaDataSnapshot> {
  const { snapshot } = await unlockEncryptedVault(passphrase);
  const db = await openDatabase();
  try {
    await writePlaintextSnapshot(db, snapshot);
    return snapshot;
  } finally {
    db.close();
  }
}

export async function wipeAllLocalData(): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(
        [STORE_SETTINGS, STORE_CYCLES, STORE_LOGS, STORE_VAULT],
        'readwrite'
      );
      tx.objectStore(STORE_SETTINGS).clear();
      tx.objectStore(STORE_CYCLES).clear();
      tx.objectStore(STORE_LOGS).clear();
      tx.objectStore(STORE_VAULT).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed wiping local data.'));
    });
  } finally {
    db.close();
  }
}

export function buildExportPayload(snapshot: LumaDataSnapshot): AppExportPayload {
  return {
    app: 'Luma',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    data: snapshot,
  };
}

export function parseImportPayload(jsonText: string): LumaDataSnapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    throw new Error('The selected file does not contain valid JSON.');
  }

  const parsed = exportPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error('This file does not match the Luma backup format.');
  }

  const { snapshot } = sanitizeRecords(parsed.data.data);
  return snapshot;
}

export function buildCsvExport(snapshot: LumaDataSnapshot): string {
  const escape = (val: string) => `"${val.replace(/"/g, '""')}"`;
  const lines: string[] = [
    ['RecordType', 'DateOrStartDate', 'EndDate', 'BleedingFlow', 'Symptoms', 'Mood', 'EnergyLevel', 'SleepHours', 'SleepQuality', 'Notes'].join(','),
  ];

  const sortedCycles = [...snapshot.cycles].sort((a, b) =>
    a.startDate.localeCompare(b.startDate)
  );
  for (const c of sortedCycles) {
    lines.push(
      [
        'Period',
        escape(c.startDate),
        escape(c.endDate ?? ''),
        '',
        '',
        '',
        '',
        '',
        '',
        escape(c.notes),
      ].join(',')
    );
  }

  const sortedLogs = [...snapshot.dailyLogs].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  for (const log of sortedLogs) {
    lines.push(
      [
        'DailyLog',
        escape(log.date),
        '',
        escape(log.bleedingFlow ?? ''),
        escape(log.symptoms.join('; ')),
        escape(log.mood ?? ''),
        escape(log.energyLevel ?? ''),
        log.sleep?.hours !== null && log.sleep?.hours !== undefined
          ? String(log.sleep.hours)
          : '',
        escape(log.sleep?.quality ?? ''),
        escape(log.notes),
      ].join(',')
    );
  }

  return lines.join('\n');
}
