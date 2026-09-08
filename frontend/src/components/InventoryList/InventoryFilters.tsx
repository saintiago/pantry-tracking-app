import React from 'react';
import { t, useLanguage } from '../../i18n/i18n';
import type { StorageLocation } from '../../api/locations/locations';
import { styles } from './styles';
/* ── QuickFilterInput ───────────────────────────────────────────── */

interface QuickFilterInputProps {
  value: string;
  onChange: (value: string) => void;
}

export const QuickFilterInput: React.FC<QuickFilterInputProps> = ({ value, onChange }) => {
  useLanguage();
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={t('Search by name…')}
      aria-label={t('Filter by product name')}
      className="inv-input"
      style={styles.filterInput}
    />
  );
};

/* ── CategorySelector ───────────────────────────────────────────── */

interface CategorySelectorProps {
  categories: string[];
  value: string;
  onChange: (value: string) => void;
}

export const CategorySelector: React.FC<CategorySelectorProps> = ({
  categories,
  value,
  onChange,
}) => {
  useLanguage();
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={t('Filter by category')}
      className="inv-select"
      style={styles.filterSelect}
    >
      <option value="All">{t('All Categories')}</option>
      {categories.map((cat) => (
        <option key={cat} value={cat}>
          {cat}
        </option>
      ))}
    </select>
  );
};

/* ── LocationFilter ─────────────────────────────────────────────── */

interface LocationFilterProps {
  locations: StorageLocation[];
  value: string;
  onChange: (value: string) => void;
}

export const LocationFilter: React.FC<LocationFilterProps> = ({ locations, value, onChange }) => {
  useLanguage();
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={t('Filter by location')}
      className="inv-select"
      style={styles.filterSelect}
    >
      <option value="All">{t('All Locations')}</option>
      {locations.map((loc) => (
        <option key={loc.locationId} value={loc.locationId}>
          {loc.name}
        </option>
      ))}
    </select>
  );
};
