import {
  canonicalStockUnit as canonicalUnit,
  convertStockQuantity as convertThreshold,
} from '@pantry/domain';
export { canonicalUnit, convertThreshold };

export interface InventoryGroup {
  groupId: string;
  canonicalKey: string;
  name: string;
  category: string;
  unit: string;
  threshold?: number;
  thresholdUnit?: string;
  totalQuantity: number;
  isLowStock: boolean;
  createdAt: string;
  updatedAt: string;
  syncVersion: number;
}

export function normalizeGroupName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function normalizeGroupCategory(value: string): string {
  return value.trim().toLowerCase();
}

export function canonicalGroupKey(name: string, category: string, unit: string): string {
  return `${normalizeGroupName(name)}|${normalizeGroupCategory(category)}|${canonicalUnit(unit)}`;
}

export function defaultGroupId(name: string, category: string, unit: string): string {
  const value = canonicalGroupKey(name, category, unit);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0)
    .toString(16)
    .padStart(8, '0')}`;
}

export function calculateLowStock(
  totalQuantity: number,
  threshold?: number,
  thresholdUnit?: string,
  unit?: string,
): boolean {
  if (threshold === undefined) return false;
  const converted =
    thresholdUnit && unit ? convertThreshold(threshold, thresholdUnit, unit) : threshold;
  return converted !== null && totalQuantity <= converted;
}

export function stripDatabaseKeys<T extends Record<string, unknown>>(
  value: T,
): Omit<T, 'PK' | 'SK'> {
  const { PK: _pk, SK: _sk, ...rest } = value;
  return rest;
}
