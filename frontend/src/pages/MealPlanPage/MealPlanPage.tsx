import React, { useEffect, useRef, useState } from 'react';
import { entryKcal, type PlannerEntry } from '@pantry/domain';
import { t, message, useLanguage } from '../../i18n/i18n';
import { fetchRecipesForPlanning, type PlannableRecipe } from '../../api/meal-plans/meal-plans';
import RecipeLibrary from './RecipeLibrary';
import RecipeDetail from '../RecipesPage/RecipeDetail';
import RecipeEditor from '../RecipesPage/RecipeEditor';
import type { CookingSession } from '../CookingPage/CookingPage';
import WeekCalendar from './WeekCalendar';
import RecipeDragPreview from './RecipeDragPreview';
import PlannerEntryEditor from './PlannerEntryEditor';
import { usePlannerWorkspace } from './usePlannerWorkspace';
import { useRecipeDrag } from './useRecipeDrag';
import { addDays, getWeekDates, getWeekStart } from './weekUtils';
import PlannerCopies from './PlannerCopies';
import PreparedBatches from './PreparedBatches';

interface Props {
  onShopping?: (selection: { start: string; weeks: number; days: string[] }) => void;
  activeCookingSession?: CookingSession | null;
  onStartCooking?: (id: string, name: string, portions?: number) => void;
  active?: boolean;
}
export default function ExpandedMealPlanner({
  active = true,
  onShopping,
  activeCookingSession,
  onStartCooking,
}: Props) {
  useLanguage();
  const planner = usePlannerWorkspace(active);
  const { state } = planner;
  const [recipes, setRecipes] = useState<PlannableRecipe[]>([]);
  const [recipeError, setRecipeError] = useState('');
  const [recipesLoading, setRecipesLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<string[]>([]);
  const [selected, setSelected] = useState('');
  const [view, setView] = useState<'day' | 'week' | 'two-weeks'>('two-weeks');
  const [week, setWeek] = useState(() => getWeekStart(new Date()));
  const [selectedDay, setSelectedDay] = useState('');
  const [entry, setEntry] = useState<PlannerEntry | null>(null);
  const [detail, setDetail] = useState<{ recipeId: string; planId?: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [remove, setRemove] = useState<PlannerEntry | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [servings, setServings] = useState('2');
  const [notice, setNotice] = useState('');
  const target = useRef<HTMLElement | null>(null);
  const scroll = useRef(0);
  const locked = planner.saving || planner.loading || Boolean(planner.pending);
  const loadRecipes = async () => {
    setRecipesLoading(true);
    setRecipeError('');
    try {
      setRecipes((await fetchRecipesForPlanning()).recipes);
    } catch (err) {
      setRecipeError(err instanceof Error ? err.message : 'Failed to load recipes');
    } finally {
      setRecipesLoading(false);
    }
  };
  useEffect(() => {
    if (active) void loadRecipes();
  }, [active]);
  const restore = () => {
    setDetail(null);
    setEntry(null);
    setEditing(false);
    requestAnimationFrame(() => {
      target.current?.focus({ preventScroll: true });
      const main = document.querySelector('main');
      if (main) main.scrollTop = scroll.current;
    });
  };
  const back = () => {
    if (window.history.state?.plannerDetail || window.history.state?.plannerEntry)
      window.history.back();
    else restore();
  };
  useEffect(() => {
    const pop = (event: PopStateEvent) => {
      if (event.state?.plannerDetail && typeof event.state.plannerDetail === 'object') {
        setDetail(event.state.plannerDetail);
        setEntry(null);
        setEditing(false);
      } else if (event.state?.plannerEntry) {
        setEntry(event.state.plannerEntry);
        setDetail(null);
      } else restore();
    };
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);
  const remember = () => {
    target.current = document.activeElement as HTMLElement;
    scroll.current = document.querySelector('main')?.scrollTop ?? 0;
    window.history.pushState({ plannerDetail: true }, '');
    document.querySelector('main')?.scrollTo(0, 0);
  };
  const openRecipe = (recipeId: string, planId?: string) => {
    remember();
    setEntry(null);
    setDetail({ recipeId, planId });
    window.history.replaceState({ plannerDetail: { recipeId, planId } }, '');
  };
  const openEntry = (value: PlannerEntry) => {
    remember();
    setEntry(value);
    setDetail(null);
    window.history.replaceState({ plannerEntry: value }, '');
  };
  const handleRemove = async (id: string, withDependents = false) => {
    if (locked) return;
    const value = state.mealPlans.find((e) => e.planId === id);
    if (!value) return;
    const batch = state.batches.find((b) => b.sourcePlanId === id);
    const dependents =
      batch?.status === 'planned'
        ? state.mealPlans.filter((e) => e.batchId === batch.batchId && e.planId !== id)
        : [];
    if (dependents.length && !withDependents) {
      setRemove(value);
      return;
    }
    try {
      await planner.mutate(
        {
          removeIds: [id, ...dependents.map((e) => e.planId)],
          removeBatchIds: batch?.status === 'planned' ? [batch.batchId] : [],
        },
        true,
      );
      setRemove(null);
      if (entry?.planId === id) back();
      setNotice('Assignment removed. The saved recipe is unchanged.');
    } catch {
      /* The workspace owns save errors and retry. */
    }
  };
  const drop = async (id: string, date: string, mealType: PlannerEntry['mealType']) => {
    if (locked) return;
    try {
      if (id.startsWith('plan:')) {
        const value = state.mealPlans.find((e) => e.planId === id.slice(5));
        if (!value || (value.date === date && value.mealType === mealType)) return;
        const batch = state.batches.find(
          (b) => b.sourcePlanId === value.planId && b.status === 'planned',
        );
        if (
          batch &&
          state.mealPlans.some((e) => e.batchId === batch.batchId && e.planId !== value.planId) &&
          value.date !== date
        ) {
          openEntry({ ...value, date, mealType });
          setNotice('Choose how to resolve dependent leftovers');
          return;
        }
        await planner.mutate(
          {
            entries: [{ ...value, date, mealType }],
            ...(batch ? { batches: [{ ...batch, cookingDate: date }] } : {}),
          },
          true,
        );
        setNotice('Meal moved.');
      } else {
        const recipe = recipes.find((r) => r.recipeId === id);
        if (!recipe) return;
        await planner.mutate({
          entries: [
            {
              planId: crypto.randomUUID(),
              date,
              mealType,
              recipeId: id,
              recipeName: recipe.name,
              servings: recipe.portions ?? 1,
              entryType: 'recipe',
              createdAt: '',
              updatedAt: '',
            },
          ],
        });
        setSelected('');
        setNotice('Meal added.');
      }
    } catch {
      /* Save errors remain visible until reconciled. */
    }
  };
  const drag = useRecipeDrag(drop, handleRemove);
  const allDates = [...getWeekDates(week), ...getWeekDates(addDays(week, 7))];
  const day = allDates.includes(selectedDay) ? selectedDay : week;
  const dates = view === 'day' ? [day] : view === 'week' ? allDates.slice(0, 7) : allDates;
  const detailPlan = state.mealPlans.find((e) => e.planId === detail?.planId);
  const newEntry = (date: string, mealType: PlannerEntry['mealType'] = 'breakfast') =>
    openEntry({
      planId: crypto.randomUUID(),
      date,
      mealType,
      recipeId: selected,
      recipeName: '',
      entryType: 'recipe',
      createdAt: '',
      updatedAt: '',
    });
  const run = (action: () => Promise<unknown>) => {
    void action().catch(() => undefined);
  };
  const library = (
    <>
      <h2>{t('Recipes')}</h2>
      {recipesLoading && <p role="status">{t('Loading recipes…')}</p>}
      {recipeError && (
        <p role="alert">
          {message(recipeError)} <button onClick={loadRecipes}>{t('Retry recipes')}</button>
        </p>
      )}
      {!recipesLoading && !recipeError && (
        <RecipeLibrary
          recipes={recipes}
          search={search}
          onSearch={setSearch}
          categories={filters}
          onCategories={setFilters}
          selected={selected}
          onSelect={setSelected}
          onOpen={(id) => openRecipe(id)}
          saving={locked}
          plans={state.mealPlans}
          batches={state.batches}
        />
      )}
    </>
  );
  return (
    <>
      <style>{`.planner-layout{display:flex;gap:16px;align-items:flex-start}.planner-library{flex:1 1 240px;max-height:65vh;overflow:auto;background:var(--color-canvas);padding:12px;border-radius:12px;min-width:0}.planner-drawer-button,.planner-return-target{display:none}.planner-calendar{flex:4 1 700px;min-width:0;width:100%}.planner-editor input:not([type=checkbox]),.planner-editor select,.planner-editor textarea{display:block;width:100%;box-sizing:border-box;padding:10px;margin-top:5px}.planner-editor button{min-height:44px}.planner-editor label{display:block}@media(max-width:600px){.planner-layout{display:block}.planner-library{display:none}.planner-library[data-open=true]{display:block;max-height:45vh;margin-bottom:12px}.planner-return-target{display:block}.planner-drawer-button{display:block;min-height:44px}}`}</style>
      <div className="planner-editor">
        {entry && (
          <PlannerEntryEditor
            key={entry.planId}
            entry={entry}
            state={state}
            recipes={recipes}
            disabled={locked}
            onSave={(changes) =>
              planner.mutate(changes, !changes.batches?.some((b) => b.status === 'prepared'))
            }
            onClose={back}
            onRecipe={(id) => openRecipe(id, entry.planId)}
            onRemove={handleRemove}
          />
        )}
        {detail && (
          <div style={{ padding: 16 }}>
            {editing ? (
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
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    disabled={locked}
                    onClick={() => {
                      setDetail(null);
                      setEntry(
                        detailPlan ?? {
                          planId: crypto.randomUUID(),
                          date: day,
                          mealType: 'dinner',
                          recipeId: detail.recipeId,
                          recipeName: '',
                          createdAt: '',
                          updatedAt: '',
                        },
                      );
                    }}
                  >
                    {t(detailPlan ? 'Edit / move meal' : 'Plan this recipe')}
                  </button>
                  {detailPlan && (
                    <button
                      disabled={locked}
                      onClick={() => run(() => handleRemove(detailPlan.planId))}
                    >
                      {t('Remove assignment')}
                    </button>
                  )}
                </div>
                <RecipeDetail
                  recipeId={detail.recipeId}
                  backLabel="Back to meal planner"
                  onBack={back}
                  onEdit={() => setEditing(true)}
                  onDeleted={() => {
                    void loadRecipes();
                    back();
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
                    detailPlan
                      ? async (value) => {
                          await planner.mutate({ entries: [{ ...detailPlan, servings: value }] });
                        }
                      : undefined
                  }
                />
              </>
            )}
          </div>
        )}
      </div>
      <div role="status" style={{ padding: '0 16px' }}>
        {notice && message(notice)}
      </div>
      {planner.error && (
        <div
          role="alert"
          style={{
            margin: 16,
            padding: 12,
            background: 'var(--color-danger)',
            color: 'var(--color-danger-text)',
          }}
        >
          {message(planner.error)}
          {planner.pending ? (
            <>
              <button disabled={planner.saving} onClick={() => run(planner.retry)}>
                {t('Retry pending save')}
              </button>
              <button disabled={planner.saving} onClick={() => run(planner.reconcile)}>
                {t('Refresh and review saved plan')}
              </button>
            </>
          ) : (
            <button onClick={() => run(planner.refresh)}>{t('Retry')}</button>
          )}
        </div>
      )}
      <div
        ref={drag.rootRef}
        style={{ display: detail || entry ? 'none' : 'block', padding: 16, overflowX: 'hidden' }}
      >
        {drag.drag && <RecipeDragPreview drag={drag.drag} />}
        <h1>{t('Meal Planner')}</h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {(['day', 'week', 'two-weeks'] as const).map((mode) => (
            <button key={mode} aria-pressed={view === mode} onClick={() => setView(mode)}>
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
          {onShopping && (
            <button
              onClick={() =>
                onShopping({
                  start: week,
                  weeks: view === 'two-weeks' || day > addDays(week, 6) ? 2 : 1,
                  days: view === 'day' ? [day] : [],
                })
              }
            >
              {t('Shop for these meals')}
            </button>
          )}
          {planner.undo && (
            <button disabled={locked} onClick={() => run(planner.undoChange)}>
              {t('Undo')}
            </button>
          )}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const today = new Date();
            const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            run(async () => {
              const entries = state.mealPlans
                .filter((e) => e.date >= date && !e.batchId)
                .map((e) => ({ ...e, servings: Number(servings) }));
              await planner.mutate({ entries });
              setNotice(`Updated ${entries.length} planned meals to ${servings} servings.`);
            });
          }}
          style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}
        >
          <label>
            {t('Servings')}{' '}
            <input
              type="number"
              required
              min="0.01"
              step="any"
              value={servings}
              onChange={(e) => setServings(e.target.value)}
              style={{ width: 70 }}
            />
          </label>
          <button disabled={locked}>{t('Update future meals')}</button>
          <small>
            {t('Applies to future meals without batch links. Edit batch portions individually.')}
          </small>
        </form>
        <PlannerCopies
          state={state}
          recipes={recipes}
          week={week}
          day={day}
          disabled={locked}
          onSave={planner.mutate}
        />
        <PreparedBatches state={state} disabled={locked} onSave={planner.mutate} />
        <p>
          {t(
            'Daily kcal per person assumes one portion of every listed dish. All planned portions uses the meal quantities. Estimates use current recipe nutrition; prepared batches keep their cooking snapshot.',
          )}
        </p>
        <button
          className="planner-drawer-button"
          aria-expanded={drawer}
          aria-controls="planner-library"
          onClick={() => setDrawer(!drawer)}
        >
          {t('Recipe drawer')}
        </button>
        {drag.drag?.recipeId.startsWith('plan:') && (
          <div
            className="planner-return-target"
            data-remove-drop
            data-drop-disabled={locked ? 'true' : undefined}
            style={{
              position: 'fixed',
              zIndex: 1500,
              bottom: 72,
              left: 12,
              right: 12,
              padding: 18,
              textAlign: 'center',
              background: 'var(--color-danger)',
              color: 'var(--color-danger-text)',
              borderRadius: 12,
              outline:
                drag.drag.target === 'remove' ? '3px solid var(--color-danger-text)' : undefined,
            }}
          >
            {t('Drop here to remove from plan')}
          </div>
        )}
        <div className="planner-layout">
          <aside
            id="planner-library"
            className="planner-library"
            data-open={drawer}
            data-recipe-library
            data-remove-drop
            data-drop-disabled={locked ? 'true' : undefined}
            aria-label={t('Recipe library')}
            style={{
              outline:
                drag.drag?.target === 'remove' ? '3px solid var(--color-danger-text)' : undefined,
            }}
          >
            {library}
          </aside>
          <div className="planner-calendar">
            <WeekCalendar
              weekDates={dates}
              assignments={state.mealPlans.map((e) => ({
                ...e,
                servings:
                  e.servings ?? recipes.find((r) => r.recipeId === e.recipeId)?.portions ?? 1,
                kcalPerPortion: entryKcal(e, state.batches, recipes),
              }))}
              loading={planner.loading}
              error={
                planner.loading ? null : planner.error && !planner.pending ? planner.error : null
              }
              removingPlanIds={new Set(locked ? state.mealPlans.map((e) => e.planId) : [])}
              onPrevWeek={() => setWeek(addDays(week, -7))}
              onNextWeek={() => setWeek(addDays(week, 7))}
              onAddClick={newEntry}
              onRemove={handleRemove}
              onOpen={(id) => {
                const value = state.mealPlans.find((e) => e.planId === id);
                if (value) {
                  if (
                    !value.entryType ||
                    value.entryType === 'recipe' ||
                    value.entryType === 'leftovers'
                  )
                    openRecipe(value.recipeId, id);
                  else openEntry(value);
                }
              }}
              onDropRecipe={drop}
              selectedRecipeId={selected}
              saving={locked}
              dragTarget={drag.drag?.target}
            />
          </div>
        </div>
      </div>
      {remove && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('Resolve dependent leftovers')}
          style={{
            position: 'fixed',
            inset: 20,
            zIndex: 2100,
            background: 'var(--color-surface)',
            border: '2px solid var(--color-border)',
            padding: 20,
            overflow: 'auto',
          }}
        >
          <h2>{t('Resolve dependent leftovers')}</h2>
          <p>
            {t(
              'Removing this cooking assignment also removes its dependent planned leftovers. Prepared food is retained.',
            )}
          </p>
          <ul>
            {state.mealPlans
              .filter((e) => e.batchId === remove.batchId)
              .map((e) => (
                <li key={e.planId}>
                  {e.date} {t(e.mealType)}: {e.recipeName} ({e.servings ?? 1})
                </li>
              ))}
          </ul>
          <button disabled={locked} onClick={() => run(() => handleRemove(remove.planId, true))}>
            {t('Remove cooking and dependent entries')}
          </button>
          <button onClick={() => setRemove(null)}>{t('Cancel')}</button>
        </div>
      )}
    </>
  );
}
