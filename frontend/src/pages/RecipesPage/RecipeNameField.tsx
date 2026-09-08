import React from 'react';
import { t, message, useLanguage } from '../../i18n/i18n';
import { styles } from './styles';
export default function RecipeNameField({
  value,
  error,
  onChange,
}: {
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  useLanguage();
  return (
    <div style={styles.fieldGroup}>
      <label htmlFor="recipe-name" style={styles.label}>
        {t('Name')} <span aria-hidden="true">*</span>
      </label>
      <input
        id="recipe-name"
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={styles.input}
        aria-required="true"
        aria-invalid={!!error}
      />
      {error && (
        <span style={styles.fieldError} role="alert">
          {message(error)}
        </span>
      )}
    </div>
  );
}
