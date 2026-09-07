import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { InventoryRow } from '../repository';

export class InventoryMemory {
  rows = new Map<string, InventoryRow>();
  transactions: TransactWriteCommand[] = [];
  pageSize = 100;
  failure?: Error;
  afterCommitFailure?: Error;
  calls: unknown[] = [];
  client = {
    send: (command: GetCommand | QueryCommand | TransactWriteCommand) => this.send(command),
  } as unknown as DynamoDBDocumentClient;
  key(row: InventoryRow) {
    return JSON.stringify([row.PK, row.SK]);
  }
  seed(...rows: InventoryRow[]) {
    for (const row of rows) this.rows.set(this.key(row), structuredClone(row));
  }
  reset() {
    this.rows.clear();
    this.transactions = [];
    this.calls = [];
    this.failure = undefined;
    this.afterCommitFailure = undefined;
    this.pageSize = 100;
  }
  get(user: string, sk: string) {
    return structuredClone(this.rows.get(this.key({ PK: `USER#${user}`, SK: sk })));
  }
  all(prefix: string) {
    return [...this.rows.values()].filter((r) => String(r.SK).startsWith(prefix));
  }

  async send(command: GetCommand | QueryCommand | TransactWriteCommand): Promise<unknown> {
    this.calls.push(command);
    if (command instanceof GetCommand)
      return { Item: structuredClone(this.rows.get(this.key(command.input.Key!))) };
    if (command instanceof QueryCommand) {
      const input = command.input;
      const values = input.ExpressionAttributeValues!;
      const all = [...this.rows.values()]
        .filter(
          (r) =>
            r.PK === values[':pk'] &&
            String(r.SK).startsWith(String(values[':prefix'] ?? values[':skPrefix'])),
        )
        .sort((a, b) => String(a.SK).localeCompare(String(b.SK)));
      const start = input.ExclusiveStartKey
        ? all.findIndex((r) => this.key(r) === this.key(input.ExclusiveStartKey!)) + 1
        : 0;
      const page = all.slice(start, start + (input.Limit ?? this.pageSize));
      return {
        Items: structuredClone(
          input.FilterExpression ? page.filter((r) => r.isLowStock === true) : page,
        ),
        ...(start + page.length < all.length
          ? { LastEvaluatedKey: { PK: page[page.length - 1].PK, SK: page[page.length - 1].SK } }
          : {}),
      };
    }
    if (!(command instanceof TransactWriteCommand))
      throw new Error('Unexpected nontransactional inventory write');
    this.transactions.push(command);
    if (this.failure) {
      const error = this.failure;
      this.failure = undefined;
      throw error;
    }
    const writes = command.input.TransactItems!;
    const reasons = writes.map((write) => {
      const operation = write.Put ?? write.Delete ?? write.ConditionCheck;
      if (!operation) throw new Error('Unsupported transaction operation');
      const row = 'Item' in operation ? operation.Item! : operation.Key!;
      const current = this.rows.get(this.key(row));
      const condition = operation.ConditionExpression;
      const ok =
        !condition ||
        (condition === 'attribute_not_exists(PK)'
          ? !current
          : condition === 'attribute_exists(PK)'
            ? !!current
            : condition === 'syncVersion = :expected'
              ? current?.syncVersion === operation.ExpressionAttributeValues?.[':expected']
              : false);
      return { Code: ok ? 'None' : 'ConditionalCheckFailed' };
    });
    if (reasons.some((r) => r.Code !== 'None'))
      throw Object.assign(new Error('Cancelled'), {
        name: 'TransactionCanceledException',
        CancellationReasons: reasons,
      });
    for (const write of writes) {
      if (write.Put) this.seed(write.Put.Item!);
      if (write.Delete) this.rows.delete(this.key(write.Delete.Key!));
    }
    if (this.afterCommitFailure) {
      const error = this.afterCommitFailure;
      this.afterCommitFailure = undefined;
      throw error;
    }
    return {};
  }
}

export const lot = (id: string, quantity = 1, unit = 'g', name = 'Rice'): InventoryRow => ({
  PK: 'USER#u',
  SK: `ITEM#${id}`,
  entityType: 'InventoryItem',
  userId: 'u',
  itemId: id,
  name,
  category: 'Food',
  unit,
  quantity,
  location: 'pantry',
  expirationDate: '2030-01-01',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  syncVersion: 1,
  GSI1PK: 'USER#u#CAT#Food',
  GSI1SK: `ITEM#${id}`,
});
