import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { VALID_UNITS } from '../../types/units';

const TABLE_NAME = process.env.TABLE_NAME ?? 'PantryApp';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

function getUserId(event: APIGatewayProxyEvent): string | null {
  return (
    event.requestContext.authorizer?.claims?.sub ??
    event.requestContext.authorizer?.sub ??
    null
  );
}

function response(statusCode: number, body: unknown): APIGatewayProxyResult {
  return { statusCode, headers, body: JSON.stringify(body) };
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RecipeIngredient {
  name: string;
  quantity: number;
  unit: string;
  inventoryItemId?: string;
}

export interface InventoryItem {
  name: string;
  quantity: number;
  [key: string]: unknown;
}

export interface IngredientStatus {
  name: string;
  required: number;
  unit: string;
  available: number;
  status: 'available' | 'partial' | 'missing';
}

// ─── Validation ──────────────────────────────────────────────────────────────

function validateIngredients(ingredients: unknown): string | null {
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    return 'At least one ingredient is required';
  }
  for (const ing of ingredients) {
    if (!ing || typeof ing !== 'object') return 'Each ingredient must be an object';
    if (!ing.quantity || ing.quantity <= 0) return 'Each ingredient must have a positive quantity';
    if (!ing.unit || String(ing.unit).trim() === '') return 'Each ingredient must have a unit';
  }
  return null;
}

// ─── Availability Calculator (pure function) ─────────────────────────────────

export function computeAvailability(
  ingredients: RecipeIngredient[],
  inventoryItems: InventoryItem[],
): { ingredientAvailability: IngredientStatus[]; missingCount: number } {
  const ingredientAvailability = ingredients.map((ing) => {
    const totalAvailable = inventoryItems
      .filter((item) => item.name.toLowerCase() === ing.name.toLowerCase())
      .reduce((sum, item) => sum + item.quantity, 0);

    const status: 'available' | 'partial' | 'missing' =
      totalAvailable >= ing.quantity
        ? 'available'
        : totalAvailable > 0
          ? 'partial'
          : 'missing';

    return {
      name: ing.name,
      required: ing.quantity,
      unit: ing.unit,
      available: totalAvailable,
      status,
    };
  });

  const missingCount = ingredientAvailability.filter((a) => a.status !== 'available').length;
  return { ingredientAvailability, missingCount };
}

// ─── Auto-create placeholder inventory items for unrecognized ingredients ────

async function autoCreateMissingIngredients(
  userId: string,
  ingredients: RecipeIngredient[],
): Promise<void> {
  // Fetch all existing inventory items for this user
  const inventoryResult = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':skPrefix': 'ITEM#',
      },
    }),
  );

  const existingNames = new Set(
    (inventoryResult.Items ?? []).map((item) => (item.name as string).toLowerCase()),
  );

  console.log(`autoCreateMissingIngredients: found ${inventoryResult.Items?.length ?? 0} existing items, checking ${ingredients.length} ingredients`);

  const toCreate = ingredients.filter((ing) => !existingNames.has(ing.name.toLowerCase()));
  console.log(`autoCreateMissingIngredients: creating ${toCreate.length} placeholder items:`, toCreate.map(i => i.name));

  const now = new Date().toISOString();

  await Promise.all(
    toCreate
      .map((ing) => {
        const itemId = randomUUID();
        const unit = VALID_UNITS.includes(ing.unit as typeof VALID_UNITS[number])
          ? ing.unit
          : 'Unit';
        const item = {
          PK: `USER#${userId}`,
          SK: `ITEM#${itemId}`,
          entityType: 'InventoryItem',
          itemId,
          userId,
          name: ing.name,
          category: 'Uncategorized',
          expirationDate: '2099-12-31',
          location: 'unknown',
          quantity: 0,
          unit,
          isLowStock: true,
          createdAt: now,
          updatedAt: now,
          syncVersion: 1,
          // Use category GSI key so items appear in the "Unknown" category view,
          // even though isLowStock is true (quantity 0 = out of stock)
          GSI1PK: `USER#${userId}#CAT#Unknown`,
          GSI1SK: `ITEM#${itemId}`,
        };
        return docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
      }),
  );
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function listRecipes(userId: string): Promise<APIGatewayProxyResult> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':skPrefix': 'RECIPE#',
      },
    }),
  );

  return response(200, { recipes: result.Items ?? [] });
}

async function createRecipe(
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

  if (!parsed.name || String(parsed.name).trim() === '') {
    return response(400, {
      error: 'VALIDATION_ERROR',
      message: 'name is required',
      details: [{ field: 'name', message: 'name is required' }],
    });
  }

  const ingredientError = validateIngredients(parsed.ingredients);
  if (ingredientError) {
    return response(400, {
      error: 'VALIDATION_ERROR',
      message: ingredientError,
      details: [{ field: 'ingredients', message: ingredientError }],
    });
  }

  const now = new Date().toISOString();
  const recipeId = randomUUID();

  const recipe: Record<string, unknown> = {
    PK: `USER#${userId}`,
    SK: `RECIPE#${recipeId}`,
    entityType: 'Recipe',
    recipeId,
    userId,
    name: String(parsed.name).trim(),
    ingredients: parsed.ingredients,
    instructions: parsed.instructions ?? '',
    createdAt: now,
    updatedAt: now,
    syncVersion: 1,
  };

  if (parsed.sourceUrl !== undefined && parsed.sourceUrl !== null) {
    recipe.sourceUrl = parsed.sourceUrl;
  }

  await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: recipe }));

  // Auto-create placeholder inventory items for any unrecognized ingredients
  await autoCreateMissingIngredients(userId, parsed.ingredients as RecipeIngredient[]);

  return response(201, { recipe });
}

