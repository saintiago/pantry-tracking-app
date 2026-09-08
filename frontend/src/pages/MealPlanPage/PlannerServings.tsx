import React from 'react';
import { t, useLanguage } from '../../i18n/i18n';
export default function PlannerServings({
  value,
  onChange,
  onApply,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  onApply: () => void;
  disabled: boolean;
}) {
  useLanguage();
  return (
    <div className="planner-servings-control">
      <label>
        {t('Servings')}: <strong>{value}</strong>
        <input
          aria-label={t('Servings')}
          type="range"
          min="1"
          max="20"
          step="1"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
      <details>
        <summary>{t('Update future meals')}</summary>
        <p>{t('Applies to future meals without batch links. Edit batch portions individually.')}</p>
        <button disabled={disabled} onClick={onApply}>
          {t('Update future meals')}
        </button>
      </details>
    </div>
  );
}
