import { message as translateMessage, t, useLanguage } from '../../i18n/i18n';
import React from 'react';
import { validateMaxTimeInput } from '../../api/recipes/filter';

export interface RecipeFilterPanelValue {
  maxPrepTimeInput: string;
  maxCookTimeInput: string;
  maxTotalTimeInput: string;
  onlyAllAvailable: boolean;
  expiringWithinDays?: number;
}

export const EMPTY_PANEL_VALUE: RecipeFilterPanelValue = {
  maxPrepTimeInput: '',
  maxCookTimeInput: '',
  maxTotalTimeInput: '',
  onlyAllAvailable: false,
  expiringWithinDays: 0,
};

export function isAllInactive(value: RecipeFilterPanelValue): boolean {
  return (
    value.maxPrepTimeInput === '' &&
    value.maxCookTimeInput === '' &&
    value.maxTotalTimeInput === '' &&
    !value.onlyAllAvailable &&
    !value.expiringWithinDays
  );
}

export interface RecipeFilterPanelProps {
  value: RecipeFilterPanelValue;
  onChange: (next: RecipeFilterPanelValue) => void;
  isAllInactive: boolean;
  onClear: () => void;
  inventoryLoading?: boolean;
  inventoryUnavailable?: boolean;
}

const RecipeFilterPanel: React.FC<RecipeFilterPanelProps> = ({
  value,
  onChange,
  isAllInactive,
  onClear,
  inventoryLoading,
  inventoryUnavailable,
}) => {
  useLanguage();
  const prepValidation = validateMaxTimeInput(value.maxPrepTimeInput);
  const cookValidation = validateMaxTimeInput(value.maxCookTimeInput);
  const totalValidation = validateMaxTimeInput(value.maxTotalTimeInput);

  return (
    <section role="region" aria-label={t('Recipe filters')} style={styles.section}>
      <div style={styles.header}>
        <span style={styles.title}>{t('Filters')}</span>
        <button
          type="button"
          onClick={onClear}
          disabled={isAllInactive}
          style={isAllInactive ? styles.clearButtonDisabled : styles.clearButton}
        >
          {t('Clear filters')}{' '}
        </button>
      </div>

      <label style={styles.fieldGroup}>
        {t('Ingredients expiring soon')}
        <select
          aria-label={t('Ingredients expiring soon')}
          disabled={inventoryLoading || inventoryUnavailable}
          value={value.expiringWithinDays ?? 0}
          onChange={(event) =>
            onChange({ ...value, expiringWithinDays: Number(event.target.value) })
          }
          style={{ minHeight: 44, maxWidth: '100%' }}
        >
          <option value={0}>{t('Any expiration')}</option>
          <option value={7}>{t('Within 1 week')}</option>
          <option value={14}>{t('Within 2 weeks')}</option>
        </select>
      </label>
      {/* Max prep time */}
      <div style={styles.fieldGroup}>
        <label htmlFor="filter-max-prep-time" style={styles.label}>
          {t('Max prep time (min)')}{' '}
        </label>
        <input
          id="filter-max-prep-time"
          type="number"
          min="0"
          step="1"
          value={value.maxPrepTimeInput}
          onChange={(e) => onChange({ ...value, maxPrepTimeInput: e.target.value })}
          style={styles.numberInput}
          aria-describedby={prepValidation.error ? 'filter-max-prep-time-error' : undefined}
        />
        {prepValidation.error && (
          <p id="filter-max-prep-time-error" style={styles.fieldError}>
            {translateMessage(prepValidation.error)}
          </p>
        )}
      </div>

      {/* Max cook time */}
      <div style={styles.fieldGroup}>
        <label htmlFor="filter-max-cook-time" style={styles.label}>
          {t('Max cook time (min)')}{' '}
        </label>
        <input
          id="filter-max-cook-time"
          type="number"
          min="0"
          step="1"
          value={value.maxCookTimeInput}
          onChange={(e) => onChange({ ...value, maxCookTimeInput: e.target.value })}
          style={styles.numberInput}
          aria-describedby={cookValidation.error ? 'filter-max-cook-time-error' : undefined}
        />
        {cookValidation.error && (
          <p id="filter-max-cook-time-error" style={styles.fieldError}>
            {translateMessage(cookValidation.error)}
          </p>
        )}
      </div>

      {/* Max total time */}
      <div style={styles.fieldGroup}>
        <label htmlFor="filter-max-total-time" style={styles.label}>
          {t('Max total time (min)')}{' '}
        </label>
        <input
          id="filter-max-total-time"
          type="number"
          min="0"
          step="1"
          value={value.maxTotalTimeInput}
          onChange={(e) => onChange({ ...value, maxTotalTimeInput: e.target.value })}
          style={styles.numberInput}
          aria-describedby={totalValidation.error ? 'filter-max-total-time-error' : undefined}
        />
        {totalValidation.error && (
          <p id="filter-max-total-time-error" style={styles.fieldError}>
            {translateMessage(totalValidation.error)}
          </p>
        )}
      </div>

      {/* Only recipes I can make now toggle */}
      <div style={styles.toggleRow}>
        <label
          htmlFor="filter-only-all-available"
          style={value.onlyAllAvailable ? styles.toggleLabelActive : styles.toggleLabel}
        >
          <input
            id="filter-only-all-available"
            type="checkbox"
            disabled={inventoryUnavailable}
            checked={value.onlyAllAvailable}
            onChange={(e) => onChange({ ...value, onlyAllAvailable: e.target.checked })}
            style={styles.checkbox}
          />
          {t('Only recipes I can make now')}{' '}
        </label>
        {inventoryLoading && <span style={styles.loadingHint}>{t('Loading inventory…')}</span>}
      </div>
    </section>
  );
};

