import { queryAll } from '../../db/query';
import { parseObject } from '../../http/request';
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
import { InventoryRepository, InventoryWriteError } from '../../inventory/repository';

const TABLE_NAME = process.env.TABLE_NAME ?? 'PantryApp';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

import { getUserId, response } from '../../http/response';

import {
  validateTimeFields,
  validatePortions,
  normalizeTags,
  validateTags,
  validateInstructions,
  validateIngredients,
  computeAvailability,
} from './recipe-rules';
import type { RecipeIngredient, InventoryItem } from './recipe-rules';
export * from './recipe-rules';

// ─── Auto-create placeholder inventory items for unrecognized ingredients ────

async function autoCreateMissingIngredients(
  userId: string,
  ingredients: RecipeIngredient[],
): Promise<void> {
  const inventory = new InventoryRepository(docClient, TABLE_NAME);
  for (const ingredient of ingredients) {
    await inventory.ensurePlaceholder(userId, ingredient.name, ingredient.unit);
  }
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function listRecipes(userId: string): Promise<APIGatewayProxyResult> {
  return response(200, { recipes: await readRecipePages(userId) });
}

async function readRecipePages(
  userId: string,
  projection?: string,
): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let cursor: Record<string, unknown> | undefined;
  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':skPrefix': 'RECIPE#' },
        ...(projection ? { ProjectionExpression: projection } : {}),
        ...(cursor ? { ExclusiveStartKey: cursor } : {}),
      }),
    );
    items.push(...(result.Items ?? []));
    cursor = result.LastEvaluatedKey;
  } while (cursor);
  return items;
}

async function createRecipe(userId: string, body: string | null): Promise<APIGatewayProxyResult> {
  if (!body) {
    return response(400, { error: 'VALIDATION_ERROR', message: 'Missing request body' });
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = parseObject(body);
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
    parsed = parseObject(body);
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
  const items = await readRecipePages(userId, 'tags');

  const allTags: string[] = [];
  for (const item of items) {
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
  const mealPlanResult = await queryAll(docClient, {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    FilterExpression: 'recipeId = :recipeId',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':skPrefix': 'MEAL#',
      ':recipeId': recipeId,
    },
  });

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
    if (err instanceof InventoryWriteError)
      return response(err.statusCode, { error: err.code, message: err.message });
    console.error('Recipe Lambda error:', err);
    return response(500, {
      error: 'INTERNAL_ERROR',
      message: 'Internal server error',
      requestId: event.requestContext.requestId,
    });
  }
}
