export interface UnitMetadata {
  key: string;
  singular: string;
  abbreviation: string;
  plural: string;
}

export const UNIT_METADATA: Record<string, UnitMetadata> = {
  tsp: { key: 'tsp', singular: 'teaspoon', abbreviation: 'tsp', plural: 'teaspoons' },
  tbsp: { key: 'tbsp', singular: 'tablespoon', abbreviation: 'tbsp', plural: 'tablespoons' },
  cup: { key: 'cup', singular: 'cup', abbreviation: 'c', plural: 'cups' },
  ml: { key: 'ml', singular: 'milliliter', abbreviation: 'ml', plural: 'milliliters' },
  l: { key: 'l', singular: 'liter', abbreviation: 'l', plural: 'liters' },
  g: { key: 'g', singular: 'gram', abbreviation: 'g', plural: 'grams' },
  kg: { key: 'kg', singular: 'kilogram', abbreviation: 'kg', plural: 'kilograms' },
  piece: { key: 'piece', singular: 'piece', abbreviation: 'pc', plural: 'pieces' },
  slice: { key: 'slice', singular: 'slice', abbreviation: 'sl', plural: 'slices' },
  clove: { key: 'clove', singular: 'clove', abbreviation: 'cl', plural: 'cloves' },
  pinch: { key: 'pinch', singular: 'pinch', abbreviation: 'pn', plural: 'pinches' },
  handful: { key: 'handful', singular: 'handful', abbreviation: 'hf', plural: 'handfuls' },
  stick: { key: 'stick', singular: 'stick', abbreviation: 'st', plural: 'sticks' },
  can: { key: 'can', singular: 'can', abbreviation: 'cn', plural: 'cans' },
  bottle: { key: 'bottle', singular: 'bottle', abbreviation: 'bt', plural: 'bottles' },
  zest: { key: 'zest', singular: 'zest', abbreviation: 'zst', plural: 'zests' },
  unit: { key: 'unit', singular: 'unit', abbreviation: 'unit', plural: 'units' },
};

export type UnitType = keyof typeof UNIT_METADATA;

export const VALID_UNITS: UnitType[] = (Object.keys(UNIT_METADATA) as UnitType[]).sort((a, b) =>
  UNIT_METADATA[a].singular.localeCompare(UNIT_METADATA[b].singular),
);

export const LEGACY_UNIT_MAP: Record<string, UnitType> = {
  Gram: 'g',
  Kilo: 'kg',
  Milliliter: 'ml',
  Liter: 'l',
  Unit: 'piece',
};

/**
 * Resolves a unit key to a valid new unit key.
 * - If key is already a valid new unit key, returns it unchanged.
 * - If key is a legacy key, returns the mapped new key.
 * - Otherwise returns "piece" as a safe fallback.
 */
export function resolveUnit(key: string): UnitType {
  if (Object.hasOwn(UNIT_METADATA, key)) return key as UnitType;
  if (Object.hasOwn(LEGACY_UNIT_MAP, key)) return LEGACY_UNIT_MAP[key];
  return 'piece';
}

/**
 * Returns the singular label when quantity === 1, plural form otherwise.
 * Fractional quantities less than 1 (e.g. 0.5) are treated as plural.
 */
export function getUnitLabel(key: string, quantity: number): string {
  const meta = UNIT_METADATA[resolveUnit(key)];
  return quantity === 1 ? meta.singular : meta.plural;
}

/**
 * Returns the abbreviation for a given unit key.
 */
export function getUnitAbbreviation(key: string): string {
  return UNIT_METADATA[resolveUnit(key)].abbreviation;
}
