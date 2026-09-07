import React from 'react';
import { t, useLanguage } from '../../i18n/i18n';
import { styles } from './styles';
export const LowStockBadge: React.FC = () => {
  useLanguage();
  return (
    <span style={styles.lowStockBadge} aria-label={t('Low stock')}>
      {t('Low Stock')}{' '}
    </span>
  );
};
