import {
  CycleInterval,
  CycleObservation,
  CyclePhase,
  CyclePrediction,
  CycleRecord,
  CycleSummary,
  DailyLog,
  ENERGY_OPTIONS,
  PeriodStatus,
  PredictionConfidence,
  UserSettings,
} from '@/src/types/luma';
import {
  addDaysLocal,
  diffDaysLocal,
  formatDisplayDate,
  todayLocalDate,
} from '@/src/utils/dateUtils';

const MIN_VALID_CYCLE_DAYS = 15;
const MAX_VALID_CYCLE_DAYS = 90;

export function sortCyclesChronological(cycles: CycleRecord[]): CycleRecord[] {
  return [...cycles].sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export function computeCycleIntervals(cycles: CycleRecord[]): CycleInterval[] {
  const sorted = sortCyclesChronological(cycles);
  const intervals: CycleInterval[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];
    const lengthDays = diffDaysLocal(current.startDate, next.startDate);
    if (lengthDays >= MIN_VALID_CYCLE_DAYS && lengthDays <= MAX_VALID_CYCLE_DAYS) {
      const periodDurationDays =
        current.endDate !== null
          ? diffDaysLocal(current.startDate, current.endDate) + 1
          : null;
      intervals.push({
        cycleId: current.id,
        startDate: current.startDate,
        nextStartDate: next.startDate,
        lengthDays,
        periodDurationDays,
      });
    }
  }
  return intervals;
}

