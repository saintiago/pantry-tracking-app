import { getPreferences } from '../preferences/store';
import { displayQuantity, displayUnit, systemUnits } from '../preferences/measurements';
import { formatQuantity } from '../utils/quantity';
import { number } from '../i18n/i18n';
import { t, getLanguage } from '../i18n/i18n';
import { UNIT_METADATA, VALID_UNITS, resolveUnit, type UnitType } from '@pantry/domain';
export { UNIT_METADATA, VALID_UNITS, LEGACY_UNIT_MAP, resolveUnit } from '@pantry/domain';
export type { UnitMetadata, UnitType } from '@pantry/domain';

/**
 * Returns the singular label when quantity === 1, plural form otherwise.
 * Fractional quantities less than 1 (e.g. 0.5) are treated as plural.
 */
export function getUnitLabel(key: string, quantity: number): string {
  const meta = UNIT_METADATA[resolveUnit(key)];
  return t(quantity === 1 ? meta.singular : meta.plural);
}

/**
 * Returns the abbreviation for a given unit key.
 */
export function getUnitAbbreviation(key: string): string {
  const resolved = resolveUnit(key);
  return getLanguage() === 'en' ? UNIT_METADATA[resolved].abbreviation : getUnitLabel(resolved, 1);
}

export function localizedUnits(current?: string): UnitType[] {
  const saved = getPreferences().units;
  const units =
    saved ??
    systemUnits(
      VALID_UNITS.filter((u) => !['oz', 'lb', 'floz', 'pint', 'quart', 'gallon'].includes(u)),
    ).sort((a, b) => getUnitLabel(a, 1).localeCompare(getUnitLabel(b, 1), getLanguage()));
  return current &&
    VALID_UNITS.includes(current as UnitType) &&
    !units.includes(current as UnitType)
    ? [...units, current as UnitType]
    : units;
}

export function getShoppingUnitLabel(key: string, quantity: number): string {
  const target = displayUnit(key);
  return getLanguage() === 'en'
    ? target === 'floz'
      ? 'fl oz (US)'
      : target
    : getUnitLabel(target, displayQuantity(quantity, key));
}

/** Quantity and unit must always be converted together, including shares and summaries. */
export function measurementParts(quantity: number, unit: string, compact = false) {
  const target = displayUnit(unit);
  const value = displayQuantity(quantity, unit);
  const unchanged =
    target === unit && getPreferences().measurement === 'original' && !(value > 0 && value < 0.01);
  return {
    amount: unchanged
      ? compact
        ? number(value, { maximumFractionDigits: 3 })
        : formatQuantity(value)
      : number(value, { maximumSignificantDigits: 5 }),
    label: compact ? getShoppingUnitLabel(target, value) : getUnitLabel(target, value),
  };
}
export function formatMeasurement(quantity: number, unit: string, compact = false): string {
  const part = measurementParts(quantity, unit, compact);
  return `${part.amount} ${part.label}`;
}
