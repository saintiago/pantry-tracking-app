import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { auditInventory, scanInventoryAudit } from '../inventory-audit';
import { spawnSync } from 'child_process';
import { resolve } from 'path';

const location = { PK: 'USER#a', SK: 'LOCATION#l', entityType: 'StorageLocation', syncVersion: 1 };
const group = {
  PK: 'USER#a',
  SK: 'GROUP#g',
  entityType: 'InventoryGroup',
  groupId: 'g',
  name: 'Rice',
  category: 'Food',
  unit: 'g',
  canonicalKey: 'rice|food|g',
  totalQuantity: 500,
  threshold: 0.5,
  thresholdUnit: 'kg',
  isLowStock: true,
  syncVersion: 2,
};
const lot = {
  PK: 'USER#a',
  SK: 'ITEM#i',
  itemId: 'i',
  userId: 'a',
  entityType: 'InventoryItem',
  groupId: 'g',
  name: 'Rice',
  category: 'Food',
  unit: 'Gram',
  quantity: 500,
  location: 'l',
  expirationDate: '2000-01-01',
  GSI1PK: 'USER#a#CAT#Food',
  GSI1SK: 'ITEM#i',
  syncVersion: 1,
};

describe('read-only inventory reconciliation', () => {
  it('rejects the retired migration apply mode before loading any database client', () => {
    const result = spawnSync(
      process.execPath,
      [resolve(__dirname, '../../../../../scripts/migrate-inventory-groups.mjs'), '--apply'],
      { encoding: 'utf8', timeout: 5000 },
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('No writes performed.');
  });
  it('uses threshold conversions, legacy units, and includes expired stock in restock totals', () => {
    expect(auditInventory([location, group, lot]).findings).toEqual([]);
  });

  it('reports drift without mutating data or deleting configured empty groups', () => {
    const rows = [location, { ...group, totalQuantity: 999, isLowStock: false }, lot];
    const before = JSON.stringify(rows);
    expect(auditInventory(rows).findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'TOTAL_MISMATCH', expected: 500, actual: 999 }),
        expect.objectContaining({ code: 'LOW_STOCK_MISMATCH', expected: true, actual: false }),
      ]),
    );
    expect(JSON.stringify(rows)).toBe(before);
    expect(auditInventory([{ ...group, totalQuantity: 0 }]).findings).toEqual([]);
  });

  it('respects explicit membership and flags identity divergence without regrouping', () => {
    const result = auditInventory([location, group, { ...lot, name: 'Brown rice' }]);
    expect(result.findingCounts).toEqual({ LOT_IDENTITY_DIFFERS_FROM_GROUP: 1 });
  });

  it('converts compatible lot quantities and refuses totals across dimensions', () => {
    expect(
      auditInventory([location, group, { ...lot, unit: 'kg', quantity: 0.5 }]).findingCounts,
    ).toEqual({ GROUP_UNIT_CONVERSION_REQUIRED: 1 });
    const bad = auditInventory([location, group, { ...lot, unit: 'ml' }]);
    expect(bad.findingCounts).toEqual({ INCOMPATIBLE_GROUP_UNIT: 1, TOTAL_NOT_RECONCILABLE: 1 });
    expect(bad.findings.some((f) => f.code === 'TOTAL_MISMATCH')).toBe(false);
  });

  it.each([-1, NaN, Infinity, '5', null])('refuses malformed quantities: %s', (quantity) => {
    expect(auditInventory([location, group, { ...lot, quantity }]).findingCounts).toEqual({
      INVALID_LOT_QUANTITY_OR_UNIT: 1,
      TOTAL_NOT_RECONCILABLE: 1,
    });
  });

  it('reports invalid thresholds instead of proposing a low-stock repair', () => {
    const result = auditInventory([location, { ...group, thresholdUnit: 'ml' }, lot]);
    expect(result.findingCounts).toEqual({ INVALID_THRESHOLD: 1 });
  });

  it('does not resolve links across account partitions or invent canonical membership', () => {
    const result = auditInventory([{ ...group, PK: 'USER#b' }, { ...location, PK: 'USER#b' }, lot]);
    expect(result.findingCounts).toMatchObject({ MISSING_GROUP: 1, MISSING_LOCATION: 1 });
    expect(
      auditInventory([location, group, { ...lot, groupId: undefined }]).findingCounts,
    ).toMatchObject({ MISSING_GROUP_LINK: 1 });
  });

  it('flags stale display names and dangling recipe links', () => {
    const recipe = {
      PK: 'USER#a',
      SK: 'RECIPE#r',
      entityType: 'Recipe',
      name: 'New',
      ingredients: [{ inventoryItemId: 'deleted' }],
      syncVersion: 1,
    };
    const meal = {
      PK: 'USER#a',
      SK: 'MEAL#1',
      entityType: 'MealPlan',
      recipeId: 'r',
      recipeName: 'Old',
      syncVersion: 1,
    };
    expect(auditInventory([recipe, meal]).findingCounts).toEqual({
      MISSING_INGREDIENT_LOT: 1,
      STALE_MEAL_RECIPE_NAME: 1,
    });
    expect(auditInventory([meal]).findingCounts).toEqual({ MISSING_MEAL_RECIPE: 1 });
  });

  it('flags obsolete lot fields, malformed keys and redundant index drift', () => {
    const result = auditInventory([
      location,
      group,
      { ...lot, userId: 'b', itemId: 'wrong', GSI1PK: 'old', threshold: 5, syncVersion: 0 },
    ]);
    expect(result.findingCounts).toEqual({
      USER_ID_MISMATCH: 1,
      INVALID_REVISION: 1,
      ITEM_ID_MISMATCH: 1,
      LEGACY_LOT_THRESHOLD: 1,
      CATEGORY_INDEX_MISMATCH: 1,
    });
  });

  it('fingerprints complete content independently of record and object-key ordering', () => {
    const reordered = Object.fromEntries(Object.entries(lot).reverse());
    expect(auditInventory([group, lot]).fingerprint).toBe(
      auditInventory([reordered, group]).fingerprint,
    );
    expect(auditInventory([group, lot]).fingerprint).not.toBe(
      auditInventory([group, { ...lot, quantity: 499 }]).fingerprint,
    );
  });

  it('reads every page including empty pages using consistent scans, and never writes', async () => {
    const cursor = { PK: 'USER#a', SK: 'ITEM#i' };
    const next = { PK: 'USER#a', SK: 'LOCATION#l' };
    const send = jest
      .fn()
      .mockResolvedValueOnce({ Items: [group, lot], LastEvaluatedKey: cursor })
      .mockResolvedValueOnce({ Items: [], LastEvaluatedKey: next })
      .mockResolvedValueOnce({ Items: [location] });
    const result = await scanInventoryAudit(
      { send } as unknown as DynamoDBDocumentClient,
      'restored-table',
    );
    expect(result.rowCount).toBe(3);
    expect(result.findings).toEqual([]);
    expect(send).toHaveBeenCalledTimes(3);
    for (const [command] of send.mock.calls) {
      expect(command).toBeInstanceOf(ScanCommand);
      expect(command.input).toMatchObject({ TableName: 'restored-table', ConsistentRead: true });
    }
    expect(send.mock.calls[1][0].input.ExclusiveStartKey).toEqual(cursor);
    expect(send.mock.calls[2][0].input.ExclusiveStartKey).toEqual(next);
  });

  it('fails closed on cursor loops and partial read failures', async () => {
    const send = jest
      .fn()
      .mockResolvedValue({ Items: [lot], LastEvaluatedKey: { PK: 'USER#a', SK: 'ITEM#i' } });
    await expect(
      scanInventoryAudit({ send } as unknown as DynamoDBDocumentClient, 'table'),
    ).rejects.toThrow('Repeated scan cursor');
    const failing = jest
      .fn()
      .mockResolvedValueOnce({ Items: [lot], LastEvaluatedKey: { PK: 'USER#a', SK: 'ITEM#i' } })
      .mockRejectedValueOnce(new Error('Unavailable'));
    await expect(
      scanInventoryAudit({ send: failing } as unknown as DynamoDBDocumentClient, 'table'),
    ).rejects.toThrow('Unavailable');
  });
});
