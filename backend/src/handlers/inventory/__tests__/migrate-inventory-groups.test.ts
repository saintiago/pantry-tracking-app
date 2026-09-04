/**
 * Migration script tests for inventory group migration.
 *
 * Validates the pure functions and business logic of
 * `scripts/migrate-inventory-groups.mjs` without requiring
 * a live DynamoDB connection.
 */

// Replicate the pure functions from the migration script for testing.
// These must stay in sync with the script's implementation.

function normalize(value: string): string {
  return String(value).trim().replace(/\s+/g, ' ').toLowerCase();
}

function canonicalUnit(value: string): string {
  const legacy: Record<string, string> = {
    Gram: 'g',
    Kilo: 'kg',
    Milliliter: 'ml',
    Liter: 'l',
    Unit: 'piece',
  };
  return legacy[value] ?? value;
}

function canonicalKey(item: { name: string; category: string; unit: string }): string {
  return `${normalize(item.name)}|${normalize(item.category)}|${canonicalUnit(item.unit)}`;
}

function groupIdFor(key: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < key.length; index += 1) {
    const code = key.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0)
    .toString(16)
    .padStart(8, '0')}`;
}

/**
 * Simulates the core migration logic: given a list of inventory items
 * and optional pre-existing groups, produces the migrated items and
 * the resulting groups map.
 */
function simulateMigration(
  items: Array<Record<string, unknown>>,
  existingGroups: Array<Record<string, unknown>> = [],
): { items: Array<Record<string, unknown>>; groups: Map<string, Record<string, unknown>> } {
  const existingGroupsMap = new Map(
    existingGroups.map((g) => [`USER#test|${g.groupId}`, g]),
  );

  const groups = new Map<string, Record<string, unknown>>();

  for (const item of items) {
    const key = canonicalKey(item as { name: string; category: string; unit: string });
    const gid = groupIdFor(key);
    const mapKey = `USER#test|${gid}`;
    const current = groups.get(mapKey) ?? {
      PK: 'USER#test',
      SK: `GROUP#${gid}`,
      entityType: 'InventoryGroup',
      groupId: gid,
      canonicalKey: key,
      name: item.name,
      category: item.category,
      unit: canonicalUnit(item.unit as string),
      totalQuantity: 0,
      createdAt: (item.createdAt as string) ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncVersion: 1,
    };
    current.totalQuantity =
      (current.totalQuantity as number) + Number(item.quantity ?? 0);
    if (typeof item.threshold === 'number') {
      current.threshold = Math.max(
        (current.threshold as number) ?? 0,
        item.threshold as number,
      );
    }
    const existing = existingGroupsMap.get(mapKey);
    if (typeof existing?.threshold === 'number') {
      current.threshold = Math.max(
        (current.threshold as number) ?? 0,
        existing.threshold as number,
      );
    }
    groups.set(mapKey, current);

    item.groupId = gid;
    delete item.threshold;
    delete (item as { isLowStock?: boolean }).isLowStock;
  }

  for (const group of groups.values()) {
    group.isLowStock =
      group.threshold !== undefined &&
      (group.totalQuantity as number) <= (group.threshold as number);
  }

  return { items, groups };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('Migration script — pure functions', () => {
  it('normalizes whitespace and case', () => {
    expect(normalize('  Almond   Milk ')).toBe('almond milk');
    expect(normalize('DAIRY')).toBe('dairy');
    expect(normalize('Mixed CASE  Value')).toBe('mixed case value');
  });

  it('maps legacy units to canonical form', () => {
    expect(canonicalUnit('Gram')).toBe('g');
    expect(canonicalUnit('Kilo')).toBe('kg');
    expect(canonicalUnit('Milliliter')).toBe('ml');
    expect(canonicalUnit('Liter')).toBe('l');
    expect(canonicalUnit('Unit')).toBe('piece');
    // Modern units pass through
    expect(canonicalUnit('cup')).toBe('cup');
    expect(canonicalUnit('tbsp')).toBe('tbsp');
  });

  it('produces consistent canonical keys', () => {
    const key1 = canonicalKey({ name: ' Milk ', category: 'DAIRY', unit: 'Liter' });
    const key2 = canonicalKey({ name: 'milk', category: 'dairy', unit: 'l' });
    expect(key1).toBe(key2);
    expect(key1).toBe('milk|dairy|l');
  });

  it('produces different keys for different categories or units', () => {
    const milkDairy = canonicalKey({ name: 'Milk', category: 'Dairy', unit: 'l' });
    const milkBeverage = canonicalKey({ name: 'Milk', category: 'Beverage', unit: 'l' });
    const milkPieces = canonicalKey({ name: 'Milk', category: 'Dairy', unit: 'piece' });
    expect(milkDairy).not.toBe(milkBeverage);
    expect(milkDairy).not.toBe(milkPieces);
  });

  it('produces stable deterministic group IDs', () => {
    const id1 = groupIdFor('milk|dairy|l');
    const id2 = groupIdFor('milk|dairy|l');
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^[0-9a-f]{16}$/);
  });

  it('produces different group IDs for different keys', () => {
    expect(groupIdFor('milk|dairy|l')).not.toBe(groupIdFor('milk|dairy|piece'));
  });
});

