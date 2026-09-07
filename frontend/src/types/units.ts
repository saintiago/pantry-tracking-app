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

export function localizedUnits(): UnitType[] {
  return [...VALID_UNITS].sort((a, b) =>
    getUnitLabel(a, 1).localeCompare(getUnitLabel(b, 1), getLanguage()),
  );
}

export function getShoppingUnitLabel(key: string, quantity: number): string {
  return getLanguage() === 'en' ? key : getUnitLabel(key, quantity);
}
