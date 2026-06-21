/**
 * Unit tests for weekUtils pure helpers (non-property cases).
 * Feature: meal-planner
 */
import { getMonthYearLabel, getWeekDates } from '../weekUtils';

describe('getMonthYearLabel', () => {
  it('returns "Month Year" when the week falls within a single month', () => {
    // 2025-06-02 (Mon) … 2025-06-08 (Sun) — all June 2025
    expect(getMonthYearLabel(getWeekDates('2025-06-02'))).toBe('June 2025');
  });

  it('returns a "Month – Month Year" range when the week spans two months', () => {
    // 2025-06-30 (Mon) … 2025-07-06 (Sun)
    expect(getMonthYearLabel(getWeekDates('2025-06-30'))).toBe('June – July 2025');
  });

  it('returns a "Month Year – Month Year" range when the week spans two years', () => {
    // 2025-12-29 (Mon) … 2026-01-04 (Sun)
    expect(getMonthYearLabel(getWeekDates('2025-12-29'))).toBe('December 2025 – January 2026');
  });

  it('returns an empty string when given no dates', () => {
    expect(getMonthYearLabel([])).toBe('');
  });
});
