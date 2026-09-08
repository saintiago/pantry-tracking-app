import React from 'react';
import MeasurementInput from '../../preferences/MeasurementInput';
import { displayUnit } from '../../preferences/measurements';
import { localizedUnits, getUnitLabel } from '../../types/units';
import { t, useLanguage, message as translateMessage } from '../../i18n/i18n';
import { styles } from './styles';
export default function IngredientMeasurements({
  row,
  rowErr,
  index,
  onValue,
  onUnit,
}: {
  row: { _id: number; quantityStr: string; unit: string };
  rowErr?: { quantity?: string; unit?: string };
  index: number;
  onValue: (value: string) => void;
  onUnit: (unit: string) => void;
}) {
  useLanguage();
  return (
    <>
      {/* Quantity + Unit row */}
      <div style={styles.qtyUnitRow}>
        <div style={styles.qtyGroup}>
          <label htmlFor={`ing-qty-${row._id}`} style={styles.smallLabel}>
            {t('Qty')}{' '}
          </label>
          <MeasurementInput
            unit={row.unit}
            id={`ing-qty-${row._id}`}
            type="text"
            value={row.quantityStr}
            onValue={onValue}
            style={styles.input}
            aria-label={t('Ingredient {0} quantity', index + 1)}
            aria-invalid={!!rowErr?.quantity}
            placeholder="e.g. 1 1/2"
          />
          {rowErr?.quantity && (
            <span style={styles.fieldError} role="alert">
              {translateMessage(rowErr.quantity)}
            </span>
          )}
        </div>

        <div style={styles.unitGroup}>
          <label htmlFor={`ing-unit-${row._id}`} style={styles.smallLabel}>
            {t('Unit')}{' '}
          </label>
          <select
            id={`ing-unit-${row._id}`}
            value={displayUnit(row.unit)}
            onChange={(e) => onUnit(e.target.value)}
            style={styles.select}
            aria-label={t('Ingredient {0} unit', index + 1)}
            aria-invalid={!!rowErr?.unit}
          >
            <option value="">{t('Select unit')}</option>
            {localizedUnits(displayUnit(row.unit)).map((u) => (
              <option key={u} value={u}>
                {getUnitLabel(u, 1)}
              </option>
            ))}
          </select>
          {rowErr?.unit && (
            <span style={styles.fieldError} role="alert">
              {translateMessage(rowErr.unit)}
            </span>
          )}
        </div>
      </div>
    </>
  );
}
