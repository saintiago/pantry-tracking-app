import React, { useCallback, useEffect, useRef, useState } from 'react';
import WeekCalendar from './WeekCalendar';
import AddRecipeDialog from './AddRecipeDialog';
import { addDays, getWeekDates, getWeekStart } from './weekUtils';
import {
  createMealPlan,
  deleteMealPlan,
  fetchMealPlans,
  fetchRecipesForPlanning,
  updateFutureServings,
  type MealPlan,
  type PlannableRecipe,
} from '../../api/meal-plans/meal-plans';
import type { Assignment } from './weekUtils';
import { useRecipeDrag } from './useRecipeDrag';

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
    servings: mp.servings,
  };
}

const MealPlanPage: React.FC = () => {
  const [recipes, setRecipes] = useState<PlannableRecipe[]>([]);
  const [recipeError, setRecipeError] = useState<string | null>(null);
  const [recipesLoading, setRecipesLoading] = useState(true);
  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [servings, setServings] = useState('2');
  const [message, setMessage] = useState('');

  const loadRecipes = useCallback(async () => {
    setRecipesLoading(true);
    setRecipeError(null);
    try {
      const result = await fetchRecipesForPlanning();
      setRecipes(result.recipes);
    } catch (err) {
      setRecipeError(err instanceof Error ? err.message : 'Failed to load recipes');
    } finally {
      setRecipesLoading(false);
    }
  }, []);
  useEffect(() => {
    void loadRecipes();
  }, [loadRecipes]);
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

      const end = addDays(start, 13);

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

  const weekDates = [...getWeekDates(weekStart), ...getWeekDates(addDays(weekStart, 7))];
  const assignments: Assignment[] = mealPlans.map((plan) =>
    toAssignment({
      ...plan,
      servings:
        plan.servings ?? recipes.find((recipe) => recipe.recipeId === plan.recipeId)?.portions,
    }),
  );

  const handleDropRecipe = async (
    recipeId: string,
    date: string,
    mealType: Assignment['mealType'],
  ) => {
    const recipe = recipes.find((entry) => entry.recipeId === recipeId);
    if (!recipe || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setRemoveError(null);
    setMessage('');
    try {
      const result = await createMealPlan({
        date,
        mealType,
        recipeId,
        recipeName: recipe.name,
        servings: recipe.portions ?? 1,
      });
      setMealPlans((previous) => [...previous, result.mealPlan]);
      setSelectedRecipeId('');
      setMessage(`${recipe.name} added to ${mealType} on ${date}.`);
    } catch (err) {
      setRemoveError(
        err instanceof Error ? err.message : 'Failed to add recipe. Please try again.',
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleServings = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(servings);
    if (!Number.isSafeInteger(value) || value < 1 || savingRef.current) return;
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    savingRef.current = true;
    setSaving(true);
    setRemoveError(null);
    setMessage('');
    try {
      const result = await updateFutureServings(today, value);
      setMealPlans((previous) =>
        previous.map((plan) => (plan.date >= today ? { ...plan, servings: value } : plan)),
      );
      setMessage(`Updated ${result.updatedCount} planned meals to ${value} servings.`);
    } catch (err) {
      setRemoveError(
        `${err instanceof Error ? err.message : 'Failed to update servings'}. Please retry to apply the servings to all future meals.`,
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const categories = Array.from(
    new Set(recipes.flatMap((recipe) => (recipe.tags?.length ? recipe.tags : ['Uncategorized']))),
  ).sort((a, b) => a.localeCompare(b));

  // ─── Render ───────────────────────────────────────────────────────────────

  const recipeDrag = useRecipeDrag(handleDropRecipe);

  return (
    <div style={styles.page} ref={recipeDrag.rootRef}>
      {recipeDrag.drag && (
        <div
          data-testid="recipe-drag-preview"
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: recipeDrag.drag.x + 12,
            top: recipeDrag.drag.y + 12,
            zIndex: 2000,
            pointerEvents: 'none',
            padding: '8px 12px',
            borderRadius: 8,
            backgroundColor: 'var(--color-lavender)',
            border: '1px solid var(--color-muted)',
            maxWidth: 220,
            boxShadow: '0 3px 12px #0002',
          }}
        >
          {recipeDrag.drag.name}
        </div>
      )}
      <h1 style={styles.heading}>Meal Planner</h1>
      <form
        onSubmit={handleServings}
        style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}
      >
        <label htmlFor="planner-servings">Servings</label>
        <input
          id="planner-servings"
          type="number"
          min="1"
          step="1"
          required
          value={servings}
          onChange={(event) => setServings(event.target.value)}
          style={{ width: 72, padding: 8 }}
        />
        <button type="submit" disabled={saving} style={styles.retryButton}>
          Update future meals
        </button>
        <span>Applies to all planned meals from today onward.</span>
      </form>
      {message && <p role="status">{message}</p>}

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

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 16 }}>
        <aside
          aria-label="Recipe library"
          style={{
            flex: '1 1 200px',
            minWidth: 0,
            padding: 12,
            backgroundColor: 'var(--color-canvas)',
            borderRadius: 12,
            maxHeight: '50vh',
            overflowY: 'auto',
          }}
        >
          <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Recipes</h2>
          <p>Drag a recipe to a meal, or select it and tap a calendar meal.</p>
          {recipesLoading && <p role="status">Loading recipes…</p>}
          {recipeError && (
            <div role="alert">
              {recipeError}
              <button onClick={loadRecipes}>Retry recipes</button>
            </div>
          )}
          {!recipesLoading && !recipeError && recipes.length === 0 && (
            <p>No recipes yet. Add recipes in the Recipes tab.</p>
          )}
          {!recipesLoading &&
            !recipeError &&
            categories.map((category) => (
              <section key={category} aria-label={category}>
                <h3 style={{ fontSize: '0.875rem', textTransform: 'capitalize' }}>{category}</h3>
                {recipes
                  .filter((recipe) =>
                    (recipe.tags?.length ? recipe.tags : ['Uncategorized']).includes(category),
                  )
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((recipe) => (
                    <button
                      key={recipe.recipeId}
                      type="button"
                      draggable={false}
                      disabled={saving}
                      aria-pressed={selectedRecipeId === recipe.recipeId}
                      onDragStart={(event) => event.preventDefault()}
                      onPointerDown={(event) =>
                        recipeDrag.start(event, recipe.recipeId, recipe.name)
                      }
                      onPointerMove={recipeDrag.move}
                      onPointerUp={recipeDrag.end}
                      onPointerCancel={recipeDrag.cancel}
                      onLostPointerCapture={recipeDrag.cancel}
                      onClick={(event) => {
                        if (event.detail > 0 && recipeDrag.consumeDragClick()) return;
                        setSelectedRecipeId((previous) =>
                          previous === recipe.recipeId ? '' : recipe.recipeId,
                        );
                      }}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: 10,
                        marginBottom: 6,
                        textAlign: 'left',
                        border: '1px solid var(--color-border)',
                        borderRadius: 8,
                        backgroundColor:
                          selectedRecipeId === recipe.recipeId
                            ? 'var(--color-lavender)'
                            : 'var(--color-surface)',
                        cursor: 'grab',
                        touchAction: 'pan-y',
                        userSelect: 'none',
                      }}
                    >
                      {recipe.name}
                    </button>
                  ))}
              </section>
            ))}
        </aside>
        <div style={{ flex: '4 1 650px', minWidth: 0, width: '100%' }}>
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
            onDropRecipe={handleDropRecipe}
            selectedRecipeId={selectedRecipeId}
            saving={saving}
            dragTarget={recipeDrag.drag?.target}
          />
        </div>
      </div>

      {/* Retry control when week fetch failed — Req 2.5, 2.6 */}
      {error && !loading && (
        <div style={styles.retryRow}>
          <button type="button" onClick={() => loadMealPlans(weekStart)} style={styles.retryButton}>
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
    color: 'var(--color-text)',
  },
  removeError: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
    padding: '0.625rem 0.875rem',
    backgroundColor: 'var(--color-danger)',
    border: '1px solid var(--color-danger)',
    borderRadius: 8,
    color: 'var(--color-danger-text)',
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
    color: 'var(--color-danger-text)',
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
    color: 'var(--color-action)',
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-action)',
    borderRadius: 8,
    cursor: 'pointer',
  },
};
