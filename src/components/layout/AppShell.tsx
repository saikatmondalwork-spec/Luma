import React, { useState } from 'react';
import {
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  Home,
  Lock,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
  X,
} from 'lucide-react';
import { NavTab } from '@/src/types/luma';
import { useLuma } from '@/src/context/LumaContext';
import { LumaMark } from '@/src/components/common/LumaMark';
import {
  OfflineIndicator,
  PWAInstallButton,
} from '@/src/components/common/PWAInstallButton';

interface AppShellProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onQuickCheckIn: () => void;
  onGlobalSearch: (query: string) => void;
  children: React.ReactNode;
}

const NAV_ITEMS: Array<{
  id: NavTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'journal', label: 'Journal', icon: BookOpen },
  { id: 'insights', label: 'Insights', icon: BarChart3 },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const TAB_META: Record<NavTab, { kicker: string; title: string }> = {
  home: { kicker: 'Primary', title: 'Dashboard' },
  calendar: { kicker: 'Schedule', title: 'Cycle Calendar' },
  insights: { kicker: 'Analytics', title: 'Cycle Insights' },
  journal: { kicker: 'Records', title: 'Health Journal' },
  settings: { kicker: 'Preferences', title: 'Settings & Privacy' },
};

export const AppShell: React.FC<AppShellProps> = ({
  activeTab,
  onSelectTab,
  onQuickCheckIn,
  onGlobalSearch,
  children,
}) => {
  const {
    resolvedTheme,
    updateSettings,
    vaultEnabled,
    lockVault,
    corruptionWarning,
    dismissCorruptionWarning,
    storageError,
    dueReminders,
    dismissReminder,
  } = useLuma();

  const [searchDraft, setSearchDraft] = useState('');

  const toggleTheme = () => {
    void updateSettings({
      theme: resolvedTheme === 'dark' ? 'light' : 'dark',
    });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onGlobalSearch(searchDraft.trim());
  };

  const pageMeta = TAB_META[activeTab];

  return (
    <div className="min-h-dvh bg-[var(--luma-canvas)] text-[var(--luma-text)] md:p-4 lg:p-6">
      <div className="max-w-[1440px] mx-auto min-h-dvh md:min-h-[calc(100dvh-3rem)] md:rounded-[34px] md:bg-[var(--luma-surface)] md:border md:border-[var(--luma-border)] md:shadow-[0_24px_60px_-20px_rgba(78,61,174,0.16)] flex flex-col md:flex-row overflow-hidden">
        {/* Desktop Floating Left Violet Icon Rail (exact reference structure) */}
        <aside className="hidden md:flex flex-col items-center justify-between w-[84px] lg:w-[92px] shrink-0 m-3 mr-0 rounded-[28px] luma-violet-gradient py-5 px-2 text-white shadow-[0_16px_36px_-10px_rgba(88,71,184,0.45)]">
          {/* Top Luma Emblem / Reminder Indicator */}
          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => onSelectTab('home')}
              aria-label="Luma Home"
              title="Luma"
              className="w-11 h-11 rounded-2xl bg-white/16 hover:bg-white/24 flex items-center justify-center transition-colors relative"
            >
              <Bell className="w-5 h-5 text-white" />
              {dueReminders.length > 0 && (
                <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-[#FF7194]" />
              )}
            </button>
          </div>

          {/* Center Navigation Icons */}
          <nav
            aria-label="Main navigation"
            className="flex flex-col items-center gap-2.5 my-auto"
          >
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  aria-label={item.label}
                  title={item.label}
                  aria-current={active ? 'page' : undefined}
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
                    active
                      ? 'bg-white text-[#5B49BE] shadow-[0_8px_18px_-4px_rgba(24,18,64,0.3)]'
                      : 'text-white/75 hover:text-white hover:bg-white/12'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </button>
              );
            })}
          </nav>

          {/* Bottom Utility Actions */}
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
              title={resolvedTheme === 'dark' ? 'Light mode' : 'Dark mode'}
              className="w-11 h-11 rounded-2xl text-white/80 hover:text-white hover:bg-white/14 flex items-center justify-center transition-colors"
            >
              {resolvedTheme === 'dark' ? (
                <Sun className="w-5 h-5" />
              ) : (
                <Moon className="w-5 h-5" />
              )}
            </button>
            {vaultEnabled && (
              <button
                type="button"
                onClick={lockVault}
                aria-label="Lock private vault"
                title="Lock private vault"
                className="w-11 h-11 rounded-2xl text-white/80 hover:text-white hover:bg-white/14 flex items-center justify-center transition-colors"
              >
                <Lock className="w-5 h-5" />
              </button>
            )}
          </div>
        </aside>

        {/* Mobile Compact Top Bar */}
        <header className="md:hidden sticky top-0 z-30 h-[54px] flex items-center justify-between gap-3 px-4 border-b border-[var(--luma-border)] bg-[var(--luma-surface)]/94 backdrop-blur-md">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-xl luma-violet-gradient flex items-center justify-center text-white">
              <LumaMark size={20} className="text-white" />
            </div>
            <span className="font-display text-lg font-bold tracking-tight text-[var(--luma-text)] whitespace-nowrap">
              Luma
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {vaultEnabled && (
              <button
                type="button"
                onClick={lockVault}
                aria-label="Lock private vault"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[var(--luma-muted)] hover:text-[var(--luma-text)]"
              >
                <Lock className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[var(--luma-muted)] hover:text-[var(--luma-text)]"
            >
              {resolvedTheme === 'dark' ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>
            <button
              type="button"
              onClick={onQuickCheckIn}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl luma-violet-gradient text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Check-in</span>
            </button>
          </div>
        </header>

        {/* Main Workspace Canvas */}
        <main className="flex-1 min-w-0 pb-24 md:pb-8 flex flex-col">
          {/* Desktop Top Header inside Shell (matching reference Primary / Dashboard + Search + Profile badge) */}
          <div className="hidden md:flex items-center justify-between gap-6 px-7 lg:px-9 pt-6 pb-2">
            <div>
              <p className="text-xs font-medium text-[var(--luma-muted)]">
                {pageMeta.kicker}
              </p>
              <h1 className="text-2xl font-bold text-[var(--luma-text)] tracking-tight leading-tight">
                {pageMeta.title}
              </h1>
            </div>

            <div className="flex items-center gap-3">
              <form onSubmit={handleSearchSubmit} className="relative">
                <Search className="w-4 h-4 text-[var(--luma-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  placeholder="Search journal & symptoms"
                  aria-label="Search journal and symptoms"
                  className="w-56 lg:w-64 min-h-[42px] rounded-2xl bg-[var(--luma-subtle)] border border-transparent focus:border-[var(--luma-plum)] focus:bg-[var(--luma-surface)] pl-10 pr-3.5 py-2 text-sm text-[var(--luma-text)] placeholder:text-[var(--luma-muted)] transition-colors"
                />
              </form>

              <PWAInstallButton compact />

              <button
                type="button"
                onClick={onQuickCheckIn}
                title="Quick Daily Check-in"
                className="min-h-[42px] px-4 py-2 rounded-2xl luma-violet-gradient text-white text-sm font-semibold inline-flex items-center gap-1.5 hover:opacity-95 transition-opacity whitespace-nowrap shrink-0 shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Check-in</span>
              </button>
            </div>
          </div>

          {/* Page Content Container */}
          <div className="flex-1 px-4 sm:px-6 md:px-7 lg:px-9 py-4 md:py-5">
            <OfflineIndicator />

            {storageError && (
              <div
                role="alert"
                className="mb-4 rounded-2xl border border-[#F3B5C5] bg-[var(--luma-rose-soft)] px-4 py-3 text-sm text-[#B82851] dark:text-[#FFA6BE]"
              >
                {storageError}
              </div>
            )}

            {corruptionWarning && (
              <div
                role="status"
                className="mb-4 flex items-start justify-between gap-3 rounded-2xl border border-[var(--luma-border)] bg-[var(--luma-subtle)] px-4 py-3 text-sm text-[var(--luma-text)]"
              >
                <span>{corruptionWarning}</span>
                <button
                  type="button"
                  onClick={dismissCorruptionWarning}
                  aria-label="Dismiss notice"
                  className="text-[var(--luma-muted)] hover:text-[var(--luma-text)] p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {dueReminders.map((reminder) => (
              <div
                key={reminder.id}
                role="status"
                className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-[var(--luma-border)] bg-[var(--luma-subtle)] px-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <span className="font-semibold text-[var(--luma-plum)]">
                    Reminder
                  </span>
                  <span className="mx-2 text-[var(--luma-muted)]" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-[var(--luma-text)]">{reminder.body}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      dismissReminder(reminder.id);
                      onQuickCheckIn();
                    }}
                    className="min-h-[36px] px-3 py-1 rounded-xl bg-[var(--luma-surface)] text-xs font-semibold text-[var(--luma-text)] shadow-xs"
                  >
                    Log now
                  </button>
                  <button
                    type="button"
                    onClick={() => dismissReminder(reminder.id)}
                    aria-label="Dismiss reminder"
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-[var(--luma-muted)] hover:text-[var(--luma-text)]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}

            {children}
          </div>
        </main>

        {/* Mobile Bottom Navigation Bar */}
        <nav
          aria-label="Mobile navigation"
          className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--luma-border)] bg-[var(--luma-surface)]/95 backdrop-blur-md pb-safe"
        >
          <div className="grid grid-cols-5 h-16 items-center px-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`h-full min-h-[44px] flex flex-col items-center justify-center gap-1 transition-colors ${
                    active
                      ? 'text-[var(--luma-plum)]'
                      : 'text-[var(--luma-muted)] hover:text-[var(--luma-text)]'
                  }`}
                >
                  <span
                    className={`px-3 py-1 rounded-xl transition-colors ${
                      active ? 'bg-[var(--luma-plum-soft)]' : ''
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="text-[11px] font-semibold leading-none whitespace-nowrap">
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
};
