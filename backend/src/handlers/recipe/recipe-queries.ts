import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { queryAll } from '../../db/query';
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
