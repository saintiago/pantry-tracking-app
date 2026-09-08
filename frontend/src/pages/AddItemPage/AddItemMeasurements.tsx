import React from 'react';
import MeasurementInput, { changeMeasureUnit } from '../../preferences/MeasurementInput';
import { displayUnit } from '../../preferences/measurements';
import { localizedUnits, getUnitLabel } from '../../types/units';
import { t, useLanguage, message as translateMessage } from '../../i18n/i18n';
import { styles } from './styles';
import type { FormErrors } from './form';
export default function AddItemMeasurements({
  form,
  errors,
  onField,
}: {
  form: { quantity: string; unit: string };
  errors: FormErrors;
  onField: (field: string, value: string) => void;
}) {
  useLanguage();
  return (
    <>
      {/* Quantity */}
      <div style={styles.fieldGroup}>
        <label htmlFor="add-item-quantity" style={styles.label}>
          {t('Quantity')} <span aria-hidden="true">*</span>
        </label>
        <MeasurementInput
          unit={form.unit}
          id="add-item-quantity"
          type="text"
          value={form.quantity}
          onValue={(value) => onField('quantity', value)}
          style={styles.input}
          aria-required="true"
          aria-invalid={!!errors.quantity}
          placeholder="e.g. 2, 1/2, 1 1/4"
        />
        {errors.quantity && (
          <span style={styles.fieldError} role="alert">
            {translateMessage(errors.quantity)}
          </span>
        )}
      </div>

      {/* Unit */}
      <div style={styles.fieldGroup}>
        <label htmlFor="add-item-unit" style={styles.label}>
          {t('Unit')} <span aria-hidden="true">*</span>
        </label>
        <select
          id="add-item-unit"
          value={displayUnit(form.unit)}
          onChange={(e) => {
            onField('quantity', changeMeasureUnit(form.quantity, form.unit, e.target.value));
            onField('unit', e.target.value);
          }}
          style={styles.select}
          aria-required="true"
          aria-invalid={!!errors.unit}
        >
          <option value="">{t('Select a unit')}</option>
          {localizedUnits(displayUnit(form.unit)).map((u) => (
            <option key={u} value={u}>
              {getUnitLabel(u, 1)}
            </option>
          ))}
        </select>
        {errors.unit && (
          <span style={styles.fieldError} role="alert">
            {translateMessage(errors.unit)}
          </span>
        )}
      </div>
    </>
  );
}