export function computeStandardDeviation(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((acc, v) => acc + v, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

export function getCompletedPeriodDurations(cycles: CycleRecord[]): number[] {
  return sortCyclesChronological(cycles)
    .filter((c) => c.endDate !== null)
    .map((c) => diffDaysLocal(c.startDate, c.endDate!) + 1)
    .filter((d) => d >= 1 && d <= 20);
}

export function computeCycleSummary(
  cycles: CycleRecord[],
  settings: UserSettings,
  referenceDate = todayLocalDate()
): CycleSummary {
  const sorted = sortCyclesChronological(cycles);
  const intervals = computeCycleIntervals(sorted);
  const intervalLengths = intervals.map((i) => i.lengthDays);

  const averageCycleLength =
    intervalLengths.length > 0
      ? Math.round(
          (intervalLengths.reduce((s, v) => s + v, 0) / intervalLengths.length) *
            10
        ) / 10
      : null;

  const shortestCycleLength =
    intervalLengths.length > 0 ? Math.min(...intervalLengths) : null;
  const longestCycleLength =
    intervalLengths.length > 0 ? Math.max(...intervalLengths) : null;
  const previousCycleLength =
    intervalLengths.length > 0
      ? intervalLengths[intervalLengths.length - 1]
      : null;

  const completedDurations = getCompletedPeriodDurations(sorted);
  const averagePeriodDuration =
    completedDurations.length > 0
      ? Math.round(
          (completedDurations.reduce((s, v) => s + v, 0) /
            completedDurations.length) *
            10
        ) / 10
      : null;

  const cycleVariationStdDev = computeStandardDeviation(intervalLengths);

  // Effective cycle length for estimation:
  // If 2+ historical intervals exist, use historical mean.
  // If only 1 historical interval exists, blend lightly with user baseline so a single outlier doesn't dominate blindly,
  // while still honoring the recorded cycle.
  // If 0 intervals exist, rely strictly on user's configured baseline.
  let effectiveCycleLength = settings.averageCycleLength;
  if (intervalLengths.length >= 2 && averageCycleLength !== null) {
    // Weight recent up to 6 cycles cleanly
    const recent = intervalLengths.slice(-6);
    effectiveCycleLength = Math.round(
      recent.reduce((s, v) => s + v, 0) / recent.length
    );
  } else if (intervalLengths.length === 1) {
    effectiveCycleLength = Math.round(
      (intervalLengths[0] + settings.averageCycleLength) / 2
    );
  }

  const effectivePeriodLength =
    averagePeriodDuration !== null
      ? Math.max(1, Math.round(averagePeriodDuration))
      : settings.averagePeriodLength;

  // Determine confidence level honestly
  let confidence: PredictionConfidence = 'insufficient';
  let confidenceLabel = 'Baseline estimate';
  let confidenceDescription =
    'Using your configured cycle length. Recording at least two periods enables personalized estimates.';

  if (sorted.length === 0) {
    confidence = 'insufficient';
    confidenceLabel = 'Insufficient data';
    confidenceDescription =
      'Log your most recent period start date to begin cycle day tracking and next-period estimates.';
  } else if (intervalLengths.length === 0) {
    confidence = 'insufficient';
    confidenceLabel = 'Uncalibrated estimate';
    confidenceDescription =
      'Only one period is recorded so far. Estimates currently rely on your baseline setting and will adapt as more cycles are logged.';
  } else if (intervalLengths.length === 1) {
    confidence = 'low';
    confidenceLabel = 'Early estimate';
    confidenceDescription =
      'Based on one completed cycle and your baseline setting. One cycle does not establish a long-term pattern yet.';
  } else if (cycleVariationStdDev !== null && cycleVariationStdDev > 4.5) {
    confidence = 'variable';
    confidenceLabel = 'Variable pattern';
    confidenceDescription = `Your ${intervalLengths.length} recorded cycles vary noticeably (range ${shortestCycleLength}–${longestCycleLength} days), so dates are approximate.`;
  } else if (intervalLengths.length >= 4) {
    confidence = 'higher';
    confidenceLabel = 'Consistent pattern';
    confidenceDescription = `Estimated from ${intervalLengths.length} recorded cycles with moderate regularity.`;
  } else {
    confidence = 'moderate';
    confidenceLabel = 'Developing pattern';
    confidenceDescription = `Based on ${intervalLengths.length} recorded cycles. Accuracy improves with additional months.`;
  }

  // Latest period on or before referenceDate (or latest overall if all in future, though validation prevents future)
  const pastOrPresentCycles = sorted.filter((c) => c.startDate <= referenceDate);
  const latestPeriod =
    pastOrPresentCycles.length > 0
      ? pastOrPresentCycles[pastOrPresentCycles.length - 1]
      : null;

  // Active period: ongoing (endDate === null and startDate <= referenceDate) OR referenceDate falls inside [startDate, endDate]
  const activePeriod =
    pastOrPresentCycles.find(
      (c) =>
        (c.endDate === null && c.startDate <= referenceDate) ||
        (c.endDate !== null &&
          c.startDate <= referenceDate &&
          referenceDate <= c.endDate)
    ) ?? null;

  const needsEndDatePrompt = Boolean(
    activePeriod &&
      activePeriod.endDate === null &&
      diffDaysLocal(activePeriod.startDate, referenceDate) >=
        effectivePeriodLength + 2
  );

  let estimatedNextStartDate: string | null = null;
  let estimatedNextEndDate: string | null = null;
  const futureWindows: Array<{ startDate: string; endDate: string }> = [];
  let fertileWindow: {
    startDate: string;
    endDate: string;
    ovulationDate: string;
  } | null = null;

  if (latestPeriod) {
    let projectedStart = addDaysLocal(
      latestPeriod.startDate,
      effectiveCycleLength
    );
    // If latest cycle is far overdue (> effectiveCycleLength + 10), still keep the anchored next estimate visible,
    // or if within normal range show exact anchored date.
    estimatedNextStartDate = projectedStart;
    estimatedNextEndDate = addDaysLocal(
      projectedStart,
      Math.max(0, effectivePeriodLength - 1)
    );

    for (let k = 0; k < 3; k++) {
      const winStart = addDaysLocal(
        latestPeriod.startDate,
        effectiveCycleLength * (k + 1)
      );
      const winEnd = addDaysLocal(
        winStart,
        Math.max(0, effectivePeriodLength - 1)
      );
      futureWindows.push({ startDate: winStart, endDate: winEnd });
    }

    if (settings.predictionPreferences.showOvulationEstimates) {
      // Calendar rhythm estimate: ovulation roughly 14 days before estimated next start
      const ovulationDate = addDaysLocal(projectedStart, -14);
      if (ovulationDate > latestPeriod.startDate) {
        fertileWindow = {
          startDate: addDaysLocal(ovulationDate, -4),
          endDate: addDaysLocal(ovulationDate, 1),
          ovulationDate,
        };
      }
    }
  }

  const prediction: CyclePrediction = {
    effectiveCycleLength,
    effectivePeriodLength,
    estimatedNextStartDate,
    estimatedNextEndDate,
    futureWindows,
    fertileWindow,
    confidence,
    confidenceLabel,
    confidenceDescription,
    usedHistoricalCount: intervalLengths.length,
  };

  // Current cycle day & phase
  let currentCycleDay: number | null = null;
  let currentPhase: CyclePhase = 'Unknown';
  let phaseIsEstimated = true;

  if (latestPeriod) {
    currentCycleDay = diffDaysLocal(latestPeriod.startDate, referenceDate) + 1;

    if (activePeriod) {
      currentPhase = 'Menstrual';
      phaseIsEstimated = false;
    } else if (currentCycleDay > effectiveCycleLength + 7) {
      currentPhase = 'Extended';
      phaseIsEstimated = true;
    } else {
      const estOvulationDay = Math.max(
        effectivePeriodLength + 2,
        effectiveCycleLength - 14
      );
      if (currentCycleDay <= effectivePeriodLength) {
        currentPhase = 'Menstrual';
      } else if (currentCycleDay < estOvulationDay - 2) {
        currentPhase = 'Follicular';
      } else if (currentCycleDay <= estOvulationDay + 2) {
        currentPhase = 'Mid-cycle';
      } else {
        currentPhase = 'Luteal';
      }
      phaseIsEstimated = true;
    }
  }

  const daysUntilNextPeriod =
    estimatedNextStartDate !== null
      ? diffDaysLocal(referenceDate, estimatedNextStartDate)
      : null;

  // Period Status evaluation
  let periodStatus: PeriodStatus = 'insufficient';
  let statusTitle = 'Cycle information insufficient';
  let statusDescription =
    'Record your last period start date to view cycle tracking and next-period estimates.';

  if (!latestPeriod) {
    periodStatus = 'insufficient';
  } else if (activePeriod) {
    periodStatus = 'current';
    const dayOfPeriod =
      diffDaysLocal(activePeriod.startDate, referenceDate) + 1;
    statusTitle = 'Period currently recorded';
    statusDescription =
      activePeriod.endDate === null
        ? `Day ${dayOfPeriod} of your ongoing period (started ${formatDisplayDate(
            activePeriod.startDate,
            'MMM d'
          )}).`
        : `Day ${dayOfPeriod} of your recorded period (${formatDisplayDate(
            activePeriod.startDate,
            'MMM d'
          )} – ${formatDisplayDate(activePeriod.endDate, 'MMM d')}).`;
  } else if (
    latestPeriod.endDate !== null &&
    diffDaysLocal(latestPeriod.endDate, referenceDate) >= 1 &&
    diffDaysLocal(latestPeriod.endDate, referenceDate) <= 3
  ) {
    periodStatus = 'recently-ended';
    statusTitle = 'Period recently ended';
    statusDescription = `Your last recorded period ended on ${formatDisplayDate(
      latestPeriod.endDate,
      'MMM d'
    )}.`;
  } else if (
    daysUntilNextPeriod !== null &&
    daysUntilNextPeriod <= 4 &&
    daysUntilNextPeriod >= -5
  ) {
    periodStatus = 'expected-soon';
    statusTitle = 'Period expected soon';
    if (daysUntilNextPeriod > 0) {
      statusDescription = `Estimated to begin in ${daysUntilNextPeriod} ${
        daysUntilNextPeriod === 1 ? 'day' : 'days'
      } (around ${formatDisplayDate(estimatedNextStartDate!, 'MMM d')}).`;
    } else if (daysUntilNextPeriod === 0) {
      statusDescription =
        'Your next period is estimated around today based on your cycle pattern.';
    } else {
      const daysPast = Math.abs(daysUntilNextPeriod);
      statusDescription = `${daysPast} ${
        daysPast === 1 ? 'day' : 'days'
      } past your estimated start date. Natural cycle variation is normal.`;
    }
  } else {
    periodStatus = 'tracking';
    statusTitle = `${currentPhase} phase (estimated)`;
    statusDescription =
      daysUntilNextPeriod !== null && daysUntilNextPeriod > 0
        ? `Next period estimated in ${daysUntilNextPeriod} days around ${formatDisplayDate(
            estimatedNextStartDate!,
            'MMM d'
          )}.`
        : 'Continue logging daily symptoms and periods to refine your personal pattern.';
  }

  return {
    currentCycleDay,
    currentPhase,
    phaseIsEstimated,
    periodStatus,
    statusTitle,
    statusDescription,
    activePeriod,
    latestPeriod,
    needsEndDatePrompt,
    daysUntilNextPeriod,
    completedIntervals: intervals,
    averageCycleLength,
    shortestCycleLength,
    longestCycleLength,
    previousCycleLength,
    averagePeriodDuration,
    cycleVariationStdDev,
    prediction,
  };
}

export type CalendarDayKind =
  | 'recorded-period'
  | 'estimated-period'
  | 'fertile-estimate'
  | 'regular';

export interface CalendarDayInfo {
  date: string;
  kind: CalendarDayKind;
  cycleRecord: CycleRecord | null;
  isOngoingPeriodDay: boolean;
  isEstimatedOvulationDay: boolean;
  cycleDayNumber: number | null;
}

export function getCalendarDayInfo(
  dateYmd: string,
  cycles: CycleRecord[],
  summary: CycleSummary,
  referenceDate = todayLocalDate()
): CalendarDayInfo {
  const sorted = sortCyclesChronological(cycles);

  // Check if date falls within a recorded period
  for (const c of sorted) {
    if (c.endDate !== null) {
      if (dateYmd >= c.startDate && dateYmd <= c.endDate) {
        return {
          date: dateYmd,
          kind: 'recorded-period',
          cycleRecord: c,
          isOngoingPeriodDay: false,
          isEstimatedOvulationDay: false,
          cycleDayNumber: diffDaysLocal(c.startDate, dateYmd) + 1,
        };
      }
    } else {
      // Unclosed ongoing period: highlight from startDate up to referenceDate (if startDate <= referenceDate),
      // never projecting an unclosed period into the future beyond today as "recorded"!
      if (dateYmd >= c.startDate && dateYmd <= referenceDate) {
        return {
          date: dateYmd,
          kind: 'recorded-period',
          cycleRecord: c,
          isOngoingPeriodDay: true,
          isEstimatedOvulationDay: false,
          cycleDayNumber: diffDaysLocal(c.startDate, dateYmd) + 1,
        };
      }
    }
  }

  // Compute cycle day relative to preceding cycle start if applicable
  let cycleDayNumber: number | null = null;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].startDate <= dateYmd) {
      const diff = diffDaysLocal(sorted[i].startDate, dateYmd) + 1;
      if (diff <= 90) {
        cycleDayNumber = diff;
      }
      break;
    }
  }

  // Check estimated future period windows
  for (const win of summary.prediction.futureWindows) {
    if (dateYmd >= win.startDate && dateYmd <= win.endDate) {
      return {
        date: dateYmd,
        kind: 'estimated-period',
        cycleRecord: null,
        isOngoingPeriodDay: false,
        isEstimatedOvulationDay: false,
        cycleDayNumber,
      };
    }
  }

  // Check optional fertile window estimate
  const fw = summary.prediction.fertileWindow;
  if (fw && dateYmd >= fw.startDate && dateYmd <= fw.endDate) {
    return {
      date: dateYmd,
      kind: 'fertile-estimate',
      cycleRecord: null,
      isOngoingPeriodDay: false,
      isEstimatedOvulationDay: dateYmd === fw.ovulationDate,
      cycleDayNumber,
    };
  }

  return {
    date: dateYmd,
    kind: 'regular',
    cycleRecord: null,
    isOngoingPeriodDay: false,
    isEstimatedOvulationDay: false,
    cycleDayNumber,
  };
}

