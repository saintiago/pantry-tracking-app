import { displayQuantity } from '../../preferences/measurements';
import React from 'react';
import ShareButton from '../../components/ShareButton/ShareButton';
import { t, useLanguage } from '../../i18n/i18n';
import { getShoppingUnitLabel as unitLabel } from '../../types/units';
import { arrangeLines, type Arrangement } from './arrangement';
import { amount, type ShoppingState } from './shopping';
import type { ShoppingLine } from './companion';
import { lineChecked } from './ShoppingRows';
export default function ShoppingShare({
  lines,
  arrangement,
  state,
  period,
  disabled,
}: {
  lines: ShoppingLine[];
  arrangement: Arrangement;
  state: ShoppingState;
  period: string;
  disabled: boolean;
}) {
  useLanguage();
  const text = [
    `${t('Shopping List')} · ${period}`,
    ...arrangeLines(lines, arrangement).map((group) =>
      [
        group.title ? t(group.title) : '',
        ...group.lines.map(
          (line) =>
            `${lineChecked(line, state) ? '☑' : '☐'} ${line.name} — ${line.unknown && !line.quantity ? t('Quantity to check') : amount(displayQuantity(line.quantity, line.unit)) + ' ' + unitLabel(line.unit, line.quantity)}`,
        ),
      ]
        .filter(Boolean)
        .join('\n'),
    ),
  ].join('\n\n');
  return (
    <ShareButton title={t('Shopping List')} text={text} disabled={disabled || !lines.length} />
  );
}
