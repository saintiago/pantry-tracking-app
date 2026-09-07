import { DynamoDBDocumentClient, QueryCommand, QueryCommandInput } from '@aws-sdk/lib-dynamodb';

/** DynamoDB's size limit applies before filtering; even empty pages may have a cursor. */
export async function queryAll(client: DynamoDBDocumentClient, input: QueryCommandInput) {
  const Items: Record<string, unknown>[] = [];
  let cursor = input.ExclusiveStartKey;
  do {
    const page = await client.send(
      new QueryCommand({
        ...input,
        ...(cursor ? { ExclusiveStartKey: cursor } : {}),
      }),
    );
    Items.push(...(page.Items ?? []));
    cursor = page.LastEvaluatedKey;
  } while (cursor);
  return { Items };
}
