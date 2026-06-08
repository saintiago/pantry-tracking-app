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
import { resolveUnit } from '../../types/units';

const TABLE_NAME = process.env.TABLE_NAME ?? 'PantryApp';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

function getUserId(event: APIGatewayProxyEvent): string | null {
  return (
    event.requestContext.authorizer?.claims?.sub ?? event.requestContext.authorizer?.sub ?? null
  );
}

function response(statusCode: number, body: unknown): APIGatewayProxyResult {
  return { statusCode, headers, body: JSON.stringify(body) };
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RecipeIngredient {
  name: string;
  quantity: number | null;
  unit: string;
  section?: string;
  inventoryItemId?: string;
}

export interface InventoryItem {
  name: string;
  quantity: number;
  [key: string]: unknown;
}

export interface IngredientStatus {
  name: string;
  required: number | null;
  unit: string;
  available: number;
  status: 'available' | 'partial' | 'missing';
}

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Validates optional prepTime and cookTime fields in a parsed request body.
 * Returns the name of the first failing field, or null if both are absent or valid.
 * Note: null values are treated as explicit removal signals and are not validated here.
 */
export function validateTimeFields(parsed: Record<string, unknown>): string | null {
  for (const field of ['prepTime', 'cookTime'] as const) {
    if (parsed[field] !== undefined && parsed[field] !== null) {
      const v = parsed[field];
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
        return field;
      }
    }
  }
  return null;
}

/**
 * Computes total time from optional prepTime and cookTime.
 * Returns undefined when both are absent; otherwise returns (prepTime ?? 0) + (cookTime ?? 0).
 */
export function computeTotalTime(prepTime?: number, cookTime?: number): number | undefined {
  if (prepTime === undefined && cookTime === undefined) return undefined;
  return (prepTime ?? 0) + (cookTime ?? 0);
}

/**
 * Validates the portions field in a parsed request body.
 * Returns an error message string if invalid, or null if valid or absent.
 * Absence is not an error here — the caller checks for required presence separately.
 */
export function validatePortions(parsed: Record<string, unknown>): string | null {
  if (parsed.portions === undefined) return null;
  const v = parsed.portions;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    return 'portions must be a positive integer';
  }
  return null;
}

/**
 * Normalizes a raw tags input: trims, lowercases, filters empty strings, deduplicates.
 * Pure function — no side effects.
 */
