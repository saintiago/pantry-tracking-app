import RecipeDragPreview from './RecipeDragPreview';
import { t, useLanguage, message as translateMessage } from '../../i18n/i18n';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import RecipeLibrary from './RecipeLibrary';
import RecipeDetail from '../RecipesPage/RecipeDetail';
import RecipeEditor from '../RecipesPage/RecipeEditor';
import type { CookingSession } from '../CookingPage/CookingPage';
import WeekCalendar from './WeekCalendar';
import AddRecipeDialog from './AddRecipeDialog';
import { addDays, getWeekDates, getWeekStart } from './weekUtils';
import {
  createMealPlan,
  deleteMealPlan,
  fetchMealPlans,
  fetchRecipesForPlanning,
  updateFutureServings,
  updateMealPlan,
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

interface Props {
  onShopping?: (selection: { start: string; weeks: number; days: string[] }) => void;
  activeCookingSession?: CookingSession | null;
  onStartCooking?: (id: string, name: string, portions?: number) => void;
  active?: boolean;
}
const MealPlanPage: React.FC<Props> = ({
  activeCookingSession,
  onStartCooking,
  active = true,
  onShopping,
}) => {
  useLanguage();
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<string[]>([]);
  const [view, setView] = useState<'day' | 'week' | 'two-weeks'>('two-weeks');
  const [selectedDay, setSelectedDay] = useState('');
  const [detail, setDetail] = useState<{ recipeId: string; planId?: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState<MealPlan | null>(null);
  const returnTarget = useRef<HTMLElement | null>(null);
  const scrollPosition = useRef({ x: 0, y: 0, main: 0 });
  const restorePlanner = useCallback(() => {
    setDetail(null);
    setEditing(false);
    setMoving(null);
    requestAnimationFrame(() => {
      returnTarget.current?.focus({ preventScroll: true });
      window.scrollTo(scrollPosition.current.x, scrollPosition.current.y);
      const main = document.querySelector('main');
      if (main) main.scrollTop = scrollPosition.current.main;
    });
  }, []);
  const backToPlanner = () => {
    if (window.history.state?.plannerDetail || window.history.state?.plannerMove)
      window.history.back();
    else restorePlanner();
  };
  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      if (event.state?.plannerDetail) {
        setDetail(event.state.plannerDetail);
        setEditing(false);
      } else restorePlanner();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [restorePlanner]);
  const openRecipe = (recipeId: string, planId?: string) => {
    returnTarget.current = document.activeElement as HTMLElement;
    scrollPosition.current = {
      x: window.scrollX,
      y: window.scrollY,
      main: document.querySelector('main')?.scrollTop ?? 0,
    };
    const next = { recipeId, planId };
    window.history.pushState({ plannerDetail: next }, '');
    setDetail(next);
    window.scrollTo(0, 0);
    document.querySelector('main')?.scrollTo(0, 0);
  };
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
  const [dialogDate, setDialogDate] = useState<{
    date: string;
    mealType?: Assignment['mealType'];
  } | null>(null);

  // AbortController ref for in-flight week fetches so we can cancel on week change
  const fetchAbortRef = useRef<AbortController | null>(null);

  // ─── Fetch meal plans for the current weekStart ────────────────────────────

  const loadMealPlans = useCallback(
    async (start: string, preserve = false) => {
      // Cancel any previous in-flight fetch
      fetchAbortRef.current?.abort();
      const controller = new AbortController();
      fetchAbortRef.current = controller;

      const end = addDays(start, 13);

      // Clear prior data immediately and show loading — Req 2.2
      if (!preserve) setMealPlans([]);
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

  const previouslyActive = useRef(active);
  useEffect(() => {
    if (active && !previouslyActive.current) {
      void loadMealPlans(weekStart, true);
      void fetchRecipesForPlanning()
        .then((result) => setRecipes(result.recipes))
        .catch((err) =>
          setRecipeError(err instanceof Error ? err.message : 'Failed to load recipes'),
        );
    }
    previouslyActive.current = active;
  }, [active]);

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

  const handleAddClick = useCallback((date: string, mealType?: Assignment['mealType']) => {
    setDialogDate({ date, mealType });
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

  const allDates = [...getWeekDates(weekStart), ...getWeekDates(addDays(weekStart, 7))];
  const day = allDates.includes(selectedDay) ? selectedDay : weekStart;
  const weekDates = view === 'day' ? [day] : view === 'week' ? allDates.slice(0, 7) : allDates;
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

  const detailPlan = detail?.planId ? mealPlans.find((p) => p.planId === detail.planId) : undefined;
  const savePlan = async (planId: string, changes: Parameters<typeof updateMealPlan>[1]) => {
    const result = await updateMealPlan(planId, changes);
    setMealPlans((previous) => previous.map((p) => (p.planId === planId ? result.mealPlan : p)));
  };
  // ─── Render ───────────────────────────────────────────────────────────────

  const recipeDrag = useRecipeDrag(handleDropRecipe);

  return (
    <>
      {detail && (
        <div style={{ padding: 16 }}>
          {editing ? (
            <>
              <button onClick={backToPlanner}>{t('Back to meal planner')}</button>
              <RecipeEditor
                recipeId={detail.recipeId}
                allTags={Array.from(new Set(recipes.flatMap((r) => r.tags ?? [])))}
                tagsLoading={recipesLoading}
                onSaved={() => {
                  setEditing(false);
                  void loadRecipes();
                }}
                onCancel={() => setEditing(false)}
              />
            </>
          ) : (
            <RecipeDetail
              key={detail.recipeId + (detail.planId ?? '')}
              recipeId={detail.recipeId}
              backLabel="Back to meal planner"
              onBack={backToPlanner}
              onEdit={() => setEditing(true)}
              onDeleted={() => {
                void loadRecipes();
                backToPlanner();
              }}
              activeCookingSession={activeCookingSession}
              onStartCooking={onStartCooking}
              plannedMeal={
                detailPlan
                  ? {
                      ...detailPlan,
                      servings:
                        detailPlan.servings ??
                        recipes.find((r) => r.recipeId === detailPlan.recipeId)?.portions ??
                        1,
                    }
                  : undefined
              }
              onSaveServings={
                detailPlan ? (value) => savePlan(detailPlan.planId, { servings: value }) : undefined
              }
            />
          )}
        </div>
      )}
      {moving && (
        <form
          style={{ padding: 16, display: 'grid', gap: 12, maxWidth: 480 }}
          onSubmit={async (e) => {
            e.preventDefault();
            if (savingRef.current) return;
            savingRef.current = true;
            setSaving(true);
            setRemoveError(null);
            try {
              await savePlan(moving.planId, { date: moving.date, mealType: moving.mealType });
              backToPlanner();
            } catch (err) {
              setRemoveError(err instanceof Error ? err.message : 'Failed to update meal');
            } finally {
              savingRef.current = false;
              setSaving(false);
            }
          }}
        >
          <h2>{t('Move {0}', moving.recipeName)}</h2>
          <label>
            {t('Date')}
            <input
              type="date"
              required
              value={moving.date}
              onChange={(e) => setMoving({ ...moving, date: e.target.value })}
            />
          </label>
          <label>
            {t('Meal')}
            <select
              aria-label={t('Meal')}
              value={moving.mealType}
              onChange={(e) =>
                setMoving({ ...moving, mealType: e.target.value as MealPlan['mealType'] })
              }
            >
              {(['breakfast', 'lunch', 'dinner'] as const).map((type) => (
                <option key={type} value={type}>
                  {t(type)}
                </option>
              ))}
            </select>
          </label>
          {removeError && <p role="alert">{translateMessage(removeError)}</p>}
          <button disabled={saving} type="submit">
            {t('Save')}
          </button>
          <button disabled={saving} type="button" onClick={backToPlanner}>
            {t('Cancel')}
          </button>
        </form>
      )}
      <div
        style={{ ...styles.page, display: detail || moving ? 'none' : 'flex' }}
        ref={recipeDrag.rootRef}
      >
        {recipeDrag.drag && <RecipeDragPreview drag={recipeDrag.drag} />}
        <h1 style={styles.heading}>{t('Meal Planner')}</h1>
        {onShopping && (
          <button
            style={styles.retryButton}
            onClick={() =>
              onShopping({
                start: weekStart,
                weeks:
                  view === 'two-weeks' || (view === 'day' && day > addDays(weekStart, 6)) ? 2 : 1,
                days: view === 'day' ? [day] : [],
              })
            }
          >
            {t('Shop for these meals')}
          </button>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {(['day', 'week', 'two-weeks'] as const).map((mode) => (
            <button
              key={mode}
              aria-pressed={view === mode}
              style={{
                ...styles.retryButton,
                background: view === mode ? 'var(--color-mint)' : 'var(--color-surface)',
              }}
              onClick={() => setView(mode)}
            >
              {t(mode === 'day' ? 'Day' : mode === 'week' ? 'Week' : 'Two weeks')}
            </button>
          ))}
          {view === 'day' && (
            <label>
              {t('Selected day')}
              <select value={day} onChange={(e) => setSelectedDay(e.target.value)}>
                {allDates.map((date) => (
                  <option key={date}>{date}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        <form
          onSubmit={handleServings}
          style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}
        >
          <label htmlFor="planner-servings">{t('Servings')}</label>
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
            {t('Update future meals')}{' '}
          </button>
          <span>{t('Applies to all planned meals from today onward.')}</span>
        </form>
        {message && <p role="status">{translateMessage(message)}</p>}

        {/* Remove error banner — Req 5.5 */}
        {removeError && (
          <div role="alert" style={styles.removeError}>
            {translateMessage(removeError)}
            <button
              type="button"
              onClick={() => setRemoveError(null)}
              aria-label={t('Dismiss error')}
              style={styles.dismissButton}
            >
              ×
            </button>
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 16 }}>
          <aside
            aria-label={t('Recipe library')}
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
            <h2 style={{ marginTop: 0, fontSize: '1rem' }}>{t('Recipes')}</h2>

            {recipesLoading && <p role="status">{t('Loading recipes…')}</p>}
            {recipeError && (
              <div role="alert">
                {translateMessage(recipeError)}
                <button onClick={loadRecipes}>{t('Retry recipes')}</button>
              </div>
            )}
            {!recipesLoading && !recipeError && recipes.length === 0 && (
              <p>{t('No recipes yet. Add recipes in the Recipes tab.')}</p>
            )}
            {!recipesLoading && !recipeError && (
              <RecipeLibrary
                recipes={recipes}
                search={search}
                onSearch={setSearch}
                categories={filters}
                onCategories={setFilters}
                selected={selectedRecipeId}
                onSelect={setSelectedRecipeId}
                onOpen={openRecipe}
                saving={saving}
                drag={recipeDrag}
              />
            )}
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
              onOpen={(planId) => {
                const plan = mealPlans.find((p) => p.planId === planId);
                if (plan) openRecipe(plan.recipeId, planId);
              }}
              onMove={(planId) => {
                const plan = mealPlans.find((p) => p.planId === planId);
                if (plan) {
                  returnTarget.current = document.activeElement as HTMLElement;
                  window.history.pushState({ plannerMove: true }, '');
                  setMoving({ ...plan });
                }
              }}
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
            <button
              type="button"
              onClick={() => loadMealPlans(weekStart)}
              style={styles.retryButton}
            >
              {t('Retry')}{' '}
            </button>
          </div>
        )}

        {/* Add Recipe Dialog — Req 4.1 */}
        {dialogDate && (
          <AddRecipeDialog
            date={dialogDate.date}
            initialMealType={dialogDate.mealType}
            onAdd={handleAddSuccess}
            onClose={handleDialogClose}
          />
        )}
      </div>
    </>
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
