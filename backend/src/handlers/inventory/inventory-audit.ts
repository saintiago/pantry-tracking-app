import { createHash } from 'crypto';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import {
  calculateLowStock,
  canonicalGroupKey,
  canonicalUnit,
  convertThreshold,
} from './inventory-groups';

type Row = Record<string, unknown>;
interface Finding {
  code: string;
  PK: unknown;
  SK: unknown;
  expected?: unknown;
  actual?: unknown;
}

// Stable ordering permits comparison without exporting user content.
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    if (value instanceof Set) return [...value].map(stable).sort();
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b, 'en'))
        .map(([k, v]) => [k, stable(v)]),
    );
  }
  return value;
}

export function auditInventory(rows: Row[]) {
  const findings: Finding[] = [];
  const report = (row: Row, code: string, expected?: unknown, actual?: unknown) =>
    findings.push({
      code,
      PK: row.PK,
      SK: row.SK,
      ...(expected !== undefined ? { expected } : {}),
      ...(actual !== undefined ? { actual } : {}),
    });
  const byKey = new Map(rows.map((r) => [JSON.stringify([r.PK, r.SK]), r]));
  const lookup = (row: Row, sk: string) => byKey.get(JSON.stringify([row.PK, sk]));
  const groups = rows.filter((r) => r.entityType === 'InventoryGroup');
  const items = rows.filter((r) => r.entityType === 'InventoryItem');
  const members = new Map<Row, Row[]>();
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const type = String(row.entityType ?? 'unknown');
    counts[type] = (counts[type] ?? 0) + 1;
    if (typeof row.PK !== 'string' || !row.PK.startsWith('USER#') || typeof row.SK !== 'string')
      report(row, 'INVALID_KEY');
    if (row.userId !== undefined && row.PK !== `USER#${row.userId}`)
      report(row, 'USER_ID_MISMATCH');
    if (
      typeof row.syncVersion !== 'number' ||
      !Number.isInteger(row.syncVersion) ||
      row.syncVersion < 1
    )
      report(row, 'INVALID_REVISION');
  }
  for (const item of items) {
    if (item.SK !== `ITEM#${item.itemId}`) report(item, 'ITEM_ID_MISMATCH');
    if ('threshold' in item || 'isLowStock' in item) report(item, 'LEGACY_LOT_THRESHOLD');
    if (item.GSI1PK !== `${item.PK}#CAT#${item.category}` || item.GSI1SK !== item.SK)
      report(item, 'CATEGORY_INDEX_MISMATCH');
    if (!lookup(item, `LOCATION#${item.location}`)) report(item, 'MISSING_LOCATION');
    if (typeof item.groupId !== 'string' || !item.groupId) {
      report(item, 'MISSING_GROUP_LINK');
      continue;
    }
    const group = lookup(item, `GROUP#${item.groupId}`);
    if (!group || group.entityType !== 'InventoryGroup') {
      report(item, 'MISSING_GROUP');
      continue;
    }
    const lots = members.get(group) ?? [];
    lots.push(item);
    members.set(group, lots);
  }
  for (const group of groups) {
    if (group.SK !== `GROUP#${group.groupId}`) report(group, 'GROUP_ID_MISMATCH');
    if (
      ![group.name, group.category, group.unit].every((v) => typeof v === 'string' && v.length > 0)
    ) {
      report(group, 'INVALID_GROUP_IDENTITY');
      continue;
    }
    const key = canonicalGroupKey(
      group.name as string,
      group.category as string,
      group.unit as string,
    );
    if (key !== group.canonicalKey) report(group, 'CANONICAL_KEY_MISMATCH');
    let total = 0;
    let reliable = true;
    const lots = members.get(group) ?? [];
    for (const lot of lots) {
      if (
        typeof lot.quantity !== 'number' ||
        !Number.isFinite(lot.quantity) ||
        lot.quantity < 0 ||
        typeof lot.unit !== 'string'
      ) {
        report(lot, 'INVALID_LOT_QUANTITY_OR_UNIT');
        reliable = false;
        continue;
      }
      const converted = convertThreshold(lot.quantity, lot.unit, group.unit as string);
      if (converted === null) {
        report(lot, 'INCOMPATIBLE_GROUP_UNIT');
        reliable = false;
        continue;
      }
      if (canonicalUnit(lot.unit) !== canonicalUnit(group.unit as string))
        report(lot, 'GROUP_UNIT_CONVERSION_REQUIRED');
      total += converted;
      if (
        typeof lot.name !== 'string' ||
        typeof lot.category !== 'string' ||
        canonicalGroupKey(lot.name, lot.category, group.unit as string) !== key
      )
        report(lot, 'LOT_IDENTITY_DIFFERS_FROM_GROUP');
    }
    const threshold = group.threshold;
    const thresholdValid =
      threshold === undefined ||
      (typeof threshold === 'number' &&
        Number.isFinite(threshold) &&
        threshold >= 0 &&
        (group.thresholdUnit === undefined ||
          (typeof group.thresholdUnit === 'string' &&
            convertThreshold(1, group.thresholdUnit, group.unit as string) !== null)));
    if (!thresholdValid) report(group, 'INVALID_THRESHOLD');
    if (threshold === undefined && group.thresholdUnit !== undefined)
      report(group, 'ORPHAN_THRESHOLD_UNIT');
    if (!lots.length && threshold === undefined) report(group, 'EMPTY_UNCONFIGURED_GROUP');
    if (!reliable || !Number.isFinite(total)) {
      report(group, 'TOTAL_NOT_RECONCILABLE');
      continue;
    }
    if (
      typeof group.totalQuantity !== 'number' ||
      !Number.isFinite(group.totalQuantity) ||
      Math.abs(group.totalQuantity - total) > 1e-9 * Math.max(1, total)
    )
      report(group, 'TOTAL_MISMATCH', total, group.totalQuantity);
    if (thresholdValid) {
      const low = calculateLowStock(
        total,
        threshold as number | undefined,
        group.thresholdUnit as string | undefined,
        group.unit as string,
      );
      if (group.isLowStock !== low) report(group, 'LOW_STOCK_MISMATCH', low, group.isLowStock);
    }
  }
  for (const row of rows) {
    if (row.entityType === 'Recipe' && Array.isArray(row.ingredients)) {
      for (const ingredient of row.ingredients) {
        if (
          ingredient &&
          typeof ingredient === 'object' &&
          ingredient.inventoryItemId &&
          !lookup(row, `ITEM#${ingredient.inventoryItemId}`)
        )
          report(row, 'MISSING_INGREDIENT_LOT');
      }
    }
    if (row.entityType === 'MealPlan') {
      const recipe = lookup(row, `RECIPE#${row.recipeId}`);
      if (!recipe) report(row, 'MISSING_MEAL_RECIPE');
      else if (recipe.name !== row.recipeName) report(row, 'STALE_MEAL_RECIPE_NAME');
    }
  }
  const findingCounts: Record<string, number> = {};
  for (const finding of findings)
    findingCounts[finding.code] = (findingCounts[finding.code] ?? 0) + 1;
  const canonicalRows = rows.map((row) => JSON.stringify(stable(row))).sort();
  return {
    mode: 'read-only',
    rowCount: rows.length,
    counts,
    fingerprint: createHash('sha256').update(JSON.stringify(canonicalRows)).digest('hex'),
    findingCounts,
    findings,
  };
}

/** Consistent pages are not a snapshot. Use a restored table for definitive results. */
export async function scanInventoryAudit(client: DynamoDBDocumentClient, tableName: string) {
  const rows: Row[] = [];
  const cursors = new Set<string>();
  let cursor: Row | undefined;
  do {
    const result = await client.send(
      new ScanCommand({
        TableName: tableName,
        ConsistentRead: true,
        ...(cursor ? { ExclusiveStartKey: cursor } : {}),
      }),
    );
    rows.push(...(result.Items ?? []));
    cursor = result.LastEvaluatedKey;
    if (cursor) {
      const token = JSON.stringify(stable(cursor));
      if (cursors.has(token)) throw new Error('Repeated scan cursor; report is incomplete');
      cursors.add(token);
    }
  } while (cursor);
  return auditInventory(rows);
}
