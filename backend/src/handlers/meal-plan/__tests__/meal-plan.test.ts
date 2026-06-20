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
  TransactWriteCommand: jest.fn((input) => ({ ...input, _type: 'TransactWrite' })),
}));

jest.mock('crypto', () => ({
  randomUUID: jest.fn(() => 'plan-uuid-1234'),
}));

import { handler } from '../meal-plan';

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    body: null,
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    path: '/meal-plans',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {
      authorizer: { claims: { sub: 'user-123' } },
      requestId: 'req-1',
    } as unknown as APIGatewayProxyEvent['requestContext'],
    resource: '',
    ...overrides,
  };
}

// A minimal existing meal-plan item as stored in DynamoDB (with PK/SK)
const existingMealPlan = {
  PK: 'USER#user-123',
  SK: 'MEAL#2025-01-15#breakfast#plan-uuid-1234',
  entityType: 'MealPlan',
  planId: 'plan-uuid-1234',
  userId: 'user-123',
  date: '2025-01-15',
  mealType: 'breakfast',
  recipeId: 'recipe-abc',
  recipeName: 'Pancakes',
  createdAt: '2025-01-15T08:00:00.000Z',
  updatedAt: '2025-01-15T08:00:00.000Z',
  syncVersion: 1,
};

describe('MealPlan Lambda handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Auth (Requirement 7.11) ──────────────────────────────────────────────────

  describe('Authentication', () => {
    it('returns 401 when authorizer is null', async () => {
      const result = await handler(
        makeEvent({
          requestContext: {
            authorizer: null,
            requestId: 'req-1',
          } as unknown as APIGatewayProxyEvent['requestContext'],
        }),
      );
      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).error).toBe('UNAUTHORIZED');
    });

    it('returns 401 when authorizer has no claims', async () => {
      const result = await handler(
        makeEvent({
          requestContext: {
            authorizer: {},
            requestId: 'req-1',
          } as unknown as APIGatewayProxyEvent['requestContext'],
        }),
      );
      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).error).toBe('UNAUTHORIZED');
    });

    it('returns 401 when sub claim is missing', async () => {
      const result = await handler(
        makeEvent({
          requestContext: {
            authorizer: { claims: {} },
            requestId: 'req-1',
          } as unknown as APIGatewayProxyEvent['requestContext'],
        }),
      );
      expect(result.statusCode).toBe(401);
    });

    it('accepts auth via top-level sub (non-claims authorizer)', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });
      const result = await handler(
        makeEvent({
          queryStringParameters: { startDate: '2025-01-13', endDate: '2025-01-19' },
          requestContext: {
            authorizer: { sub: 'user-456' },
            requestId: 'req-1',
          } as unknown as APIGatewayProxyEvent['requestContext'],
        }),
      );
      expect(result.statusCode).toBe(200);
    });
  });

  // ─── 405 Method Not Allowed ───────────────────────────────────────────────────

  describe('405 for unmatched routes', () => {
    it('returns 405 for GET with a planId', async () => {
      const result = await handler(
        makeEvent({ httpMethod: 'GET', pathParameters: { planId: 'some-plan' } }),
      );
      expect(result.statusCode).toBe(405);
      expect(JSON.parse(result.body).error).toBe('METHOD_NOT_ALLOWED');
    });

    it('returns 405 for POST with a planId', async () => {
      const result = await handler(
        makeEvent({
          httpMethod: 'POST',
          pathParameters: { planId: 'some-plan' },
          body: JSON.stringify({
            date: '2025-01-15',
            mealType: 'breakfast',
            recipeId: 'r-1',
            recipeName: 'Toast',
          }),
        }),
      );
      expect(result.statusCode).toBe(405);
    });

    it('returns 405 for DELETE without planId', async () => {
      const result = await handler(makeEvent({ httpMethod: 'DELETE', pathParameters: null }));
      expect(result.statusCode).toBe(405);
    });

    it('returns 405 for PUT without planId', async () => {
      const result = await handler(
        makeEvent({
          httpMethod: 'PUT',
          pathParameters: null,
          body: JSON.stringify({ recipeName: 'Updated' }),
        }),
      );
      expect(result.statusCode).toBe(405);
    });

    it('returns 405 for PATCH method', async () => {
      const result = await handler(makeEvent({ httpMethod: 'PATCH' }));
      expect(result.statusCode).toBe(405);
    });
  });

  // ─── GET /meal-plans ──────────────────────────────────────────────────────────

  describe('GET /meal-plans', () => {
    it('returns 200 with mealPlans array for a valid date range', async () => {
      mockSend.mockResolvedValueOnce({ Items: [existingMealPlan] });

      const result = await handler(
        makeEvent({
          queryStringParameters: { startDate: '2025-01-13', endDate: '2025-01-19' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(Array.isArray(body.mealPlans)).toBe(true);
      expect(body.mealPlans).toHaveLength(1);
      expect(body.mealPlans[0].planId).toBe('plan-uuid-1234');
      expect(body.mealPlans[0].date).toBe('2025-01-15');
      expect(body.mealPlans[0].mealType).toBe('breakfast');
    });

    it('strips PK and SK from returned items', async () => {
      mockSend.mockResolvedValueOnce({ Items: [existingMealPlan] });

      const result = await handler(
        makeEvent({
          queryStringParameters: { startDate: '2025-01-13', endDate: '2025-01-19' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(body.mealPlans[0].PK).toBeUndefined();
      expect(body.mealPlans[0].SK).toBeUndefined();
    });

    it('returns 200 with empty array when no plans exist', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      const result = await handler(
        makeEvent({
          queryStringParameters: { startDate: '2025-01-13', endDate: '2025-01-19' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.mealPlans).toHaveLength(0);
    });

    it('returns 400 when startDate is missing', async () => {
      const result = await handler(
        makeEvent({ queryStringParameters: { endDate: '2025-01-19' } }),
      );
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when endDate is before startDate', async () => {
      const result = await handler(
        makeEvent({
          queryStringParameters: { startDate: '2025-01-19', endDate: '2025-01-13' },
        }),
      );
      expect(result.statusCode).toBe(400);
    });

    it('filters out plans outside the date range', async () => {
      const outsidePlan = {
        ...existingMealPlan,
        date: '2025-01-20', // outside the queried range
        SK: 'MEAL#2025-01-20#breakfast#plan-uuid-1234',
      };
      mockSend.mockResolvedValueOnce({ Items: [outsidePlan] });

      const result = await handler(
        makeEvent({
          queryStringParameters: { startDate: '2025-01-13', endDate: '2025-01-19' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.mealPlans).toHaveLength(0);
    });
  });

  // ─── POST /meal-plans ─────────────────────────────────────────────────────────

  describe('POST /meal-plans', () => {
    const validBody = {
      date: '2025-01-15',
      mealType: 'lunch',
      recipeId: 'recipe-xyz',
      recipeName: 'Caesar Salad',
    };

    it('returns 201 with the created mealPlan on success', async () => {
      mockSend.mockResolvedValueOnce({}); // PutCommand

      const result = await handler(
        makeEvent({ httpMethod: 'POST', body: JSON.stringify(validBody) }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(201);
      expect(body.mealPlan).toBeDefined();
      expect(body.mealPlan.planId).toBe('plan-uuid-1234');
      expect(body.mealPlan.date).toBe('2025-01-15');
      expect(body.mealPlan.mealType).toBe('lunch');
      expect(body.mealPlan.recipeId).toBe('recipe-xyz');
      expect(body.mealPlan.recipeName).toBe('Caesar Salad');
      expect(body.mealPlan.syncVersion).toBe(1);
      expect(body.mealPlan.entityType).toBe('MealPlan');
    });

    it('strips PK and SK from the created mealPlan response', async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await handler(
        makeEvent({ httpMethod: 'POST', body: JSON.stringify(validBody) }),
      );
      const body = JSON.parse(result.body);

      expect(body.mealPlan.PK).toBeUndefined();
      expect(body.mealPlan.SK).toBeUndefined();
    });

    it('includes createdAt and updatedAt timestamps', async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await handler(
        makeEvent({ httpMethod: 'POST', body: JSON.stringify(validBody) }),
      );
      const body = JSON.parse(result.body);

      expect(body.mealPlan.createdAt).toBeDefined();
      expect(body.mealPlan.updatedAt).toBeDefined();
    });

    it('returns 400 when body is missing', async () => {
      const result = await handler(makeEvent({ httpMethod: 'POST', body: null }));
      expect(result.statusCode).toBe(400);
    });

    it('returns 400 when body is invalid JSON', async () => {
      const result = await handler(makeEvent({ httpMethod: 'POST', body: 'not-json' }));
      expect(result.statusCode).toBe(400);
    });

    it('returns 400 for invalid mealType', async () => {
      const result = await handler(
        makeEvent({
          httpMethod: 'POST',
          body: JSON.stringify({ ...validBody, mealType: 'brunch' }),
        }),
      );
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when date is missing', async () => {
      const { date: _date, ...noDate } = validBody;
      const result = await handler(
        makeEvent({ httpMethod: 'POST', body: JSON.stringify(noDate) }),
      );
      expect(result.statusCode).toBe(400);
    });

    it('returns 400 when recipeId is missing', async () => {
      const result = await handler(
        makeEvent({
          httpMethod: 'POST',
          body: JSON.stringify({ ...validBody, recipeId: '' }),
        }),
      );
      expect(result.statusCode).toBe(400);
    });
  });

  // ─── PUT /meal-plans/{planId} ─────────────────────────────────────────────────

  describe('PUT /meal-plans/{planId}', () => {
    it('returns 200 with the updated mealPlan on success (no SK change)', async () => {
      mockSend.mockResolvedValueOnce({ Items: [existingMealPlan] }); // QueryCommand
      mockSend.mockResolvedValueOnce({}); // UpdateCommand

      const result = await handler(
        makeEvent({
          httpMethod: 'PUT',
          pathParameters: { planId: 'plan-uuid-1234' },
          body: JSON.stringify({ recipeName: 'Fluffy Pancakes' }),
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.mealPlan).toBeDefined();
      expect(body.mealPlan.planId).toBe('plan-uuid-1234');
      expect(body.mealPlan.recipeName).toBe('Fluffy Pancakes');
      expect(body.mealPlan.PK).toBeUndefined();
      expect(body.mealPlan.SK).toBeUndefined();
    });

    it('returns 404 when planId is absent from the caller partition (Requirement 7.10)', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] }); // QueryCommand returns nothing

      const result = await handler(
        makeEvent({
          httpMethod: 'PUT',
          pathParameters: { planId: 'non-existent-plan' },
          body: JSON.stringify({ recipeName: 'Updated' }),
        }),
      );

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).error).toBe('NOT_FOUND');
    });

    it('returns 404 for a planId belonging to a different user (Requirement 7.10)', async () => {
      // The query is scoped to the caller's PK, so foreign planIds are simply not found
      mockSend.mockResolvedValueOnce({ Items: [] }); // Nothing under this user's partition

      const result = await handler(
        makeEvent({
          httpMethod: 'PUT',
          pathParameters: { planId: 'other-user-plan' },
          body: JSON.stringify({ recipeName: 'Hacked' }),
        }),
      );

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).error).toBe('NOT_FOUND');
    });

    it('returns 400 when body is missing', async () => {
      const result = await handler(
        makeEvent({
          httpMethod: 'PUT',
          pathParameters: { planId: 'plan-uuid-1234' },
          body: null,
        }),
      );
      expect(result.statusCode).toBe(400);
    });

    it('returns 400 for invalid mealType on update', async () => {
      const result = await handler(
        makeEvent({
          httpMethod: 'PUT',
          pathParameters: { planId: 'plan-uuid-1234' },
          body: JSON.stringify({ mealType: 'brunch' }),
        }),
      );
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toBe('VALIDATION_ERROR');
    });
  });

  // ─── PUT that changes date/mealType rewrites the SK via TransactWriteCommand ──

  describe('PUT /meal-plans/{planId} — SK rewrite when date/mealType changes', () => {
    it('calls TransactWriteCommand (delete old + put new) when date changes', async () => {
      const { TransactWriteCommand } = jest.requireMock('@aws-sdk/lib-dynamodb');
      mockSend.mockResolvedValueOnce({ Items: [existingMealPlan] }); // QueryCommand
      mockSend.mockResolvedValueOnce({}); // TransactWriteCommand

      const result = await handler(
        makeEvent({
          httpMethod: 'PUT',
          pathParameters: { planId: 'plan-uuid-1234' },
          body: JSON.stringify({ date: '2025-01-16' }), // date changed
        }),
      );

      expect(result.statusCode).toBe(200);
      expect(TransactWriteCommand).toHaveBeenCalledTimes(1);

      const transactCall = TransactWriteCommand.mock.calls[0][0];
      expect(transactCall.TransactItems).toHaveLength(2);

      // First item: Delete the old SK
      expect(transactCall.TransactItems[0].Delete).toBeDefined();
      expect(transactCall.TransactItems[0].Delete.Key.SK).toBe(
        'MEAL#2025-01-15#breakfast#plan-uuid-1234',
      );

      // Second item: Put with new SK
      expect(transactCall.TransactItems[1].Put).toBeDefined();
      expect(transactCall.TransactItems[1].Put.Item.SK).toBe(
        'MEAL#2025-01-16#breakfast#plan-uuid-1234',
      );
      expect(transactCall.TransactItems[1].Put.Item.date).toBe('2025-01-16');
    });

    it('calls TransactWriteCommand when mealType changes', async () => {
      const { TransactWriteCommand } = jest.requireMock('@aws-sdk/lib-dynamodb');
      mockSend.mockResolvedValueOnce({ Items: [existingMealPlan] });
      mockSend.mockResolvedValueOnce({});

      const result = await handler(
        makeEvent({
          httpMethod: 'PUT',
          pathParameters: { planId: 'plan-uuid-1234' },
          body: JSON.stringify({ mealType: 'dinner' }), // mealType changed
        }),
      );

      expect(result.statusCode).toBe(200);
      expect(TransactWriteCommand).toHaveBeenCalledTimes(1);

      const transactCall = TransactWriteCommand.mock.calls[0][0];
      expect(transactCall.TransactItems[0].Delete.Key.SK).toBe(
        'MEAL#2025-01-15#breakfast#plan-uuid-1234',
      );
      expect(transactCall.TransactItems[1].Put.Item.SK).toBe(
        'MEAL#2025-01-15#dinner#plan-uuid-1234',
      );
      expect(transactCall.TransactItems[1].Put.Item.mealType).toBe('dinner');
    });

    it('calls TransactWriteCommand when both date and mealType change', async () => {
      const { TransactWriteCommand } = jest.requireMock('@aws-sdk/lib-dynamodb');
      mockSend.mockResolvedValueOnce({ Items: [existingMealPlan] });
      mockSend.mockResolvedValueOnce({});

      await handler(
        makeEvent({
          httpMethod: 'PUT',
          pathParameters: { planId: 'plan-uuid-1234' },
          body: JSON.stringify({ date: '2025-01-17', mealType: 'lunch' }),
        }),
      );

      expect(TransactWriteCommand).toHaveBeenCalledTimes(1);
      const transactCall = TransactWriteCommand.mock.calls[0][0];
      expect(transactCall.TransactItems[1].Put.Item.SK).toBe(
        'MEAL#2025-01-17#lunch#plan-uuid-1234',
      );
    });

    it('does NOT call TransactWriteCommand when only recipeName changes', async () => {
      const { TransactWriteCommand, UpdateCommand } = jest.requireMock('@aws-sdk/lib-dynamodb');
      mockSend.mockResolvedValueOnce({ Items: [existingMealPlan] });
      mockSend.mockResolvedValueOnce({}); // UpdateCommand

      await handler(
        makeEvent({
          httpMethod: 'PUT',
          pathParameters: { planId: 'plan-uuid-1234' },
          body: JSON.stringify({ recipeName: 'New Name' }),
        }),
      );

      expect(TransactWriteCommand).not.toHaveBeenCalled();
      expect(UpdateCommand).toHaveBeenCalledTimes(1);
    });

    it('increments syncVersion in the updated item', async () => {
      mockSend.mockResolvedValueOnce({ Items: [existingMealPlan] });
      mockSend.mockResolvedValueOnce({});

      const result = await handler(
        makeEvent({
          httpMethod: 'PUT',
          pathParameters: { planId: 'plan-uuid-1234' },
          body: JSON.stringify({ date: '2025-01-16' }),
        }),
      );
      const body = JSON.parse(result.body);

      expect(body.mealPlan.syncVersion).toBe(2); // 1 + 1
    });
  });

  // ─── DELETE /meal-plans/{planId} ──────────────────────────────────────────────

  describe('DELETE /meal-plans/{planId}', () => {
    it('returns 200 with a message on success', async () => {
      mockSend.mockResolvedValueOnce({ Items: [existingMealPlan] }); // QueryCommand
      mockSend.mockResolvedValueOnce({}); // DeleteCommand

      const result = await handler(
        makeEvent({
          httpMethod: 'DELETE',
          pathParameters: { planId: 'plan-uuid-1234' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.message).toBeDefined();
      expect(typeof body.message).toBe('string');
    });

    it('calls DeleteCommand with the correct SK', async () => {
      const { DeleteCommand } = jest.requireMock('@aws-sdk/lib-dynamodb');
      mockSend.mockResolvedValueOnce({ Items: [existingMealPlan] });
      mockSend.mockResolvedValueOnce({});

      await handler(
        makeEvent({
          httpMethod: 'DELETE',
          pathParameters: { planId: 'plan-uuid-1234' },
        }),
      );

      expect(DeleteCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Key: {
            PK: 'USER#user-123',
            SK: 'MEAL#2025-01-15#breakfast#plan-uuid-1234',
          },
        }),
      );
    });

    it('returns 404 when planId is absent (Requirement 7.10)', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] }); // QueryCommand returns nothing

      const result = await handler(
        makeEvent({
          httpMethod: 'DELETE',
          pathParameters: { planId: 'non-existent-plan' },
        }),
      );

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).error).toBe('NOT_FOUND');
    });

    it('returns 404 for a planId belonging to another user (Requirement 7.10)', async () => {
      // The query is scoped to the caller's PK so foreign planIds appear absent
      mockSend.mockResolvedValueOnce({ Items: [] });

      const result = await handler(
        makeEvent({
          httpMethod: 'DELETE',
          pathParameters: { planId: 'other-user-plan' },
        }),
      );

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).error).toBe('NOT_FOUND');
    });
  });

  // ─── Error handling ───────────────────────────────────────────────────────────

  describe('Error handling', () => {
    it('returns 500 on unexpected DynamoDB error during GET', async () => {
      mockSend.mockRejectedValueOnce(new Error('DynamoDB failure'));

      const result = await handler(
        makeEvent({
          queryStringParameters: { startDate: '2025-01-13', endDate: '2025-01-19' },
        }),
      );

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).error).toBe('INTERNAL_ERROR');
    });

    it('returns 500 on unexpected DynamoDB error during DELETE', async () => {
      mockSend.mockResolvedValueOnce({ Items: [existingMealPlan] }); // QueryCommand succeeds
      mockSend.mockRejectedValueOnce(new Error('DynamoDB failure')); // DeleteCommand fails

      const result = await handler(
        makeEvent({
          httpMethod: 'DELETE',
          pathParameters: { planId: 'plan-uuid-1234' },
        }),
      );

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).error).toBe('INTERNAL_ERROR');
    });
  });
});
