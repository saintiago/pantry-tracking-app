#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { scanInventoryAudit } from '../backend/dist/handlers/inventory/inventory-audit.js';

const { values } = parseArgs({
  options: { table: { type: 'string' }, region: { type: 'string' }, output: { type: 'string' } },
});
const tableName = values.table ?? process.env.TABLE_NAME ?? 'PantryApp';
const region = values.region ?? process.env.AWS_REGION ?? 'eu-north-1';
const startedAt = new Date().toISOString();
const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
try {
  const report = {
    tableName,
    region,
    startedAt,
    completedAt: '',
    ...(await scanInventoryAudit(client, tableName)),
  };
  report.completedAt = new Date().toISOString();
  if (values.output)
    await writeFile(values.output, JSON.stringify(report, null, 2) + '\n', {
      encoding: 'utf8',
      flag: 'wx',
    });
  const { findings: _findings, ...summary } = report;
  console.log(JSON.stringify(summary, null, 2));
  console.log(
    'No database writes performed. Consistent scan pages are not a snapshot. Review findings on an isolated restore before planning repairs.',
  );
} finally {
  client.destroy();
}
