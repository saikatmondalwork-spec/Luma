import { describe, expect, it } from 'vitest';
import {
  addDaysLocal,
  diffDaysLocal,
  formatLocalDate,
  getCalendarMonthGrid,
  isValidYmd,
  parseLocalDate,
} from '@/src/utils/dateUtils';

describe('dateUtils local calendar arithmetic', () => {
  it('validates leap years and invalid calendar rollovers accurately', () => {
    expect(isValidYmd('2024-02-29')).toBe(true); // Leap year
    expect(isValidYmd('2025-02-29')).toBe(false); // Non-leap year
    expect(isValidYmd('2026-04-31')).toBe(false);
    expect(isValidYmd('2026-13-01')).toBe(false);
    expect(isValidYmd('2026-02-28')).toBe(true);
  });

  it('handles month and year boundaries without off-by-one UTC shifts', () => {
    expect(addDaysLocal('2025-12-31', 1)).toBe('2026-01-01');
    expect(addDaysLocal('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDaysLocal('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDaysLocal('2024-02-29', 1)).toBe('2024-03-01');
    expect(addDaysLocal('2025-02-28', 1)).toBe('2025-03-01');

    const parsed = parseLocalDate('2026-05-15');
    expect(formatLocalDate(parsed)).toBe('2026-05-15');
  });

  it('computes exact calendar day differences across DST transitions', () => {
    expect(diffDaysLocal('2026-03-07', '2026-03-09')).toBe(2);
    expect(diffDaysLocal('2026-10-31', '2026-11-03')).toBe(3);
    expect(diffDaysLocal('2024-02-27', '2024-03-02')).toBe(4);
  });

  it('generates complete 7-column calendar grids', () => {
    const grid = getCalendarMonthGrid('2026-02-01');
    expect(grid.length % 7).toBe(0);
    expect(grid).toContain('2026-02-01');
    expect(grid).toContain('2026-02-28');
  });
});
