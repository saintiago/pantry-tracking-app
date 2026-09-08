import { STOCK_MEASURES } from '@pantry/domain';
import { localizedUnits, resolveUnit } from './units';
export function thresholdUnits(unit: string, selected = unit): string[] {
  const canonical = resolveUnit(unit);
  const dimension = STOCK_MEASURES[canonical]?.dimension;
  if (!dimension) return [canonical];
  return [...new Set([...localizedUnits(selected), selected])].filter(
    (key) => STOCK_MEASURES[key]?.dimension === dimension,
  );
}
