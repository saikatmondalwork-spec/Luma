import { describe, expect, it } from 'vitest';
import {
  computeCycleSummary,
  generatePersonalizedObservations,
  getCalendarDayInfo,
} from '@/src/services/cycleEngine';
import { createDefaultSettings } from '@/src/utils/validation';
import { CycleRecord, DailyLog } from '@/src/types/luma';

function makeCycle(
  id: string,
  startDate: string,
  endDate: string | null = null
): CycleRecord {
  const now = '2026-01-01T00:00:00.000Z';
  return { id, startDate, endDate, notes: '', createdAt: now, updatedAt: now };
}

describe('cycleEngine calculations and predictions', () => {
  it('handles first-time user with zero recorded periods honestly', () => {
    const settings = createDefaultSettings();
    const summary = computeCycleSummary([], settings, '2026-11-12');
    expect(summary.periodStatus).toBe('insufficient');
    expect(summary.currentCycleDay).toBeNull();
    expect(summary.averageCycleLength).toBeNull();
    expect(summary.prediction.estimatedNextStartDate).toBeNull();
    expect(summary.prediction.confidence).toBe('insufficient');
  });

  it('does not auto-end an unclosed ongoing period when estimated duration passes', () => {
    const settings = { ...createDefaultSettings(), averagePeriodLength: 5 };
    const cycles = [makeCycle('c1', '2026-11-01', null)];
    const summary = computeCycleSummary(cycles, settings, '2026-11-10');

    expect(summary.periodStatus).toBe('current');
    expect(summary.activePeriod?.id).toBe('c1');
    expect(summary.needsEndDatePrompt).toBe(true);
    expect(summary.currentCycleDay).toBe(10);
  });

  it('calculates cycle intervals accurately and avoids treating 1 cycle as long-term pattern', () => {
    const settings = { ...createDefaultSettings(), averageCycleLength: 28 };
    const cycles = [
      makeCycle('c1', '2026-09-01', '2026-09-05'),
      makeCycle('c2', '2026-10-01', '2026-10-05'), // 30-day cycle
    ];
    const summary = computeCycleSummary(cycles, settings, '2026-10-15');

    expect(summary.completedIntervals).toHaveLength(1);
    expect(summary.completedIntervals[0].lengthDays).toBe(30);
    expect(summary.averageCycleLength).toBe(30);
    expect(summary.averagePeriodDuration).toBe(5);
    expect(summary.prediction.confidence).toBe('low');
    // Blends 30 and 28 -> 29 effective days -> Oct 30
    expect(summary.prediction.estimatedNextStartDate).toBe('2026-10-30');
  });

  it('detects irregular cycle variation across multiple recorded cycles', () => {
    const settings = createDefaultSettings();
    const cycles = [
      makeCycle('c1', '2026-06-01', '2026-06-05'),
      makeCycle('c2', '2026-06-25', '2026-06-29'), // 24d
      makeCycle('c3', '2026-08-02', '2026-08-06'), // 38d
      makeCycle('c4', '2026-08-29', '2026-09-02'), // 27d
    ];
    const summary = computeCycleSummary(cycles, settings, '2026-09-10');

    expect(summary.shortestCycleLength).toBe(24);
    expect(summary.longestCycleLength).toBe(38);
    expect(summary.prediction.confidence).toBe('variable');

    const observations = generatePersonalizedObservations(cycles, [], summary);
    expect(observations.some((o) => o.text.includes('varied between 24 and 38'))).toBe(
      true
    );
  });

  it('keeps ovulation estimates disabled by default and respects opt-in setting', () => {
    const baseSettings = createDefaultSettings();
    const cycles = [makeCycle('c1', '2026-10-20', '2026-10-24')];

    const defaultSummary = computeCycleSummary(cycles, baseSettings, '2026-11-01');
    expect(defaultSummary.prediction.fertileWindow).toBeNull();

    const optedIn = {
      ...baseSettings,
      predictionPreferences: { showOvulationEstimates: true },
    };
    const fertileSummary = computeCycleSummary(cycles, optedIn, '2026-11-01');
    expect(fertileSummary.prediction.fertileWindow).not.toBeNull();

    const ovDay = fertileSummary.prediction.fertileWindow!.ovulationDate;
    const dayInfo = getCalendarDayInfo(ovDay, cycles, fertileSummary, '2026-11-01');
    expect(dayInfo.kind).toBe('fertile-estimate');
    expect(dayInfo.isEstimatedOvulationDay).toBe(true);
  });

  it('generates symptom observations strictly from actual logged records', () => {
    const settings = createDefaultSettings();
    const cycles = [makeCycle('c1', '2026-11-01', '2026-11-05')];
    const logs: DailyLog[] = [
      {
        id: 'l1',
        date: '2026-11-01',
        bleedingFlow: 'medium',
        symptoms: ['Headache', 'Cramps'],
        mood: 'Calm',
        energyLevel: 'low',
        sleep: null,
        notes: '',
        createdAt: '2026-11-01T10:00:00Z',
        updatedAt: '2026-11-01T10:00:00Z',
      },
      {
        id: 'l2',
        date: '2026-11-02',
        bleedingFlow: 'light',
        symptoms: ['Headache'],
        mood: 'Calm',
        energyLevel: 'moderate',
        sleep: null,
        notes: '',
        createdAt: '2026-11-02T10:00:00Z',
        updatedAt: '2026-11-02T10:00:00Z',
      },
    ];
    const summary = computeCycleSummary(cycles, settings, '2026-11-05');
    const obs = generatePersonalizedObservations(cycles, logs, summary);
    expect(obs.some((o) => o.text.includes('headache on 2 days'))).toBe(true);
  });
});