export default RecipeFilterPanel;

const styles: Record<string, React.CSSProperties> = {
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    padding: '0.75rem',
    backgroundColor: 'var(--color-canvas)',
    border: '1px solid var(--color-border)',
    borderRadius: 8,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
  },
  title: {
    fontSize: '0.9375rem',
    fontWeight: 600,
    color: 'var(--color-text)',
  },
  clearButton: {
    padding: '0.25rem 0.75rem',
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: 'var(--color-action)',
    backgroundColor: 'var(--color-sky)',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    minHeight: 32,
  },
  clearButtonDisabled: {
    padding: '0.25rem 0.75rem',
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: 'var(--color-secondary)',
    backgroundColor: 'var(--color-canvas)',
    border: 'none',
    borderRadius: 6,
    cursor: 'not-allowed',
    minHeight: 32,
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  label: {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text)',
  },
  numberInput: {
    minHeight: 36,
    padding: '0.375rem 0.5rem',
    fontSize: '0.9375rem',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  fieldError: {
    fontSize: '0.8125rem',
    color: 'var(--color-danger-text)',
    margin: 0,
  },
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },
  toggleLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    minHeight: 44,
    fontSize: '0.9375rem',
    fontWeight: 500,
    cursor: 'pointer',
    padding: '0.25rem 0.75rem',
    borderRadius: 6,
    backgroundColor: 'var(--color-sky)',
    color: 'var(--color-action)',
  },
  toggleLabelActive: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    minHeight: 44,
    fontSize: '0.9375rem',
    fontWeight: 600,
    cursor: 'pointer',
    padding: '0.25rem 0.75rem',
    borderRadius: 6,
    backgroundColor: 'var(--color-mint)',
    color: 'var(--color-text)',
  },
  checkbox: {
    width: 18,
    height: 18,
    cursor: 'pointer',
    flexShrink: 0,
  },
  loadingHint: {
    fontSize: '0.8125rem',
    color: 'var(--color-secondary)',
    fontStyle: 'italic',
  },
};
