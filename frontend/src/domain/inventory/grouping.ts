import type { InventoryItem, InventoryGroup } from './types';
import { convertStockQuantity, resolveUnit, type UnitType } from '@pantry/domain';

export function replaceInventoryGroup(
  groups: InventoryGroup[],
  id: string,
  updated?: InventoryGroup,
): InventoryGroup[] {
  return groups.flatMap((group) => (group.groupId !== id ? [group] : updated ? [updated] : []));
}

export interface CategorySummary {
  category: string;
  itemCount: number;
  totalQuantity: number;
  quantityByUnit: Record<string, number>;
  lowStockCount: number;
}

export function groupItemsByCategory(items: InventoryItem[]): CategorySummary[] {
  const map = new Map<string, CategorySummary>();
  const lowStockGroups = new Map<string, Set<string>>();

  for (const item of items) {
    const existing = map.get(item.category);
    if (existing) {
      existing.itemCount += 1;
      existing.totalQuantity += item.quantity;
      existing.quantityByUnit[item.unit] =
        (existing.quantityByUnit[item.unit] ?? 0) + item.quantity;
      if (item.isLowStock) {
        const identity = item.groupId ?? item.itemId;
        const seen = lowStockGroups.get(item.category) ?? new Set<string>();
        if (!seen.has(identity)) existing.lowStockCount += 1;
        seen.add(identity);
        lowStockGroups.set(item.category, seen);
      }
    } else {
      map.set(item.category, {
        category: item.category,
        itemCount: 1,
        totalQuantity: item.quantity,
        quantityByUnit: { [item.unit]: item.quantity },
        lowStockCount: item.isLowStock ? 1 : 0,
      });
      if (item.isLowStock) {
        lowStockGroups.set(item.category, new Set([item.groupId ?? item.itemId]));
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => a.category.localeCompare(b.category));
}

/* ── GroupedRow type and groupItemsByGroupingKey ────────────────── */

/**
 * A client-side-only parent row in the category view representing all items
 * that share a Grouping_Key (name + category + unit). Never persisted or sent
 * to any API; derived purely from the provided InventoryItem list.
 */
export interface GroupedRow {
  hasIncompatibleUnits?: boolean;
  groupId: string;
  groupingKey: string; // canonical composite key
  name: string; // display name (first child's original name)
  unit: UnitType; // canonical unit key
  category: string; // display category (first child's original category)
  childItems: InventoryItem[]; // sorted by expirationDate, then createdAt, then itemId
  totalQuantity: number;
  childCount: number;
  hasLowStock: boolean;
  threshold?: number;
  thresholdUnit?: string;
}

/**
 * Normalizes a name for grouping: trims leading/trailing whitespace, collapses
 * internal whitespace runs to a single space, and lowercases.
 */
export function normalizeGroupName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Normalizes a category for grouping: trims and lowercases so case-only
 * differences group together.
 */
function normalizeGroupCategory(category: string): string {
  return category.trim().toLowerCase();
}

/**
 * Groups items into Grouped_Rows keyed by (normalized name, normalized
 * category, canonical unit key). Within each group, child items are sorted by
 * expirationDate asc, then createdAt asc, then itemId asc. Groups are ordered
 * by normalized name asc, tie-broken by canonical unit key asc.
 *
 * Pure UI construct: no database records are created or modified.
 */
export function groupItemsByGroupingKey(
  items: InventoryItem[],
  inventoryGroups: InventoryGroup[] = [],
): GroupedRow[] {
  const map = new Map<string, GroupedRow>();
  const groupsById = new Map(inventoryGroups.map((group) => [group.groupId, group]));

  for (const item of items) {
    const canonicalUnit = resolveUnit(item.unit);
    const legacyGroupingKey = `${normalizeGroupName(item.name)}|${normalizeGroupCategory(
      item.category,
    )}|${canonicalUnit}`;
    const groupingKey = item.groupId ?? legacyGroupingKey;
    const persistedGroup = item.groupId ? groupsById.get(item.groupId) : undefined;
    const displayUnit = resolveUnit(
      persistedGroup?.unit ?? map.get(groupingKey)?.unit ?? canonicalUnit,
    );
    const quantity = convertStockQuantity(item.quantity, item.unit, displayUnit);

    const existing = map.get(groupingKey);
    if (existing) {
      existing.childItems.push(item);
      existing.totalQuantity += quantity ?? 0;
      if (quantity === null) existing.hasIncompatibleUnits = true;
      existing.childCount += 1;
      if (!item.groupId && item.isLowStock) existing.hasLowStock = true;
    } else {
      map.set(groupingKey, {
        groupId: item.groupId ?? legacyGroupingKey,
        groupingKey,
        name: item.name,
        unit: displayUnit,
        category: item.category,
        childItems: [item],
        totalQuantity: quantity ?? 0,
        ...(quantity === null ? { hasIncompatibleUnits: true } : {}),
        childCount: 1,
        hasLowStock: persistedGroup?.isLowStock ?? item.isLowStock ?? false,
        threshold: persistedGroup?.threshold,
        thresholdUnit: persistedGroup?.thresholdUnit,
      });
    }
  }

  const groups = Array.from(map.values());

  // Sort child items within each group: expirationDate asc, createdAt asc, itemId asc.
  for (const group of groups) {
    group.childItems.sort((a, b) => {
      if (a.expirationDate !== b.expirationDate) {
        return (a.expirationDate ?? '9999-12-31') < (b.expirationDate ?? '9999-12-31') ? -1 : 1;
      }
      if (a.createdAt !== b.createdAt) {
        return a.createdAt < b.createdAt ? -1 : 1;
      }
      if (a.itemId !== b.itemId) {
        return a.itemId < b.itemId ? -1 : 1;
      }
      return 0;
    });
  }

  // Order groups by normalized name asc, tie-broken by canonical unit key asc.
  groups.sort((a, b) => {
    const nameCompare = normalizeGroupName(a.name).localeCompare(normalizeGroupName(b.name));
    if (nameCompare !== 0) return nameCompare;
    return a.unit.localeCompare(b.unit);
  });

  return groups;
}
