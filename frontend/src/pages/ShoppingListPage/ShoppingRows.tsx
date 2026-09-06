import React from 'react';
import { amount, needsReview } from './shopping';
import type { ShoppingState } from './shopping';
import { packageSuggestion, isDeferred } from './companion';
import type { CompanionState, ShoppingLine } from './companion';
import { DEPARTMENTS, departmentColor } from './departments';
import { addDays } from '../MealPlanPage/weekUtils';

export const card: React.CSSProperties = {
  padding: 18,
  border: '1px solid var(--color-border)',
  borderRadius: 18,
  background: 'var(--color-surface)',
  marginBottom: 18,
};
export const rowWrap: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'center',
  flexWrap: 'wrap',
};
export const small: React.CSSProperties = {
  color: 'var(--color-secondary)',
  fontSize: 13,
  lineHeight: 1.6,
};
export const action: React.CSSProperties = {
  padding: '10px 14px',
  minHeight: 44,
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  border: '1px solid var(--color-border)',
  borderRadius: 10,
  cursor: 'pointer',
};
export function lineChecked(line: ShoppingLine, basket: ShoppingState): boolean {
  return (
    !!basket.checked[line.id] && !needsReview(basket.checked[line.id], line.quantity, line.meal)
  );
}
interface Props {
  lines: ShoppingLine[];
  title: string;
  mode: 'meal' | 'low' | 'manual' | 'shopping' | 'pending';
  companion: CompanionState;
  basket: ShoppingState;
  disabled: boolean;
  today: string;
  period: string;
  onCheck: (line: ShoppingLine) => void;
  onPurchase: (line: ShoppingLine) => void;
  onPreferences: (line: ShoppingLine) => void;
  onEditManual: (id: string) => void;
  onRemoveManual: (id: string) => void;
  onUpdate: (state: CompanionState) => void;
}
export default function ShoppingRows(props: Props) {
  const { lines, title, mode, companion, basket, disabled, today, period } = props;
  function render(line: ShoppingLine) {
    const pref = companion.preferences[line.id] ?? {};
    const pack = packageSuggestion(line.quantity, line.unit, pref);
    const deferred = isDeferred(companion, line.id, today, period);
    const checked = lineChecked(line, basket);
    const label = `${line.name} ${mode === 'meal' ? 'meal ingredient' : mode === 'low' ? 'low stock' : mode === 'manual' ? 'manual item' : 'shopping item'}`;
    return (
      <article
        key={line.id}
        aria-label={label}
        style={{ padding: '14px 0', borderBottom: '1px solid var(--color-border)' }}
      >
        <div style={{ ...rowWrap, justifyContent: 'space-between' }}>
          <label style={{ ...rowWrap, flexWrap: 'nowrap', minHeight: 44, cursor: 'pointer' }}>
            <input
              type="checkbox"
              aria-label={`In basket: ${line.name}`}
              checked={checked}
              disabled={disabled || deferred || (line.quantity === 0 && !line.unknown)}
              onChange={() => props.onCheck(line)}
              style={{ width: 22, height: 22, flexShrink: 0 }}
            />
            <strong style={{ overflowWrap: 'anywhere' }}>{line.name}</strong>
          </label>
          <strong
            style={{
              padding: '4px 8px',
              borderRadius: 8,
              background: line.quantity > 0 ? 'var(--color-mint)' : 'var(--color-success)',
            }}
          >
            {line.quantity > 0
              ? `Buy ${amount(line.quantity)} ${line.unit}`
              : line.unknown
                ? 'Quantity to check'
                : mode === 'low'
                  ? 'Threshold reached'
                  : 'In stock'}
          </strong>
        </div>
        {line.meal && (
          <>
            <p style={small}>
              Needed{' '}
              {line.meal.unknown && line.meal.needed === 0
                ? 'quantity to check'
                : `${amount(line.meal.needed)} ${line.unit}`}{' '}
              · In inventory for these meals {amount(line.meal.available)} {line.unit}
            </p>
            <div style={rowWrap}>
              {[...new Map(line.meal.contributions.map((c) => [c.planId, c])).values()].map((c) => (
                <span
                  key={c.planId}
                  style={{
                    ...small,
                    padding: '3px 8px',
                    borderRadius: 8,
                    background: 'var(--color-lavender)',
                  }}
                >
                  {c.recipeName} ·{' '}
                  {new Date(`${c.date}T12:00:00`).toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}{' '}
                  · {c.mealType}
                </span>
              ))}
            </div>
            {line.meal.warnings.map((w) => (
              <p key={w} style={{ ...small, color: 'var(--color-warning-text)' }}>
                {w}
              </p>
            ))}
          </>
        )}
        {line.sources.includes('Restock') && (
          <p style={small}>
            {line.meal
              ? `Also low stock · ${amount(line.extra)} ${line.unit} extra to keep`
              : `Buy ${amount(line.extra)} ${line.unit} to complete`}{' '}
            the {amount(line.reserve)} {line.unit}{' '}
            {pref.reserve === undefined ? 'threshold' : 'desired stock'}
            {line.meal ? ' after planned meals.' : '.'}
          </p>
        )}
        {!line.meal && line.sources.includes('Restock') && <p style={small}>General restock</p>}
        <p style={small}>
          {line.sources.join(' · ')} · {line.store}
          {line.carried ? ' · Still outstanding from an earlier list' : ''}
        </p>
        {line.notes && <p style={small}>{line.notes}</p>}
        {pack && line.quantity > 0 && (
          <p style={small}>
            {pack.count} package{pack.count === 1 ? '' : 's'} × {amount(pref.packageSize!)}{' '}
            {pref.packageUnit ?? line.unit} · {amount(pack.remainder)} {line.unit} beyond this list
            {pack.price === undefined ? '' : ` · estimated €${pack.price.toFixed(2)}`}
          </p>
        )}
        {pref.packageSize && !pack && (
          <p style={small}>
            Package unit differs. Confirm the package conversion when putting purchases away.
          </p>
        )}
        {needsReview(basket.checked[line.id], line.quantity, line.meal) && (
          <p role="status" style={{ ...small, background: 'var(--color-warning)' }}>
            Needs review — the meals or quantity increased. Check the amount and tick again.
          </p>
        )}
        {checked && (
          <button
            style={{ ...action, background: 'var(--color-mint)', marginTop: 10 }}
            disabled={disabled}
            onClick={() => props.onPurchase(line)}
          >
            Add purchases to inventory
          </button>
        )}
        {deferred && (
          <p style={small}>
            {companion.deferred[line.id].kind === 'later'
              ? `Buy on ${companion.deferred[line.id].until}`
              : companion.deferred[line.id].kind === 'skip'
                ? 'Skipped for this period'
                : 'Unavailable at this store'}{' '}
            <button
              style={action}
              onClick={() => {
                const next = { ...companion.deferred };
                delete next[line.id];
                props.onUpdate({ ...companion, deferred: next });
              }}
            >
              Return to list
            </button>
          </p>
        )}
        <details style={{ marginTop: 8 }}>
          <summary style={{ ...small, minHeight: 44, cursor: 'pointer', padding: '10px 0' }}>
            Options for {line.name}
          </summary>
          <div style={rowWrap}>
            <button style={action} onClick={() => props.onPreferences(line)}>
              Product preferences
            </button>
            {line.manualIds.map((id) => (
              <React.Fragment key={id}>
                <button style={action} onClick={() => props.onEditManual(id)}>
                  Edit manual entry
                </button>
                <button style={action} onClick={() => props.onRemoveManual(id)}>
                  Remove manual entry
                </button>
              </React.Fragment>
            ))}
            <button
              style={action}
              onClick={() =>
                props.onUpdate({
                  ...companion,
                  deferred: { ...companion.deferred, [line.id]: { kind: 'skip', period } },
                })
              }
            >
              Skip this trip
            </button>
            <button
              style={action}
              onClick={() =>
                props.onUpdate({
                  ...companion,
                  deferred: {
                    ...companion.deferred,
                    [line.id]: { kind: 'later', until: addDays(today, 7) },
                  },
                })
              }
            >
              Buy next week
            </button>
            <label style={small}>
              Buy on date
              <input
                aria-label={`Buy on date: ${line.name}`}
                style={action}
                type="date"
                min={today}
                onChange={(e) => {
                  if (e.target.value)
                    props.onUpdate({
                      ...companion,
                      deferred: {
                        ...companion.deferred,
                        [line.id]: { kind: 'later', until: e.target.value },
                      },
                    });
                }}
              />
            </label>
            <button
              style={action}
              onClick={() =>
                props.onUpdate({
                  ...companion,
                  deferred: { ...companion.deferred, [line.id]: { kind: 'unavailable' } },
                })
              }
            >
              Unavailable here
            </button>
            {pref.alternativeStore && (
              <button
                style={action}
                onClick={() => {
                  const next = { ...companion.deferred };
                  delete next[line.id];
                  props.onUpdate({
                    ...companion,
                    deferred: next,
                    preferences: {
                      ...companion.preferences,
                      [line.id]: {
                        ...pref,
                        store: pref.alternativeStore,
                        alternativeStore: pref.store,
                      },
                    },
                  });
                }}
              >
                Try {pref.alternativeStore}
              </button>
            )}
            {line.carried && (
              <button
                style={action}
                onClick={() => {
                  const carry = { ...companion.carry };
                  delete carry[line.id];
                  props.onUpdate({ ...companion, carry });
                }}
              >
                Dismiss carried item
              </button>
            )}
          </div>
        </details>
      </article>
    );
  }
  function departments(items: ShoppingLine[]) {
    return DEPARTMENTS.map((department) => {
      const section = items.filter((line) => line.department === department);
      return section.length ? (
        <section key={department} aria-label={`${title}: ${department}`}>
          <h4
            style={{
              padding: '8px 12px',
              margin: '12px 0 0',
              background: departmentColor(department),
              borderRadius: 10,
            }}
          >
            {department}
          </h4>
          {section.map(render)}
        </section>
      ) : null;
    });
  }
  const pending = lines.filter((line) => !lineChecked(line, basket));
  const checked = lines.filter((line) => lineChecked(line, basket));
  return (
    <section aria-label={title} style={card}>
      <h3 style={{ marginBottom: 6 }}>{title}</h3>
      {mode === 'low' && (
        <p style={small}>
          Replenish across all locations. Includes the stock to keep after selected meals.
        </p>
      )}
      {mode === 'shopping'
        ? [...new Set(pending.map((l) => l.store))].sort().map((store) => (
            <section key={store} aria-label={`Shop at ${store}`}>
              <h4 style={{ margin: '16px 0 4px' }}>{store}</h4>
              {departments(pending.filter((l) => l.store === store))}
            </section>
          ))
        : departments(pending)}
      {checked.length > 0 && (
        <details>
          <summary style={{ ...action, marginTop: 12 }}>In basket ({checked.length})</summary>
          {departments(checked)}
        </details>
      )}
    </section>
  );
}
