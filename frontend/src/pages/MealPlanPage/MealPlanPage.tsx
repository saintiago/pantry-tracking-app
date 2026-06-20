import React, { useCallback, useEffect, useRef, useState } from 'react';
import WeekCalendar from './WeekCalendar';
import AddRecipeDialog from './AddRecipeDialog';
import { addDays, getWeekDates, getWeekStart } from './weekUtils';
import { deleteMealPlan, fetchMealPlans, type MealPlan } from '../../api/meal-plans/meal-plans';
import type { Assignment } from './weekUtils';

/**
 * Maps a MealPlan API object to the Assignment interface used by the calendar components.
 */
function toAssignment(mp: MealPlan): Assignment {
  return {
    planId: mp.planId,
    date: mp.date,
    mealType: mp.mealType,
    recipeName: mp.recipeName,
    createdAt: mp.createdAt,
  };
}

const MealPlanPage: React.FC = () => {
  // Current week start (ISO YYYY-MM-DD), initialised to Monday of current week — Req 1.2
  const [weekStart, setWeekStart] = useState<string>(() => getWeekStart(new Date()));

  // Loaded meal plans for the visible week
  const [mealPlans, setMealPlans] = useState<MealPlan[]>([]);

  // Loading / error state for the week fetch
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Error message for a remove operation
  const [removeError, setRemoveError] = useState<string | null>(null);

  // Set of planIds currently being deleted — Req 5.3
  const [removingPlanIds, setRemovingPlanIds] = useState<Set<string>>(new Set());

  // Dialog state: null = closed, { date } = open for that date — Req 4.1
  const [dialogDate, setDialogDate] = useState<{ date: string } | null>(null);

  // AbortController ref for in-flight week fetches so we can cancel on week change
  const fetchAbortRef = useRef<AbortController | null>(null);

  // ─── Fetch meal plans for the current weekStart ────────────────────────────

  const loadMealPlans = useCallback(
    async (start: string) => {
      // Cancel any previous in-flight fetch
      fetchAbortRef.current?.abort();
      const controller = new AbortController();
      fetchAbortRef.current = controller;

      const end = addDays(start, 6);

      // Clear prior data immediately and show loading — Req 2.2
      setMealPlans([]);
      setLoading(true);
      setError(null);
      setRemoveError(null);

      try {
        const data = await fetchMealPlans(start, end);
        if (!controller.signal.aborted) {
          setMealPlans(data.mealPlans); // Req 2.3, 2.4
          setLoading(false);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          // Retain prior state (already cleared above to empty), show error — Req 2.5
          setError(err instanceof Error ? err.message : 'Failed to load meal plans.');
          setLoading(false);
        }
      }
    },
    [], // stable — no external deps
  );

  // Fetch on mount and whenever weekStart changes — Req 2.1
  useEffect(() => {
    loadMealPlans(weekStart);

    return () => {
      fetchAbortRef.current?.abort();
    };
  }, [weekStart, loadMealPlans]);

  // ─── Retry — Req 2.6 ──────────────────────────────────────────────────────
  // WeekCalendar surfaces the error; it needs a retry callback.
  // We re-use loadMealPlans with the current weekStart.
  // WeekCalendar passes the error as a prop; we expose the retry via onRetry.
  // However, WeekCalendar's current API does not have an onRetry prop — the
  // error banner is rendered inside WeekCalendar.  We therefore show the retry
  // control here at the page level, below the calendar, when there's an error.

  // ─── Week navigation — Req 3.2, 3.3, 3.4 ─────────────────────────────────

  const handlePrevWeek = useCallback(() => {
    setWeekStart((prev) => addDays(prev, -7));
  }, []);

  const handleNextWeek = useCallback(() => {
    setWeekStart((prev) => addDays(prev, 7));
  }, []);

  // ─── Add dialog — Req 4.1 ─────────────────────────────────────────────────

  const handleAddClick = useCallback((date: string) => {
    setDialogDate({ date });
    setRemoveError(null);
  }, []);

  const handleDialogClose = useCallback(() => {
    setDialogDate(null);
  }, []);

  // Called by AddRecipeDialog on successful POST — Req 4.7
  const handleAddSuccess = useCallback((newMealPlan: MealPlan) => {
    setMealPlans((prev) => [...prev, newMealPlan]);
    setDialogDate(null);
  }, []);

  // ─── Remove — Req 5.1–5.7 ─────────────────────────────────────────────────

  const handleRemove = useCallback(
    async (planId: string) => {
      // Disable the button immediately — Req 5.3
      setRemovingPlanIds((prev) => new Set(prev).add(planId));
      setRemoveError(null);

      try {
        await deleteMealPlan(planId);
        // On success, refresh from server (source of truth) — Req 5.4
        await loadMealPlans(weekStart);
      } catch (err) {
        // On failure: keep card, re-enable button, show error — Req 5.5, 5.6, 5.7
        setRemovingPlanIds((prev) => {
          const next = new Set(prev);
          next.delete(planId);
          return next;
        });
        setRemoveError(
          err instanceof Error ? err.message : 'Failed to remove assignment. Please try again.',
        );
      }
    },
    [weekStart, loadMealPlans],
  );

  // ─── Derived values ───────────────────────────────────────────────────────

  const weekDates = getWeekDates(weekStart);
  const assignments: Assignment[] = mealPlans.map(toAssignment);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={styles.page}>
      <h1 style={styles.heading}>Meal Planner</h1>

      {/* Remove error banner — Req 5.5 */}
      {removeError && (
        <div role="alert" style={styles.removeError}>
          {removeError}
          <button
            type="button"
            onClick={() => setRemoveError(null)}
            aria-label="Dismiss error"
            style={styles.dismissButton}
          >
            ×
          </button>
        </div>
      )}

      <WeekCalendar
        weekDates={weekDates}
        assignments={assignments}
        loading={loading}
        error={error}
        removingPlanIds={removingPlanIds}
        onPrevWeek={handlePrevWeek}
        onNextWeek={handleNextWeek}
        onAddClick={handleAddClick}
        onRemove={handleRemove}
      />

      {/* Retry control when week fetch failed — Req 2.5, 2.6 */}
      {error && !loading && (
        <div style={styles.retryRow}>
          <button
            type="button"
            onClick={() => loadMealPlans(weekStart)}
            style={styles.retryButton}
          >
            Retry
          </button>
        </div>
      )}

      {/* Add Recipe Dialog — Req 4.1 */}
      {dialogDate && (
        <AddRecipeDialog
          date={dialogDate.date}
          onAdd={handleAddSuccess}
          onClose={handleDialogClose}
        />
      )}
    </div>
  );
};

export default MealPlanPage;

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    padding: '1rem',
    maxWidth: '100%',
    overflowX: 'hidden',
  },
  heading: {
    margin: 0,
    fontSize: '1.25rem',
    fontWeight: 700,
    color: '#111827',
  },
  removeError: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
    padding: '0.625rem 0.875rem',
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 8,
    color: '#dc2626',
    fontSize: '0.875rem',
    lineHeight: 1.5,
  },
  dismissButton: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
    padding: 0,
    fontSize: '1.125rem',
    lineHeight: 1,
    color: '#dc2626',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
  },
  retryRow: {
    display: 'flex',
    justifyContent: 'center',
    paddingTop: '0.25rem',
  },
  retryButton: {
    padding: '0.5rem 1.5rem',
    fontSize: '0.9375rem',
    fontWeight: 500,
    color: '#1d4ed8',
    backgroundColor: '#ffffff',
    border: '1px solid #1d4ed8',
    borderRadius: 8,
    cursor: 'pointer',
  },
};