export function normalizeTags(raw: unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const normalized = item.trim().toLowerCase();
    if (normalized.length === 0) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

/**
 * Validates the tags field in a parsed request body.
 * Returns an error string if tags is absent, not an array, or empty after normalization.
 * Returns null if valid.
 */
export function validateTags(parsed: Record<string, unknown>): string | null {
  if (parsed.tags === undefined || parsed.tags === null) {
    return 'tags is required';
  }
  if (!Array.isArray(parsed.tags)) {
    return 'tags must be an array';
  }
  const normalized = normalizeTags(parsed.tags as unknown[]);
  if (normalized.length === 0) {
    return 'At least one tag is required';
  }
  return null;
}

/**
 * Scales a list of ingredient quantities from one portions base to another.
 * Returns a new array of scaled quantities (rounded to at most 2 decimal places).
 * Does NOT mutate the input ingredients.
 *
 * @param ingredients - The source ingredient list
 * @param fromPortions - The base portions value (positive integer)
 * @param toPortions - The target portions value (positive integer)
 * @returns Array of scaled quantities in the same order as the input
 */
export function scaleIngredients(
  ingredients: RecipeIngredient[],
  fromPortions: number,
  toPortions: number,
): Array<number | null> {
  const factor = toPortions / fromPortions;
  return ingredients.map((ing) =>
    ing.quantity === null ? null : Math.round(ing.quantity * factor * 100) / 100,
  );
}

/**
 * Validates the instructions field. Accepts either a non-empty string or a
 * non-empty array of non-empty strings (the array form is what new clients send).
 * `undefined` is allowed so callers can treat instructions as optional.
 */
function validateInstructions(instructions: unknown): string | null {
  if (instructions === undefined) return null;
  if (typeof instructions === 'string') {
    return instructions.trim() === '' ? 'instructions must not be empty' : null;
  }
  if (Array.isArray(instructions)) {
    if (instructions.length === 0) return 'instructions must have at least one step';
    for (const step of instructions) {
      if (typeof step !== 'string' || step.trim() === '') {
        return 'Each instruction step must be a non-empty string';
      }
    }
    return null;
  }
  return 'instructions must be a string or an array of strings';
}

function validateIngredients(ingredients: unknown): string | null {
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    return 'At least one ingredient is required';
  }
  for (const ing of ingredients) {
    if (!ing || typeof ing !== 'object') return 'Each ingredient must be an object';
    const ingredient = ing as Record<string, unknown>;
    if (!ingredient.unit || String(ingredient.unit).trim() === '') {
      return 'Each ingredient must have a unit';
    }
    const unit = String(ingredient.unit).trim();
    const quantity = ingredient.quantity;
    const validHandfulQuantity = unit === 'handful' && quantity === null;
    const validNumericQuantity =
      typeof quantity === 'number' && Number.isFinite(quantity) && quantity > 0;
    if (!validHandfulQuantity && !validNumericQuantity) {
      return 'Each ingredient must have a positive quantity, except handful may be empty';
    }
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
      ing.quantity === null
        ? totalAvailable > 0
          ? 'available'
          : 'missing'
        : totalAvailable >= ing.quantity
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

  console.log(
    `autoCreateMissingIngredients: found ${inventoryResult.Items?.length ?? 0} existing items, checking ${ingredients.length} ingredients`,
  );

  const toCreate = ingredients.filter((ing) => !existingNames.has(ing.name.toLowerCase()));
  console.log(
    `autoCreateMissingIngredients: creating ${toCreate.length} placeholder items:`,
    toCreate.map((i) => i.name),
  );

  const now = new Date().toISOString();

  await Promise.all(
    toCreate.map((ing) => {
      const itemId = randomUUID();
      const unit = resolveUnit(ing.unit);
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

async function createRecipe(userId: string, body: string | null): Promise<APIGatewayProxyResult> {
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

  const instructionsError = validateInstructions(parsed.instructions);
  if (instructionsError) {
    return response(400, {
      error: 'VALIDATION_ERROR',
      message: instructionsError,
      details: [{ field: 'instructions', message: instructionsError }],
    });
  }

  const invalidTimeField = validateTimeFields(parsed);
  if (invalidTimeField) {
    return response(400, {
      error: 'VALIDATION_ERROR',
      message: `${invalidTimeField} must be a non-negative integer`,
      details: [
        { field: invalidTimeField, message: `${invalidTimeField} must be a non-negative integer` },
      ],
    });
  }

  const portionsError = validatePortions(parsed);
  if (portionsError) {
    return response(400, {
      error: 'VALIDATION_ERROR',
      message: portionsError,
      details: [{ field: 'portions', message: portionsError }],
    });
  }
  if (parsed.portions === undefined) {
    return response(400, {
      error: 'VALIDATION_ERROR',
      message: 'portions is required',
      details: [{ field: 'portions', message: 'portions is required' }],
    });
  }

  const tagsError = validateTags(parsed);
  if (tagsError) {
    return response(400, {
      error: 'VALIDATION_ERROR',
      message: tagsError,
      details: [{ field: 'tags', message: tagsError }],
    });
  }

  const normalizedTags = normalizeTags(parsed.tags as unknown[]);

  const now = new Date().toISOString();
  const recipeId = randomUUID();

  const recipe: Record<string, unknown> = {
    PK: `USER#${userId}`,
    SK: `RECIPE#${recipeId}`,
    entityType: 'Recipe',
    recipeId,
    userId,
    name: String(parsed.name).trim(),
    tags: normalizedTags,
    ingredients: parsed.ingredients,
    instructions: parsed.instructions ?? '',
    createdAt: now,
    updatedAt: now,
    syncVersion: 1,
    portions: parsed.portions as number,
  };

  if (parsed.sourceUrl !== undefined && parsed.sourceUrl !== null) {
    recipe.sourceUrl = parsed.sourceUrl;
  }
  if (parsed.chefNotes !== undefined && parsed.chefNotes !== null) {
    recipe.chefNotes = parsed.chefNotes;
  }

  if (parsed.prepTime !== undefined) recipe.prepTime = parsed.prepTime as number;
  if (parsed.cookTime !== undefined) recipe.cookTime = parsed.cookTime as number;

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

  // Validate instructions if provided
  if (parsed.instructions !== undefined) {
    const instructionsError = validateInstructions(parsed.instructions);
    if (instructionsError) {
      return response(400, {
        error: 'VALIDATION_ERROR',
        message: instructionsError,
        details: [{ field: 'instructions', message: instructionsError }],
      });
    }
  }

  const invalidTimeField = validateTimeFields(parsed);
  if (invalidTimeField) {
    return response(400, {
      error: 'VALIDATION_ERROR',
      message: `${invalidTimeField} must be a non-negative integer`,
      details: [
        { field: invalidTimeField, message: `${invalidTimeField} must be a non-negative integer` },
      ],
    });
  }

  const portionsError = validatePortions(parsed);
  if (portionsError) {
    return response(400, {
      error: 'VALIDATION_ERROR',
      message: portionsError,
      details: [{ field: 'portions', message: portionsError }],
    });
  }

  if (parsed.tags !== undefined) {
    const tagsError = validateTags(parsed);
    if (tagsError) {
      return response(400, {
        error: 'VALIDATION_ERROR',
        message: tagsError,
        details: [{ field: 'tags', message: tagsError }],
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
    prepTime: 'prepTime',
    cookTime: 'cookTime',
    portions: 'portions',
    chefNotes: 'chefNotes',
  };

  for (const [field, dbField] of Object.entries(updatableFields)) {
    if (parsed[field] !== undefined && parsed[field] !== null) {
      const alias = `#f_${field}`;
      const valAlias = `:v_${field}`;
      expressionAttrNames[alias] = dbField;
      expressionAttrValues[valAlias] = parsed[field];
      updateParts.push(`${alias} = ${valAlias}`);
    }
  }

  // Handle tags separately — needs normalization
  if (parsed.tags !== undefined) {
    const normalizedTags = normalizeTags(parsed.tags as unknown[]);
    const alias = '#f_tags';
    const valAlias = ':v_tags';
    expressionAttrNames[alias] = 'tags';
    expressionAttrValues[valAlias] = normalizedTags;
    updateParts.push(`${alias} = ${valAlias}`);
  }

  // Handle explicit null values for optional fields — use REMOVE to delete the attribute.
  const removeParts: string[] = [];
  for (const field of ['prepTime', 'cookTime', 'chefNotes'] as const) {
    if (parsed[field] === null) {
      const alias = `#f_${field}`;
      expressionAttrNames[alias] = field;
      removeParts.push(alias);
    }
  }

  const updateExpressionParts: string[] = [];
  if (updateParts.length > 0) updateExpressionParts.push(`SET ${updateParts.join(', ')}`);
  if (removeParts.length > 0) updateExpressionParts.push(`REMOVE ${removeParts.join(', ')}`);
  const updateExpression = updateExpressionParts.join(' ');

  try {
    const result = await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: `RECIPE#${recipeId}` },
        UpdateExpression: updateExpression,
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

async function listRecipeTags(userId: string): Promise<APIGatewayProxyResult> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':skPrefix': 'RECIPE#',
      },
      ProjectionExpression: 'tags',
    }),
  );

  const allTags: string[] = [];
  for (const item of result.Items ?? []) {
    if (Array.isArray(item.tags)) {
      for (const tag of item.tags) {
        if (typeof tag === 'string') {
          allTags.push(tag.trim().toLowerCase());
        }
      }
    }
  }

  // Deduplicate and sort
  const uniqueTags = [...new Set(allTags)].sort();

  return response(200, { tags: uniqueTags });
}

async function deleteRecipe(userId: string, recipeId: string): Promise<APIGatewayProxyResult> {
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

    // Must be before GET /recipes/{recipeId} to avoid "tags" being treated as a recipeId
    if (method === 'GET' && recipeId === 'tags') {
      return await listRecipeTags(userId);
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
