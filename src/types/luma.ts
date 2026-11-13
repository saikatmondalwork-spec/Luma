export type NavTab = 'home' | 'calendar' | 'insights' | 'journal' | 'settings';

export type ThemeMode = 'light' | 'dark' | 'system';

export type BleedingFlow = 'none' | 'spotting' | 'light' | 'medium' | 'heavy';

export type MoodOption =
  | 'Happy'
  | 'Calm'
  | 'Energetic'
  | 'Neutral'
  | 'Anxious'
  | 'Irritable'
  | 'Sad'
  | 'Stressed';

export type EnergyLevel = 'very-low' | 'low' | 'moderate' | 'high' | 'very-high';

export type SleepQuality = 'poor' | 'fair' | 'good' | 'restful';

export interface SleepEntry {
  hours: number | null;
  quality: SleepQuality | null;
}

export interface TrackingPreferences {
  trackFlow: boolean;
  trackSymptoms: boolean;
  trackMood: boolean;
  trackEnergy: boolean;
  trackSleep: boolean;
}

export interface ReminderPreferences {
  enabled: boolean;
  periodApproaching: boolean;
  periodApproachingDays: number;
  dailyLog: boolean;
  dailyLogTime: string; // HH:mm 24h local time
  discreetText: boolean;
}

export interface PredictionPreferences {
  showOvulationEstimates: boolean; // Disabled by default
}

export interface UserSettings {
  id: 'default';
  onboardingCompleted: boolean;
  averageCycleLength: number;
  averagePeriodLength: number;
  theme: ThemeMode;
  trackingPreferences: TrackingPreferences;
  reminderPreferences: ReminderPreferences;
  predictionPreferences: PredictionPreferences;
  customSymptoms: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CycleRecord {
  id: string;
  startDate: string; // YYYY-MM-DD local calendar date
  endDate: string | null; // YYYY-MM-DD local calendar date or null if ongoing/unclosed
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface DailyLog {
  id: string;
  date: string; // YYYY-MM-DD local calendar date (unique per date)
  bleedingFlow: BleedingFlow | null;
  symptoms: string[];
  mood: MoodOption | null;
  energyLevel: EnergyLevel | null;
  sleep: SleepEntry | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type PeriodStatus =
  | 'insufficient'
  | 'current'
  | 'recently-ended'
  | 'expected-soon'
  | 'tracking';

export type PredictionConfidence =
  | 'insufficient'
  | 'low'
  | 'moderate'
  | 'higher'
  | 'variable';

export type CyclePhase =
  | 'Menstrual'
  | 'Follicular'
  | 'Mid-cycle'
  | 'Luteal'
  | 'Extended'
  | 'Unknown';

export interface CycleInterval {
  cycleId: string;
  startDate: string;
  nextStartDate: string;
  lengthDays: number;
  periodDurationDays: number | null;
}

export interface CyclePrediction {
  effectiveCycleLength: number;
  effectivePeriodLength: number;
  estimatedNextStartDate: string | null;
  estimatedNextEndDate: string | null;
  futureWindows: Array<{ startDate: string; endDate: string }>;
  fertileWindow: { startDate: string; endDate: string; ovulationDate: string } | null;
  confidence: PredictionConfidence;
  confidenceLabel: string;
  confidenceDescription: string;
  usedHistoricalCount: number;
}

export interface CycleSummary {
  currentCycleDay: number | null;
  currentPhase: CyclePhase;
  phaseIsEstimated: boolean;
  periodStatus: PeriodStatus;
  statusTitle: string;
  statusDescription: string;
  activePeriod: CycleRecord | null;
  latestPeriod: CycleRecord | null;
  needsEndDatePrompt: boolean;
  daysUntilNextPeriod: number | null;
  completedIntervals: CycleInterval[];
  averageCycleLength: number | null;
  shortestCycleLength: number | null;
  longestCycleLength: number | null;
  previousCycleLength: number | null;
  averagePeriodDuration: number | null;
  cycleVariationStdDev: number | null;
  prediction: CyclePrediction;
}

export interface CycleObservation {
  id: string;
  category: 'cycle' | 'period' | 'symptom' | 'mood' | 'energy';
  text: string;
}

export interface EncryptedVaultRecord {
  id: 'vault';
  encrypted: boolean;
  version: number;
  iterations: number;
  salt: string; // base64
  iv: string; // base64
  ciphertext: string; // base64
  updatedAt: string;
}

export interface LumaDataSnapshot {
  settings: UserSettings;
  cycles: CycleRecord[];
  dailyLogs: DailyLog[];
}

export interface AppExportPayload {
  app: 'Luma';
  schemaVersion: 1;
  exportedAt: string;
  data: LumaDataSnapshot;
}

export const PRESET_SYMPTOMS = [
  'Cramps',
  'Headache',
  'Bloating',
  'Acne',
  'Breast tenderness',
  'Fatigue',
  'Back pain',
  'Nausea',
  'Cravings',
] as const;

export const MOOD_OPTIONS: MoodOption[] = [
  'Happy',
  'Calm',
  'Energetic',
  'Neutral',
  'Anxious',
  'Irritable',
  'Sad',
  'Stressed',
];

export const ENERGY_OPTIONS: Array<{ value: EnergyLevel; label: string; score: number }> = [
  { value: 'very-low', label: 'Very low', score: 1 },
  { value: 'low', label: 'Low', score: 2 },
  { value: 'moderate', label: 'Moderate', score: 3 },
  { value: 'high', label: 'High', score: 4 },
  { value: 'very-high', label: 'Very high', score: 5 },
];

export const BLEEDING_FLOW_OPTIONS: Array<{ value: BleedingFlow; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'spotting', label: 'Spotting' },
  { value: 'light', label: 'Light' },
  { value: 'medium', label: 'Medium' },
  { value: 'heavy', label: 'Heavy' },
];
