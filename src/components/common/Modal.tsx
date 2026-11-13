import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidthClass?: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  subtitle,
  maxWidthClass = 'max-w-lg',
  children,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="luma-modal-title"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={onClose}
            className="fixed inset-0 bg-[#181530]/45 backdrop-blur-[3px]"
          />
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.99 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className={`relative z-10 w-full ${maxWidthClass} max-h-[90dvh] flex flex-col rounded-t-[28px] sm:rounded-[28px] bg-[var(--luma-surface)] border border-[var(--luma-border)] shadow-2xl overflow-hidden`}
          >
            <div className="sm:hidden w-10 h-1 rounded-full bg-[var(--luma-border)] mx-auto mt-2.5 shrink-0" />
            <div className="flex items-start justify-between gap-4 px-5 sm:px-6 pt-5 pb-3.5 border-b border-[var(--luma-border)] shrink-0">
              <div className="min-w-0">
                <h2
                  id="luma-modal-title"
                  className="font-display text-lg sm:text-xl font-semibold text-[var(--luma-text)] leading-snug"
                >
                  {title}
                </h2>
                {subtitle && (
                  <p className="text-xs sm:text-sm text-[var(--luma-muted)] mt-0.5">
                    {subtitle}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center rounded-2xl text-[var(--luma-muted)] hover:text-[var(--luma-text)] hover:bg-[var(--luma-subtle)] transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto px-5 sm:px-6 py-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
