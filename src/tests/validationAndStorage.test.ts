import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildCsvExport,
  buildExportPayload,
  loadInitialStorage,
  parseImportPayload,
  saveSnapshot,
  wipeAllLocalData,
} from '@/src/services/storageService';
import {
  createDefaultSettings,
  validatePeriodInput,
} from '@/src/utils/validation';
import { CycleRecord } from '@/src/types/luma';

const baseCycle: CycleRecord = {
  id: 'c1',
  startDate: '2026-10-01',
  endDate: '2026-10-05',
  notes: 'Normal start',
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
};

describe('period validation and IndexedDB storage persistence', () => {
  beforeEach(async () => {
    await wipeAllLocalData();
  });

  it('rejects invalid ranges, duplicates, and overlapping periods', () => {
    expect(
      validatePeriodInput(
        { startDate: '2026-10-05', endDate: '2026-10-02' },
        []
      ).valid
    ).toBe(false);

    expect(
      validatePeriodInput(
        { startDate: '2026-10-01', endDate: '2026-10-04' },
        [baseCycle]
      ).valid
    ).toBe(false);

    expect(
      validatePeriodInput(
        { startDate: '2026-10-03', endDate: '2026-10-07' },
        [baseCycle]
      ).valid
    ).toBe(false);

    expect(
      validatePeriodInput(
        { startDate: '2026-10-29', endDate: '2026-11-02' },
        [baseCycle]
      ).valid
    ).toBe(true);
  });

  it('persists snapshots in IndexedDB across reloads and supports JSON/CSV export & import', async () => {
    const settings = { ...createDefaultSettings(), onboardingCompleted: true };
    const snapshot = {
      settings,
      cycles: [baseCycle],
      dailyLogs: [
        {
          id: 'log-1',
          date: '2026-10-01',
          bleedingFlow: 'medium' as const,
          symptoms: ['Cramps'],
          mood: 'Calm' as const,
          energyLevel: 'moderate' as const,
          sleep: { hours: 7.5, quality: 'good' as const },
          notes: 'Private note',
          createdAt: '2026-10-01T12:00:00.000Z',
          updatedAt: '2026-10-01T12:00:00.000Z',
        },
      ],
    };

    await saveSnapshot(snapshot, null);
    const loaded = await loadInitialStorage();
    expect(loaded.locked).toBe(false);
    expect(loaded.snapshot.cycles).toHaveLength(1);
    expect(loaded.snapshot.dailyLogs).toHaveLength(1);
    expect(loaded.snapshot.dailyLogs[0].notes).toBe('Private note');

    const jsonText = JSON.stringify(buildExportPayload(loaded.snapshot));
    const reimported = parseImportPayload(jsonText);
    expect(reimported.cycles[0].startDate).toBe('2026-10-01');

    const csv = buildCsvExport(loaded.snapshot);
    expect(csv).toContain('Period,"2026-10-01","2026-10-05"');
    expect(csv).toContain('DailyLog,"2026-10-01"');

    await wipeAllLocalData();
    const afterWipe = await loadInitialStorage();
    expect(afterWipe.snapshot.cycles).toHaveLength(0);
    expect(afterWipe.snapshot.dailyLogs).toHaveLength(0);
  });

  it('rejects malformed import files cleanly', () => {
    expect(() => parseImportPayload('not json')).toThrow();
    expect(() => parseImportPayload('{"foo": "bar"}')).toThrow();
  });

  it('encrypts and decrypts the private vault via PBKDF2 + AES-GCM and rejects wrong passphrases', async () => {
    const {
      enableEncryptedVault,
      unlockEncryptedVault,
      disableEncryptedVault,
    } = await import('@/src/services/storageService');

    const snapshot = {
      settings: { ...createDefaultSettings(), onboardingCompleted: true },
      cycles: [baseCycle],
      dailyLogs: [],
    };

    await enableEncryptedVault(snapshot, 'my-secret-passphrase');

    const lockedCheck = await loadInitialStorage();
    expect(lockedCheck.locked).toBe(true);
    expect(lockedCheck.vaultExists).toBe(true);
    expect(lockedCheck.snapshot.cycles).toHaveLength(0);

    await expect(unlockEncryptedVault('wrong-passphrase')).rejects.toThrow();

    const unlocked = await unlockEncryptedVault('my-secret-passphrase');
    expect(unlocked.snapshot.cycles).toHaveLength(1);
    expect(unlocked.snapshot.cycles[0].startDate).toBe('2026-10-01');

    const decrypted = await disableEncryptedVault('my-secret-passphrase');
    expect(decrypted.cycles).toHaveLength(1);

    const plainCheck = await loadInitialStorage();
    expect(plainCheck.locked).toBe(false);
    expect(plainCheck.vaultExists).toBe(false);
    expect(plainCheck.snapshot.cycles).toHaveLength(1);
  });
});
