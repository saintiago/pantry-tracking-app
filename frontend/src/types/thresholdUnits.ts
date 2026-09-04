import { resolveUnit } from './units';

export function thresholdUnits(unit: string): string[] {
  const canonical = resolveUnit(unit);
  if (canonical === 'g' || canonical === 'kg') return ['g', 'kg'];
  if (canonical === 'ml' || canonical === 'l') return ['l', 'ml'];
  return [canonical];
}
