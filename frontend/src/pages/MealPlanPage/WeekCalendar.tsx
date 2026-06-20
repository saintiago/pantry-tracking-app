import React from 'react';
import DayColumn from './DayColumn';
import { groupByDate } from './weekUtils';
import type { Assignment } from './weekUtils';

interface WeekCalendarProps {
  weekDates: string[]; // 7 ISO dates from getWeekDates(weekStart)
  assignments: Assignment[]; // All assignments for this week (flat)
  loading: boolean; // True while fetching
  error: string | null; // Error message if fetch failed
  removingPlanIds: Set<string>; // Plan IDs currently being deleted
  onPrevWeek: () => void; // Navigate to previous week
  onNextWeek: () => void; // Navigate to next week
  onAddClick: (date: string) => void;
  onRemove: (planId: string) => void;
}

const WeekCalendar: React.FC<WeekCalendarProps> = ({
  weekDates,
  assignments,
  loading,
  error,
  removingPlanIds,
  onPrevWeek,
  onNextWeek,
  onAddClick,
  onRemove,
}) => {
  // When there's an error, pass empty arrays to all DayColumns (Req 1.9)
  const grouped = error ? groupByDate([], weekDates) : groupByDate(assignments, weekDates);

  return (
    <div style={styles.container}>
      {/* Navigation controls — disabled while loading (Req 3.1, 3.5) */}
      <div style={styles.nav}>
        <button
          type="button"
          onClick={onPrevWeek}
          disabled={loading}
          aria-label="Previous week"
          style={{ ...styles.navButton, ...(loading ? styles.navButtonDisabled : {}) }}
        >
          ‹ Prev
        </button>

        {/* Loading indication (Req 1.8) */}
        {loading && (
          <span role="status" aria-live="polite" style={styles.loadingIndicator}>
            Loading…
          </span>
        )}

        <button
          type="button"
          onClick={onNextWeek}
          disabled={loading}
          aria-label="Next week"
          style={{ ...styles.navButton, ...(loading ? styles.navButtonDisabled : {}) }}
        >
          Next ›
        </button>
      </div>

      {/* Error indication — still renders all 7 columns below (Req 1.9) */}
      {error && (
        <div role="alert" style={styles.errorBanner}>
          {error}
        </div>
      )}

      {/* Seven DayColumns (Req 1.1) */}
      <div style={styles.columns}>
        {weekDates.map((date) => (
          <DayColumn
            key={date}
            date={date}
            assignments={grouped[date] ?? []}
            removingPlanIds={removingPlanIds}
            onRemove={onRemove}
            onAddClick={onAddClick}
          />
        ))}
      </div>
    </div>
  );
};

export default WeekCalendar;

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    width: '100%',
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
    paddingBottom: '0.25rem',
  },
  navButton: {
    padding: '0.375rem 0.75rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: '#374151',
    backgroundColor: '#f9fafb',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    cursor: 'pointer',
    minHeight: 36,
    transition: 'opacity 0.15s',
  },
  navButtonDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  loadingIndicator: {
    flex: 1,
    textAlign: 'center',
    fontSize: '0.875rem',
    color: '#6b7280',
    fontStyle: 'italic',
  },
  errorBanner: {
    padding: '0.625rem 0.875rem',
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 8,
    color: '#dc2626',
    fontSize: '0.875rem',
    lineHeight: 1.5,
  },
  columns: {
    display: 'flex',
    flexDirection: 'row',
    gap: '0.5rem',
    overflowX: 'auto',
    // Mobile-first: allow horizontal scroll on narrow screens
    WebkitOverflowScrolling: 'touch',
  },
};
