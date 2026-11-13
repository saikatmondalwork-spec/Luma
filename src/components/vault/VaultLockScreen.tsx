import React, { useState } from 'react';
import { Lock, ShieldAlert, Unlock } from 'lucide-react';
import { useLuma } from '@/src/context/LumaContext';
import { LumaMark } from '@/src/components/common/LumaMark';
import { ConfirmDialog } from '@/src/components/common/ConfirmDialog';

export const VaultLockScreen: React.FC = () => {
  const { unlockVault, deleteAllData } = useLuma();
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphrase) {
      setError('Enter your vault passphrase.');
      return;
    }
    setUnlocking(true);
    setError(null);
    try {
      await unlockVault(passphrase);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to unlock vault. Check your passphrase.'
      );
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center px-4 py-10 bg-[var(--luma-canvas)] text-[var(--luma-text)]">
      <div className="w-full max-w-md luma-card rounded-[28px] p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl luma-violet-gradient text-white flex items-center justify-center shadow-md">
            <LumaMark size={24} />
          </div>
          <span className="text-2xl font-bold tracking-tight">Luma</span>
        </div>

        <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-[var(--luma-plum-soft)] px-3 py-1 text-xs font-semibold text-[var(--luma-plum)]">
          <Lock className="w-3.5 h-3.5" />
          <span>Encrypted Private Vault</span>
        </div>

        <h1 className="mt-3 text-2xl font-bold text-[var(--luma-text)]">
          Unlock your local records
        </h1>
        <p className="mt-2 text-sm text-[var(--luma-muted)] leading-relaxed">
          Your cycle data is encrypted locally with AES-GCM. Enter your
          passphrase to decrypt it in memory for this session.
        </p>

        <form onSubmit={handleUnlock} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="vault-passphrase"
              className="block text-sm font-semibold text-[var(--luma-text)] mb-1.5"
            >
              Vault passphrase
            </label>
            <input
              id="vault-passphrase"
              type="password"
              autoFocus
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Enter passphrase"
              className="w-full min-h-[44px] rounded-2xl border border-[var(--luma-border)] bg-[var(--luma-canvas)] px-3.5 py-2.5 text-sm text-[var(--luma-text)] focus:border-[var(--luma-plum)] focus:outline-none"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-2xl border border-[#F3B5C5] bg-[var(--luma-rose-soft)] px-3.5 py-2.5 text-xs sm:text-sm text-[#B82851] dark:text-[#FFA6BE]"
            >
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={unlocking}
            className="w-full min-h-[46px] inline-flex items-center justify-center gap-2 rounded-2xl luma-violet-gradient text-white text-sm font-semibold hover:opacity-95 transition-opacity disabled:opacity-50 shadow-md"
          >
            <Unlock className="w-4 h-4" />
            <span>{unlocking ? 'Decrypting...' : 'Unlock Vault'}</span>
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-[var(--luma-border)] flex items-center justify-between gap-4">
          <p className="text-xs text-[var(--luma-muted)]">
            Forgot your passphrase? Encrypted data cannot be recovered without
            it.
          </p>
          <button
            type="button"
            onClick={() => setConfirmResetOpen(true)}
            className="text-xs font-semibold text-[var(--luma-rose-deep)] hover:underline whitespace-nowrap shrink-0 min-h-[40px] px-2"
          >
            Reset vault
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmResetOpen}
        onClose={() => setConfirmResetOpen(false)}
        onConfirm={async () => {
          await deleteAllData();
          setConfirmResetOpen(false);
        }}
        title="Erase encrypted vault and start fresh?"
        description="This permanently deletes all encrypted records stored on this device. This action cannot be undone."
        confirmLabel="Erase All Data"
        destructive
      />
    </div>
  );
};
