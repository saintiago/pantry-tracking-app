import { LEGACY_UNIT_MAP } from './units';

export function canonicalStockUnit(value: string): string {
  return LEGACY_UNIT_MAP[value] ?? value;
}

/** Stock conversions preserve discrete units and never guess across dimensions. */
export function convertStockQuantity(value: number, from: string, to: string): number | null {
  const source = canonicalStockUnit(from);
  const target = canonicalStockUnit(to);
  if (source === target) return value;
  const measures: Record<string, { dimension: string; scale: number }> = {
    g: { dimension: 'mass', scale: 1 },
    kg: { dimension: 'mass', scale: 1000 },
    ml: { dimension: 'volume', scale: 1 },
    l: { dimension: 'volume', scale: 1000 },
  };
  if (
    !measures[source] ||
    !measures[target] ||
    measures[source].dimension !== measures[target].dimension
  )
    return null;
  return (value * measures[source].scale) / measures[target].scale;
}
