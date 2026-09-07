import React from 'react';
import { t, useLanguage } from '../../i18n/i18n';

/** Null is an explicit choice; an empty date still requires user input. */
export default function ExpirationField({
  id,
  value,
  onChange,
  invalid,
  style,
}: {
  id: string;
  value: string | null;
  onChange: (value: string | null) => void;
  invalid?: boolean;
  style?: React.CSSProperties;
}) {
  useLanguage();
  return (
    <>
      <label htmlFor={id}>{t('Expiration Date')}</label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44 }}>
        <input
          type="checkbox"
          checked={value === null}
          onChange={(event) => onChange(event.target.checked ? null : '')}
        />
        {t('Not applicable')}
      </label>
      <input
        id={id}
        type="date"
        value={value ?? ''}
        disabled={value === null}
        onChange={(event) => onChange(event.target.value)}
        style={style}
        aria-required={value !== null}
        aria-invalid={invalid}
      />
    </>
  );
}
