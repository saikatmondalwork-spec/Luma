import { z } from 'zod';
import {
  CycleRecord,
  DailyLog,
  LumaDataSnapshot,
  UserSettings,
} from '@/src/types/luma';
import { isValidYmd, todayLocalDate } from '@/src/utils/dateUtils';

export const ymdSchema = z
  .string()
  .refine(isValidYmd, { message: 'Please enter a valid calendar date (YYYY-MM-DD).' });

export const userSettingsSchema = z.object({
  id: z.literal('default'),
  onboardingCompleted: z.boolean(),
  averageCycleLength: z.number().int().min(18).max(60),
  averagePeriodLength: z.number().int().min(1).max(14),
  theme: z.enum(['light', 'dark', 'system']),
  trackingPreferences: z.object({
    trackFlow: z.boolean(),
    trackSymptoms: z.boolean(),
    trackMood: z.boolean(),
    trackEnergy: z.boolean(),
    trackSleep: z.boolean(),
  }),
  reminderPreferences: z.object({
    enabled: z.boolean(),
    periodApproaching: z.boolean(),
    periodApproachingDays: z.number().int().min(1).max(7),
    dailyLog: z.boolean(),
    dailyLogTime: z.string().regex(/^\d{2}:\d{2}$/),
    discreetText: z.boolean(),
  }),
  predictionPreferences: z.object({
    showOvulationEstimates: z.boolean(),
  }),
  customSymptoms: z.array(z.string().trim().min(1).max(40)).max(50),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const cycleRecordSchema = z
  .object({
    id: z.string().min(1),
    startDate: ymdSchema,
    endDate: ymdSchema.nullable(),
    notes: z.string().max(1000),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .refine((r) => r.endDate === null || r.endDate >= r.startDate, {
    message: 'End date cannot be earlier than start date.',
    path: ['endDate'],
  });

export const dailyLogSchema = z.object({
  id: z.string().min(1),
  date: ymdSchema,
  bleedingFlow: z.enum(['none', 'spotting', 'light', 'medium', 'heavy']).nullable(),
  symptoms: z.array(z.string().trim().min(1).max(50)).max(30),
  mood: z
    .enum([
      'Happy',
      'Calm',
      'Energetic',
      'Neutral',
      'Anxious',
      'Irritable',
      'Sad',
      'Stressed',
    ])
    .nullable(),
  energyLevel: z
    .enum(['very-low', 'low', 'moderate', 'high', 'very-high'])
    .nullable(),
  sleep: z
    .object({
      hours: z.number().min(0).max(24).nullable(),
      quality: z.enum(['poor', 'fair', 'good', 'restful']).nullable(),
    })
    .nullable(),
  notes: z.string().max(5000),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const exportPayloadSchema = z.object({
  app: z.literal('Luma'),
  schemaVersion: z.literal(1),
  exportedAt: z.string(),
  data: z.object({
    settings: userSettingsSchema,
    cycles: z.array(cycleRecordSchema),
    dailyLogs: z.array(dailyLogSchema),
  }),
});

export function createDefaultSettings(): UserSettings {
  const now = new Date().toISOString();
  return {
    id: 'default',
    onboardingCompleted: false,
    averageCycleLength: 28,
    averagePeriodLength: 5,
    theme: 'system',
    trackingPreferences: {
      trackFlow: true,
      trackSymptoms: true,
      trackMood: true,
      trackEnergy: true,
      trackSleep: true,
    },
    reminderPreferences: {
      enabled: false,
      periodApproaching: true,
      periodApproachingDays: 2,
      dailyLog: false,
      dailyLogTime: '20:00',
      discreetText: true,
    },
    predictionPreferences: {
      showOvulationEstimates: false,
    },
    customSymptoms: [],
    createdAt: now,
    updatedAt: now,
  };
}

export interface PeriodValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates a candidate period entry against date constraints, future limits,
 * duplicate start dates, and overlapping existing periods.
 */
export function validatePeriodInput(
  candidate: { id?: string; startDate: string; endDate: string | null },
  existingCycles: CycleRecord[]
): PeriodValidationResult {
  const today = todayLocalDate();

  if (!isValidYmd(candidate.startDate)) {
    return { valid: false, error: 'Please select a valid start date.' };
  }
  if (candidate.startDate > today) {
    return { valid: false, error: 'Period start date cannot be in the future.' };
  }
  if (candidate.endDate !== null) {
    if (!isValidYmd(candidate.endDate)) {
      return { valid: false, error: 'Please select a valid end date.' };
    }
    if (candidate.endDate < candidate.startDate) {
      return {
        valid: false,
        error: 'End date cannot be earlier than the start date.',
      };
    }
    if (candidate.endDate > today) {
      return {
        valid: false,
        error: 'Period end date cannot be in the future.',
      };
    }
  }

  const candEnd = candidate.endDate ?? candidate.startDate;

  for (const other of existingCycles) {
    if (candidate.id && other.id === candidate.id) continue;

    if (other.startDate === candidate.startDate) {
      return {
        valid: false,
        error: `A period starting on ${candidate.startDate} is already recorded.`,
      };
    }

    const otherEnd = other.endDate ?? other.startDate;
    const overlaps =
      candidate.startDate <= otherEnd && candEnd >= other.startDate;

    if (overlaps) {
      return {
        valid: false,
        error: `These dates overlap with an existing period (${other.startDate}${
          other.endDate ? ` to ${other.endDate}` : ''
        }).`,
      };
    }
  }

  return { valid: true };
}

export function sanitizeSnapshot(raw: unknown): LumaDataSnapshot | null {
  const parsed = exportPayloadSchema.safeParse(raw);
  if (parsed.success) {
    return parsed.data.data;
  }
  return null;
}

export function hasAnyDailyLogContent(log: Pick<DailyLog, 'bleedingFlow' | 'symptoms' | 'mood' | 'energyLevel' | 'sleep' | 'notes'>): boolean {
  const hasFlow = log.bleedingFlow !== null;
  const hasSymptoms = log.symptoms.length > 0;
  const hasMood = log.mood !== null;
  const hasEnergy = log.energyLevel !== null;
  const hasSleep = Boolean(log.sleep && (log.sleep.hours !== null || log.sleep.quality !== null));
  const hasNotes = log.notes.trim().length > 0;
  return hasFlow || hasSymptoms || hasMood || hasEnergy || hasSleep || hasNotes;
}
