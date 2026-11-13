import React, { useRef, useState } from 'react';
import {
  Bell,
  CalendarPlus,
  Download,
  Lock,
  ShieldCheck,
  Trash2,
  Unlock,
  Upload,
} from 'lucide-react';
import { useLuma } from '@/src/context/LumaContext';
import { LumaDataSnapshot, ThemeMode } from '@/src/types/luma';
import {
  buildCsvExport,
  buildExportPayload,
  parseImportPayload,
} from '@/src/services/storageService';
import {
  buildReminderIcs,
  getNotificationPermissionState,
  requestNotificationPermission,
} from '@/src/services/reminderService';
import { isWebCryptoSupported } from '@/src/services/cryptoService';
import { todayLocalDate } from '@/src/utils/dateUtils';
import { ConfirmDialog } from '@/src/components/common/ConfirmDialog';
import { Modal } from '@/src/components/common/Modal';
import { PWAInstallButton } from '@/src/components/common/PWAInstallButton';

function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const SettingsPage: React.FC = () => {
  const {
    settings,
    cycles,
    dailyLogs,
    summary,
    vaultEnabled,
    updateSettings,
    enableVault,
    lockVault,
    disableVault,
    importSnapshot,
    deleteAllData,
  } = useLuma();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [notifPermission, setNotifPermission] = useState(() =>
    getNotificationPermissionState()
  );

  const [enableVaultOpen, setEnableVaultOpen] = useState(false);
  const [disableVaultOpen, setDisableVaultOpen] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [vaultBusy, setVaultBusy] = useState(false);

  const [pendingImport, setPendingImport] = useState<LumaDataSnapshot | null>(
    null
  );
  const [importError, setImportError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [confirmWipeOpen, setConfirmWipeOpen] = useState(false);

  const handleToggleReminders = async (enabled: boolean) => {
    if (enabled) {
      const perm = await requestNotificationPermission();
      setNotifPermission(perm);
    }
    await updateSettings((prev) => ({
      ...prev,
      reminderPreferences: {
        ...prev.reminderPreferences,
        enabled,
      },
    }));
  };

  const handleExportJson = () => {
    const payload = buildExportPayload({ settings, cycles, dailyLogs });
    downloadTextFile(
      `luma-backup-${todayLocalDate()}.json`,
      JSON.stringify(payload, null, 2),
      'application/json'
    );
    setStatusMessage('JSON backup downloaded locally.');
  };

  const handleExportCsv = () => {
    const csv = buildCsvExport({ settings, cycles, dailyLogs });
    downloadTextFile(
      `luma-records-${todayLocalDate()}.csv`,
      csv,
      'text/csv;charset=utf-8'
    );
    setStatusMessage('CSV export downloaded locally.');
  };

  const handleExportIcs = () => {
    const ics = buildReminderIcs(settings.reminderPreferences, summary);
    downloadTextFile(
      `luma-reminders-${todayLocalDate()}.ics`,
      ics,
      'text/calendar;charset=utf-8'
    );
    setStatusMessage('Calendar reminder (.ics) downloaded.');
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    setStatusMessage(null);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseImportPayload(text);
      setPendingImport(parsed);
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : 'Unable to import selected file.'
      );
    } finally {
      e.target.value = '';
    }
  };

  const handleEnableVaultSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setVaultError(null);
    if (passphrase.length < 8) {
      setVaultError('Use a passphrase with at least 8 characters.');
      return;
    }
    if (passphrase !== confirmPassphrase) {
      setVaultError('Passphrases do not match.');
      return;
    }
    setVaultBusy(true);
    try {
      await enableVault(passphrase);
      setPassphrase('');
      setConfirmPassphrase('');
      setEnableVaultOpen(false);
      setStatusMessage(
        'Encrypted Private Vault enabled. Your local data is now encrypted with AES-GCM.'
      );
    } catch (err) {
      setVaultError(
        err instanceof Error ? err.message : 'Could not enable vault.'
      );
    } finally {
      setVaultBusy(false);
    }
  };

  const handleDisableVaultSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setVaultError(null);
    if (!passphrase) {
      setVaultError('Enter your current vault passphrase.');
      return;
    }
    setVaultBusy(true);
    try {
      await disableVault(passphrase);
      setPassphrase('');
      setDisableVaultOpen(false);
      setStatusMessage(
        'Vault encryption disabled. Data remains stored locally in IndexedDB.'
      );
    } catch (err) {
      setVaultError(
        err instanceof Error ? err.message : 'Incorrect passphrase.'
      );
    } finally {
      setVaultBusy(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <p className="text-sm text-[var(--luma-muted)]">
        Configure cycle baselines, reminders, local encryption, and data
        portability.
      </p>

      {statusMessage && (
        <div
          role="status"
          className="rounded-2xl border border-[#B4E7C9] dark:border-[#2C5B42] bg-[#E7F8EE] dark:bg-[#1A3527] px-4 py-3 text-sm font-medium text-[#15803D] dark:text-[#6EE7B7]"
        >
          {statusMessage}
        </div>
      )}

      {/* Cycle & Tracking Preferences */}
      <section className="luma-card rounded-[28px] p-5 sm:p-6 space-y-6">
        <h2 className="text-lg sm:text-xl font-bold text-[var(--luma-text)]">
          Cycle preferences
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-[var(--luma-border)] bg-[var(--luma-canvas)] p-4">
            <div className="flex items-baseline justify-between gap-2">
              <label
                htmlFor="settings-cycle-len"
                className="text-sm font-semibold text-[var(--luma-text)]"
              >
                Baseline cycle length
              </label>
              <span className="text-lg font-bold text-[var(--luma-plum)] tabular-nums">
                {settings.averageCycleLength} days
              </span>
            </div>
            <input
              id="settings-cycle-len"
              type="range"
              min={18}
              max={60}
              value={settings.averageCycleLength}
              onChange={(e) =>
                updateSettings({ averageCycleLength: Number(e.target.value) })
              }
              className="w-full mt-3 accent-[var(--luma-plum)]"
            />
            <p className="mt-1.5 text-xs text-[var(--luma-muted)]">
              Used when fewer than 2 historical cycles are recorded.
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--luma-border)] bg-[var(--luma-canvas)] p-4">
            <div className="flex items-baseline justify-between gap-2">
              <label
                htmlFor="settings-period-len"
                className="text-sm font-semibold text-[var(--luma-text)]"
              >
                Baseline period duration
              </label>
              <span className="text-lg font-bold text-[var(--luma-rose-deep)] tabular-nums">
                {settings.averagePeriodLength} days
              </span>
            </div>
            <input
              id="settings-period-len"
              type="range"
              min={1}
              max={14}
              value={settings.averagePeriodLength}
              onChange={(e) =>
                updateSettings({ averagePeriodLength: Number(e.target.value) })
              }
              className="w-full mt-3 accent-[var(--luma-rose)]"
            />
            <p className="mt-1.5 text-xs text-[var(--luma-muted)]">
              Used for estimated upcoming period windows.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--luma-border)] bg-[var(--luma-canvas)] p-4 space-y-2">
          <label className="flex items-start justify-between gap-4 cursor-pointer">
            <div>
              <span className="block text-sm font-semibold text-[var(--luma-text)]">
                Show optional ovulation &amp; fertile window estimates
              </span>
              <span className="block text-xs text-[var(--luma-muted)] mt-0.5 leading-relaxed">
                Disabled by default. Calendar-based estimates are approximate
                only, cannot reliably prevent pregnancy, and must never be used
                as contraception.
              </span>
            </div>
            <input
              type="checkbox"
              checked={settings.predictionPreferences.showOvulationEstimates}
              onChange={(e) =>
                updateSettings((prev) => ({
                  ...prev,
                  predictionPreferences: {
                    showOvulationEstimates: e.target.checked,
                  },
                }))
              }
              className="w-5 h-5 mt-0.5 accent-[var(--luma-plum)] shrink-0"
            />
          </label>
        </div>

        <div>
          <span className="block text-sm font-semibold text-[var(--luma-text)] mb-2.5">
            Daily check-in categories
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {(
              [
                { key: 'trackFlow', label: 'Flow' },
                { key: 'trackSymptoms', label: 'Symptoms' },
                { key: 'trackMood', label: 'Mood' },
                { key: 'trackEnergy', label: 'Energy' },
                { key: 'trackSleep', label: 'Sleep' },
              ] as const
            ).map((item) => {
              const active = settings.trackingPreferences[item.key];
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() =>
                    updateSettings((prev) => ({
                      ...prev,
                      trackingPreferences: {
                        ...prev.trackingPreferences,
                        [item.key]: !prev.trackingPreferences[item.key],
                      },
                    }))
                  }
                  className={`min-h-[42px] px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold border transition-colors ${
                    active
                      ? 'border-[var(--luma-plum)] bg-[var(--luma-plum-soft)] text-[var(--luma-plum)]'
                      : 'border-[var(--luma-border)] bg-[var(--luma-canvas)] text-[var(--luma-muted)]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Appearance */}
      <section className="luma-card rounded-[28px] p-5 sm:p-6 space-y-4">
        <h2 className="text-lg sm:text-xl font-bold text-[var(--luma-text)]">
          Appearance
        </h2>
        <div className="grid grid-cols-3 gap-2.5">
          {(
            [
              { value: 'light', label: 'Warm Light' },
              { value: 'dark', label: 'Evening Dark' },
              { value: 'system', label: 'Match Device' },
            ] as Array<{ value: ThemeMode; label: string }>
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => updateSettings({ theme: opt.value })}
              className={`min-h-[44px] px-3 py-2 rounded-2xl text-xs sm:text-sm font-semibold border transition-colors ${
                settings.theme === opt.value
                  ? 'border-[var(--luma-plum)] bg-[var(--luma-plum-soft)] text-[var(--luma-plum)]'
                  : 'border-[var(--luma-border)] bg-[var(--luma-canvas)] text-[var(--luma-muted)] hover:text-[var(--luma-text)]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      {/* Reminders & Notifications */}
      <section className="luma-card rounded-[28px] p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-[var(--luma-plum-soft)] text-[var(--luma-plum)] flex items-center justify-center">
              <Bell className="w-4 h-4" />
            </span>
            <h2 className="text-lg sm:text-xl font-bold text-[var(--luma-text)]">
              Reminders
            </h2>
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <span className="text-xs font-semibold text-[var(--luma-muted)]">
              {settings.reminderPreferences.enabled ? 'Enabled' : 'Disabled'}
            </span>
            <input
              type="checkbox"
              checked={settings.reminderPreferences.enabled}
              onChange={(e) => handleToggleReminders(e.target.checked)}
              className="w-5 h-5 accent-[var(--luma-plum)]"
            />
          </label>
        </div>

        <p className="text-xs sm:text-sm text-[var(--luma-muted)] leading-relaxed">
          To protect your privacy, Luma uses zero remote push servers. Active
          reminders appear in-app and via browser notifications while Luma is
          open. For background OS alerts when closed, export a private{' '}
          <code className="font-mono-tabular text-xs">.ics</code> reminder to
          your device calendar.
        </p>

        {settings.reminderPreferences.enabled && (
          <div className="space-y-4 pt-2 border-t border-[var(--luma-border)]">
            {notifPermission === 'denied' && (
              <p className="text-xs text-[var(--luma-rose-deep)] font-medium">
                Browser notifications are currently blocked in your browser
                settings. In-app reminder banners will still appear.
              </p>
            )}

            <label className="flex items-center justify-between gap-4 cursor-pointer">
              <span className="text-sm text-[var(--luma-text)]">
                Expected period approaching
              </span>
              <input
                type="checkbox"
                checked={settings.reminderPreferences.periodApproaching}
                onChange={(e) =>
                  updateSettings((prev) => ({
                    ...prev,
                    reminderPreferences: {
                      ...prev.reminderPreferences,
                      periodApproaching: e.target.checked,
                    },
                  }))
                }
                className="w-5 h-5 accent-[var(--luma-plum)]"
              />
            </label>

            {settings.reminderPreferences.periodApproaching && (
              <div className="flex items-center justify-between gap-4 pl-2">
                <label
                  htmlFor="reminder-lead-days"
                  className="text-xs sm:text-sm text-[var(--luma-muted)]"
                >
                  Days before estimated start
                </label>
                <select
                  id="reminder-lead-days"
                  value={settings.reminderPreferences.periodApproachingDays}
                  onChange={(e) =>
                    updateSettings((prev) => ({
                      ...prev,
                      reminderPreferences: {
                        ...prev.reminderPreferences,
                        periodApproachingDays: Number(e.target.value),
                      },
                    }))
                  }
                  className="min-h-[40px] rounded-xl border border-[var(--luma-border)] bg-[var(--luma-canvas)] px-3 py-1.5 text-sm text-[var(--luma-text)]"
                >
                  {[1, 2, 3, 4, 5].map((d) => (
                    <option key={d} value={d}>
                      {d} {d === 1 ? 'day' : 'days'} before
                    </option>
                  ))}
                </select>
              </div>
            )}

            <label className="flex items-center justify-between gap-4 cursor-pointer">
              <span className="text-sm text-[var(--luma-text)]">
                Daily symptom &amp; journal check-in
              </span>
              <input
                type="checkbox"
                checked={settings.reminderPreferences.dailyLog}
                onChange={(e) =>
                  updateSettings((prev) => ({
                    ...prev,
                    reminderPreferences: {
                      ...prev.reminderPreferences,
                      dailyLog: e.target.checked,
                    },
                  }))
                }
                className="w-5 h-5 accent-[var(--luma-plum)]"
              />
            </label>

            {settings.reminderPreferences.dailyLog && (
              <div className="flex items-center justify-between gap-4 pl-2">
                <label
                  htmlFor="settings-daily-time"
                  className="text-xs sm:text-sm text-[var(--luma-muted)]"
                >
                  Daily check-in time
                </label>
                <input
                  id="settings-daily-time"
                  type="time"
                  value={settings.reminderPreferences.dailyLogTime}
                  onChange={(e) =>
                    updateSettings((prev) => ({
                      ...prev,
                      reminderPreferences: {
                        ...prev.reminderPreferences,
                        dailyLogTime: e.target.value,
                      },
                    }))
                  }
                  className="min-h-[40px] rounded-xl border border-[var(--luma-border)] bg-[var(--luma-canvas)] px-3 py-1.5 text-sm text-[var(--luma-text)] tabular-nums"
                />
              </div>
            )}

            <label className="flex items-center justify-between gap-4 cursor-pointer">
              <div>
                <span className="block text-sm text-[var(--luma-text)]">
                  Use discreet notification text
                </span>
                <span className="block text-xs text-[var(--luma-muted)]">
                  Hides cycle-specific wording on lock screens.
                </span>
              </div>
              <input
                type="checkbox"
                checked={settings.reminderPreferences.discreetText}
                onChange={(e) =>
                  updateSettings((prev) => ({
                    ...prev,
                    reminderPreferences: {
                      ...prev.reminderPreferences,
                      discreetText: e.target.checked,
                    },
                  }))
                }
                className="w-5 h-5 accent-[var(--luma-plum)]"
              />
            </label>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleExportIcs}
                className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 rounded-2xl border border-[var(--luma-border)] bg-[var(--luma-canvas)] hover:bg-[var(--luma-subtle)] text-xs sm:text-sm font-semibold text-[var(--luma-text)]"
              >
                <CalendarPlus className="w-4 h-4 text-[var(--luma-plum)]" />
                <span>Download Calendar Reminder (.ics)</span>
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Privacy & Encrypted Private Vault */}
      <section className="luma-card rounded-[28px] p-5 sm:p-6 space-y-5">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-[#E7F8EE] dark:bg-[#1A3527] text-[#16A34A] dark:text-[#34D399] flex items-center justify-center">
            <ShieldCheck className="w-4 h-4" />
          </span>
          <h2 className="text-lg sm:text-xl font-bold text-[var(--luma-text)]">
            Privacy &amp; Encrypted Vault
          </h2>
        </div>

        <p className="text-sm text-[var(--luma-muted)] leading-relaxed">
          All cycle dates, symptoms, and journal entries live exclusively in
          this browser&apos;s IndexedDB storage. Luma has no user accounts, no
          external servers, no analytics trackers, and never puts health details
          in URLs or console logs.
        </p>

        <div className="rounded-2xl border border-[var(--luma-border)] bg-[var(--luma-canvas)] p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="block text-sm font-semibold text-[var(--luma-text)]">
                {vaultEnabled
                  ? 'Encrypted Private Vault is active'
                  : 'Encrypted Private Vault (optional)'}
              </span>
              <span className="block text-xs text-[var(--luma-muted)] mt-0.5">
                Encrypts all local records with AES-256-GCM using a PBKDF2 key
                derived from your passphrase. Your passphrase is never stored.
              </span>
            </div>

            {isWebCryptoSupported() ? (
              vaultEnabled ? (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={lockVault}
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl luma-violet-gradient text-white text-xs font-semibold whitespace-nowrap"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Lock Now</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPassphrase('');
                      setVaultError(null);
                      setDisableVaultOpen(true);
                    }}
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[var(--luma-border)] text-xs font-semibold text-[var(--luma-text)] hover:bg-[var(--luma-subtle)] whitespace-nowrap"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span>Disable</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setPassphrase('');
                    setConfirmPassphrase('');
                    setVaultError(null);
                    setEnableVaultOpen(true);
                  }}
                  className="min-h-[42px] inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl luma-violet-gradient text-white text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0"
                >
                  <Lock className="w-4 h-4" />
                  <span>Enable Vault Lock</span>
                </button>
              )
            ) : (
              <span className="text-xs text-[var(--luma-muted)]">
                Web Crypto API unavailable in this context.
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Data Export, Import & Deletion */}
      <section className="luma-card rounded-[28px] p-5 sm:p-6 space-y-5">
        <h2 className="text-lg sm:text-xl font-bold text-[var(--luma-text)]">
          Your data
        </h2>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleExportJson}
            className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-2xl border border-[var(--luma-border)] bg-[var(--luma-canvas)] hover:bg-[var(--luma-subtle)] text-sm font-semibold text-[var(--luma-text)]"
          >
            <Download className="w-4 h-4 text-[var(--luma-plum)]" />
            <span>Export Backup (JSON)</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-2xl border border-[var(--luma-border)] bg-[var(--luma-canvas)] hover:bg-[var(--luma-subtle)] text-sm font-semibold text-[var(--luma-text)]"
          >
            <Download className="w-4 h-4 text-[var(--luma-plum)]" />
            <span>Export Spreadsheet (CSV)</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-2xl border border-[var(--luma-border)] bg-[var(--luma-canvas)] hover:bg-[var(--luma-subtle)] text-sm font-semibold text-[var(--luma-text)]"
          >
            <Upload className="w-4 h-4 text-[var(--luma-plum)]" />
            <span>Import Backup (JSON)</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFileSelected}
            className="hidden"
          />
        </div>

        {importError && (
          <p
            role="alert"
            className="rounded-2xl border border-[#F3B5C5] bg-[var(--luma-rose-soft)] px-3.5 py-2.5 text-sm text-[#B82851] dark:text-[#FFA6BE]"
          >
            {importError}
          </p>
        )}

        <div className="pt-4 border-t border-[var(--luma-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="block text-sm font-semibold text-[var(--luma-rose-deep)]">
              Delete all personal information
            </span>
            <span className="block text-xs text-[var(--luma-muted)]">
              Permanently erases all periods, daily logs, and preferences from
              this device.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setConfirmWipeOpen(true)}
            className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-2xl bg-[var(--luma-rose-soft)] text-sm font-semibold text-[var(--luma-rose-deep)] hover:opacity-90 whitespace-nowrap shrink-0"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete All Data</span>
          </button>
        </div>
      </section>

      {/* About & Install */}
      <section className="luma-card rounded-[28px] p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg sm:text-xl font-bold text-[var(--luma-text)]">
            About Luma
          </h2>
          <PWAInstallButton />
        </div>
        <p className="text-sm text-[var(--luma-muted)] leading-relaxed">
          Luma is an offline-capable personal menstrual cycle and health
          companion. Cycle predictions, phase indicators, and optional fertile
          window estimates are mathematical projections based on logged dates—they
          are never medical guarantees, diagnostic tools, or contraception.
          Consult a qualified healthcare professional for medical questions.
        </p>
      </section>

      <Modal
        open={enableVaultOpen}
        onClose={() => setEnableVaultOpen(false)}
        title="Enable Encrypted Private Vault"
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleEnableVaultSubmit} className="space-y-4">
          <p className="text-xs sm:text-sm text-[var(--luma-muted)] leading-relaxed">
            Important: Luma never stores your passphrase or recovery keys. If
            you forget your passphrase, your encrypted data cannot be recovered.
          </p>

          <div>
            <label
              htmlFor="new-vault-pass"
              className="block text-sm font-semibold text-[var(--luma-text)] mb-1"
            >
              Passphrase (minimum 8 characters)
            </label>
            <input
              id="new-vault-pass"
              type="password"
              required
              minLength={8}
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              className="w-full min-h-[44px] rounded-2xl border border-[var(--luma-border)] bg-[var(--luma-canvas)] px-3.5 py-2 text-sm text-[var(--luma-text)]"
            />
          </div>

          <div>
            <label
              htmlFor="confirm-vault-pass"
              className="block text-sm font-semibold text-[var(--luma-text)] mb-1"
            >
              Confirm passphrase
            </label>
            <input
              id="confirm-vault-pass"
              type="password"
              required
              minLength={8}
              value={confirmPassphrase}
              onChange={(e) => setConfirmPassphrase(e.target.value)}
              className="w-full min-h-[44px] rounded-2xl border border-[var(--luma-border)] bg-[var(--luma-canvas)] px-3.5 py-2 text-sm text-[var(--luma-text)]"
            />
          </div>

          {vaultError && (
            <p className="text-xs sm:text-sm text-[var(--luma-rose-deep)]">
              {vaultError}
            </p>
          )}

          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setEnableVaultOpen(false)}
              className="min-h-[44px] px-4 py-2 rounded-2xl border border-[var(--luma-border)] text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={vaultBusy}
              className="min-h-[44px] px-5 py-2 rounded-2xl luma-violet-gradient text-white text-sm font-semibold disabled:opacity-50"
            >
              {vaultBusy ? 'Encrypting...' : 'Enable Vault'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={disableVaultOpen}
        onClose={() => setDisableVaultOpen(false)}
        title="Disable Encrypted Vault"
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleDisableVaultSubmit} className="space-y-4">
          <p className="text-xs sm:text-sm text-[var(--luma-muted)]">
            Enter your passphrase to decrypt and return to standard local
            IndexedDB storage.
          </p>
          <input
            type="password"
            required
            placeholder="Current vault passphrase"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            className="w-full min-h-[44px] rounded-2xl border border-[var(--luma-border)] bg-[var(--luma-canvas)] px-3.5 py-2 text-sm text-[var(--luma-text)]"
          />
          {vaultError && (
            <p className="text-xs sm:text-sm text-[var(--luma-rose-deep)]">
              {vaultError}
            </p>
          )}
          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setDisableVaultOpen(false)}
              className="min-h-[44px] px-4 py-2 rounded-2xl border border-[var(--luma-border)] text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={vaultBusy}
              className="min-h-[44px] px-5 py-2 rounded-2xl luma-violet-gradient text-white text-sm font-semibold disabled:opacity-50"
            >
              {vaultBusy ? 'Decrypting...' : 'Disable Vault'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={pendingImport !== null}
        onClose={() => setPendingImport(null)}
        title="Import Luma Backup"
        maxWidthClass="max-w-md"
      >
        {pendingImport && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--luma-muted)]">
              Backup verified locally:{' '}
              <strong className="text-[var(--luma-text)] tabular-nums">
                {pendingImport.cycles.length}
              </strong>{' '}
              period record(s) and{' '}
              <strong className="text-[var(--luma-text)] tabular-nums">
                {pendingImport.dailyLogs.length}
              </strong>{' '}
              daily log(s).
            </p>
            <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
              <button
                type="button"
                onClick={async () => {
                  await importSnapshot(pendingImport, 'merge');
                  setPendingImport(null);
                  setStatusMessage('Backup merged with existing local data.');
                }}
                className="flex-1 min-h-[44px] px-4 py-2 rounded-2xl border border-[var(--luma-border)] bg-[var(--luma-canvas)] hover:bg-[var(--luma-subtle)] text-sm font-semibold"
              >
                Merge with Current
              </button>
              <button
                type="button"
                onClick={async () => {
                  await importSnapshot(pendingImport, 'replace');
                  setPendingImport(null);
                  setStatusMessage('Local data replaced with imported backup.');
                }}
                className="flex-1 min-h-[44px] px-4 py-2 rounded-2xl luma-violet-gradient text-white text-sm font-semibold"
              >
                Replace All Data
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmWipeOpen}
        onClose={() => setConfirmWipeOpen(false)}
        onConfirm={async () => {
          await deleteAllData();
          setConfirmWipeOpen(false);
        }}
        title="Delete all personal data?"
        description="This permanently erases all recorded periods, daily symptoms, journal entries, settings, and any encrypted vault from this browser. This cannot be undone."
        confirmLabel="Delete Everything"
        destructive
      />
    </div>
  );
};
