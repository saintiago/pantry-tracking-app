import { t, useLanguage, message as translateMessage } from '../../i18n/i18n';
import React from 'react';
import DayColumn from './DayColumn';
import { getMonthYearLabel, groupByDate } from './weekUtils';
import type { Assignment } from './weekUtils';

interface WeekCalendarProps {
  weekDates: string[]; // 7 ISO dates from getWeekDates(weekStart)
  assignments: Assignment[]; // All assignments for this week (flat)
  loading: boolean; // True while fetching
  error: string | null; // Error message if fetch failed
  removingPlanIds: Set<string>; // Plan IDs currently being deleted
  onPrevWeek: () => void; // Navigate to previous week
  onNextWeek: () => void; // Navigate to next week
  onAddClick: (date: string, mealType?: Assignment['mealType']) => void;
  onRemove: (planId: string) => void;
  onOpen?: (planId: string) => void;
  onMove?: (planId: string) => void;
  onDropRecipe?: (recipeId: string, date: string, mealType: Assignment['mealType']) => void;
  selectedRecipeId?: string;
  saving?: boolean;
  dragTarget?: string;
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
  onOpen,
  onMove,
  onDropRecipe,
  selectedRecipeId,
  saving,
  dragTarget,
}) => {
  useLanguage();
  // When there's an error, pass empty arrays to all DayColumns (Req 1.9)
  const grouped = error ? groupByDate([], weekDates) : groupByDate(assignments, weekDates);

  const monthYearLabel = getMonthYearLabel(weekDates);

  return (
    <div style={styles.container}>
      {/* Month/year label for the visible week */}
      <h2 style={styles.monthLabel}>{monthYearLabel}</h2>

      {/* Navigation controls — disabled while loading (Req 3.1, 3.5) */}
      <div style={styles.nav}>
        <button
          type="button"
          onClick={onPrevWeek}
          disabled={loading}
          aria-label={t('Previous week')}
          style={{ ...styles.navButton, ...(loading ? styles.navButtonDisabled : {}) }}
        >
          {t('‹ Prev')}{' '}
        </button>

        {/* Loading indication (Req 1.8) */}
        {loading && (
          <span role="status" aria-live="polite" style={styles.loadingIndicator}>
            {t('Loading…')}{' '}
          </span>
        )}

        <button
          type="button"
          onClick={onNextWeek}
          disabled={loading}
          aria-label={t('Next week')}
          style={{ ...styles.navButton, ...(loading ? styles.navButtonDisabled : {}) }}
        >
          {t('Next ›')}{' '}
        </button>
      </div>

      {/* Error indication — still renders all 7 columns below (Req 1.9) */}
      {error && (
        <div role="alert" style={styles.errorBanner}>
          {translateMessage(error)}
        </div>
      )}

      {/* Seven DayColumns (Req 1.1) */}
      <div
        style={{
          ...styles.columns,
          gridTemplateColumns:
            weekDates.length === 1 ? 'minmax(0, 1fr)' : styles.columns.gridTemplateColumns,
        }}
        data-meal-calendar
      >
        {weekDates.map((date) => (
          <DayColumn
            key={date}
            date={date}
            assignments={grouped[date] ?? []}
            removingPlanIds={removingPlanIds}
            onRemove={onRemove}
            onOpen={onOpen}
            onMove={onMove}
            onAddClick={onAddClick}
            onDropRecipe={onDropRecipe}
            selectedRecipeId={selectedRecipeId}
            saving={saving || loading}
            dragTarget={dragTarget}
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
  monthLabel: {
    margin: 0,
    textAlign: 'center',
    fontSize: '1rem',
    fontWeight: 600,
    color: 'var(--color-text)',
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
    color: 'var(--color-text)',
    backgroundColor: 'var(--color-canvas)',
    border: '1px solid var(--color-border)',
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
    color: 'var(--color-secondary)',
    fontStyle: 'italic',
  },
  errorBanner: {
    padding: '0.625rem 0.875rem',
    backgroundColor: 'var(--color-danger)',
    border: '1px solid var(--color-danger)',
    borderRadius: 8,
    color: 'var(--color-danger-text)',
    fontSize: '0.875rem',
    lineHeight: 1.5,
  },
  columns: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, minmax(115px, 1fr))',
    gap: '0.5rem',
    overflowX: 'auto',
    // Mobile-first: allow horizontal scroll on narrow screens
    WebkitOverflowScrolling: 'touch',
  },
};
