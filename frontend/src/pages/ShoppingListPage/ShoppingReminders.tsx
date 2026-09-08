import { displayQuantity } from '../../preferences/measurements';
import React from 'react';
import { t, date, getLanguage, useLanguage } from '../../i18n/i18n';
import { getShoppingUnitLabel as getUnitLabel } from '../../types/units';
import type { ShoppingData } from '../../api/shopping-list/types';
import { amount } from './shopping';
import { purchaseCadence, type CompanionState } from './companion';
import { card as panel, small as muted } from './ShoppingRows';
import { addDays } from '../MealPlanPage/weekUtils';
export default function ShoppingReminders({
  items,
  companion,
  today,
}: {
  items: ShoppingData['items'];
  companion: CompanionState;
  today: string;
}) {
  useLanguage();
  return (
    <details style={panel}>
      <summary style={{ minHeight: 44, cursor: 'pointer' }}>
        {t('Pantry reminders & purchase history')}{' '}
      </summary>
      {items
        .filter(
          (i) =>
            i.quantity > 0 &&
            i.expirationDate !== null &&
            i.expirationDate >= today &&
            i.expirationDate <= addDays(today, 3),
        )
        .map((i) => (
          <p key={i.itemId} style={{ ...muted, padding: 8, background: 'var(--color-warning)' }}>
            {t('Use')} {i.name} {t('soon · expires')} {date(i.expirationDate ?? '')}
            {i.locationDetails ? ` · ${i.locationDetails}` : ''}
          </p>
        ))}
      {!items.some(
        (i) =>
          i.quantity > 0 &&
          i.expirationDate !== null &&
          i.expirationDate >= today &&
          i.expirationDate <= addDays(today, 3),
      ) && <p style={muted}>{t('No recorded stock expires in the next three days.')}</p>}
      {purchaseCadence(companion.history).map((pattern) => (
        <p key={pattern.id} style={muted}>
          {pattern.name}
          {t(': bought about every')} {pattern.interval} {t('days across')} {pattern.count}{' '}
          {t(
            'purchase dates. This is a shopping-history reminder; check your current stock before adding more.',
          )}{' '}
        </p>
      ))}
      {companion.history
        .slice(-10)
        .reverse()
        .map((h, i) => (
          <p key={`${h.date}-${i}`} style={muted}>
            {h.name} · {amount(displayQuantity(h.quantity, h.unit))}{' '}
            {getUnitLabel(h.unit, h.quantity)} ·{' '}
            {new Date(h.date).toLocaleDateString(getLanguage())}
          </p>
        ))}
      {!companion.history.length && (
        <p style={muted}>{t('Purchases added through this tab will appear here.')}</p>
      )}
    </details>
  );
}
