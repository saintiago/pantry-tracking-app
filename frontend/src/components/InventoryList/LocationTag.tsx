import React from 'react';
import { t, useLanguage } from '../../i18n/i18n';
import { styles } from './styles';

export default function LocationTag({
  ids,
  names,
}: {
  ids: string[];
  names: Record<string, string>;
}) {
  useLanguage();
  const unique = [...new Set(ids)];
  if (!unique.length) return null;
  return (
    <span style={styles.locationBadge}>
      {unique.length > 1 ? t('Mixed locations') : (names[unique[0]] ?? t('Unknown location'))}
    </span>
  );
}
