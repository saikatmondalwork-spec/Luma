import {
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';

const YMD_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Validates that a string is a real local calendar date in YYYY-MM-DD format.
 * Checks calendar rollover (e.g., rejects 2025-02-29, accepts 2024-02-29).
 */
export function isValidYmd(ymd: string): boolean {
  const match = YMD_PATTERN.exec(ymd);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(year, month - 1, day, 12, 0, 0, 0);
  return (
    dt.getFullYear() === year &&
    dt.getMonth() === month - 1 &&
    dt.getDate() === day
  );
}

/**
 * Parses YYYY-MM-DD strictly as a local calendar date at 12:00 PM local time,
 * avoiding UTC midnight shifts and DST midnight edge cases.
 */
export function parseLocalDate(ymd: string): Date {
  const match = YMD_PATTERN.exec(ymd);
  if (!match) {
    throw new Error(`Invalid YYYY-MM-DD date string: "${ymd}"`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

/**
 * Formats a Date object as YYYY-MM-DD using its local calendar fields.
 */
export function formatLocalDate(date: Date): string {
  const y = String(date.getFullYear()).padStart(4, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Returns today's local calendar date in YYYY-MM-DD format.
 */
export function todayLocalDate(): string {
  return formatLocalDate(new Date());
}

/**
 * Calculates whole calendar days from startYmd to endYmd (end - start).
 * Uses Date.UTC on the Y/M/D components so DST 23h/25h transitions never skew day counts.
 */
export function diffDaysLocal(startYmd: string, endYmd: string): number {
  const s = parseLocalDate(startYmd);
  const e = parseLocalDate(endYmd);
  const utcStart = Date.UTC(s.getFullYear(), s.getMonth(), s.getDate());
  const utcEnd = Date.UTC(e.getFullYear(), e.getMonth(), e.getDate());
  return Math.round((utcEnd - utcStart) / 86_400_000);
}

/**
 * Adds a signed integer number of calendar days to a YYYY-MM-DD local date.
 */
export function addDaysLocal(ymd: string, days: number): string {
  const dt = parseLocalDate(ymd);
  dt.setDate(dt.getDate() + days);
  return formatLocalDate(dt);
}

/**
 * Formats YYYY-MM-DD into a human-friendly local date label.
 */
export function formatDisplayDate(
  ymd: string,
  pattern = 'MMM d, yyyy'
): string {
  if (!isValidYmd(ymd)) return ymd;
  return format(parseLocalDate(ymd), pattern);
}

/**
 * Returns YYYY-MM for a given YYYY-MM-DD date.
 */
export function getMonthKey(ymd: string): string {
  return ymd.slice(0, 7);
}

/**
 * Steps a month anchor YYYY-MM-01 forward or backward by delta months.
 */
export function stepMonthAnchor(anchorYmd: string, delta: number): string {
  const dt = parseLocalDate(anchorYmd);
  const next = delta >= 0 ? addMonths(dt, delta) : subMonths(dt, Math.abs(delta));
  return formatLocalDate(startOfMonth(next));
}

/**
 * Returns all 35 or 42 YYYY-MM-DD cells for a Sunday-start monthly calendar view.
 */
export function getCalendarMonthGrid(monthAnchorYmd: string): string[] {
  const anchor = parseLocalDate(monthAnchorYmd);
  const gridStart = startOfWeek(startOfMonth(anchor), { weekStartsOn: 0 });
  const gridEnd = endOfWeek(endOfMonth(anchor), { weekStartsOn: 0 });

  const days: string[] = [];
  let cursor = formatLocalDate(gridStart);
  const endStr = formatLocalDate(gridEnd);
  while (cursor <= endStr) {
    days.push(cursor);
    cursor = addDaysLocal(cursor, 1);
  }
  return days;
}

export function isDateInRange(
  targetYmd: string,
  startYmd: string,
  endYmd: string
): boolean {
  return targetYmd >= startYmd && targetYmd <= endYmd;
}
