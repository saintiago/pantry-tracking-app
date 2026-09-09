import React from 'react';
import { t, useLanguage } from '../../i18n/i18n';
export function timeStops(values: (number | undefined)[]): number[] {
  return [
    ...new Set(
      values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0),
    ),
  ].sort((a, b) => a - b);
}
export default function RecipeTimeSlider({
  label,
  values,
  value,
  onChange,
}: {
  label: string;
  values: (number | undefined)[];
  value: string;
  onChange: (value: string) => void;
}) {
  useLanguage();
  const stops = timeStops(values);
  const id = React.useId();
  const index = value === '' ? stops.length : stops.findIndex((n) => n >= Number(value));
  const selected = index < 0 ? stops.length : index;
  const text = value === '' ? t('Any time') : t('{0} min', value);
  return (
    <label htmlFor={id} style={{ display: 'block', minWidth: 0, fontSize: '.8125rem' }}>
      <span style={{ display: 'block' }}>{t(label)}</span>
      <strong>{text}</strong>
      <input
        id={id}
        type="range"
        min={0}
        max={stops.length || 1}
        step={1}
        value={selected}
        disabled={!stops.length}
        aria-label={t(label)}
        aria-valuetext={text}
        style={{
          display: 'block',
          width: '100%',
          minHeight: 28,
          accentColor: 'var(--color-action)',
        }}
        onChange={(e) => onChange(stops[Number(e.target.value)]?.toString() ?? '')}
      />
      {!stops.length && <small>{t('No recorded times')}</small>}
    </label>
  );
}
