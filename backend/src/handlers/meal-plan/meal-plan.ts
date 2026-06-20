import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

const TABLE_NAME = process.env.TABLE_NAME ?? 'PantryApp';

const ddbClient = new DynamoDBClient({});
export const docClient = DynamoDBDocumentClient.from(ddbClient);

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

// ─── Shared helpers ──────────────────────────────────────────────────────────

export function getUserId(event: APIGatewayProxyEvent): string | null {
  return (
    event.requestContext.authorizer?.claims?.sub ?? event.requestContext.authorizer?.sub ?? null
  );
}

export function response(statusCode: number, body: unknown): APIGatewayProxyResult {
  return { statusCode, headers, body: JSON.stringify(body) };
}

// ─── Constants & Types ────────────────────────────────────────────────────────

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner'] as const;
export type MealType = (typeof MEAL_TYPES)[number];

// ─── Pure Validation Helpers ─────────────────────────────────────────────────

/**
 * Returns true iff value is one of the three valid MealType strings.
 */
export function isValidMealType(value: unknown): value is MealType {
  return MEAL_TYPES.includes(value as MealType);
}

/**
 * Returns true iff value is a string that strictly matches YYYY-MM-DD.
 * Does not accept ISO timestamps — date-only strings only.
 */
export function isValidIsoDate(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  // Ensure the string represents an actual calendar date
  const d = new Date(value + 'T00:00:00.000Z');
  return !isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

/**
 * Validates the startDate/endDate pair for GET /meal-plans query parameters.
 * Returns an error message string on failure, or null if both params are valid.
 * Requirements 7.3: missing, non-ISO, or endDate < startDate all return 400.
 */
export function validateDateRange(startDate?: string, endDate?: string): string | null {
  if (!startDate) return 'startDate is required';
  if (!endDate) return 'endDate is required';
  if (!isValidIsoDate(startDate)) return 'startDate must be a valid ISO date (YYYY-MM-DD)';
  if (!isValidIsoDate(endDate)) return 'endDate must be a valid ISO date (YYYY-MM-DD)';
  if (endDate < startDate) return 'endDate must be on or after startDate';
  return null;
}

/**
 * Validates the body of a POST /meal-plans request.
 * Returns an error message on the first failing field, or null if valid.
 * Requirements 7.5, 7.6: invalid mealType, missing/invalid date, missing recipeId/recipeName.
 */
export function validateCreateBody(parsed: Record<string, unknown>): string | null {
  if (!parsed.date) return 'date is required';
  if (!isValidIsoDate(parsed.date)) return 'date must be a valid ISO date (YYYY-MM-DD)';
  if (!parsed.mealType) return 'mealType is required';
  if (!isValidMealType(parsed.mealType))
    return `mealType must be one of: ${MEAL_TYPES.join(', ')}`;
  if (!parsed.recipeId || String(parsed.recipeId).trim() === '') return 'recipeId is required';
  if (!parsed.recipeName || String(parsed.recipeName).trim() === '') return 'recipeName is required';
  return null;
}

/**
 * Validates the body of a PUT /meal-plans/{planId} request.
 * Only validates fields that are present — all fields are optional on update.
 * Returns an error message on the first failing field, or null if valid.
 * Requirements 7.8: invalid mealType, non-ISO date, empty recipeId/recipeName.
 */
export function validateUpdateBody(parsed: Record<string, unknown>): string | null {
  if (parsed.date !== undefined) {
    if (!isValidIsoDate(parsed.date)) return 'date must be a valid ISO date (YYYY-MM-DD)';
  }
  if (parsed.mealType !== undefined) {
    if (!isValidMealType(parsed.mealType))
      return `mealType must be one of: ${MEAL_TYPES.join(', ')}`;
  }
  if (parsed.recipeId !== undefined) {
    if (!parsed.recipeId || String(parsed.recipeId).trim() === '')
      return 'recipeId must not be empty';
  }
  if (parsed.recipeName !== undefined) {
    if (!parsed.recipeName || String(parsed.recipeName).trim() === '')
      return 'recipeName must not be empty';
  }
  return null;
}

/**
 * Filters an array of records to those whose `date` falls within the inclusive
 * [startDate, endDate] range using lexicographic YYYY-MM-DD comparison.
 * Requirements 7.1, 7.2: inclusive range, empty result when no records match.
 */
export function filterByDateRange<T extends { date: string }>(
  records: T[],
  startDate: string,
  endDate: string,
): T[] {
  return records.filter((r) => r.date >= startDate && r.date <= endDate);
}

// ─── Table name export for handlers ──────────────────────────────────────────

export { TABLE_NAME };

// ─── MealPlan shape (without DynamoDB keys) ───────────────────────────────────

interface MealPlanItem {
  planId: string;
  userId: string;
  date: string;
  mealType: MealType;
  recipeId: string;
  recipeName: string;
  createdAt: string;
  updatedAt: string;
  syncVersion: number;
  entityType: 'MealPlan';
}

function stripKeys(item: Record<string, unknown>): MealPlanItem {
  const { PK: _PK, SK: _SK, ...rest } = item;
  void _PK;
  void _SK;
  return rest as unknown as MealPlanItem;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function listMealPlans(
  userId: string,
  query: Record<string, string | undefined>,
): Promise<APIGatewayProxyResult> {
  const { startDate, endDate } = query;
  const rangeError = validateDateRange(startDate, endDate);
  if (rangeError) {
    return response(400, { error: 'VALIDATION_ERROR', message: rangeError });
  }

  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':skPrefix': 'MEAL#',
      },
    }),
  );

  const items = (result.Items ?? []) as Array<Record<string, unknown>>;
  const typed = items.map((item) => stripKeys(item));
  const filtered = filterByDateRange(typed, startDate!, endDate!);

  return response(200, { mealPlans: filtered });
}

