import React, { useState } from 'react';
import { batchBalance, type CookingBatch, type PlannerSnapshot } from '@pantry/domain';
import type { Changes } from './usePlannerWorkspace';
import { t, message, useLanguage } from '../../i18n/i18n';
export default function PreparedBatches({
  state,
  disabled,
  onSave,
}: {
  state: PlannerSnapshot;
  disabled: boolean;
  onSave: (changes: Changes) => Promise<unknown>;
}) {
  useLanguage();
  const [editing, setEditing] = useState<CookingBatch | null>(null);
  const [error, setError] = useState('');
  const batches = state.batches.filter((b) => b.status === 'prepared');
  return (
    <details>
      <summary>
        {t('Prepared batches')} ({batches.length})
      </summary>
      {batches.length === 0 && (
        <p>{t('No prepared batches. Confirm cooking from a planned recipe meal.')}</p>
      )}
      {batches.map((batch) => {
        const balance = batchBalance(batch, state.mealPlans);
        return (
          <section
            key={batch.batchId}
            style={{ padding: 12, borderBottom: '1px solid var(--color-border)' }}
          >
            <strong>{batch.recipeName}</strong> · {batch.preparedDate} · {batch.storage}
            <p>
              {t(
                'Available: {0}. Reserved: {1}. Consumed: {2}. Discarded: {3}.',
                balance.available,
                balance.reserved,
                balance.consumed,
                balance.discarded,
              )}
            </p>
            {batch.useBy && (
              <p>
                {t('Use-by date')}: {batch.useBy}
              </p>
            )}
            <ul>
              {state.mealPlans
                .filter((e) => e.batchId === batch.batchId && !e.consumed)
                .map((e) => (
                  <li key={e.planId}>
                    {e.date} · {t(e.mealType)} · {e.servings ?? 1} {t('servings')}
                  </li>
                ))}
            </ul>
            <button
              disabled={disabled}
              onClick={() => {
                setEditing({ ...batch });
                setError('');
              }}
            >
              {t('Edit prepared batch')}
            </button>
          </section>
        );
      })}
      {editing && (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            try {
              await onSave({ batches: [editing] });
              setEditing(null);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not save planner');
            }
          }}
          style={{ display: 'grid', gap: 12, padding: 12 }}
        >
          <label>
            {t('Actual yield')}{' '}
            <input
              required
              type="number"
              min="0.01"
              step="any"
              value={editing.actualYield}
              onChange={(e) => setEditing({ ...editing, actualYield: Number(e.target.value) })}
            />
          </label>
          <label>
            {t('Total discarded portions')}{' '}
            <input
              required
              type="number"
              min={state.batches.find((b) => b.batchId === editing.batchId)?.discarded ?? 0}
              step="any"
              value={editing.discarded}
              onChange={(e) => setEditing({ ...editing, discarded: Number(e.target.value) })}
            />
          </label>
          <label>
            {t('Storage (for example, fridge or freezer)')}{' '}
            <input
              required
              value={editing.storage}
              onChange={(e) => setEditing({ ...editing, storage: e.target.value })}
            />
          </label>
          <label>
            {t('Use-by date (optional)')}{' '}
            <input
              type="date"
              value={editing.useBy ?? ''}
              onChange={(e) => setEditing({ ...editing, useBy: e.target.value || undefined })}
            />
          </label>
          <p>
            {t(
              'Resolve reservations in their meals before reducing yield or discarding reserved portions.',
            )}
          </p>
          {error && <p role="alert">{message(error)}</p>}
          <button disabled={disabled}>{t('Save')}</button>
          <button type="button" disabled={disabled} onClick={() => setEditing(null)}>
            {t('Cancel')}
          </button>
        </form>
      )}
    </details>
  );
}
