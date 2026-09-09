import { usePreferences } from '../../preferences/store';
import React from 'react';
import { t, useLanguage } from '../../i18n/i18n';

const icons = [
  '🧹',
  '🧽',
  '🧴',
  '🧼',
  '🧻',
  '🍞',
  '🥐',
  '🍎',
  '🍌',
  '🥦',
  '🥕',
  '🥔',
  '🥩',
  '🐟',
  '🥚',
  '🧀',
  '🥛',
  '🍚',
  '🍝',
  '🥫',
  '🧂',
  '☕',
  '🧃',
  '🍷',
  '🍼',
  '🐾',
];

export default function ItemIconField({
  value,
  onChange,
  suggestion = '📦',
}: {
  value: string;
  onChange: (value: string) => void;
  suggestion?: string;
}) {
  useLanguage();
  const id = React.useId();
  const { appearance } = usePreferences();
  if (appearance === 'minimal') return null;
  return (
    <label htmlFor={id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {t('Product icon')}
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{ minHeight: 44, padding: 8, fontSize: '1rem', borderRadius: 6 }}
      >
        <option value="">
          {suggestion} {t('Default')}
        </option>
        {icons.map((icon) => (
          <option key={icon} value={icon}>
            {icon}
          </option>
        ))}
        {value && !icons.includes(value) && <option value={value}>{value}</option>}
      </select>
    </label>
  );
}
