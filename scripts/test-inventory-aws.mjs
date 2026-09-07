#!/usr/bin/env node
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  DynamoDBClient,
  CreateTableCommand,
  DeleteTableCommand,
  waitUntilTableExists,
  waitUntilTableNotExists,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  BatchWriteCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { InventoryRepository } from '../backend/dist/inventory/repository.js';
import { defaultGroupId, canonicalGroupKey } from '../backend/dist/inventory/groups.js';
import { auditInventory } from '../backend/dist/handlers/inventory/inventory-audit.js';

// This command can only create its own isolated fixture table; it cannot target production.
const region = process.env.AWS_REGION ?? 'eu-north-1';
const account = execFileSync(
  'aws',
  ['sts', 'get-caller-identity', '--query', 'Account', '--output', 'text', '--region', region],
  { encoding: 'utf8' },
).trim();
assert.equal(account, '698643713254', 'Unexpected AWS account');
const table = `PantryApp-inventory-test-${Date.now()}-${randomUUID().slice(0, 8)}`;
const raw = new DynamoDBClient({ region });
const client = DynamoDBDocumentClient.from(raw);
const repository = new InventoryRepository(client, table);
const pk = 'USER#integration';
const groupId = defaultGroupId('Rice', 'Food', 'g');
const item = (id, quantity = 1, name = 'Rice') => ({
  PK: pk,
  SK: `ITEM#${id}`,
  entityType: 'InventoryItem',
  userId: 'integration',
  itemId: id,
  name,
  category: 'Food',
  quantity,
  unit: 'g',
  location: 'drill',
  expirationDate: '2030-01-01',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  syncVersion: 1,
  GSI1PK: `${pk}#CAT#Food`,
  GSI1SK: `ITEM#${id}`,
});
async function snapshot() {
  const rows = [];
  let cursor;
  do {
    const page = await client.send(
      new ScanCommand({ TableName: table, ConsistentRead: true, ExclusiveStartKey: cursor }),
    );
    rows.push(...(page.Items ?? []));
    cursor = page.LastEvaluatedKey;
  } while (cursor);
  return rows;
}
function consistent(rows) {
  const findings = auditInventory(rows).findingCounts;
  for (const code of [
    'TOTAL_MISMATCH',
    'LOW_STOCK_MISMATCH',
    'MISSING_GROUP_LINK',
    'MISSING_GROUP',
    'MISSING_LOCATION',
  ])
    assert.equal(findings[code] ?? 0, 0, code);
}
let created = false;
try {
  await raw.send(
    new CreateTableCommand({
      TableName: table,
      BillingMode: 'PAY_PER_REQUEST',
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
      AttributeDefinitions: [
        { AttributeName: 'PK', AttributeType: 'S' },
        { AttributeName: 'SK', AttributeType: 'S' },
      ],
    }),
  );
  created = true;
  console.log(`Created isolated table ${table}`);
  await waitUntilTableExists(
    { client: raw, maxWaitTime: 180, minDelay: 1, maxDelay: 5 },
    { TableName: table },
  );
  const seeds = Array.from({ length: 22 }, (_, i) => ({
    ...item(`seed-${i}`),
    groupId,
    brand: 'x'.repeat(60000),
  }));
  seeds.push({
    PK: pk,
    SK: `GROUP#${groupId}`,
    entityType: 'InventoryGroup',
    groupId,
    canonicalKey: canonicalGroupKey('Rice', 'Food', 'g'),
    name: 'Rice',
    category: 'Food',
    unit: 'g',
    totalQuantity: 22,
    isLowStock: false,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    syncVersion: 1,
  });
  seeds.push({
    PK: pk,
    SK: 'LOCATION#drill',
    entityType: 'StorageLocation',
    locationId: 'drill',
    userId: 'integration',
    name: 'Drill',
    syncVersion: 1,
  });
  seeds.push({ ...item('legacy', 0, 'Legacy spice'), isLowStock: true });
  let requests = seeds.map((Item) => ({ PutRequest: { Item } }));
  for (let retry = 0; requests.length && retry < 8; retry++) {
    const result = await client.send(
      new BatchWriteCommand({ RequestItems: { [table]: requests } }),
    );
    requests = result.UnprocessedItems?.[table] ?? [];
  }
  assert.equal(requests.length, 0, 'Incomplete fixture setup');
  let itemPages = 0;
  const countingClient = {
    send: (command) => {
      if (
        command instanceof QueryCommand &&
        command.input.ExpressionAttributeValues?.[':prefix'] === 'ITEM#'
      )
        itemPages++;
      return client.send(command);
    },
  };
  await new InventoryRepository(countingClient, table).add('integration', item('page-check'));
  assert.ok(itemPages > 1, 'Must read real pages exceeding DynamoDB 1 MB limit');
  console.log('Passed real >1 MB inventory pagination');
  await repository.update('integration', 'legacy', { name: 'Old spice' }, false);
  const adoptedGroup = (await snapshot()).find(
    (row) => row.SK === `GROUP#${defaultGroupId('Legacy spice', 'Food', 'g')}`,
  );
  assert.equal(adoptedGroup.threshold, 0);
  assert.equal(adoptedGroup.name, 'Legacy spice');
  assert.equal(adoptedGroup.isLowStock, true);
  console.log('Passed legacy-lot adoption with retained identity and warning intent');

  await Promise.all(
    Array.from({ length: 6 }, (_, i) => repository.add('integration', item(`add-${i}`, 2))),
  );
  await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      repository.add('integration', item(`new-${i}`, 1, 'Beans')),
    ),
  );
  consistent(await snapshot());
  assert.equal(
    (await snapshot()).find((r) => r.groupId === groupId && r.entityType === 'InventoryGroup')
      .totalQuantity,
    35,
  );
  await repository.threshold('integration', groupId, 34);
  const transition = await repository.update('integration', 'add-0', { quantity: 0 }, false);
  assert.equal(transition.lowStockTransition, true);
  await Promise.all([
    repository.update('integration', 'seed-0', { name: 'Beans' }, true),
    repository.delete('integration', 'seed-1'),
    repository.threshold('integration', groupId, 30),
    repository.add('integration', item('overlap', 3)),
    repository.update('integration', 'seed-2', { quantity: 5 }, false),
  ]);
  consistent(await snapshot());
  console.log('Passed concurrent group creation, add/update/reassign/delete and threshold changes');

  const before = auditInventory(await snapshot()).fingerprint;
  const rejectingClient = {
    send: (command) =>
      command instanceof TransactWriteCommand
        ? client.send(
            new TransactWriteCommand({
              ...command.input,
              TransactItems: [
                ...command.input.TransactItems,
                {
                  ConditionCheck: {
                    TableName: table,
                    Key: { PK: pk, SK: 'NEVER_EXISTS' },
                    ConditionExpression: 'attribute_exists(PK)',
                  },
                },
              ],
            }),
          )
        : client.send(command),
  };
  await assert.rejects(
    new InventoryRepository(rejectingClient, table).update(
      'integration',
      'add-1',
      { quantity: 900 },
      false,
    ),
    (error) => error.statusCode === 409,
  );
  assert.equal(auditInventory(await snapshot()).fingerprint, before);
  console.log('Passed injected DynamoDB rejection with no partial writes and bounded retries');

  let writes = 0;
  let committed;
  const ambiguousClient = {
    send: async (command) => {
      const result = await client.send(command);
      if (command instanceof TransactWriteCommand) {
        writes++;
        committed = command;
        throw Object.assign(new Error('Simulated response loss after commit'), {
          name: 'TimeoutError',
        });
      }
      return result;
    },
  };
  await assert.rejects(
    new InventoryRepository(ambiguousClient, table).add('integration', item('response-loss', 2)),
    /response loss/,
  );
  assert.equal(writes, 1);
  const committedFingerprint = auditInventory(await snapshot()).fingerprint;
  await client.send(committed);
  assert.equal(auditInventory(await snapshot()).fingerprint, committedFingerprint);
  console.log(
    'Passed ambiguous-response non-replay and real ClientRequestToken replay deduplication',
  );

  await Promise.all(
    Array.from({ length: 4 }, () => repository.ensurePlaceholder('integration', 'Milk', 'Liter')),
  );
  const rows = await snapshot();
  assert.equal(rows.filter((r) => r.entityType === 'InventoryItem' && r.name === 'Milk').length, 1);
  consistent(rows);
  console.log('Passed concurrent recipe placeholders with real location and group threshold');
  console.log(
    JSON.stringify(
      { table, account, region, result: 'passed', finalRows: rows.length, itemPages },
      null,
      2,
    ),
  );
} finally {
  if (created) {
    assert.ok(table.startsWith('PantryApp-inventory-test-'));
    await raw.send(new DeleteTableCommand({ TableName: table }));
    await waitUntilTableNotExists(
      { client: raw, maxWaitTime: 180, minDelay: 1, maxDelay: 5 },
      { TableName: table },
    );
    console.log(`Deleted isolated table ${table}`);
  }
  client.destroy();
}
