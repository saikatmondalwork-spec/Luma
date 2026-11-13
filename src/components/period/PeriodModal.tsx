import React, { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useLuma } from '@/src/context/LumaContext';
import {
  BLEEDING_FLOW_OPTIONS,
  BleedingFlow,
  CycleRecord,
} from '@/src/types/luma';
import { todayLocalDate } from '@/src/utils/dateUtils';
import { Modal } from '@/src/components/common/Modal';
import { ConfirmDialog } from '@/src/components/common/ConfirmDialog';

interface PeriodModalProps {
  open: boolean;
  onClose: () => void;
  editingCycle?: CycleRecord | null;
  defaultStartDate?: string;
}

export const PeriodModal: React.FC<PeriodModalProps> = ({
  open,
  onClose,
  editingCycle = null,
  defaultStartDate,
}) => {
  const { addPeriod, updatePeriod, deletePeriod } = useLuma();
  const today = todayLocalDate();

  const [startDate, setStartDate] = useState(today);
  const [isOngoing, setIsOngoing] = useState(true);
  const [endDate, setEndDate] = useState(today);
  const [notes, setNotes] = useState('');
  const [initialFlow, setInitialFlow] = useState<BleedingFlow>('medium');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editingCycle) {
      setStartDate(editingCycle.startDate);
      setIsOngoing(editingCycle.endDate === null);
      setEndDate(editingCycle.endDate ?? editingCycle.startDate);
      setNotes(editingCycle.notes);
    } else {
      const initialStart = defaultStartDate ?? today;
      setStartDate(initialStart);
      setIsOngoing(initialStart === today);
      setEndDate(initialStart);
      setNotes('');
      setInitialFlow('medium');
    }
  }, [open, editingCycle, defaultStartDate, today]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const resolvedEnd = isOngoing ? null : endDate || null;

    try {
      if (editingCycle) {
        const res = await updatePeriod(editingCycle.id, {
          startDate,
          endDate: resolvedEnd,
          notes,
        });
        if (!res.ok) {
          setError(res.error ?? 'Could not update period.');
          return;
        }
      } else {
        const res = await addPeriod({
          startDate,
          endDate: resolvedEnd,
          notes,
          initialFlow,
        });
        if (!res.ok) {
          setError(res.error ?? 'Could not save period.');
          return;
        }
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingCycle) return;
    await deletePeriod(editingCycle.id);
    setConfirmDeleteOpen(false);
    onClose();
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={editingCycle ? 'Edit period record' : 'Log period'}
        subtitle="Dates are saved strictly on your local device."
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="period-start-date"
              className="block text-sm font-semibold text-[var(--luma-text)] mb-1.5"
            >
              First day of bleeding
            </label>
            <input
              id="period-start-date"
              type="date"
              max={today}
              required
              value={startDate}
              onChange={(e) => {
                const val = e.target.value;
                setStartDate(val);
                if (!isOngoing && endDate < val) {
                  setEndDate(val);
                }
              }}
              className="w-full min-h-[44px] rounded-2xl border border-[var(--luma-border)] bg-[var(--luma-canvas)] px-3.5 py-2 text-sm text-[var(--luma-text)] tabular-nums"
            />
          </div>

          <div className="rounded-2xl border border-[var(--luma-border)] bg-[var(--luma-canvas)] p-4 space-y-3">
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <div>
                <span className="block text-sm font-semibold text-[var(--luma-text)]">
                  Period is still ongoing
                </span>
                <span className="block text-xs text-[var(--luma-muted)]">
                  Luma never closes your period automatically.
                </span>
              </div>
              <input
                type="checkbox"
                checked={isOngoing}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setIsOngoing(checked);
                  if (!checked && (!endDate || endDate < startDate)) {
                    setEndDate(startDate);
                  }
                }}
                className="w-5 h-5 accent-[var(--luma-plum)] rounded"
              />
            </label>

            {!isOngoing && (
              <div className="pt-2 border-t border-[var(--luma-border)]">
                <label
                  htmlFor="period-end-date"
                  className="block text-sm font-semibold text-[var(--luma-text)] mb-1.5"
                >
                  Last day of bleeding
                </label>
                <input
                  id="period-end-date"
                  type="date"
                  min={startDate}
                  max={today}
                  required={!isOngoing}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full min-h-[44px] rounded-2xl border border-[var(--luma-border)] bg-[var(--luma-surface)] px-3.5 py-2 text-sm text-[var(--luma-text)] tabular-nums"
                />
              </div>
            )}
          </div>

          {!editingCycle && (
            <div>
              <span className="block text-sm font-semibold text-[var(--luma-text)] mb-2">
                Flow on start day (optional)
              </span>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {BLEEDING_FLOW_OPTIONS.filter((o) => o.value !== 'none').map(
                  (opt) => {
                    const active = initialFlow === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setInitialFlow(opt.value)}
                        className={`min-h-[44px] px-3 py-2 rounded-2xl text-xs sm:text-sm font-semibold border transition-colors whitespace-nowrap ${
                          active
                            ? 'border-[var(--luma-rose)] bg-[var(--luma-rose-soft)] text-[var(--luma-rose-deep)]'
                            : 'border-[var(--luma-border)] bg-[var(--luma-canvas)] text-[var(--luma-muted)] hover:text-[var(--luma-text)]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  }
                )}
              </div>
            </div>
          )}

          <div>
            <label
              htmlFor="period-notes"
              className="block text-sm font-semibold text-[var(--luma-text)] mb-1.5"
            >
              Notes (optional)
            </label>
            <textarea
              id="period-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything helpful to remember about this cycle..."
              className="w-full rounded-2xl border border-[var(--luma-border)] bg-[var(--luma-canvas)] px-3.5 py-2.5 text-sm text-[var(--luma-text)] resize-y"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-2xl border border-[#F3B5C5] bg-[var(--luma-rose-soft)] px-3.5 py-2.5 text-xs sm:text-sm text-[#B82851] dark:text-[#FFA6BE]"
            >
              {error}
            </p>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            {editingCycle ? (
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(true)}
                className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-sm font-semibold text-[var(--luma-rose-deep)] hover:bg-[var(--luma-rose-soft)] transition-colors whitespace-nowrap shrink-0"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete</span>
              </button>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] px-4 py-2 rounded-2xl border border-[var(--luma-border)] text-sm font-semibold text-[var(--luma-text)] hover:bg-[var(--luma-subtle)] transition-colors whitespace-nowrap shrink-0"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="min-h-[44px] px-5 py-2 rounded-2xl luma-violet-gradient text-white text-sm font-semibold hover:opacity-95 transition-opacity disabled:opacity-50 whitespace-nowrap shrink-0 shadow-sm"
              >
                {saving
                  ? 'Saving...'
                  : editingCycle
                  ? 'Save Changes'
                  : 'Save Period'}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete this period entry?"
        description="Your cycle predictions and history will automatically recalculate without this record."
        confirmLabel="Delete Period"
        destructive
      />
    </>
  );
};
