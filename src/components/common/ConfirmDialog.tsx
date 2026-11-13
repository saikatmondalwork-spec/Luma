import React from 'react';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
}) => {
  return (
    <Modal open={open} onClose={onClose} title={title} maxWidthClass="max-w-md">
      <p className="text-sm text-[var(--luma-muted)] leading-relaxed">
        {description}
      </p>
      <div className="mt-6 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="min-h-[44px] px-4 py-2 rounded-2xl border border-[var(--luma-border)] text-sm font-semibold text-[var(--luma-text)] hover:bg-[var(--luma-subtle)] transition-colors whitespace-nowrap shrink-0"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={`min-h-[44px] px-5 py-2 rounded-2xl text-sm font-semibold text-white transition-opacity whitespace-nowrap shrink-0 disabled:opacity-50 ${
            destructive ? 'luma-pink-gradient' : 'luma-violet-gradient'
          }`}
        >
          {busy ? 'Working...' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
};
