import React, { useState } from 'react';
import { Download, Smartphone, WifiOff } from 'lucide-react';
import { usePWAInstall } from '@/src/hooks/usePWAInstall';
import { useOnlineStatus } from '@/src/hooks/useOnlineStatus';
import { Modal } from './Modal';

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({
  compact = false,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={`inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--luma-border)] bg-[var(--luma-surface)] hover:bg-[var(--luma-subtle)] text-[var(--luma-text)] font-medium transition-colors whitespace-nowrap shrink-0 ${
          compact ? 'min-h-[40px] px-3 py-1.5 text-xs' : 'min-h-[44px] px-4 py-2 text-sm'
        }`}
      >
        <Download className="w-4 h-4 text-[var(--luma-plum)]" />
        <span>Install Luma App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={`inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--luma-border)] bg-[var(--luma-surface)] hover:bg-[var(--luma-subtle)] text-[var(--luma-text)] font-medium transition-colors whitespace-nowrap shrink-0 ${
            compact ? 'min-h-[40px] px-3 py-1.5 text-xs' : 'min-h-[44px] px-4 py-2 text-sm'
          }`}
        >
          <Smartphone className="w-4 h-4 text-[var(--luma-plum)]" />
          <span>Add to Home Screen</span>
        </button>

        <Modal
          open={showIOSGuide}
          onClose={() => setShowIOSGuide(false)}
          title="Install Luma on iPhone or iPad"
          maxWidthClass="max-w-sm"
        >
          <ol className="space-y-3 text-sm text-[var(--luma-muted)] leading-relaxed list-decimal list-inside">
            <li>
              Tap the <strong className="text-[var(--luma-text)]">Share</strong>{' '}
              button in the Safari toolbar.
            </li>
            <li>
              Scroll down and tap{' '}
              <strong className="text-[var(--luma-text)]">
                Add to Home Screen
              </strong>
              .
            </li>
            <li>
              Tap <strong className="text-[var(--luma-text)]">Add</strong> to
              launch Luma offline like a native app.
            </li>
          </ol>
          <button
            type="button"
            onClick={() => setShowIOSGuide(false)}
            className="mt-5 w-full min-h-[44px] rounded-xl bg-[var(--luma-subtle)] text-sm font-medium text-[var(--luma-text)] hover:opacity-90 transition-opacity"
          >
            Done
          </button>
        </Modal>
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      className="mb-4 flex items-center gap-2.5 rounded-xl border border-[var(--luma-border)] bg-[var(--luma-subtle)] px-4 py-2.5 text-xs sm:text-sm text-[var(--luma-text)]"
    >
      <WifiOff className="w-4 h-4 text-[var(--luma-peach)] shrink-0" />
      <span>
        Offline mode active — your local records remain fully available on this
        device.
      </span>
    </div>
  );
};