async function createMealPlan(
  userId: string,
  body: string | null,
): Promise<APIGatewayProxyResult> {
  if (!body) {
    return response(400, { error: 'VALIDATION_ERROR', message: 'Missing request body' });
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body);
  } catch {
    return response(400, { error: 'VALIDATION_ERROR', message: 'Invalid JSON body' });
  }

  const validationError = validateCreateBody(parsed);
  if (validationError) {
    return response(400, { error: 'VALIDATION_ERROR', message: validationError });
  }

  const planId = randomUUID();
  const now = new Date().toISOString();
  const date = parsed.date as string;
  const mealType = parsed.mealType as MealType;

  const mealPlan: Record<string, unknown> = {
    PK: `USER#${userId}`,
    SK: `MEAL#${date}#${mealType}#${planId}`,
    entityType: 'MealPlan',
    planId,
    userId,
    date,
    mealType,
    recipeId: parsed.recipeId as string,
    recipeName: parsed.recipeName as string,
    createdAt: now,
    updatedAt: now,
    syncVersion: 1,
  };

  await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: mealPlan }));

  return response(201, { mealPlan: stripKeys(mealPlan) });
}

async function updateMealPlan(
  userId: string,
  planId: string,
  body: string | null,
): Promise<APIGatewayProxyResult> {
  if (!body) {
    return response(400, { error: 'VALIDATION_ERROR', message: 'Missing request body' });
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body);
  } catch {
    return response(400, { error: 'VALIDATION_ERROR', message: 'Invalid JSON body' });
  }

  const validationError = validateUpdateBody(parsed);
  if (validationError) {
    return response(400, { error: 'VALIDATION_ERROR', message: validationError });
  }

  // Find the existing item — query by PK, filter by planId since planId is embedded in SK
  const queryResult = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      FilterExpression: 'planId = :planId',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':skPrefix': 'MEAL#',
        ':planId': planId,
      },
    }),
  );

  const existing = queryResult.Items?.[0] as Record<string, unknown> | undefined;
  if (!existing) {
    return response(404, { error: 'NOT_FOUND', message: 'Meal plan not found' });
  }

  const now = new Date().toISOString();
  const newDate = (parsed.date as string | undefined) ?? (existing.date as string);
  const newMealType = (parsed.mealType as MealType | undefined) ?? (existing.mealType as MealType);
  const newRecipeId = (parsed.recipeId as string | undefined) ?? (existing.recipeId as string);
  const newRecipeName =
    (parsed.recipeName as string | undefined) ?? (existing.recipeName as string);

  const dateOrTypeChanged =
    newDate !== (existing.date as string) || newMealType !== (existing.mealType as MealType);

  const oldSK = existing.SK as string;
  const newSK = `MEAL#${newDate}#${newMealType}#${planId}`;

  const updatedItem: Record<string, unknown> = {
    PK: `USER#${userId}`,
    SK: newSK,
    entityType: 'MealPlan',
    planId,
    userId,
    date: newDate,
    mealType: newMealType,
    recipeId: newRecipeId,
    recipeName: newRecipeName,
    createdAt: existing.createdAt as string,
    updatedAt: now,
    syncVersion: ((existing.syncVersion as number) ?? 0) + 1,
  };

  if (dateOrTypeChanged) {
    // SK changed: delete old + put new in a transaction
    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Delete: {
              TableName: TABLE_NAME,
              Key: { PK: `USER#${userId}`, SK: oldSK },
            },
          },
          {
            Put: {
              TableName: TABLE_NAME,
              Item: updatedItem,
            },
          },
        ],
      }),
    );
  } else {
    // SK unchanged: in-place UpdateCommand
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: oldSK },
        UpdateExpression:
          'SET recipeId = :recipeId, recipeName = :recipeName, updatedAt = :updatedAt, syncVersion = syncVersion + :inc',
        ConditionExpression: 'attribute_exists(PK)',
        ExpressionAttributeValues: {
          ':recipeId': newRecipeId,
          ':recipeName': newRecipeName,
          ':updatedAt': now,
          ':inc': 1,
        },
      }),
    );
    // Refresh the updatedAt/syncVersion we return
    updatedItem.syncVersion = ((existing.syncVersion as number) ?? 0) + 1;
  }

  return response(200, { mealPlan: stripKeys(updatedItem) });
}