describe('Migration script — business logic', () => {
  const baseItem = {
    PK: 'USER#test',
    SK: 'ITEM#item-1',
    entityType: 'InventoryItem' as const,
    itemId: 'item-1',
    name: 'Milk',
    category: 'Dairy',
    unit: 'Liter',
    quantity: 2,
    expirationDate: '2026-01-01',
    location: 'loc-1',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-06-01T00:00:00.000Z',
    syncVersion: 1,
  };

  it('assigns groupId and removes threshold and isLowStock from items', () => {
    const item = { ...baseItem, threshold: 2, isLowStock: true };
    const { items, groups } = simulateMigration([item]);

    expect(items[0].groupId).toBeDefined();
    expect(typeof items[0].groupId).toBe('string');
    expect(items[0].threshold).toBeUndefined();
    expect(items[0].isLowStock).toBeUndefined();

    // Group should be created with the item's threshold
    expect(groups.size).toBe(1);
    const group = [...groups.values()][0];
    expect(group.totalQuantity).toBe(2);
    expect(group.threshold).toBe(2);
  });

  it('aggregates multiple items into the same canonical group', () => {
    const item1 = { ...baseItem, itemId: 'item-1', SK: 'ITEM#item-1', quantity: 2 };
    const item2 = {
      ...baseItem,
      itemId: 'item-2',
      SK: 'ITEM#item-2',
      name: '  milk ', // different casing/whitespace
      category: 'Dairy',
      unit: 'l', // canonical equivalent of Liter
      quantity: 3,
    };

    const { items, groups } = simulateMigration([item1, item2]);

    // Both items should have the same groupId
    expect(items[0].groupId).toBe(items[1].groupId);
    expect(items).toHaveLength(2);

    // Group total should be sum
    expect(groups.size).toBe(1);
    const group = [...groups.values()][0];
    expect(group.totalQuantity).toBe(5);
  });

  it('resolves conflicting thresholds to the maximum value', () => {
    const item1 = { ...baseItem, itemId: 'item-1', SK: 'ITEM#item-1', threshold: 2, quantity: 1 };
    const item2 = {
      ...baseItem,
      itemId: 'item-2',
      SK: 'ITEM#item-2',
      threshold: 5,
      quantity: 1,
    };

    const { groups } = simulateMigration([item1, item2]);

    const group = [...groups.values()][0];
    expect(group.threshold).toBe(5); // max(2, 5)
  });

  it('preserves higher threshold from pre-existing group', () => {
    const groupId = groupIdFor(canonicalKey(baseItem));
    const existingGroup = {
      PK: 'USER#test',
      SK: `GROUP#${groupId}`,
      groupId,
      threshold: 10,
      totalQuantity: 0,
      isLowStock: false,
    };

    const item = { ...baseItem, threshold: 2, quantity: 3 };
    const { groups } = simulateMigration([item], [existingGroup]);

    const group = [...groups.values()][0];
    expect(group.threshold).toBe(10); // max(2, 10) = 10
  });

  it('computes isLowStock correctly based on total and threshold', () => {
    const item1 = { ...baseItem, itemId: 'item-1', SK: 'ITEM#item-1', threshold: 5, quantity: 2 };
    const item2 = { ...baseItem, itemId: 'item-2', SK: 'ITEM#item-2', quantity: 2 };

    // total = 4, threshold = 5 → isLowStock = true
    const { groups } = simulateMigration([item1, item2]);

    const group = [...groups.values()][0];
    expect(group.totalQuantity).toBe(4);
    expect(group.threshold).toBe(5);
    expect(group.isLowStock).toBe(true);
  });

  it('sets isLowStock false when no threshold is present', () => {
    const item = { ...baseItem, quantity: 0 };
    const { groups } = simulateMigration([item]);

    const group = [...groups.values()][0];
    expect(group.threshold).toBeUndefined();
    expect(group.isLowStock).toBe(false);
  });

  it('handles items with zero quantity', () => {
    const item = { ...baseItem, quantity: 0 };
    const { groups } = simulateMigration([item]);

    const group = [...groups.values()][0];
    expect(group.totalQuantity).toBe(0);
  });

  it('idempotent on repeat execution (already-migrated rows)', () => {
    // First migration
    const item = { ...baseItem, threshold: 3, isLowStock: false, quantity: 2 };
    const { items: migrated1, groups: groups1 } = simulateMigration([item]);

    // Second migration on already-migrated items (no threshold/isLowStock)
    const { items: migrated2, groups: groups2 } = simulateMigration(
      migrated1,
      [...groups1.values()],
    );

    // Same groupId preserved
    expect(migrated2[0].groupId).toBe(migrated1[0].groupId);
    // Threshold still absent from items
    expect(migrated2[0].threshold).toBeUndefined();
    // Only one group
    expect(groups2.size).toBe(1);
  });

  it('separates items with different units into different groups', () => {
    const itemLiter = { ...baseItem, itemId: 'item-1', SK: 'ITEM#item-1', unit: 'Liter', quantity: 1 };
    const itemGallon = {
      ...baseItem,
      itemId: 'item-2',
      SK: 'ITEM#item-2',
      unit: 'g',
      quantity: 500,
    };

    const { items, groups } = simulateMigration([itemLiter, itemGallon]);

    expect(items[0].groupId).not.toBe(items[1].groupId);
    expect(groups.size).toBe(2);
  });

  it('handles items without threshold (implicit undefined)', () => {
    const item = { ...baseItem, quantity: 3 };
    // threshold not present

    const { items, groups } = simulateMigration([item]);

    expect(items[0].threshold).toBeUndefined();
    const group = [...groups.values()][0];
    expect(group.threshold).toBeUndefined();
  });

  it('handles malformed items with missing name/category/unit gracefully', () => {
    const malformed = {
      ...baseItem,
      name: '',
      category: '',
      unit: '',
      quantity: 1,
    };

    // Should not throw
    const { items } = simulateMigration([malformed]);
    expect(items[0].groupId).toBeDefined();
  });

  it('handles empty item list', () => {
    const { items, groups } = simulateMigration([]);
    expect(items).toHaveLength(0);
    expect(groups.size).toBe(0);
  });

  it('handles many items across many groups', () => {
    const items = [];
    for (let i = 0; i < 50; i++) {
      items.push({
        ...baseItem,
        itemId: `item-${i}`,
        SK: `ITEM#item-${i}`,
        name: `Product ${i % 5}`,
        category: `Category ${i % 3}`,
        unit: i % 2 === 0 ? 'Liter' : 'piece',
        quantity: i + 1,
        threshold: i % 7 === 0 ? 5 : undefined,
      });
    }

    const { items: migrated, groups } = simulateMigration(items);

    expect(migrated).toHaveLength(50);
    // 5 names × 3 categories × 2 units = up to 30 groups, but some may collapse
    expect(groups.size).toBeGreaterThan(0);
    expect(groups.size).toBeLessThanOrEqual(30);

    // Every item has a groupId
    for (const item of migrated) {
      expect(item.groupId).toBeDefined();
      expect(item.threshold).toBeUndefined();
      expect(item.isLowStock).toBeUndefined();
    }
  });
});
