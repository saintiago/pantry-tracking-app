import React, { useState } from 'react';
import {
  batchBalance,
  type CookingBatch,
  type PlannerEntry,
  type PlannerSnapshot,
  type EntryType,
} from '@pantry/domain';
import { t, message, useLanguage } from '../../i18n/i18n';
import type { PlannableRecipe } from '../../api/meal-plans/meal-plans';
import type { Changes } from './usePlannerWorkspace';
import { addDays } from './weekUtils';
const formStyle: React.CSSProperties = {
  padding: 16,
  display: 'grid',
  gap: 14,
  maxWidth: 600,
  margin: '0 auto',
};
export default function PlannerEntryEditor({
  entry,
  state,
  recipes,
  disabled,
  onSave,
  onClose,
  onRecipe,
  onRemove,
}: {
  entry: PlannerEntry;
  state: PlannerSnapshot;
  recipes: PlannableRecipe[];
  disabled: boolean;
  onSave: (changes: Changes) => Promise<unknown>;
  onClose: () => void;
  onRecipe: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  useLanguage();
  const [value, setValue] = useState({
    ...entry,
    servings: entry.servings ?? recipes.find((r) => r.recipeId === entry.recipeId)?.portions ?? 1,
  });
  const existingBatch = state.batches.find((b) => b.batchId === entry.batchId);
  const original = state.mealPlans.find((e) => e.planId === entry.planId) ?? entry;
  const sourceBatch = existingBatch?.sourcePlanId === entry.planId ? existingBatch : undefined;
  const [batch, setBatch] = useState<CookingBatch | undefined>(sourceBatch);
  const [batchEnabled, setBatchEnabled] = useState(Boolean(sourceBatch));
  const [resolution, setResolution] = useState<'none' | 'move' | 'remove'>('none');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const type = value.entryType ?? 'recipe';
  const recipe = recipes.find((r) => r.recipeId === value.recipeId);
  const linked = state.batches.find((b) => b.batchId === value.batchId);
  const dependents = state.mealPlans.filter(
    (e) => e.batchId === sourceBatch?.batchId && sourceBatch && e.planId !== entry.planId,
  );
  const balance = linked ? batchBalance(linked, state.mealPlans) : undefined;
  const update = (fields: Partial<typeof value>) =>
    setValue((previous) => ({ ...previous, ...fields }));
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || disabled) return;
    setBusy(true);
    setError('');
    try {
      let next: PlannerEntry = { ...value };
      const changes: Changes = { entries: [next] };
      if (type === 'recipe') {
        if (!recipe) throw new Error('Recipe unavailable. Select an available recipe.');
        next.recipeName = recipe.name;
        if (batchEnabled) {
          if (!batch) throw new Error('Enter the batch details');
          const cookingBatch = {
            ...batch,
            recipeId: recipe.recipeId,
            recipeName: recipe.name,
            cookingDate: value.date,
            sourcePlanId: value.planId,
          };
          if (sourceBatch?.status !== 'prepared' && cookingBatch.status === 'prepared')
            cookingBatch.kcalPerPortion =
              recipe.totalKcal === undefined
                ? undefined
                : recipe.totalKcal / (recipe.portions ?? 1);
          next.batchId = cookingBatch.batchId;
          changes.batches = [cookingBatch];
          if (dependents.length && value.date !== original.date) {
            if (resolution === 'none') throw new Error('Choose how to resolve dependent leftovers');
            if (resolution === 'remove')
              changes.removeIds = dependents.filter((e) => !e.consumed).map((e) => e.planId);
            else {
              const offset = Math.round(
                (new Date(value.date).getTime() - new Date(original.date).getTime()) / 86400000,
              );
              changes.entries!.push(
                ...dependents.map((e) => ({ ...e, date: addDays(e.date, offset) })),
              );
            }
          }
        } else {
          delete next.batchId;
          if (sourceBatch) changes.removeBatchIds = [sourceBatch.batchId];
        }
      } else if (type === 'leftovers') {
        if (!linked) throw new Error('Select a source batch');
        next.recipeId = linked.recipeId;
        next.recipeName = linked.recipeName;
      } else {
        next = { ...next, recipeId: '' };
        delete next.batchId;
        changes.entries![0] = next;
      }
      await onSave(changes);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save planner');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save} style={formStyle} aria-label={t('Meal entry')}>
      <h2>
        {t(state.mealPlans.some((e) => e.planId === entry.planId) ? 'Edit meal' : 'Add meal')}
      </h2>
      <fieldset
        disabled={disabled || busy}
        style={{ display: 'grid', gap: 14, border: 0, padding: 0, minWidth: 0 }}
      >
        <label>
          {t('Entry type')}
          <select
            value={type}
            disabled={Boolean(entry.batchId)}
            onChange={(e) =>
              update({
                entryType: e.target.value as EntryType,
                recipeId: '',
                recipeName: '',
                batchId: undefined,
              })
            }
          >
            {(['recipe', 'leftovers', 'eating-out', 'custom', 'leftovers-note'] as const).map(
              (v) => (
                <option key={v} value={v}>
                  {t(v)}
                </option>
              ),
            )}
          </select>
        </label>
        <label>
          {t('Date')}
          <input
            type="date"
            required
            value={value.date}
            onChange={(e) => update({ date: e.target.value })}
          />
        </label>
        <label>
          {t('Meal')}
          <select
            value={value.mealType}
            onChange={(e) => update({ mealType: e.target.value as PlannerEntry['mealType'] })}
          >
            {(['breakfast', 'lunch', 'dinner'] as const).map((v) => (
              <option key={v} value={v}>
                {t(v)}
              </option>
            ))}
          </select>
        </label>
        {type === 'recipe' && (
          <label>
            {t('Recipe')}
            <select
              required
              value={value.recipeId}
              disabled={sourceBatch?.status === 'prepared'}
              onChange={(e) => update({ recipeId: e.target.value })}
            >
              <option value="">{t('Select a recipe')}</option>
              {recipes.map((r) => (
                <option key={r.recipeId} value={r.recipeId}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {type === 'leftovers' && (
          <>
            <label>
              {t('Source batch')}
              <select
                required
                value={value.batchId ?? ''}
                disabled={value.consumed}
                onChange={(e) => update({ batchId: e.target.value })}
              >
                <option value="">{t('Select a source batch')}</option>
                {state.batches.map((b) => (
                  <option key={b.batchId} value={b.batchId}>
                    {b.recipeName} · {b.preparedDate ?? b.cookingDate} · {t(b.status)}
                  </option>
                ))}
              </select>
            </label>
            {linked && balance && (
              <p>
                {t(
                  'Available: {0}. Reserved: {1}. Consumed: {2}. Discarded: {3}.',
                  balance.available,
                  balance.reserved,
                  balance.consumed,
                  balance.discarded,
                )}
              </p>
            )}
            {linked?.useBy && value.date > linked.useBy && (
              <p role="status">
                {t('This meal is after the recorded use-by date: {0}.', linked.useBy)}
              </p>
            )}
          </>
        )}
        {!['recipe', 'leftovers'].includes(type) && (
          <label>
            {t('Title')}
            <input
              required
              maxLength={1000}
              value={value.recipeName}
              onChange={(e) => update({ recipeName: e.target.value })}
            />
          </label>
        )}
        <label>
          {t('Portions for this meal')}
          <input
            type="number"
            required
            min="0.01"
            step="any"
            disabled={value.consumed}
            value={value.servings}
            onChange={(e) => update({ servings: Number(e.target.value) })}
          />
        </label>
        <label>
          {t('Notes')}
          <textarea
            maxLength={10000}
            value={value.notes ?? ''}
            onChange={(e) => update({ notes: e.target.value })}
          />
        </label>
        {!['recipe', 'leftovers'].includes(type) && (
          <label>
            {t('Estimated kcal/portion (optional)')}
            <input
              type="number"
              min="0"
              step="any"
              value={value.kcalPerPortion ?? ''}
              onChange={(e) =>
                update({
                  kcalPerPortion: e.target.value === '' ? undefined : Number(e.target.value),
                })
              }
            />
          </label>
        )}
        {type === 'leftovers-note' && (
          <p>{t('Unlinked note: no tracked food reservation or shopping demand.')}</p>
        )}
        {type === 'recipe' && (
          <label>
            <input
              type="checkbox"
              checked={batchEnabled}
              disabled={Boolean(sourceBatch)}
              onChange={(e) => {
                setBatchEnabled(e.target.checked);
                if (!batch)
                  setBatch({
                    batchId: crypto.randomUUID(),
                    sourcePlanId: entry.planId,
                    recipeId: value.recipeId,
                    recipeName: recipe?.name ?? '',
                    cookingDate: value.date,
                    plannedYield: value.servings,
                    status: 'planned',
                    consumed: 0,
                    discarded: 0,
                  });
              }}
            />
            {t('Plan batch cooking')}
          </label>
        )}
        {batchEnabled && batch && (
          <>
            <label>
              {t('Total portions to prepare')}
              <input
                type="number"
                min="0.01"
                step="any"
                required
                value={batch.plannedYield}
                onChange={(e) => setBatch({ ...batch, plannedYield: Number(e.target.value) })}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={batch.status === 'prepared'}
                disabled={sourceBatch?.status === 'prepared'}
                onChange={(e) =>
                  setBatch({
                    ...batch,
                    status: e.target.checked ? 'prepared' : 'planned',
                    actualYield: batch.plannedYield,
                    preparedDate: value.date,
                  })
                }
              />
              {t('Confirm batch as cooked')}
            </label>
            <p>{t('Confirming cooking records prepared food. Raw inventory is not deducted.')}</p>
            {batch.status === 'prepared' && (
              <>
                <label>
                  {t('Actual yield')}
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    required
                    value={batch.actualYield ?? ''}
                    onChange={(e) => setBatch({ ...batch, actualYield: Number(e.target.value) })}
                  />
                </label>
                <label>
                  {t('Preparation date')}
                  <input
                    type="date"
                    required
                    value={batch.preparedDate ?? ''}
                    onChange={(e) => setBatch({ ...batch, preparedDate: e.target.value })}
                  />
                </label>
                <label>
                  {t('Storage (for example, fridge or freezer)')}
                  <input
                    required
                    maxLength={200}
                    value={batch.storage ?? ''}
                    onChange={(e) => setBatch({ ...batch, storage: e.target.value })}
                  />
                </label>
                <label>
                  {t('Use-by date (optional)')}
                  <input
                    type="date"
                    value={batch.useBy ?? ''}
                    onChange={(e) => setBatch({ ...batch, useBy: e.target.value || undefined })}
                  />
                </label>
                <label>
                  {t('Total discarded portions')}
                  <input
                    type="number"
                    min={sourceBatch?.discarded ?? 0}
                    step="any"
                    required
                    value={batch.discarded}
                    onChange={(e) => setBatch({ ...batch, discarded: Number(e.target.value) })}
                  />
                </label>
                <p>{t('Consumed portions: {0}', batch.consumed)}</p>
              </>
            )}
          </>
        )}
        {(linked?.status === 'prepared' || batch?.status === 'prepared') && (
          <label>
            <input
              type="checkbox"
              checked={value.consumed ?? false}
              disabled={entry.consumed}
              onChange={(e) => update({ consumed: e.target.checked })}
            />
            {t('Mark these portions eaten')}
          </label>
        )}
        {dependents.length > 0 && (
          <div>
            <p>
              {t('Dependent leftovers')}:{' '}
              {dependents.map((e) => `${e.date}: ${e.servings ?? 1}`).join(', ')}
            </p>
            <label>
              {t('When moving the cooking date')}
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value as typeof resolution)}
              >
                <option value="none">{t('Choose a resolution')}</option>
                <option value="move">{t('Move linked meals by the same number of days')}</option>
                <option value="remove">{t('Remove dependent planned entries')}</option>
              </select>
            </label>
          </div>
        )}
        {error && <p role="alert">{message(error)}</p>}
        <button type="submit">{t('Save')}</button>
        {value.recipeId && (
          <button type="button" onClick={() => onRecipe(value.recipeId)}>
            {t('Open recipe')}
          </button>
        )}
        {state.mealPlans.some((e) => e.planId === entry.planId) && (
          <button type="button" onClick={() => onRemove(entry.planId)}>
            {t('Remove assignment')}
          </button>
        )}
      </fieldset>
      <button type="button" disabled={busy} onClick={onClose}>
        {t('Back to meal planner')}
      </button>
    </form>
  );
}
