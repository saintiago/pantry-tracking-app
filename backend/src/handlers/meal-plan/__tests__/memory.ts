type Row = Record<string, unknown>;
type Command = { input: Row; constructor: { name: string } };
export class PlannerMemory {
  rows = new Map<string, Row>();
  pageSize = 2;
  failAfterCommit = false;
  rejectNext = false;
  private key(row: Row) {
    return `${row.PK}|${row.SK}`;
  }
  seed(row: Row) {
    this.rows.set(this.key(row), structuredClone(row));
  }
  async send(command: Command): Promise<Row> {
    const input = command.input;
    if (command.constructor.name === 'GetCommand')
      return { Item: structuredClone(this.rows.get(this.key(input.Key as Row))) };
    if (command.constructor.name === 'QueryCommand') {
      const values = input.ExpressionAttributeValues as Row;
      const prefix = String(values[':prefix'] ?? values[':skPrefix']);
      const rows = [...this.rows.values()]
        .filter((row) => row.PK === values[':pk'] && String(row.SK).startsWith(prefix))
        .sort((a, b) => String(a.SK).localeCompare(String(b.SK)));
      const start = input.ExclusiveStartKey
        ? rows.findIndex((row) => row.SK === (input.ExclusiveStartKey as Row).SK) + 1
        : 0;
      const page = rows.slice(start, start + this.pageSize);
      return {
        Items: structuredClone(page),
        ...(start + this.pageSize < rows.length
          ? { LastEvaluatedKey: { PK: page.at(-1)!.PK, SK: page.at(-1)!.SK } }
          : {}),
      };
    }
    if (command.constructor.name !== 'TransactWriteCommand')
      throw new Error(`Unexpected ${command.constructor.name}`);
    const items = input.TransactItems as {
      Put?: { Item: Row; ConditionExpression?: string; ExpressionAttributeValues?: Row };
      Delete?: { Key: Row };
    }[];
    const rejected = items.some((item) => {
      if (!item.Put?.ConditionExpression) return false;
      const previous = this.rows.get(this.key(item.Put.Item));
      return item.Put.ConditionExpression === 'attribute_not_exists(PK)'
        ? Boolean(previous)
        : previous?.revision !== item.Put.ExpressionAttributeValues?.[':revision'];
    });
    if (rejected || this.rejectNext) {
      this.rejectNext = false;
      const error = new Error('Conflict');
      error.name = 'TransactionCanceledException';
      throw error;
    }
    for (const item of items) {
      if (item.Delete) this.rows.delete(this.key(item.Delete.Key));
      if (item.Put) this.seed(item.Put.Item);
    }
    if (this.failAfterCommit) {
      this.failAfterCommit = false;
      throw new Error('Network timeout after commit');
    }
    return {};
  }
}
