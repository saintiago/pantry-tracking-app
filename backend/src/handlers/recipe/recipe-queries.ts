import { GetCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyResult } from 'aws-lambda';
import { response } from '../../http/response';
import { computeAvailability, type InventoryItem, type RecipeIngredient } from './recipe-rules';
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

export async function getRecipeWithAvailability(
  docClient: DynamoDBDocumentClient,
  TABLE_NAME: string,
  userId: string,
  recipeId: string,
): Promise<APIGatewayProxyResult> {
  const recipeResult = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: `RECIPE#${recipeId}` },
    }),
  );

  if (!recipeResult.Item) {
    return response(404, { error: 'NOT_FOUND', message: 'Recipe not found' });
  }

  const recipe = recipeResult.Item;

  // Fetch all inventory items for availability calculation
  const inventoryResult = await queryAll(docClient, {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':skPrefix': 'ITEM#',
    },
  });

  const inventoryItems = (inventoryResult.Items ?? []) as InventoryItem[];
  const ingredients = (recipe.ingredients ?? []) as RecipeIngredient[];
  const { ingredientAvailability, missingCount } = computeAvailability(ingredients, inventoryItems);

  return response(200, { recipe, ingredientAvailability, missingCount });
}
