import React, { useState } from 'react';
import type { FavoriteWeek, PlannerSnapshot } from '@pantry/domain';
import type { PlannableRecipe } from '../../api/meal-plans/meal-plans';
import { favoriteFromRange, previewCopy } from '../../domain/recipes/planner-copy';
import type { Changes } from './usePlannerWorkspace';
import { t, message, useLanguage } from '../../i18n/i18n';
import { addDays } from './weekUtils';
export default function PlannerCopies({
  state,
  recipes,
  week,
  day,
  disabled,
  onSave,
}: {
  state: PlannerSnapshot;
  recipes: PlannableRecipe[];
  week: string;
  day: string;
  disabled: boolean;
  onSave: (changes: Changes) => Promise<unknown>;
}) {
  useLanguage();
  const [source, setSource] = useState('week');
  const [destination, setDestination] = useState(addDays(week, 7));
  const [name, setName] = useState('');
  const [preview, setPreview] = useState<ReturnType<typeof previewCopy> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [saved, setSaved] = useState('');
  const template = (): FavoriteWeek =>
    source === 'day' || source === 'week'
      ? favoriteFromRange(
          state,
          source === 'day' ? day : week,
          source === 'day' ? day : addDays(week, 6),
          name.trim(),
          crypto.randomUUID(),
        )
      : state.favorites.find((f) => f.favoriteId === source)!;
  const apply = async (changes: Changes) => {
    setBusy(true);
    setError('');
    try {
      await onSave(changes);
      setPreview(null);
      setSaved('Saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save planner');
    } finally {
      setBusy(false);
    }
  };
  const saveFavorite = () => {
    const value = template();
    if (!name.trim()) {
      setError('Enter a favorite week name');
      return;
    }
    const checked = previewCopy(value, week, recipes, () => crypto.randomUUID());
    if (checked.warnings.length) {
      setError(checked.warnings.join('. '));
      return;
    }
    void apply({ favorites: [{ ...value, name: name.trim() }] });
  };
  return (
    <details style={{ padding: '10px 0' }}>
      <summary>{t('Copy plans / Favorite weeks')}</summary>
      <fieldset
        disabled={disabled || busy}
        style={{ display: 'flex', flexWrap: 'wrap', gap: 10, border: 0, padding: '10px 0' }}
      >
        <label>
          {t('Copy from')}{' '}
          <select
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setPreview(null);
            }}
          >
            <option value="day">
              {t('Copy day')} ({day})
            </option>
            <option value="week">
              {t('Copy week')} ({week})
            </option>
            {state.favorites.map((f) => (
              <option key={f.favoriteId} value={f.favoriteId}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('Destination start date')}{' '}
          <input
            type="date"
            required
            value={destination}
            onChange={(e) => {
              setDestination(e.target.value);
              setPreview(null);
            }}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            if (!destination) return;
            setPreview(previewCopy(template(), destination, recipes, () => crypto.randomUUID()));
            setRevision(state.revision);
          }}
        >
          {t('Preview copy')}
        </button>
        <label>
          {t('Favorite week name')}{' '}
          <input maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="button" onClick={saveFavorite}>
          {t(source === 'day' || source === 'week' ? 'Save favorite week' : 'Rename favorite week')}
        </button>
        {source !== 'day' && source !== 'week' && (
          <>
            <button
              type="button"
              onClick={() => {
                const previous = state.favorites.find((f) => f.favoriteId === source)!;
                const updated = favoriteFromRange(
                  state,
                  week,
                  addDays(week, 6),
                  previous.name,
                  previous.favoriteId,
                );
                const check = previewCopy(updated, week, recipes, () => crypto.randomUUID());
                if (check.warnings.length) setError(check.warnings.join('. '));
                else void apply({ favorites: [updated] });
              }}
            >
              {t('Update favorite from visible week')}
            </button>
            <button
              type="button"
              onClick={() => {
                void apply({ removeFavoriteIds: [source] });
                setSource('week');
              }}
            >
              {t('Delete favorite week')}
            </button>
          </>
        )}
      </fieldset>
      {error && <p role="alert">{message(error)}</p>}
      {saved && <p role="status">{t(saved)}</p>}
      {preview && (
        <section
          aria-label={t('Copy preview')}
          style={{ border: '1px solid var(--color-border)', padding: 12 }}
        >
          <p>{t('Adds independent entries. Existing destination meals remain unchanged.')}</p>
          {state.revision !== revision && (
            <p role="alert">{t('The planner changed. Preview the copy again.')}</p>
          )}
          {preview.warnings.map((warning, index) => (
            <p key={index} role="alert">
              {message(warning)}
            </p>
          ))}
          <ul>
            {preview.entries.map((e) => (
              <li key={e.planId}>
                {e.date} · {t(e.mealType)} · {e.recipeName} · {e.servings ?? 1} {t('servings')}
                {state.mealPlans.some((p) => p.date === e.date && p.mealType === e.mealType)
                  ? ` · ${t('Adds to occupied meal')}`
                  : ''}
              </li>
            ))}
          </ul>
          {preview.warnings.length > 0 && (
            <p>
              {t(
                'Include the cooking source or edit the source plan before copying. Unavailable recipes must be replaced first.',
              )}
            </p>
          )}
          <button
            disabled={
              disabled ||
              busy ||
              preview.warnings.length > 0 ||
              state.revision !== revision ||
              !preview.entries.length
            }
            onClick={() => void apply({ entries: preview.entries, batches: preview.batches })}
          >
            {t('Apply copy')}
          </button>
          <button onClick={() => setPreview(null)}>{t('Cancel')}</button>
        </section>
      )}
    </details>
  );
}
