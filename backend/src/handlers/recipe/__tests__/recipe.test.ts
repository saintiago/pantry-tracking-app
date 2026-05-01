import { APIGatewayProxyEvent } from 'aws-lambda';

const mockSend = jest.fn();
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({})),
}));
jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn(() => ({ send: mockSend })) },
  QueryCommand: jest.fn((input) => ({ ...input, _type: 'Query' })),
  PutCommand: jest.fn((input) => ({ ...input, _type: 'Put' })),
  UpdateCommand: jest.fn((input) => ({ ...input, _type: 'Update' })),
  DeleteCommand: jest.fn((input) => ({ ...input, _type: 'Delete' })),
  GetCommand: jest.fn((input) => ({ ...input, _type: 'Get' })),
}));

jest.mock('crypto', () => ({
  randomUUID: jest.fn(() => 'recipe-uuid-1234'),
}));

import { handler } from '../recipe';

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    body: null,
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    path: '/recipes',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {
      authorizer: { claims: { sub: 'user-123' } },
      requestId: 'req-1',
    } as any,
    resource: '',
    ...overrides,
  };
}

const validRecipe = {
  name: 'Pasta Carbonara',
  ingredients: [
    { name: 'Pasta', quantity: 200, unit: 'Gram' },
    { name: 'Eggs', quantity: 2, unit: 'Unit' },
  ],
  instructions: 'Boil pasta. Mix with eggs.',
  sourceUrl: 'https://example.com/carbonara',
  portions: 4,
};

