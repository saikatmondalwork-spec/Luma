import React, { useState } from 'react';
import { MotionConfig } from 'motion/react';
import { LumaProvider, useLuma } from '@/src/context/LumaContext';
import { CycleRecord, NavTab } from '@/src/types/luma';
import { todayLocalDate } from '@/src/utils/dateUtils';
import { LumaMark } from '@/src/components/common/LumaMark';
import { VaultLockScreen } from '@/src/components/vault/VaultLockScreen';
import { OnboardingFlow } from '@/src/components/onboarding/OnboardingFlow';
import { AppShell } from '@/src/components/layout/AppShell';
import { HomePage } from '@/src/pages/HomePage';
import { CalendarPage } from '@/src/pages/CalendarPage';
import { InsightsPage } from '@/src/pages/InsightsPage';
import { JournalPage } from '@/src/pages/JournalPage';
import { SettingsPage } from '@/src/pages/SettingsPage';
import { PeriodModal } from '@/src/components/period/PeriodModal';
import { DailyLogModal } from '@/src/components/logging/DailyLogModal';

const LumaWorkspace: React.FC = () => {
  const { loading, vaultLocked, settings } = useLuma();
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [journalSearchQuery, setJournalSearchQuery] = useState('');

  const [periodModalOpen, setPeriodModalOpen] = useState(false);
  const [editingCycle, setEditingCycle] = useState<CycleRecord | null>(null);
  const [defaultPeriodStart, setDefaultPeriodStart] = useState<string | undefined>(
    undefined
  );

  const [dailyLogModalOpen, setDailyLogModalOpen] = useState(false);
  const [dailyLogDate, setDailyLogDate] = useState(todayLocalDate());
  const [dailyLogFocus, setDailyLogFocus] = useState<
    'symptoms' | 'journal' | 'all'
  >('all');

  const openPeriodModal = (
    cycle: CycleRecord | null = null,
    defaultStart?: string
  ) => {
    setEditingCycle(cycle);
    setDefaultPeriodStart(defaultStart);
    setPeriodModalOpen(true);
  };

  const openDailyLogModal = (
    date: string = todayLocalDate(),
    focus: 'symptoms' | 'journal' | 'all' = 'all'
  ) => {
    setDailyLogDate(date);
    setDailyLogFocus(focus);
    setDailyLogModalOpen(true);
  };

  const handleGlobalSearch = (query: string) => {
    setJournalSearchQuery(query);
    setActiveTab('journal');
  };

  if (loading) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-3 bg-[var(--luma-canvas)] text-[var(--luma-text)]">
        <div className="w-14 h-14 rounded-2xl luma-violet-gradient flex items-center justify-center text-white shadow-lg">
          <LumaMark size={28} />
        </div>
        <p className="text-sm font-medium text-[var(--luma-muted)]">
          Loading local workspace...
        </p>
      </div>
    );
  }

  if (vaultLocked) {
    return <VaultLockScreen />;
  }

  if (!settings.onboardingCompleted) {
    return <OnboardingFlow />;
  }

  return (
    <AppShell
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      onQuickCheckIn={() => openDailyLogModal(todayLocalDate(), 'all')}
      onGlobalSearch={handleGlobalSearch}
    >
      {activeTab === 'home' && (
        <HomePage
          onNavigate={setActiveTab}
          onOpenPeriodModal={(cycle) => openPeriodModal(cycle ?? null)}
          onOpenDailyLogModal={openDailyLogModal}
        />
      )}
      {activeTab === 'calendar' && (
        <CalendarPage
          onOpenPeriodModal={(cycle, defaultStart) =>
            openPeriodModal(cycle ?? null, defaultStart)
          }
          onOpenDailyLogModal={(date) => openDailyLogModal(date, 'all')}
        />
      )}
      {activeTab === 'insights' && (
        <InsightsPage
          onOpenPeriodModal={(cycle) => openPeriodModal(cycle ?? null)}
          onOpenDailyLogModal={(date) => openDailyLogModal(date, 'all')}
        />
      )}
      {activeTab === 'journal' && (
        <JournalPage
          onOpenDailyLogModal={openDailyLogModal}
          externalSearchQuery={journalSearchQuery}
        />
      )}
      {activeTab === 'settings' && <SettingsPage />}

      <PeriodModal
        open={periodModalOpen}
        onClose={() => setPeriodModalOpen(false)}
        editingCycle={editingCycle}
        defaultStartDate={defaultPeriodStart}
      />

      <DailyLogModal
        open={dailyLogModalOpen}
        onClose={() => setDailyLogModalOpen(false)}
        date={dailyLogDate}
        initialFocus={dailyLogFocus}
      />
    </AppShell>
  );
};

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <LumaProvider>
        <LumaWorkspace />
      </LumaProvider>
    </MotionConfig>
  );
}