/**
 * Generates transparent, strictly data-backed observations from recorded cycles and daily logs.
 * Never fabricates statistics or medical diagnoses.
 */
export function generatePersonalizedObservations(
  cycles: CycleRecord[],
  dailyLogs: DailyLog[],
  summary: CycleSummary
): CycleObservation[] {
  const observations: CycleObservation[] = [];

  if (summary.completedIntervals.length >= 2 && summary.averageCycleLength !== null) {
    observations.push({
      id: 'avg-cycle',
      category: 'cycle',
      text: `Your average recorded cycle length across ${summary.completedIntervals.length} cycles is ${summary.averageCycleLength} days.`,
    });
  } else if (summary.completedIntervals.length === 1 && summary.previousCycleLength !== null) {
    observations.push({
      id: 'single-cycle',
      category: 'cycle',
      text: `Your one completed recorded cycle lasted ${summary.previousCycleLength} days. Log additional periods to see your longer-term average.`,
    });
  }

  if (
    summary.shortestCycleLength !== null &&
    summary.longestCycleLength !== null &&
    summary.completedIntervals.length >= 2
  ) {
    const spread = summary.longestCycleLength - summary.shortestCycleLength;
    if (spread >= 6) {
      observations.push({
        id: 'cycle-variation',
        category: 'cycle',
        text: `Your recent cycle lengths have varied between ${summary.shortestCycleLength} and ${summary.longestCycleLength} days.`,
      });
    } else if (spread <= 3) {
      observations.push({
        id: 'cycle-steady',
        category: 'cycle',
        text: `Your recorded cycles have stayed within a narrow ${summary.shortestCycleLength}–${summary.longestCycleLength} day range.`,
      });
    }
  }

  const completedPeriods = getCompletedPeriodDurations(cycles);
  if (completedPeriods.length >= 2 && summary.averagePeriodDuration !== null) {
    observations.push({
      id: 'avg-period',
      category: 'period',
      text: `Across ${completedPeriods.length} completed periods, bleeding lasted an average of ${summary.averagePeriodDuration} days.`,
    });
  }

  // Symptom observations in current cycle or overall
  const recentLogs = summary.latestPeriod
    ? dailyLogs.filter((l) => l.date >= summary.latestPeriod!.startDate)
    : dailyLogs;

  const symptomCounts = new Map<string, number>();
  for (const log of recentLogs) {
    for (const s of log.symptoms) {
      symptomCounts.set(s, (symptomCounts.get(s) ?? 0) + 1);
    }
  }
  const topSymptoms = Array.from(symptomCounts.entries()).sort((a, b) => b[1] - a[1]);
  if (topSymptoms.length > 0 && topSymptoms[0][1] >= 2) {
    const [symptomName, count] = topSymptoms[0];
    const scope = summary.latestPeriod ? 'this cycle' : 'your recent entries';
    observations.push({
      id: 'top-symptom',
      category: 'symptom',
      text: `You have logged ${symptomName.toLowerCase()} on ${count} ${
        count === 1 ? 'day' : 'days'
      } in ${scope}.`,
    });
  }

  // Mood observation (only if >= 3 mood logs)
  const moodLogs = dailyLogs.filter((l) => l.mood !== null);
  if (moodLogs.length >= 3) {
    const moodCounts = new Map<string, number>();
    for (const log of moodLogs) {
      if (log.mood) moodCounts.set(log.mood, (moodCounts.get(log.mood) ?? 0) + 1);
    }
    const topMood = Array.from(moodCounts.entries()).sort((a, b) => b[1] - a[1])[0];
    if (topMood) {
      observations.push({
        id: 'top-mood',
        category: 'mood',
        text: `Your most frequently logged mood across ${moodLogs.length} check-ins is ${topMood[0]} (${topMood[1]} times).`,
      });
    }
  }

  // Energy observation (only if >= 3 energy logs)
  const energyLogs = dailyLogs.filter((l) => l.energyLevel !== null);
  if (energyLogs.length >= 3) {
    const scores = energyLogs.map(
      (l) => ENERGY_OPTIONS.find((e) => e.value === l.energyLevel)?.score ?? 3
    );
    const avgScore =
      Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
    const descriptor =
      avgScore >= 3.8 ? 'high' : avgScore >= 2.6 ? 'moderate' : 'low';
    observations.push({
      id: 'avg-energy',
      category: 'energy',
      text: `Across ${energyLogs.length} energy check-ins, your average energy level has been ${descriptor} (${avgScore}/5).`,
    });
  }

  return observations;
}
