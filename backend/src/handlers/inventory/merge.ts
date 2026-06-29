import { resolveUnit } from '../../types/units';

/**
 * Comparable-field projection of an inventory item used to decide whether a
 * newly submitted item should merge into an existing one. Quantity and picture
 * are intentionally excluded from this set (Requirement 2.6).
 */
export interface ComparableFields {
  name: string;
  category: string;
  expirationDate: string;
  location: string;
  unit: string;
  barcode?: string;
  brand?: string;
  whereToBuy?: string;
  onlineStoreLink?: string;
}

/**
 * String comparable fields that follow the trim + case-insensitive equality
 * rule with optional-field semantics (Requirement 2.7).
 */
export const STRING_COMPARABLE_FIELDS = [
  'name',
  'category',
  'barcode',
  'brand',
  'whereToBuy',
  'onlineStoreLink',
] as const;

export type StringComparableField = (typeof STRING_COMPARABLE_FIELDS)[number];

/**
 * Source shape accepted by {@link toComparableFields}. Covers both an
 * `InventoryItem` (which uses `location`) and an `AddInventoryRequest` (which
 * uses `locationId`), plus optional string fields that may be absent.
 */
export interface ComparableFieldsSource {
  name?: unknown;
  category?: unknown;
  expirationDate?: unknown;
  location?: unknown;
  locationId?: unknown;
  unit?: unknown;
  barcode?: unknown;
  brand?: unknown;
  whereToBuy?: unknown;
  onlineStoreLink?: unknown;
}

/**
 * Normalizes a string comparable field: trims surrounding whitespace and
 * lower-cases. Absent or non-string values normalize to `''` so that absent
 * and empty values are treated identically (Requirement 2.4/2.5/2.7).
 */
export function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/**
 * Equality for a single string comparable field with optional-field semantics:
 * absent/empty on both is equal; present on one and absent/empty on the other
 * is not equal (Requirement 2.4/2.5/2.7).
 */
export function stringFieldEqual(a: unknown, b: unknown): boolean {
  return normalizeString(a) === normalizeString(b);
}

/**
 * Determines whether two items are equal across every comparable field
 * (Requirement 2.3). `expirationDate` and `location` are compared by exact
 * trimmed value (Requirement 2.1/2.2), `unit` by canonical unit key via
 * `resolveUnit` (Requirement 2.8), and the string fields via
 * {@link stringFieldEqual} (Requirement 2.7).
 */
export function comparableFieldsEqual(
  submitted: ComparableFields,
  existing: ComparableFields,
): boolean {
  if (submitted.expirationDate.trim() !== existing.expirationDate.trim()) return false;
  if (submitted.location.trim() !== existing.location.trim()) return false;
  if (resolveUnit(submitted.unit) !== resolveUnit(existing.unit)) return false;
  return STRING_COMPARABLE_FIELDS.every((field) =>
    stringFieldEqual(submitted[field], existing[field]),
  );
}

/**
 * Projects an `InventoryItem` or `AddInventoryRequest`-shaped record into a
 * {@link ComparableFields} value. Reads the location identifier from either
 * `location` (InventoryItem) or `locationId` (AddInventoryRequest).
 */
export function toComparableFields(source: ComparableFieldsSource): ComparableFields {
  const asString = (value: unknown): string => (typeof value === 'string' ? value : '');
  const location = source.location !== undefined ? source.location : source.locationId;

  const fields: ComparableFields = {
    name: asString(source.name),
    category: asString(source.category),
    expirationDate: asString(source.expirationDate),
    location: asString(location),
    unit: asString(source.unit),
  };

  for (const field of STRING_COMPARABLE_FIELDS) {
    if (field === 'name' || field === 'category') continue;
    if (source[field] !== undefined) {
      fields[field] = asString(source[field]);
    }
  }

  return fields;
}

/**
 * Minimal projection of an inventory item required to select a canonical merge
 * match. The backend handler builds items inline as plain records rather than
 * via a shared `InventoryItem` interface, so {@link selectMergeMatch} accepts
 * any record carrying these two fields.
 */
export interface MergeMatchCandidate {
  createdAt: string;
  itemId: string;
}

/**
 * Selects the canonical merge match from a set of qualifying matches
 * (Requirement 1.6): the item with the earliest `createdAt`, tie-broken by the
 * lexicographically smallest `itemId`. Returns `null` for an empty set. The
 * choice is independent of input order because the comparison is a total order
 * over (`createdAt`, `itemId`).
 */
export function selectMergeMatch<T extends MergeMatchCandidate>(matches: T[]): T | null {
  if (matches.length === 0) return null;
  return matches.reduce((best, cur) => {
    if (cur.createdAt < best.createdAt) return cur;
    if (cur.createdAt > best.createdAt) return best;
    return cur.itemId < best.itemId ? cur : best;
  });
}

/**
 * Minimal projection of an inventory item required to apply a quantity merge.
 * The backend handler builds items inline as plain records rather than via a
 * shared `InventoryItem` interface, so {@link applyMerge} accepts any record
 * carrying these fields. `threshold` is optional and absent when the item has
 * no low-stock threshold configured.
 */
export interface MergeQuantitySource {
  quantity: number;
  threshold?: number;
  isLowStock: boolean;
}

/**
 * Result of merging a submitted quantity into an existing item.
 */
export interface MergeResult {
  /** Exact arithmetic sum of the existing and submitted quantities. */
  quantity: number;
  /** Recomputed low-stock flag for the resulting quantity. */
  isLowStock: boolean;
  /** True iff the recomputed `isLowStock` differs from the existing value. */
  lowStockTransition: boolean;
}

/**
 * Computes the result of a `Merge_Operation` for a matched item. The resulting
 * `quantity` is the exact JS arithmetic sum of the existing and submitted
 * quantities, with no rounding or truncation so fractional values are
 * preserved (Requirement 3.1). `isLowStock` is true if and only if the item has
 * a defined `threshold` and the resulting `quantity` is less than or equal to
 * that `threshold` (Requirement 3.2). `lowStockTransition` is true if and only
 * if the recomputed `isLowStock` differs from the existing value, so the caller
 * can report any change in low-stock state (Requirement 3.3/3.4).
 */
export function applyMerge(
  existing: MergeQuantitySource,
  submittedQuantity: number,
): MergeResult {
  const quantity = existing.quantity + submittedQuantity;
  const isLowStock = existing.threshold !== undefined && quantity <= existing.threshold;
  const lowStockTransition = isLowStock !== existing.isLowStock;
  return { quantity, isLowStock, lowStockTransition };
}
