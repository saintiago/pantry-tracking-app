import { cookbookRequest, validateCookbook } from '../cookbooks';
import {
  GetCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
const valid = {
  name: 'Weeknight dinners',
  description: 'Quick favorites',
  recipeIds: ['recipe-a', 'recipe-b'],
};
function fixture() {
  const records = new Map<string, Record<string, unknown>>();
  const send = jest.fn(async (command) => {
    const input = command.input;
    const key = input.Key?.PK + ':' + input.Key?.SK;
    if (command instanceof GetCommand) return { Item: records.get(key) };
    if (command instanceof QueryCommand)
      return {
        Items: [...records.values()].filter((r) => r.PK === input.ExpressionAttributeValues[':pk']),
      };
    if (command instanceof PutCommand || command instanceof DeleteCommand) {
      const item = input.Item;
      const k = item ? item.PK + ':' + item.SK : key;
      const previous = records.get(k);
      if (
        input.ConditionExpression.includes('attribute_not_exists')
          ? !!previous
          : previous?.version !== input.ExpressionAttributeValues[':version']
      )
        throw Object.assign(new Error('Conflict'), { name: 'ConditionalCheckFailedException' });
      if (item) records.set(k, item);
      else records.delete(k);
      return {};
    }
    throw new Error('Unexpected command');
  });
  return { records, send, client: { send } as unknown as DynamoDBDocumentClient };
}
test('cookbooks persist metadata/membership, isolate accounts, reject stale edits and preserve recipes on delete', async () => {
  const f = fixture();
  const request = (user: string, method: string, id?: string, body: unknown = valid) =>
    cookbookRequest(f.client, 'Test', user, method, id, JSON.stringify(body));
  const created = await request('alice', 'POST');
  expect(created.statusCode).toBe(201);
  const book = JSON.parse(created.body);
  expect(book).toMatchObject({ ...valid, version: 1 });
  expect(JSON.parse((await request('alice', 'GET')).body).cookbooks).toHaveLength(1);
  expect(JSON.parse((await request('bob', 'GET')).body).cookbooks).toEqual([]);
  expect(
    (await request('bob', 'PUT', book.cookbookId, { ...book, name: 'Stolen' })).statusCode,
  ).toBe(404);
  const edited = await request('alice', 'PUT', book.cookbookId, {
    ...book,
    name: 'Updated',
    recipeIds: ['recipe-a', 'recipe-a'],
  });
  expect(JSON.parse(edited.body)).toMatchObject({
    name: 'Updated',
    recipeIds: ['recipe-a'],
    version: 2,
  });
  expect((await request('alice', 'PUT', book.cookbookId, book)).statusCode).toBe(409);
  expect((await request('alice', 'DELETE', book.cookbookId, { version: 2 })).statusCode).toBe(200);
  expect(
    f.send.mock.calls
      .filter(([c]) => c instanceof DeleteCommand)
      .every(([c]) => c.input.Key.SK.startsWith('COOKBOOK#')),
  ).toBe(true);
});
test.each([
  { ...valid, name: '' },
  { ...valid, recipeIds: [''] },
  { ...valid, description: 'a'.repeat(2001) },
  { ...valid, imageId: '../../other-account' },
])('rejects malformed cookbook metadata', (value) =>
  expect(validateCookbook(value)).not.toBeNull(),
);
test('rejects invalid JSON before writing', async () => {
  const f = fixture();
  expect(
    (await cookbookRequest(f.client, 'Test', 'alice', 'POST', undefined, '{')).statusCode,
  ).toBe(400);
  expect(f.send).not.toHaveBeenCalled();
});
