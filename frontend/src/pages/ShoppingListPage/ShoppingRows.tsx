import Emoji from '../../preferences/Emoji';
import { displayQuantity } from '../../preferences/measurements';
import { arrangeLines, shoppingIcon, type Arrangement } from './arrangement';
import { getShoppingUnitLabel as getUnitLabel } from '../../types/units';
import { number, getLanguage } from '../../i18n/i18n';
import { t, useLanguage, message as translateMessage } from '../../i18n/i18n';
import React from 'react';
import { amount, needsReview } from './shopping';
import type { ShoppingState } from './shopping';
import { packageSuggestion, isDeferred } from './companion';
import type { CompanionState, ShoppingLine } from './companion';
import { departmentColor } from './departments';
import { addDays } from '../MealPlanPage/weekUtils';
import { storeLabel } from './storeLabel';

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
  arrangement?: Arrangement;
  onRemove?: (line: ShoppingLine) => void;
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
  useLanguage();
  const { lines, title, mode, companion, basket, disabled, today, period } = props;
  function render(line: ShoppingLine) {
    const pref = companion.preferences[line.id] ?? {};
    const pack = packageSuggestion(line.quantity, line.unit, pref);
    const deferred = isDeferred(companion, line.id, today, period);
    const checked = lineChecked(line, basket);
    const label = `${line.name} ${mode === 'meal' ? t('meal ingredient') : mode === 'low' ? t('low stock') : mode === 'manual' ? t('manual item') : t('shopping item')}`;
    return (
      <article
        key={line.id}
        aria-label={translateMessage(label)}
        style={{
          overflowWrap: 'anywhere',
          minWidth: 0,
          padding: '14px 0',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <div style={{ ...rowWrap, justifyContent: 'space-between' }}>
          <label style={{ ...rowWrap, flexWrap: 'nowrap', minHeight: 44, cursor: 'pointer' }}>
            <input
              type="checkbox"
              aria-label={t('In basket: {0}', line.name)}
              checked={checked}
              disabled={disabled || deferred || (line.quantity === 0 && !line.unknown)}
              onChange={() => props.onCheck(line)}
              style={{ width: 22, height: 22, flexShrink: 0 }}
            />
            <span aria-hidden="true">
              <Emoji>{shoppingIcon(line)}</Emoji>
            </span>
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
              ? t(
                  'Buy {0} {1}',
                  amount(displayQuantity(line.quantity, line.unit)),
                  getUnitLabel(line.unit, line.quantity),
                )
              : line.unknown
                ? t('Quantity to check')
                : mode === 'low'
                  ? t('Threshold reached')
                  : t('In stock')}
          </strong>
          {props.onRemove && (
            <button
              type="button"
              aria-label={t('Remove from shopping list: {0}', line.name)}
              disabled={disabled}
              onClick={() => props.onRemove?.(line)}
              style={{
                ...action,
                background: 'var(--color-danger)',
                color: 'var(--color-danger-text)',
                padding: 8,
              }}
            >
              ✕
            </button>
          )}
        </div>
        {line.meal && (
          <>
            <p style={small}>
              {t('Needed')}{' '}
              {line.meal.unknown && line.meal.needed === 0
                ? t('quantity to check')
                : `${amount(displayQuantity(line.meal.needed, line.unit))} ${getUnitLabel(line.unit, line.quantity)}`}{' '}
              {t('· In inventory for these meals')}{' '}
              {amount(displayQuantity(line.meal.available, line.unit))}{' '}
              {getUnitLabel(line.unit, line.quantity)}
            </p>
          </>
        )}
        <details style={{ marginTop: 8 }}>
          <summary style={{ ...small, minHeight: 44, cursor: 'pointer', padding: '10px 0' }}>
            {t('Details for {0}', line.name)}
          </summary>
          {line.meal && (
            <>
              <div style={rowWrap}>
                {[...new Map(line.meal.contributions.map((c) => [c.planId, c])).values()].map(
                  (c) => (
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
                      {new Date(`${c.date}T12:00:00`).toLocaleDateString(getLanguage(), {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}{' '}
                      · {t(c.mealType)}
                    </span>
                  ),
                )}
              </div>
              {line.meal.warnings.map((w) => (
                <p key={w} style={{ ...small, color: 'var(--color-warning-text)' }}>
                  {translateMessage(w)}
                </p>
              ))}
            </>
          )}
          {line.sources.includes('Restock') && (
            <p style={small}>
              {line.meal
                ? t(
                    'Also low stock · {0} {1} extra to keep',
                    amount(displayQuantity(line.extra, line.unit)),
                    getUnitLabel(line.unit, line.quantity),
                  )
                : t(
                    'Buy {0} {1} to complete',
                    amount(displayQuantity(line.extra, line.unit)),
                    getUnitLabel(line.unit, line.quantity),
                  )}{' '}
              {t('the')} {amount(displayQuantity(line.reserve, line.unit))}{' '}
              {getUnitLabel(line.unit, line.quantity)}{' '}
              {pref.reserve === undefined ? t('threshold') : t('desired stock')}
              {line.meal ? t(' after planned meals.') : '.'}
            </p>
          )}
          {!line.meal && line.sources.includes('Restock') && (
            <p style={small}>{t('General restock')}</p>
          )}
          <p style={small}>
            {line.sources.map((source) => t(source)).join(' · ')} · {storeLabel(line.store)}
            {line.carried ? t(' · Still outstanding from an earlier list') : ''}
          </p>
          {line.notes && <p style={small}>{line.notes}</p>}
          {pack && line.quantity > 0 && (
            <p style={small}>
              {t(
                pack.count === 1 ? '{0} package × {1} {2}' : '{0} packages × {1} {2}',
                pack.count,
                amount(displayQuantity(pref.packageSize!, pref.packageUnit ?? line.unit)),
                getUnitLabel(pref.packageUnit ?? line.unit, pref.packageSize ?? 1),
              )}
              {' · '}
              {amount(displayQuantity(pack.remainder, line.unit))}{' '}
              {getUnitLabel(line.unit, line.quantity)} {t('beyond this list')}{' '}
              {pack.price === undefined
                ? ''
                : t(' · estimated €{0}', number(pack.price, { minimumFractionDigits: 2 }))}
            </p>
          )}
          {pref.packageSize && !pack && (
            <p style={small}>
              {t(
                'Package unit differs. Confirm the package conversion when putting purchases away.',
              )}{' '}
            </p>
          )}
          <div style={rowWrap}>
            <button style={action} onClick={() => props.onPreferences(line)}>
              {t('Product preferences')}{' '}
            </button>
            {line.manualIds.map((id) => (
              <React.Fragment key={id}>
                <button style={action} onClick={() => props.onEditManual(id)}>
                  {t('Edit manual entry')}{' '}
                </button>
                <button style={action} onClick={() => props.onRemoveManual(id)}>
                  {t('Remove manual entry')}{' '}
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
              {t('Skip this trip')}{' '}
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
              {t('Buy next week')}{' '}
            </button>
            <label style={small}>
              {t('Buy on date')}{' '}
              <input
                aria-label={t('Buy on date: {0}', line.name)}
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
              {t('Unavailable here')}{' '}
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
                {t('Try')} {pref.alternativeStore}
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
                {t('Dismiss carried item')}{' '}
              </button>
            )}
          </div>
        </details>
        {needsReview(basket.checked[line.id], line.quantity, line.meal) && (
          <p role="status" style={{ ...small, background: 'var(--color-warning)' }}>
            {t(
              'Needs review — the meals or quantity increased. Check the amount and tick again.',
            )}{' '}
          </p>
        )}
        {checked && (
          <button
            style={{ ...action, background: 'var(--color-mint)', marginTop: 10 }}
            disabled={disabled}
            onClick={() => props.onPurchase(line)}
          >
            {t('Add purchases to inventory')}{' '}
          </button>
        )}
        {deferred && (
          <p style={small}>
            {companion.deferred[line.id].kind === 'later'
              ? t('Buy on {0}', companion.deferred[line.id].until)
              : companion.deferred[line.id].kind === 'skip'
                ? t('Skipped for this period')
                : t('Unavailable at this store')}{' '}
            <button
              style={action}
              onClick={() => {
                const next = { ...companion.deferred };
                delete next[line.id];
                props.onUpdate({ ...companion, deferred: next });
              }}
            >
              {t('Return to list')}{' '}
            </button>
          </p>
        )}
      </article>
    );
  }
  function departments(items: ShoppingLine[]) {
    return arrangeLines(items, props.arrangement ?? 'aisle').map((group) => (
      <section
        key={group.title}
        aria-label={group.title ? `${t(title)}: ${t(group.title)}` : undefined}
      >
        {group.title && (
          <h4
            style={{
              padding: '8px 12px',
              margin: '12px 0 0',
              background: departmentColor(group.title),
              borderRadius: 10,
            }}
          >
            {t(group.title)}
          </h4>
        )}
        {group.lines.map(render)}
      </section>
    ));
  }

  const pending = lines.filter((line) => !lineChecked(line, basket));
  const checked = lines.filter((line) => lineChecked(line, basket));
  return (
    <section aria-label={t(title)} style={card}>
      <h3 style={{ marginBottom: 6 }}>{t(title)}</h3>
      {mode === 'low' && (
        <p style={small}>
          {t(
            'Replenish across all locations. Includes the stock to keep after selected meals.',
          )}{' '}
        </p>
      )}
      {mode === 'shopping'
        ? [...new Set(pending.map((l) => l.store))].sort().map((store) => (
            <section key={store} aria-label={t('Shop at {0}', storeLabel(store))}>
              <h4 style={{ margin: '16px 0 4px' }}>{storeLabel(store)}</h4>
              {departments(pending.filter((l) => l.store === store))}
            </section>
          ))
        : departments(pending)}
      {checked.length > 0 && (
        <details>
          <summary style={{ ...action, marginTop: 12 }}>
            {t('In basket (')}
            {checked.length})
          </summary>
          {departments(checked)}
        </details>
      )}
    </section>
  );
}
