#!/usr/bin/env node

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand, DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const tableName = process.env.TABLE_NAME ?? 'PantryApp';
const apply = process.argv.includes('--apply');
const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function normalize(value) {
  return String(value).trim().replace(/\s+/g, ' ').toLowerCase();
}

function canonicalUnit(value) {
  const legacy = { Gram: 'g', Kilo: 'kg', Milliliter: 'ml', Liter: 'l', Unit: 'piece' };
  return legacy[value] ?? value;
}

function canonicalKey(item) {
  return `${normalize(item.name)}|${normalize(item.category)}|${canonicalUnit(item.unit)}`;
}

function groupIdFor(key) {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < key.length; index += 1) {
    const code = key.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

async function scanAll() {
  const items = [];
  let ExclusiveStartKey;
  do {
    const result = await client.send(new ScanCommand({ TableName: tableName, ExclusiveStartKey }));
    items.push(...(result.Items ?? []));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function writeAll(items) {
  for (let index = 0; index < items.length; index += 25) {
    let requests = items.slice(index, index + 25).map((Item) => ({ PutRequest: { Item } }));
    do {
      const result = await client.send(
        new BatchWriteCommand({
          RequestItems: { [tableName]: requests },
        }),
      );
      requests = result.UnprocessedItems?.[tableName] ?? [];
    } while (requests.length > 0);
  }
}

const allRows = await scanAll();
const inventoryItems = allRows.filter((row) => row.entityType === 'InventoryItem');
const existingGroups = new Map(
  allRows
    .filter((row) => row.entityType === 'InventoryGroup')
    .map((group) => [`${group.PK}|${group.groupId}`, group]),
);
const groups = new Map();

for (const item of inventoryItems) {
  const key = canonicalKey(item);
  const groupId = groupIdFor(key);
  const mapKey = `${item.PK}|${groupId}`;
  const current = groups.get(mapKey) ?? {
    PK: item.PK,
    SK: `GROUP#${groupId}`,
    entityType: 'InventoryGroup',
    groupId,
    canonicalKey: key,
    name: item.name,
    category: item.category,
    unit: canonicalUnit(item.unit),
    totalQuantity: 0,
    createdAt: item.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    syncVersion: 1,
  };
  current.totalQuantity += Number(item.quantity ?? 0);
  if (typeof item.threshold === 'number') {
    current.threshold = Math.max(current.threshold ?? 0, item.threshold);
  }
  const existing = existingGroups.get(mapKey);
  if (typeof existing?.threshold === 'number') {
    current.threshold = Math.max(current.threshold ?? 0, existing.threshold);
  }
  groups.set(mapKey, current);

  item.groupId = groupId;
  item.GSI1PK = `USER#${String(item.PK).slice(5)}#CAT#${item.category}`;
  item.GSI1SK = `ITEM#${item.itemId}`;
  delete item.threshold;
  delete item.isLowStock;
}

for (const group of groups.values()) {
  group.isLowStock = group.threshold !== undefined && group.totalQuantity <= group.threshold;
}

console.log(
  JSON.stringify(
    {
      mode: apply ? 'apply' : 'dry-run',
      tableName,
      inventoryItems: inventoryItems.length,
      inventoryGroups: groups.size,
    },
    null,
    2,
  ),
);

if (!apply) {
  console.log('No writes performed. Re-run with --apply after reviewing the summary.');
  process.exit(0);
}

await writeAll([...groups.values(), ...inventoryItems]);
console.log('Inventory group migration completed.');