async function getRecipeWithAvailability(
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
  const inventoryResult = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':skPrefix': 'ITEM#',
      },
    }),
  );

  const inventoryItems = (inventoryResult.Items ?? []) as InventoryItem[];
  const ingredients = (recipe.ingredients ?? []) as RecipeIngredient[];
  const { ingredientAvailability, missingCount } = computeAvailability(ingredients, inventoryItems);

  return response(200, { recipe, ingredientAvailability, missingCount });
}

async function updateRecipe(
  userId: string,
  recipeId: string,
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

  // Validate ingredients if provided
  if (parsed.ingredients !== undefined) {
    const ingredientError = validateIngredients(parsed.ingredients);
    if (ingredientError) {
      return response(400, {
        error: 'VALIDATION_ERROR',
        message: ingredientError,
        details: [{ field: 'ingredients', message: ingredientError }],
      });
    }
  }

  const now = new Date().toISOString();
  const expressionAttrNames: Record<string, string> = { '#updatedAt': 'updatedAt' };
  const expressionAttrValues: Record<string, unknown> = { ':now': now, ':inc': 1 };
  const updateParts: string[] = ['#updatedAt = :now', 'syncVersion = syncVersion + :inc'];

  const updatableFields: Record<string, string> = {
    name: 'name',
    ingredients: 'ingredients',
    instructions: 'instructions',
    sourceUrl: 'sourceUrl',
  };

  for (const [field, dbField] of Object.entries(updatableFields)) {
    if (parsed[field] !== undefined) {
      const alias = `#f_${field}`;
      const valAlias = `:v_${field}`;
      expressionAttrNames[alias] = dbField;
      expressionAttrValues[valAlias] = parsed[field];
      updateParts.push(`${alias} = ${valAlias}`);
    }
  }

  try {
    const result = await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: `RECIPE#${recipeId}` },
        UpdateExpression: `SET ${updateParts.join(', ')}`,
        ConditionExpression: 'attribute_exists(PK)',
        ExpressionAttributeNames: expressionAttrNames,
        ExpressionAttributeValues: expressionAttrValues,
        ReturnValues: 'ALL_NEW',
      }),
    );

    // Auto-create placeholder inventory items for any unrecognized ingredients
    if (parsed.ingredients !== undefined) {
      await autoCreateMissingIngredients(userId, parsed.ingredients as RecipeIngredient[]);
    }

    return response(200, { recipe: result.Attributes });
  } catch (err: unknown) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      return response(404, { error: 'NOT_FOUND', message: 'Recipe not found' });
    }
    throw err;
  }
}

async function deleteRecipe(
  userId: string,
  recipeId: string,
): Promise<APIGatewayProxyResult> {
  // Verify recipe exists
  const existing = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: `RECIPE#${recipeId}` },
    }),
  );

  if (!existing.Item) {
    return response(404, { error: 'NOT_FOUND', message: 'Recipe not found' });
  }

  // Check if recipe is assigned to any meal plan
  const mealPlanResult = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      FilterExpression: 'recipeId = :recipeId',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':skPrefix': 'MEAL#',
        ':recipeId': recipeId,
      },
    }),
  );

  const mealPlanCount = (mealPlanResult.Items ?? []).length;

  await docClient.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: `RECIPE#${recipeId}` },
    }),
  );

  const responseBody: Record<string, unknown> = { message: 'Recipe deleted' };
  if (mealPlanCount > 0) {
    responseBody.warning = `This recipe was assigned to ${mealPlanCount} meal plan(s). Those assignments have been left in place but will reference a deleted recipe.`;
    responseBody.mealPlanCount = mealPlanCount;
  }

  return response(200, responseBody);
}

// ─── Route Dispatcher ─────────────────────────────────────────────────────────

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const userId = getUserId(event);
  if (!userId) {
    return response(401, { error: 'UNAUTHORIZED', message: 'Missing authentication' });
  }

  const method = event.httpMethod;
  const recipeId = event.pathParameters?.recipeId ?? null;

  try {
    if (method === 'GET' && !recipeId) {
      return await listRecipes(userId);
    }

    if (method === 'POST' && !recipeId) {
      return await createRecipe(userId, event.body);
    }

    if (method === 'GET' && recipeId) {
      return await getRecipeWithAvailability(userId, recipeId);
    }

    if (method === 'PUT' && recipeId) {
      return await updateRecipe(userId, recipeId, event.body);
    }

    if (method === 'DELETE' && recipeId) {
      return await deleteRecipe(userId, recipeId);
    }

    return response(405, { error: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' });
  } catch (err) {
    console.error('Recipe Lambda error:', err);
    return response(500, {
      error: 'INTERNAL_ERROR',
      message: 'Internal server error',
      requestId: event.requestContext.requestId,
    });
  }
}
