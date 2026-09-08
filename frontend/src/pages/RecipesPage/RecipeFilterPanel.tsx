import { t, useLanguage } from '../../i18n/i18n';
import React from 'react';
import RecipeTimeSlider from './RecipeTimeSlider';
import { computeTotalTime, type Recipe } from '../../api/recipes/recipes';

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
  recipes?: Recipe[];
  value: RecipeFilterPanelValue;
  onChange: (next: RecipeFilterPanelValue) => void;
  isAllInactive: boolean;
  onClear: () => void;
  inventoryLoading?: boolean;
  inventoryUnavailable?: boolean;
}

const RecipeFilterPanel: React.FC<RecipeFilterPanelProps> = ({
  value,
  recipes = [],
  onChange,
  isAllInactive,
  onClear,
  inventoryLoading,
  inventoryUnavailable,
}) => {
  useLanguage();

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

      <RecipeTimeSlider
        label="Max prep time (min)"
        values={recipes.map((r) => r.prepTime)}
        value={value.maxPrepTimeInput}
        onChange={(v) => onChange({ ...value, maxPrepTimeInput: v })}
      />
      <RecipeTimeSlider
        label="Max cook time (min)"
        values={recipes.map((r) => r.cookTime)}
        value={value.maxCookTimeInput}
        onChange={(v) => onChange({ ...value, maxCookTimeInput: v })}
      />
      <RecipeTimeSlider
        label="Max total time (min)"
        values={recipes.map((r) => computeTotalTime(r.prepTime, r.cookTime))}
        value={value.maxTotalTimeInput}
        onChange={(v) => onChange({ ...value, maxTotalTimeInput: v })}
      />

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
        <label
          htmlFor="filter-expiring"
          style={value.expiringWithinDays ? styles.toggleLabelActive : styles.toggleLabel}
        >
          <input
            id="filter-expiring"
            type="checkbox"
            style={styles.checkbox}
            disabled={inventoryLoading || inventoryUnavailable}
            checked={!!value.expiringWithinDays}
            onChange={(e) => onChange({ ...value, expiringWithinDays: e.target.checked ? 7 : 0 })}
          />
          {t('Ingredients expiring soon')}
        </label>
        {!!value.expiringWithinDays && (
          <select
            aria-label={t('Expiration window')}
            value={value.expiringWithinDays}
            disabled={inventoryLoading || inventoryUnavailable}
            onChange={(e) => onChange({ ...value, expiringWithinDays: Number(e.target.value) })}
            style={{ minHeight: 44, maxWidth: '100%' }}
          >
            <option value={7}>{t('Within 1 week')}</option>
            <option value={14}>{t('Within 2 weeks')}</option>
          </select>
        )}
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