describe('Recipe Lambda handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Auth ────────────────────────────────────────────────────────────────────

  it('returns 401 when userId is missing', async () => {
    const result = await handler(
      makeEvent({ requestContext: { authorizer: {}, requestId: 'req-1' } as any }),
    );
    expect(result.statusCode).toBe(401);
  });

  it('returns 401 when authorizer is null', async () => {
    const result = await handler(
      makeEvent({ requestContext: { authorizer: null, requestId: 'req-1' } as any }),
    );
    expect(result.statusCode).toBe(401);
  });

  it('returns 405 for unsupported methods', async () => {
    const result = await handler(makeEvent({ httpMethod: 'PATCH' }));
    expect(result.statusCode).toBe(405);
  });

  // ─── GET /recipes ─────────────────────────────────────────────────────────────

  describe('GET /recipes', () => {
    it('returns list of recipes for authenticated user', async () => {
      const recipes = [
        { recipeId: 'r-1', name: 'Pasta', ingredients: [] },
        { recipeId: 'r-2', name: 'Salad', ingredients: [] },
      ];
      mockSend.mockResolvedValueOnce({ Items: recipes });

      const result = await handler(makeEvent());
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.recipes).toHaveLength(2);
      expect(body.recipes[0].name).toBe('Pasta');
    });

    it('returns empty list when user has no recipes', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      const result = await handler(makeEvent());
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.recipes).toHaveLength(0);
    });

    it('queries with correct PK and SK prefix for user', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      await handler(makeEvent());

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          ExpressionAttributeValues: expect.objectContaining({
            ':pk': 'USER#user-123',
            ':skPrefix': 'RECIPE#',
          }),
        }),
      );
    });

    it('returns 401 when auth is missing', async () => {
      const result = await handler(
        makeEvent({ requestContext: { authorizer: {}, requestId: 'req-1' } as any }),
      );
      expect(result.statusCode).toBe(401);
    });
  });

  // ─── POST /recipes ────────────────────────────────────────────────────────────

  describe('POST /recipes', () => {
    it('creates recipe and returns 201 with recipe data', async () => {
      mockSend.mockResolvedValueOnce({}); // PutCommand: save recipe
      mockSend.mockResolvedValueOnce({ Items: [] }); // QueryCommand: existing inventory (none)
      mockSend.mockResolvedValue({}); // PutCommand: placeholder items

      const result = await handler(
        makeEvent({ httpMethod: 'POST', body: JSON.stringify(validRecipe) }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(201);
      expect(body.recipe.name).toBe('Pasta Carbonara');
      expect(body.recipe.recipeId).toBe('recipe-uuid-1234');
      expect(body.recipe.userId).toBe('user-123');
      expect(body.recipe.entityType).toBe('Recipe');
      expect(body.recipe.syncVersion).toBe(1);
      expect(body.recipe.createdAt).toBeDefined();
      expect(body.recipe.updatedAt).toBeDefined();
    });

    it('stores ingredients as provided', async () => {
      mockSend.mockResolvedValueOnce({});
      mockSend.mockResolvedValueOnce({ Items: [] });
      mockSend.mockResolvedValue({});

      const result = await handler(
        makeEvent({ httpMethod: 'POST', body: JSON.stringify(validRecipe) }),
      );
      const body = JSON.parse(result.body);

      expect(body.recipe.ingredients).toHaveLength(2);
      expect(body.recipe.ingredients[0].name).toBe('Pasta');
      expect(body.recipe.ingredients[0].quantity).toBe(200);
      expect(body.recipe.ingredients[0].unit).toBe('Gram');
    });

    it('stores sourceUrl when provided', async () => {
      mockSend.mockResolvedValueOnce({});
      mockSend.mockResolvedValueOnce({ Items: [] });
      mockSend.mockResolvedValue({});

      const result = await handler(
        makeEvent({ httpMethod: 'POST', body: JSON.stringify(validRecipe) }),
      );
      const body = JSON.parse(result.body);

      expect(body.recipe.sourceUrl).toBe('https://example.com/carbonara');
    });

    it('creates recipe without sourceUrl when not provided', async () => {
      mockSend.mockResolvedValueOnce({});
      mockSend.mockResolvedValueOnce({ Items: [] });
      mockSend.mockResolvedValue({});
      const { sourceUrl: _, ...noUrl } = validRecipe;

      const result = await handler(
        makeEvent({ httpMethod: 'POST', body: JSON.stringify(noUrl) }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(201);
      expect(body.recipe.sourceUrl).toBeUndefined();
    });

    it('auto-creates placeholder inventory items for unrecognized ingredients', async () => {
      mockSend.mockResolvedValueOnce({}); // PutCommand: save recipe
      mockSend.mockResolvedValueOnce({ Items: [] }); // QueryCommand: no existing inventory
      mockSend.mockResolvedValue({}); // PutCommand: placeholder items

      const { PutCommand } = jest.requireMock('@aws-sdk/lib-dynamodb');
      PutCommand.mockClear();

      await handler(
        makeEvent({ httpMethod: 'POST', body: JSON.stringify(validRecipe) }),
      );

      // PutCommand called once for recipe + once per ingredient (2 ingredients, both new)
      expect(PutCommand).toHaveBeenCalledTimes(3);

      // Check the placeholder items have correct fields
      const placeholderCalls = PutCommand.mock.calls.slice(1);
      for (const [item] of placeholderCalls) {
        expect(item.Item.category).toBe('Uncategorized');
        expect(item.Item.quantity).toBe(0);
        expect(item.Item.isLowStock).toBe(true);
        expect(item.Item.location).toBe('unknown');
        expect(item.Item.expirationDate).toBe('2099-12-31');
        expect(item.Item.entityType).toBe('InventoryItem');
        expect(item.Item.GSI1PK).toBe('USER#user-123#CAT#Unknown');
      }
    });

    it('does not create placeholder for ingredients that already exist in inventory', async () => {
      mockSend.mockResolvedValueOnce({}); // PutCommand: save recipe
      // QueryCommand: Pasta already exists
      mockSend.mockResolvedValueOnce({ Items: [{ name: 'Pasta', quantity: 100 }] });
      mockSend.mockResolvedValue({}); // PutCommand: placeholder for Eggs only

      const { PutCommand } = jest.requireMock('@aws-sdk/lib-dynamodb');
      PutCommand.mockClear();

      await handler(
        makeEvent({ httpMethod: 'POST', body: JSON.stringify(validRecipe) }),
      );

      // PutCommand: 1 for recipe + 1 for Eggs (Pasta already exists)
      expect(PutCommand).toHaveBeenCalledTimes(2);
      const placeholderCall = PutCommand.mock.calls[1][0];
      expect(placeholderCall.Item.name).toBe('Eggs');
    });

    it('uses piece as fallback when ingredient unit is not a valid UnitType or legacy key', async () => {
      mockSend.mockResolvedValueOnce({});
      mockSend.mockResolvedValueOnce({ Items: [] });
      mockSend.mockResolvedValue({});

      const { PutCommand } = jest.requireMock('@aws-sdk/lib-dynamodb');
      PutCommand.mockClear();

      const recipeWithInvalidUnit = {
        ...validRecipe,
        ingredients: [{ name: 'Pasta', quantity: 200, unit: 'cups' }],
      };

      await handler(
        makeEvent({ httpMethod: 'POST', body: JSON.stringify(recipeWithInvalidUnit) }),
      );

      const placeholderCall = PutCommand.mock.calls[1][0];
      expect(placeholderCall.Item.unit).toBe('piece');
    });

    it('returns 400 for empty ingredients array', async () => {
      const result = await handler(
        makeEvent({
          httpMethod: 'POST',
          body: JSON.stringify({ ...validRecipe, ingredients: [] }),
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.error).toBe('VALIDATION_ERROR');
      expect(body.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'ingredients' })]),
      );
    });

    it('returns 400 for ingredient missing quantity', async () => {
      const result = await handler(
        makeEvent({
          httpMethod: 'POST',
          body: JSON.stringify({
            ...validRecipe,
            ingredients: [{ name: 'Pasta', unit: 'Gram' }],
          }),
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.error).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for ingredient with zero quantity', async () => {
      const result = await handler(
        makeEvent({
          httpMethod: 'POST',
          body: JSON.stringify({
            ...validRecipe,
            ingredients: [{ name: 'Pasta', quantity: 0, unit: 'Gram' }],
          }),
        }),
      );

      expect(result.statusCode).toBe(400);
    });

    it('returns 400 for ingredient missing unit', async () => {
      const result = await handler(
        makeEvent({
          httpMethod: 'POST',
          body: JSON.stringify({
            ...validRecipe,
            ingredients: [{ name: 'Pasta', quantity: 200 }],
          }),
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.error).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for ingredient with empty unit string', async () => {
      const result = await handler(
        makeEvent({
          httpMethod: 'POST',
          body: JSON.stringify({
            ...validRecipe,
            ingredients: [{ name: 'Pasta', quantity: 200, unit: '   ' }],
          }),
        }),
      );

      expect(result.statusCode).toBe(400);
    });

    it('does not persist recipe when ingredients are invalid', async () => {
      await handler(
        makeEvent({
          httpMethod: 'POST',
          body: JSON.stringify({ ...validRecipe, ingredients: [] }),
        }),
      );

      // PutCommand should not have been called
      const { PutCommand } = jest.requireMock('@aws-sdk/lib-dynamodb');
      expect(PutCommand).not.toHaveBeenCalled();
    });

    it('returns 400 when body is missing', async () => {
      const result = await handler(makeEvent({ httpMethod: 'POST', body: null }));
      expect(result.statusCode).toBe(400);
    });

    it('returns 400 when body is invalid JSON', async () => {
      const result = await handler(makeEvent({ httpMethod: 'POST', body: 'not-json' }));
      expect(result.statusCode).toBe(400);
    });

    it('returns 401 when auth is missing', async () => {
      const result = await handler(
        makeEvent({
          httpMethod: 'POST',
          body: JSON.stringify(validRecipe),
          requestContext: { authorizer: {}, requestId: 'req-1' } as any,
        }),
      );
      expect(result.statusCode).toBe(401);
    });
  });

  // ─── GET /recipes/{recipeId} ──────────────────────────────────────────────────

  describe('GET /recipes/{recipeId}', () => {
    it('returns recipe with availability data', async () => {
      const recipe = {
        PK: 'USER#user-123',
        SK: 'RECIPE#recipe-1',
        recipeId: 'recipe-1',
        name: 'Pasta Carbonara',
        ingredients: [{ name: 'Pasta', quantity: 200, unit: 'Gram' }],
      };
      const inventoryItems = [{ name: 'Pasta', quantity: 300, unit: 'Gram' }];

      mockSend.mockResolvedValueOnce({ Item: recipe }); // GetCommand for recipe
      mockSend.mockResolvedValueOnce({ Items: inventoryItems }); // QueryCommand for inventory

      const result = await handler(
        makeEvent({ pathParameters: { recipeId: 'recipe-1' } }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.recipe.recipeId).toBe('recipe-1');
      expect(body.ingredientAvailability).toHaveLength(1);
      expect(body.ingredientAvailability[0].status).toBe('available');
      expect(body.missingCount).toBe(0);
    });

    it('returns partial status when inventory is insufficient', async () => {
      const recipe = {
        recipeId: 'recipe-1',
        ingredients: [{ name: 'Pasta', quantity: 500, unit: 'Gram' }],
      };
      const inventoryItems = [{ name: 'Pasta', quantity: 200, unit: 'Gram' }];

      mockSend.mockResolvedValueOnce({ Item: recipe });
      mockSend.mockResolvedValueOnce({ Items: inventoryItems });

      const result = await handler(
        makeEvent({ pathParameters: { recipeId: 'recipe-1' } }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.ingredientAvailability[0].status).toBe('partial');
      expect(body.missingCount).toBe(1);
    });

    it('returns missing status when ingredient not in inventory', async () => {
      const recipe = {
        recipeId: 'recipe-1',
        ingredients: [{ name: 'Truffle', quantity: 10, unit: 'Gram' }],
      };

      mockSend.mockResolvedValueOnce({ Item: recipe });
      mockSend.mockResolvedValueOnce({ Items: [] });

      const result = await handler(
        makeEvent({ pathParameters: { recipeId: 'recipe-1' } }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.ingredientAvailability[0].status).toBe('missing');
      expect(body.missingCount).toBe(1);
    });

    it('returns 404 for wrong user recipe (recipe not found)', async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined }); // GetCommand returns nothing

      const result = await handler(
        makeEvent({ pathParameters: { recipeId: 'other-users-recipe' } }),
      );

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).error).toBe('NOT_FOUND');
    });

    it('returns 401 when auth is missing', async () => {
      const result = await handler(
        makeEvent({
          pathParameters: { recipeId: 'recipe-1' },
          requestContext: { authorizer: {}, requestId: 'req-1' } as any,
        }),
      );
      expect(result.statusCode).toBe(401);
    });
  });

  // ─── PUT /recipes/{recipeId} ──────────────────────────────────────────────────

  describe('PUT /recipes/{recipeId}', () => {
    it('updates recipe and returns updated data', async () => {
      mockSend.mockResolvedValueOnce({
        Attributes: {
          recipeId: 'recipe-1',
          name: 'Updated Pasta',
          ingredients: validRecipe.ingredients,
          syncVersion: 2,
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      });

      const result = await handler(
        makeEvent({
          httpMethod: 'PUT',
          pathParameters: { recipeId: 'recipe-1' },
          body: JSON.stringify({ name: 'Updated Pasta' }),
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.recipe.name).toBe('Updated Pasta');
      expect(body.recipe.syncVersion).toBe(2);
    });

    it('returns 404 for wrong user recipe', async () => {
      const condErr = new Error('Condition not met');
      condErr.name = 'ConditionalCheckFailedException';
      mockSend.mockRejectedValueOnce(condErr);

      const result = await handler(
        makeEvent({
          httpMethod: 'PUT',
          pathParameters: { recipeId: 'other-users-recipe' },
          body: JSON.stringify({ name: 'Hacked' }),
        }),
      );

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).error).toBe('NOT_FOUND');
    });

    it('returns 400 for invalid ingredients on update', async () => {
      const result = await handler(
        makeEvent({
          httpMethod: 'PUT',
          pathParameters: { recipeId: 'recipe-1' },
          body: JSON.stringify({ ingredients: [] }),
        }),
      );

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for ingredient missing quantity on update', async () => {
      const result = await handler(
        makeEvent({
          httpMethod: 'PUT',
          pathParameters: { recipeId: 'recipe-1' },
          body: JSON.stringify({
            ingredients: [{ name: 'Pasta', unit: 'Gram' }],
          }),
        }),
      );

      expect(result.statusCode).toBe(400);
    });

    it('returns 400 for ingredient missing unit on update', async () => {
      const result = await handler(
        makeEvent({
          httpMethod: 'PUT',
          pathParameters: { recipeId: 'recipe-1' },
          body: JSON.stringify({
            ingredients: [{ name: 'Pasta', quantity: 200 }],
          }),
        }),
      );

      expect(result.statusCode).toBe(400);
    });

    it('returns 400 when body is missing', async () => {
      const result = await handler(
        makeEvent({
          httpMethod: 'PUT',
          pathParameters: { recipeId: 'recipe-1' },
          body: null,
        }),
      );
      expect(result.statusCode).toBe(400);
    });

    it('returns 400 when body is invalid JSON', async () => {
      const result = await handler(
        makeEvent({
          httpMethod: 'PUT',
          pathParameters: { recipeId: 'recipe-1' },
          body: 'not-json',
        }),
      );
      expect(result.statusCode).toBe(400);
    });

    it('returns 401 when auth is missing', async () => {
      const result = await handler(
        makeEvent({
          httpMethod: 'PUT',
          pathParameters: { recipeId: 'recipe-1' },
          body: JSON.stringify({ name: 'Updated' }),
          requestContext: { authorizer: {}, requestId: 'req-1' } as any,
        }),
      );
      expect(result.statusCode).toBe(401);
    });
  });

  // ─── DELETE /recipes/{recipeId} ───────────────────────────────────────────────

  describe('DELETE /recipes/{recipeId}', () => {
    it('deletes recipe and returns 200', async () => {
      mockSend.mockResolvedValueOnce({ Item: { recipeId: 'recipe-1', name: 'Pasta' } }); // GetCommand
      mockSend.mockResolvedValueOnce({ Items: [] }); // meal plan check
      mockSend.mockResolvedValueOnce({}); // DeleteCommand

      const result = await handler(
        makeEvent({
          httpMethod: 'DELETE',
          pathParameters: { recipeId: 'recipe-1' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.message).toBe('Recipe deleted');
    });

    it('returns 404 for wrong user recipe', async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined }); // GetCommand returns nothing

      const result = await handler(
        makeEvent({
          httpMethod: 'DELETE',
          pathParameters: { recipeId: 'other-users-recipe' },
        }),
      );

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).error).toBe('NOT_FOUND');
    });

    it('includes warning when recipe is in meal plans', async () => {
      mockSend.mockResolvedValueOnce({ Item: { recipeId: 'recipe-1', name: 'Pasta' } }); // GetCommand
      mockSend.mockResolvedValueOnce({
        Items: [{ planId: 'plan-1' }, { planId: 'plan-2' }],
      }); // meal plan check — 2 plans
      mockSend.mockResolvedValueOnce({}); // DeleteCommand

      const result = await handler(
        makeEvent({
          httpMethod: 'DELETE',
          pathParameters: { recipeId: 'recipe-1' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.warning).toBeDefined();
      expect(body.mealPlanCount).toBe(2);
    });

    it('does not include warning when recipe is not in any meal plan', async () => {
      mockSend.mockResolvedValueOnce({ Item: { recipeId: 'recipe-1' } });
      mockSend.mockResolvedValueOnce({ Items: [] });
      mockSend.mockResolvedValueOnce({});

      const result = await handler(
        makeEvent({
          httpMethod: 'DELETE',
          pathParameters: { recipeId: 'recipe-1' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.warning).toBeUndefined();
    });

    it('returns 401 when auth is missing', async () => {
      const result = await handler(
        makeEvent({
          httpMethod: 'DELETE',
          pathParameters: { recipeId: 'recipe-1' },
          requestContext: { authorizer: {}, requestId: 'req-1' } as any,
        }),
      );
      expect(result.statusCode).toBe(401);
    });
  });

  // ─── Error handling ───────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('returns 500 on unexpected DynamoDB error', async () => {
      mockSend.mockRejectedValueOnce(new Error('DynamoDB failure'));

      const result = await handler(makeEvent());

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).error).toBe('INTERNAL_ERROR');
    });
  });

  // ─── Time field validation ────────────────────────────────────────────────────

  describe('POST /recipes — time fields', () => {
    it('creates recipe with valid prepTime and cookTime and returns them in response', async () => {
      mockSend.mockResolvedValueOnce({}); // PutCommand: save recipe
      mockSend.mockResolvedValueOnce({ Items: [] }); // QueryCommand: existing inventory
      mockSend.mockResolvedValue({}); // PutCommand: placeholder items

      const result = await handler(
        makeEvent({
          httpMethod: 'POST',
          body: JSON.stringify({ ...validRecipe, prepTime: 10, cookTime: 20 }),
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(201);
      expect(body.recipe.prepTime).toBe(10);
      expect(body.recipe.cookTime).toBe(20);
    });

    it('creates recipe without time fields when not provided', async () => {
      mockSend.mockResolvedValueOnce({});
      mockSend.mockResolvedValueOnce({ Items: [] });
      mockSend.mockResolvedValue({});

      const result = await handler(
        makeEvent({ httpMethod: 'POST', body: JSON.stringify(validRecipe) }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(201);
      expect(body.recipe.prepTime).toBeUndefined();
      expect(body.recipe.cookTime).toBeUndefined();
    });

    it('returns 400 with prepTime field identified when prepTime is -1', async () => {
      const result = await handler(
        makeEvent({
          httpMethod: 'POST',
          body: JSON.stringify({ ...validRecipe, prepTime: -1 }),
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.error).toBe('VALIDATION_ERROR');
      expect(body.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'prepTime' })]),
      );
    });

    it('returns 400 with cookTime field identified when cookTime is 1.5', async () => {
      const result = await handler(
        makeEvent({
          httpMethod: 'POST',
          body: JSON.stringify({ ...validRecipe, cookTime: 1.5 }),
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.error).toBe('VALIDATION_ERROR');
      expect(body.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'cookTime' })]),
      );
    });
  });

  describe('PUT /recipes/{recipeId} — time fields', () => {
    it('uses REMOVE expression when prepTime is null', async () => {
      const { UpdateCommand: MockUpdateCommand } = jest.requireMock('@aws-sdk/lib-dynamodb');
      MockUpdateCommand.mockClear();

      mockSend.mockResolvedValueOnce({
        Attributes: { recipeId: 'recipe-1', name: 'Pasta', syncVersion: 2 },
      });

      const result = await handler(
        makeEvent({
          httpMethod: 'PUT',
          pathParameters: { recipeId: 'recipe-1' },
          body: JSON.stringify({ prepTime: null }),
        }),
      );

      expect(result.statusCode).toBe(200);
      const updateCall = MockUpdateCommand.mock.calls[0][0];
      expect(updateCall.UpdateExpression).toContain('REMOVE');
      // prepTime should be in REMOVE clause, not SET clause
      const setClause = updateCall.UpdateExpression.split('REMOVE')[0];
      expect(setClause).not.toContain('#f_prepTime');
    });
  });

  // ─── Portions field validation ────────────────────────────────────────────────

  describe('POST /recipes — portions field', () => {
    it('creates recipe with valid portions: 4 and returns 201 with portions in response', async () => {
      mockSend.mockResolvedValueOnce({}); // PutCommand: save recipe
      mockSend.mockResolvedValueOnce({ Items: [] }); // QueryCommand: existing inventory
      mockSend.mockResolvedValue({}); // PutCommand: placeholder items

      const result = await handler(
        makeEvent({ httpMethod: 'POST', body: JSON.stringify(validRecipe) }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(201);
      expect(body.recipe.portions).toBe(4);
    });

    it('returns 400 when portions is missing', async () => {
      const { portions: _, ...noPortions } = validRecipe;

      const result = await handler(
        makeEvent({ httpMethod: 'POST', body: JSON.stringify(noPortions) }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.error).toBe('VALIDATION_ERROR');
      expect(body.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'portions' })]),
      );
    });

    it('returns 400 when portions is 0', async () => {
      const result = await handler(
        makeEvent({
          httpMethod: 'POST',
          body: JSON.stringify({ ...validRecipe, portions: 0 }),
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.error).toBe('VALIDATION_ERROR');
      expect(body.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'portions' })]),
      );
    });

    it('returns 400 when portions is -1', async () => {
      const result = await handler(
        makeEvent({
          httpMethod: 'POST',
          body: JSON.stringify({ ...validRecipe, portions: -1 }),
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.error).toBe('VALIDATION_ERROR');
      expect(body.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'portions' })]),
      );
    });

    it('returns 400 when portions is 1.5 (non-integer)', async () => {
      const result = await handler(
        makeEvent({
          httpMethod: 'POST',
          body: JSON.stringify({ ...validRecipe, portions: 1.5 }),
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.error).toBe('VALIDATION_ERROR');
      expect(body.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'portions' })]),
      );
    });
  });

  describe('PUT /recipes/{recipeId} — portions field', () => {
    it('updates portions to 6 and returns updated recipe with portions: 6', async () => {
      mockSend.mockResolvedValueOnce({
        Attributes: {
          recipeId: 'recipe-1',
          name: 'Pasta Carbonara',
          ingredients: validRecipe.ingredients,
          portions: 6,
          syncVersion: 2,
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      });

      const result = await handler(
        makeEvent({
          httpMethod: 'PUT',
          pathParameters: { recipeId: 'recipe-1' },
          body: JSON.stringify({ portions: 6 }),
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.recipe.portions).toBe(6);
    });

    it('leaves portions unchanged when portions is omitted from update body', async () => {
      mockSend.mockResolvedValueOnce({
        Attributes: {
          recipeId: 'recipe-1',
          name: 'Pasta Carbonara',
          ingredients: validRecipe.ingredients,
          portions: 4,
          syncVersion: 2,
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      });

      const result = await handler(
        makeEvent({
          httpMethod: 'PUT',
          pathParameters: { recipeId: 'recipe-1' },
          body: JSON.stringify({ name: 'Updated Pasta' }),
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.recipe.portions).toBe(4);
    });
  });
});
