import { LEGACY_UNIT_MAP } from './units';

export function canonicalStockUnit(value: string): string {
  return LEGACY_UNIT_MAP[value] ?? value;
}

/** Stock conversions preserve discrete units and never guess across dimensions. */
export function convertStockQuantity(value: number, from: string, to: string): number | null {
  const source = canonicalStockUnit(from);
  const target = canonicalStockUnit(to);
  if (source === target) return value;
  if (
    !STOCK_MEASURES[source] ||
    !STOCK_MEASURES[target] ||
    STOCK_MEASURES[source].dimension !== STOCK_MEASURES[target].dimension
  )
    return null;
  return (value * STOCK_MEASURES[source].scale) / STOCK_MEASURES[target].scale;
}

/** US customary volumes; mass and volume are never interchangeable. */
export const STOCK_MEASURES: Record<string, { dimension: string; scale: number }> = {
  g: { dimension: 'mass', scale: 1 },
  kg: { dimension: 'mass', scale: 1000 },
  oz: { dimension: 'mass', scale: 28.349523125 },
  lb: { dimension: 'mass', scale: 453.59237 },
  ml: { dimension: 'volume', scale: 1 },
  l: { dimension: 'volume', scale: 1000 },
  floz: { dimension: 'volume', scale: 29.5735295625 },
  pint: { dimension: 'volume', scale: 473.176473 },
  quart: { dimension: 'volume', scale: 946.352946 },
  gallon: { dimension: 'volume', scale: 3785.411784 },
  tsp: { dimension: 'volume', scale: 4.92892159375 },
  tbsp: { dimension: 'volume', scale: 14.78676478125 },
  cup: { dimension: 'volume', scale: 236.5882365 },
};
