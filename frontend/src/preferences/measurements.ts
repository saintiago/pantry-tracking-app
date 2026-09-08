import {
  canonicalStockUnit,
  convertStockQuantity,
  STOCK_MEASURES,
  type UnitType,
} from '@pantry/domain';
import { getPreferences, type MeasurementSystem } from './store';
/** A stable unit per source avoids different units for needed/available comparisons. */
export function displayUnit(
  unit: string,
  system: MeasurementSystem = getPreferences().measurement,
): string {
  const key = canonicalStockUnit(unit);
  if (system === 'original' || !STOCK_MEASURES[key]) return key;
  if (system === 'metric') {
    if (['kg', 'lb'].includes(key)) return 'kg';
    if (STOCK_MEASURES[key].dimension === 'mass') return 'g';
    return ['l', 'quart', 'gallon'].includes(key) ? 'l' : 'ml';
  }
  if (['kg', 'lb'].includes(key)) return 'lb';
  if (STOCK_MEASURES[key].dimension === 'mass') return 'oz';
  if (['tsp', 'tbsp', 'cup', 'floz', 'pint', 'quart', 'gallon'].includes(key)) return key;
  return key === 'l' ? 'quart' : 'floz';
}
export function displayQuantity(quantity: number, unit: string): number {
  return convertStockQuantity(quantity, unit, displayUnit(unit)) ?? quantity;
}
export function systemUnits(units: UnitType[]): UnitType[] {
  return [...new Set(units.map((unit) => displayUnit(unit) as UnitType))];
}
