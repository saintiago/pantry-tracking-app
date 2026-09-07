import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { queryAll } from '../../db/query';
export function recipeTags(items: Record<string, unknown>[]): string[] {
  return [
    ...new Set(
      items.flatMap((item) =>
        Array.isArray(item.tags)
          ? item.tags
              .filter((tag): tag is string => typeof tag === 'string')
              .map((tag) => tag.trim().toLowerCase())
          : [],
      ),
    ),
  ].sort();
}
export async function readRecipePages(
  docClient: DynamoDBDocumentClient,
  TABLE_NAME: string,
  userId: string,
  projection?: string,
): Promise<Record<string, unknown>[]> {
  return (
    await queryAll(docClient, {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':skPrefix': 'RECIPE#' },
      ...(projection ? { ProjectionExpression: projection } : {}),
    })
  ).Items;
}