async function deleteMealPlan(userId: string, planId: string): Promise<APIGatewayProxyResult> {
  // Find the existing item under the caller's partition
  const queryResult = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      FilterExpression: 'planId = :planId',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':skPrefix': 'MEAL#',
        ':planId': planId,
      },
    }),
  );

  const existing = queryResult.Items?.[0] as Record<string, unknown> | undefined;
  if (!existing) {
    return response(404, { error: 'NOT_FOUND', message: 'Meal plan not found' });
  }

  await docClient.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: existing.SK as string },
    }),
  );

  return response(200, { message: 'Meal plan deleted' });
}

// ─── Route Dispatcher ─────────────────────────────────────────────────────────

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const userId = getUserId(event);
  if (!userId) {
    return response(401, { error: 'UNAUTHORIZED', message: 'Unauthorized' });
  }

  const method = event.httpMethod;
  const planId = event.pathParameters?.planId ?? null;

  try {
    if (method === 'GET' && !planId) {
      const query = (event.queryStringParameters ?? {}) as Record<string, string | undefined>;
      return await listMealPlans(userId, query);
    }

    if (method === 'POST' && !planId) {
      return await createMealPlan(userId, event.body);
    }

    if (method === 'PUT' && planId) {
      return await updateMealPlan(userId, planId, event.body);
    }

    if (method === 'DELETE' && planId) {
      return await deleteMealPlan(userId, planId);
    }

    return response(405, { error: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' });
  } catch (err) {
    console.error('MealPlan Lambda error:', err);
    return response(500, {
      error: 'INTERNAL_ERROR',
      message: 'Internal server error',
      requestId: event.requestContext.requestId,
    });
  }
}
