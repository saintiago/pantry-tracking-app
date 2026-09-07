import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { queryAll } from '../query';

test('continues through empty filtered pages and preserves query scope', async () => {
  const cursor = { PK: 'USER#a', SK: 'ITEM#last' };
  const send = jest
    .fn()
    .mockResolvedValueOnce({ Items: [], LastEvaluatedKey: cursor })
    .mockResolvedValueOnce({ Items: [{ itemId: 'found' }] });
  const client = { send } as unknown as DynamoDBDocumentClient;
  const input = { TableName: 'test', ConsistentRead: true, FilterExpression: '#loc = :loc' };
  expect(await queryAll(client, input)).toEqual({ Items: [{ itemId: 'found' }] });
  expect((send.mock.calls[1][0] as QueryCommand).input).toEqual({
    ...input,
    ExclusiveStartKey: cursor,
  });
});

test('fails the entire read when a later page fails', async () => {
  const send = jest
    .fn()
    .mockResolvedValueOnce({
      Items: [{ itemId: 'partial' }],
      LastEvaluatedKey: { PK: 'a', SK: 'b' },
    })
    .mockRejectedValueOnce(new Error('unavailable'));
  await expect(
    queryAll({ send } as unknown as DynamoDBDocumentClient, { TableName: 'test' }),
  ).rejects.toThrow('unavailable');
});
