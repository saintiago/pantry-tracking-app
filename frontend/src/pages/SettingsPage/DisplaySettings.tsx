import React, { useState } from 'react';
import { VALID_UNITS, type UnitType } from '@pantry/domain';
import { t, useLanguage } from '../../i18n/i18n';
import { getUnitLabel, localizedUnits } from '../../types/units';
import {
  preferenceError,
  savePreferences,
  usePreferences,
  type Appearance,
  type MeasurementSystem,
} from '../../preferences/store';
const section: React.CSSProperties = {
  margin: '16px 0',
  padding: 16,
  border: '1px solid var(--color-border)',
  borderRadius: 12,
};
const input: React.CSSProperties = {
  display: 'block',
  width: '100%',
  minHeight: 44,
  padding: 8,
  margin: '8px 0',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
};
export default function DisplaySettings() {
  useLanguage();
  const prefs = usePreferences();
  const [add, setAdd] = useState('');
  const units = localizedUnits();
  const remaining = VALID_UNITS.filter((unit) => !units.includes(unit));
  const updateUnits = (next: UnitType[]) => savePreferences({ ...prefs, units: next });
  const measurement = prefs.measurement === 'imperial' ? 'imperial' : 'metric';
  function move(index: number, by: number) {
    const next = [...units];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    updateUnits(next);
  }
  return (
    <>
      <section style={section} aria-label={t('Appearance')}>
        <h3>{t('Appearance')}</h3>
        <label>
          {t('App appearance')}
          <select
            style={input}
            value={prefs.appearance}
            onChange={(e) =>
              savePreferences({ ...prefs, appearance: e.target.value as Appearance })
            }
          >
            <option value="pastel">{t('Default')}</option>
            <option value="minimal">{t('Minimalist')}</option>
            <option value="system">{t('System mode')}</option>
          </select>
        </label>
        <p>
          {t(
            'Minimalist uses black and white without decorative emojis. System mode follows your device’s light or dark appearance.',
          )}
        </p>
      </section>
      <section style={section} aria-label={t('Measurements')}>
        <h3>{t('Measurements')}</h3>
        <label>
          {t('Measurement system')}
          <select
            style={input}
            value={measurement}
            onChange={(e) =>
              savePreferences({ ...prefs, measurement: e.target.value as MeasurementSystem })
            }
          >
            <option value="metric">{t('Metric')}</option>
            <option value="imperial">{t('Imperial (US customary)')}</option>
          </select>
        </label>
        <details style={{ marginTop: 16 }}>
          <summary style={{ minHeight: 44, fontWeight: 700 }}>{t('Manage units')}</summary>
          <ol aria-label={t('Unit order')}>
            {units.map((unit, index) => (
              <li
                key={unit}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 4,
                  alignItems: 'center',
                  borderBottom: '1px solid var(--color-border)',
                }}
              >
                <span style={{ flex: '1 1 100px' }}>{getUnitLabel(unit, 1)}</span>
                <button
                  type="button"
                  disabled={!index}
                  aria-label={t('Move {0} up', getUnitLabel(unit, 1))}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={index === units.length - 1}
                  aria-label={t('Move {0} down', getUnitLabel(unit, 1))}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  disabled={units.length === 1}
                  aria-label={t('Remove unit {0}', getUnitLabel(unit, 1))}
                  onClick={() => updateUnits(units.filter((u) => u !== unit))}
                >
                  ×
                </button>
              </li>
            ))}
          </ol>
          <label>
            {t('Available units')}
            <select style={input} value={add} onChange={(e) => setAdd(e.target.value)}>
              <option value="">{t('Select a unit')}</option>
              {remaining.map((unit) => (
                <option key={unit} value={unit}>
                  {getUnitLabel(unit, 1)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!remaining.includes(add as UnitType)}
            onClick={() => {
              updateUnits([...units, add as UnitType]);
              setAdd('');
            }}
          >
            {t('Add unit')}
          </button>
          <button type="button" onClick={() => savePreferences({ ...prefs, units: null })}>
            {t('Reset unit list')}
          </button>
        </details>
      </section>
      <p>{t('These settings are saved for your account on this device.')}</p>
      {preferenceError() && <p role="alert">{t(preferenceError())}</p>}
    </>
  );
}
