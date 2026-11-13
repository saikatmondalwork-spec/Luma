import { CycleSummary, ReminderPreferences } from '@/src/types/luma';
import { addDaysLocal, diffDaysLocal, parseLocalDate, todayLocalDate } from '@/src/utils/dateUtils';

export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

export function getNotificationPermissionState(): NotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  const result = await Notification.requestPermission();
  return result;
}

export interface DueReminder {
  id: string;
  title: string;
  body: string;
}

/**
 * Evaluates whether an active local reminder is due right now while the app is open.
 * Uses discreet copy by default to protect privacy on lock screens.
 */
export function evaluateDueReminders(
  prefs: ReminderPreferences,
  summary: CycleSummary,
  hasLoggedToday: boolean
): DueReminder[] {
  if (!prefs.enabled) return [];
  const due: DueReminder[] = [];

  if (
    prefs.periodApproaching &&
    summary.daysUntilNextPeriod !== null &&
    summary.daysUntilNextPeriod >= 0 &&
    summary.daysUntilNextPeriod <= prefs.periodApproachingDays &&
    summary.periodStatus !== 'current'
  ) {
    due.push({
      id: `period-${todayLocalDate()}`,
      title: 'Luma',
      body: prefs.discreetText
        ? 'Upcoming cycle check-in window is approaching.'
        : `Your next period is estimated in ${
            summary.daysUntilNextPeriod === 0
              ? 'about 0 days (around today)'
              : `${summary.daysUntilNextPeriod} day(s)`
          }.`,
    });
  }

  if (prefs.dailyLog && !hasLoggedToday) {
    const now = new Date();
    const [targetH, targetM] = prefs.dailyLogTime.split(':').map(Number);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const targetMinutes = targetH * 60 + targetM;
    if (nowMinutes >= targetMinutes) {
      due.push({
        id: `daily-${todayLocalDate()}`,
        title: 'Luma',
        body: prefs.discreetText
          ? 'Time for your daily wellness check-in.'
          : 'Take a moment to log your daily symptoms, mood, and notes.',
      });
    }
  }

  return due;
}

export function triggerBrowserNotification(reminder: DueReminder): boolean {
  if (getNotificationPermissionState() !== 'granted') return false;
  try {
    new Notification(reminder.title, {
      body: reminder.body,
      icon: '/pwa-192x192.png',
      tag: reminder.id,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Generates a private offline .ics calendar reminder file so users can schedule
 * native OS reminders without relying on background browser push servers.
 */
export function buildReminderIcs(
  prefs: ReminderPreferences,
  summary: CycleSummary
): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Luma Health//Local Cycle Companion//EN',
    'CALSCALE:GREGORIAN',
  ];

  const [hh, mm] = prefs.dailyLogTime.split(':');
  const today = todayLocalDate();
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  if (prefs.dailyLog) {
    const dtStart = `${today.replace(/-/g, '')}T${hh}${mm}00`;
    const summaryText = prefs.discreetText
      ? 'Luma Daily Check-in'
      : 'Luma: Daily Symptom & Journal Check-in';
    lines.push(
      'BEGIN:VEVENT',
      `UID:luma-daily-${today}@local`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${dtStart}`,
      'RRULE:FREQ=DAILY',
      `SUMMARY:${summaryText}`,
      'DESCRIPTION:Local reminder created from Luma.',
      'END:VEVENT'
    );
  }

  if (prefs.periodApproaching && summary.prediction.estimatedNextStartDate) {
    const reminderDate = addDaysLocal(
      summary.prediction.estimatedNextStartDate,
      -prefs.periodApproachingDays
    );
    const validDate =
      diffDaysLocal(today, reminderDate) >= 0 ? reminderDate : today;
    const dt = parseLocalDate(validDate);
    const ymdCompact = [
      dt.getFullYear(),
      String(dt.getMonth() + 1).padStart(2, '0'),
      String(dt.getDate()).padStart(2, '0'),
    ].join('');
    const summaryText = prefs.discreetText
      ? 'Luma Check-in Window'
      : 'Luma: Estimated Period Approaching';

    lines.push(
      'BEGIN:VEVENT',
      `UID:luma-period-${validDate}@local`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymdCompact}`,
      `SUMMARY:${summaryText}`,
      'DESCRIPTION:Estimated cycle reminder created locally by Luma.',
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
