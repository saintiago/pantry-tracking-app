/**
 * Property-based tests for MealPlan_Lambda.
 * Feature: meal-planner
 */
import * as fc from 'fast-check';
import { APIGatewayProxyEvent } from 'aws-lambda';

// ─── In-memory DynamoDB store & mockSend ─────────────────────────────────────

// Store keyed by "PK|SK"
let store: Map<string, Record<string, unknown>> = new Map();

const mockSend = jest.fn(async (command: Record<string, unknown>) => {
  const type = command._type as string;

  if (type === 'Query') {
    const pk = (command.ExpressionAttributeValues as Record<string, string>)[':pk'];
    const skPrefix = (command.ExpressionAttributeValues as Record<string, string>)[':skPrefix'];
    const planIdFilter = (command.ExpressionAttributeValues as Record<string, unknown>)?.[
      ':planId'
    ] as string | undefined;

    let items = Array.from(store.values()).filter((item) => {
      const itemPk = item.PK as string;
      const itemSk = item.SK as string;
      return itemPk === pk && itemSk.startsWith(skPrefix);
    });

    if (planIdFilter !== undefined) {
      items = items.filter((item) => item.planId === planIdFilter);
    }

    return { Items: items };
  }

  if (type === 'Put') {
    const item = command.Item as Record<string, unknown>;
    const key = `${item.PK}|${item.SK}`;
    store.set(key, item);
    return {};
  }

  if (type === 'Update') {
    const key_obj = command.Key as Record<string, unknown>;
    const storeKey = `${key_obj.PK}|${key_obj.SK}`;
    const existing = store.get(storeKey);
    if (!existing) {
      // ConditionExpression: attribute_exists(PK) — throw like real DynamoDB
      const err = new Error('The conditional request failed');
      (err as NodeJS.ErrnoException).code = 'ConditionalCheckFailedException';
      throw err;
    }
    // Apply the update expression values
    const vals = command.ExpressionAttributeValues as Record<string, unknown>;
    const updated = {
      ...existing,
      recipeId: vals[':recipeId'] ?? existing.recipeId,
      recipeName: vals[':recipeName'] ?? existing.recipeName,
      updatedAt: vals[':updatedAt'] ?? existing.updatedAt,
      syncVersion: ((existing.syncVersion as number) ?? 1) + 1,
    };
    store.set(storeKey, updated);
    return {};
  }

  if (type === 'Delete') {
    const key_obj = command.Key as Record<string, unknown>;
    const storeKey = `${key_obj.PK}|${key_obj.SK}`;
    store.delete(storeKey);
    return {};
  }

  if (type === 'TransactWrite') {
    const items = command.TransactItems as Array<{
      Delete?: { Key: Record<string, unknown>; TableName: string };
      Put?: { Item: Record<string, unknown>; TableName: string };
    }>;
    for (const item of items) {
      if (item.Delete) {
        const k = item.Delete.Key;
        store.delete(`${k.PK}|${k.SK}`);
      }
      if (item.Put) {
        const putItem = item.Put.Item;
        store.set(`${putItem.PK}|${putItem.SK}`, putItem);
      }
    }
    return {};
  }

  return {};
});

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

let uuidCounter = 0;
jest.mock('crypto', () => ({
  randomUUID: jest.fn(() => `plan-uuid-${++uuidCounter}`),
}));

process.env.TABLE_NAME = 'TestTable';

import { handler } from '../meal-plan';

// ─── Event factory ────────────────────────────────────────────────────────────

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
      authorizer: { claims: { sub: 'user-prop' } },
      requestId: 'test-request-id',
    } as unknown as APIGatewayProxyEvent['requestContext'],
    resource: '',
    ...overrides,
  };
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const mealTypeArb = fc.constantFrom('breakfast', 'lunch', 'dinner');

const isoDateArb = fc
  .date({ min: new Date('2024-01-01'), max: new Date('2030-12-31') })
  .map((d) => d.toISOString().split('T')[0]);

const recipeIdArb = fc.uuid();

const recipeNameArb = fc
  .string({ minLength: 1, maxLength: 80 })
  .map((s) => s.replace(/[\x00-\x1f]/g, 'a').trim()) // eslint-disable-line no-control-regex
  .filter((s) => s.length > 0);

const validMealPlanBodyArb = fc.record({
  date: isoDateArb,
  mealType: mealTypeArb,
  recipeId: recipeIdArb,
  recipeName: recipeNameArb,
});

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('MealPlan Lambda Property Tests', () => {
  beforeEach(() => {
    store = new Map();
    jest.clearAllMocks();
    uuidCounter = 0;
    // Re-attach the mockSend implementation after clearAllMocks clears call records
    // (the mock function identity is preserved, so we only need to re-bind the
    //  implementation if clearAllMocks was called with resetImplementation — it was not)
    mockSend.mockImplementation(async (command: Record<string, unknown>) => {
      const type = command._type as string;

      if (type === 'Query') {
        const pk = (command.ExpressionAttributeValues as Record<string, string>)[':pk'];
        const skPrefix = (command.ExpressionAttributeValues as Record<string, string>)[':skPrefix'];
        const planIdFilter = (command.ExpressionAttributeValues as Record<string, unknown>)?.[
          ':planId'
        ] as string | undefined;

        let items = Array.from(store.values()).filter((item) => {
          const itemPk = item.PK as string;
          const itemSk = item.SK as string;
          return itemPk === pk && itemSk.startsWith(skPrefix);
        });

        if (planIdFilter !== undefined) {
          items = items.filter((item) => item.planId === planIdFilter);
        }

        return { Items: items };
      }

      if (type === 'Put') {
        const item = command.Item as Record<string, unknown>;
        const key = `${item.PK}|${item.SK}`;
        store.set(key, item);
        return {};
      }

      if (type === 'Update') {
        const key_obj = command.Key as Record<string, unknown>;
        const storeKey = `${key_obj.PK}|${key_obj.SK}`;
        const existing = store.get(storeKey);
        if (!existing) {
          const err = new Error('The conditional request failed');
          (err as NodeJS.ErrnoException).code = 'ConditionalCheckFailedException';
          throw err;
        }
        const vals = command.ExpressionAttributeValues as Record<string, unknown>;
        const updated = {
          ...existing,
          recipeId: vals[':recipeId'] ?? existing.recipeId,
          recipeName: vals[':recipeName'] ?? existing.recipeName,
          updatedAt: vals[':updatedAt'] ?? existing.updatedAt,
          syncVersion: ((existing.syncVersion as number) ?? 1) + 1,
        };
        store.set(storeKey, updated);
        return {};
      }

      if (type === 'Delete') {
        const key_obj = command.Key as Record<string, unknown>;
        const storeKey = `${key_obj.PK}|${key_obj.SK}`;
        store.delete(storeKey);
        return {};
      }

      if (type === 'TransactWrite') {
        const txItems = command.TransactItems as Array<{
          Delete?: { Key: Record<string, unknown>; TableName: string };
          Put?: { Item: Record<string, unknown>; TableName: string };
        }>;
        for (const txItem of txItems) {
          if (txItem.Delete) {
            const k = txItem.Delete.Key;
            store.delete(`${k.PK}|${k.SK}`);
          }
          if (txItem.Put) {
            const putItem = txItem.Put.Item;
            store.set(`${putItem.PK}|${putItem.SK}`, putItem);
          }
        }
        return {};
      }

      return {};
    });
  });

  // Feature: meal-planner, Property 7: Meal plan CRUD persistence (round trip)
  // Validates: Requirements 7.1, 7.4, 7.7, 7.9
  it('Property 7: Meal plan CRUD persistence (round trip)', async () => {
    await fc.assert(
      fc.asyncProperty(validMealPlanBodyArb, recipeIdArb, recipeNameArb, async (body, newRecipeId, newRecipeName) => {
        store = new Map();
        uuidCounter = 0;

        // ── POST: create ──────────────────────────────────────────────────────
        const createRes = await handler(
          makeEvent({
            httpMethod: 'POST',
            body: JSON.stringify(body),
          }),
        );
        expect(createRes.statusCode).toBe(201);
        const createBody = JSON.parse(createRes.body);
        const mealPlan = createBody.mealPlan;
        expect(mealPlan.planId).toBeDefined();
        expect(mealPlan.date).toBe(body.date);
        expect(mealPlan.mealType).toBe(body.mealType);
        expect(mealPlan.recipeId).toBe(body.recipeId);
        expect(mealPlan.recipeName).toBe(body.recipeName);
        expect(mealPlan.createdAt).toBeDefined();
        expect(mealPlan.updatedAt).toBeDefined();

        const planId = mealPlan.planId as string;

        // ── GET: list with date range covering the record ─────────────────────
        const listRes = await handler(
          makeEvent({
            httpMethod: 'GET',
            queryStringParameters: {
              startDate: body.date,
              endDate: body.date,
            },
          }),
        );
        expect(listRes.statusCode).toBe(200);
        const listBody = JSON.parse(listRes.body);
        const found = listBody.mealPlans.find(
          (mp: { planId: string }) => mp.planId === planId,
        );
        expect(found).toBeDefined();
        expect(found.date).toBe(body.date);
        expect(found.mealType).toBe(body.mealType);
        expect(found.recipeId).toBe(body.recipeId);
        expect(found.recipeName).toBe(body.recipeName);

        // ── PUT: update recipeId and recipeName ───────────────────────────────
        const updateRes = await handler(
          makeEvent({
            httpMethod: 'PUT',
            pathParameters: { planId },
            body: JSON.stringify({ recipeId: newRecipeId, recipeName: newRecipeName }),
          }),
        );
        expect(updateRes.statusCode).toBe(200);
        const updateBody = JSON.parse(updateRes.body);
        expect(updateBody.mealPlan.recipeId).toBe(newRecipeId);
        expect(updateBody.mealPlan.recipeName).toBe(newRecipeName);

        // ── GET again: confirm updated fields are returned ────────────────────
        const listAfterUpdateRes = await handler(
          makeEvent({
            httpMethod: 'GET',
            queryStringParameters: {
              startDate: body.date,
              endDate: body.date,
            },
          }),
        );
        expect(listAfterUpdateRes.statusCode).toBe(200);
        const listAfterUpdateBody = JSON.parse(listAfterUpdateRes.body);
        const updatedRecord = listAfterUpdateBody.mealPlans.find(
          (mp: { planId: string }) => mp.planId === planId,
        );
        expect(updatedRecord).toBeDefined();
        expect(updatedRecord.recipeId).toBe(newRecipeId);
        expect(updatedRecord.recipeName).toBe(newRecipeName);

        // ── DELETE ────────────────────────────────────────────────────────────
        const deleteRes = await handler(
          makeEvent({
            httpMethod: 'DELETE',
            pathParameters: { planId },
          }),
        );
        expect(deleteRes.statusCode).toBe(200);

        // ── GET after delete: confirm absent ──────────────────────────────────
        const listAfterDeleteRes = await handler(
          makeEvent({
            httpMethod: 'GET',
            queryStringParameters: {
              startDate: body.date,
              endDate: body.date,
            },
          }),
        );
        expect(listAfterDeleteRes.statusCode).toBe(200);
        const listAfterDeleteBody = JSON.parse(listAfterDeleteRes.body);
        const absent = listAfterDeleteBody.mealPlans.find(
          (mp: { planId: string }) => mp.planId === planId,
        );
        expect(absent).toBeUndefined();
      }),
      { numRuns: 100 },
    );
  });

  // Feature: meal-planner, Property 8: Date range query bounds are inclusive and exact
  // Validates: Requirements 7.1, 7.2
  it('Property 8: Date range query bounds are inclusive and exact', async () => {
    // Generate a set of dates within a bounded window and a query sub-range
    const dateWindowArb = fc
      .tuple(
        fc.date({ min: new Date('2025-01-01'), max: new Date('2025-12-20') }),
        fc.integer({ min: 1, max: 20 }),
      )
      .chain(([anchor, count]) => {
        // Generate `count` offsets from the anchor date
        const dates = Array.from({ length: count }, (_, i) => {
          const d = new Date(anchor);
          d.setDate(d.getDate() + i);
          return d.toISOString().split('T')[0];
        });
        // Query range: startDate and endDate are valid sub-ranges of generated dates
        const sortedDates = [...dates].sort();
        const startIdx = Math.floor(Math.random() * sortedDates.length);
        const endIdx = startIdx + Math.floor(Math.random() * (sortedDates.length - startIdx));
        return fc.constant({
          dates,
          startDate: sortedDates[startIdx],
          endDate: sortedDates[Math.min(endIdx, sortedDates.length - 1)],
        });
      });

    await fc.assert(
      fc.asyncProperty(
        dateWindowArb,
        mealTypeArb,
        recipeIdArb,
        recipeNameArb,
        async ({ dates, startDate, endDate }, mealType, recipeId, recipeName) => {
          store = new Map();
          uuidCounter = 0;

          // Create one meal plan per date
          const planIds: Array<{ planId: string; date: string }> = [];
          for (const date of dates) {
            const res = await handler(
              makeEvent({
                httpMethod: 'POST',
                body: JSON.stringify({ date, mealType, recipeId, recipeName }),
              }),
            );
            expect(res.statusCode).toBe(201);
            const body = JSON.parse(res.body);
            planIds.push({ planId: body.mealPlan.planId, date });
          }

          // Query with startDate/endDate
          const listRes = await handler(
            makeEvent({
              httpMethod: 'GET',
              queryStringParameters: { startDate, endDate },
            }),
          );
          expect(listRes.statusCode).toBe(200);
          const listBody = JSON.parse(listRes.body);
          const returnedPlanIds = new Set(
            listBody.mealPlans.map((mp: { planId: string }) => mp.planId),
          );

          // Every returned record must be within [startDate, endDate]
          for (const mp of listBody.mealPlans as Array<{ date: string }>) {
            expect(mp.date >= startDate).toBe(true);
            expect(mp.date <= endDate).toBe(true);
          }

          // Every record within range must be returned
          for (const { planId, date } of planIds) {
            if (date >= startDate && date <= endDate) {
              expect(returnedPlanIds.has(planId)).toBe(true);
            } else {
              expect(returnedPlanIds.has(planId)).toBe(false);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: meal-planner, Property 9: Invalid meal type is rejected without persistence
  // Validates: Requirements 7.5
  it('Property 9: Invalid meal type is rejected without persistence', async () => {
    const invalidMealTypeArb = fc
      .string({ minLength: 1, maxLength: 30 })
      .filter((s) => !['breakfast', 'lunch', 'dinner'].includes(s));

    await fc.assert(
      fc.asyncProperty(
        isoDateArb,
        invalidMealTypeArb,
        recipeIdArb,
        recipeNameArb,
        async (date, mealType, recipeId, recipeName) => {
          store = new Map();
          uuidCounter = 0;

          const res = await handler(
            makeEvent({
              httpMethod: 'POST',
              body: JSON.stringify({ date, mealType, recipeId, recipeName }),
            }),
          );

          // Must be rejected with 400
          expect(res.statusCode).toBe(400);
          expect(JSON.parse(res.body).error).toBe('VALIDATION_ERROR');

          // Verify no record was persisted
          const listRes = await handler(
            makeEvent({
              httpMethod: 'GET',
              queryStringParameters: { startDate: date, endDate: date },
            }),
          );
          expect(listRes.statusCode).toBe(200);
          const listBody = JSON.parse(listRes.body);
          expect(listBody.mealPlans).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: meal-planner, Property 10: Invalid create or update bodies are rejected without persistence
  // Validates: Requirements 7.6, 7.8
  it('Property 10: Invalid POST bodies are rejected without persistence', async () => {
    // Generate a valid base and then corrupt exactly one required field
    const invalidCreateArb = fc.oneof(
      // Missing date
      fc
        .record({ mealType: mealTypeArb, recipeId: recipeIdArb, recipeName: recipeNameArb })
        .map((b) => ({ body: b, corruptField: 'date' })),
      // Invalid date (not YYYY-MM-DD)
      fc
        .record({
          date: fc
            .string({ minLength: 1, maxLength: 20 })
            .filter((s) => !/^\d{4}-\d{2}-\d{2}$/.test(s)),
          mealType: mealTypeArb,
          recipeId: recipeIdArb,
          recipeName: recipeNameArb,
        })
        .map((b) => ({ body: b, corruptField: 'date' })),
      // Missing recipeId
      fc
        .record({ date: isoDateArb, mealType: mealTypeArb, recipeName: recipeNameArb })
        .map((b) => ({ body: b, corruptField: 'recipeId' })),
      // Missing recipeName
      fc
        .record({ date: isoDateArb, mealType: mealTypeArb, recipeId: recipeIdArb })
        .map((b) => ({ body: b, corruptField: 'recipeName' })),
    );

    await fc.assert(
      fc.asyncProperty(invalidCreateArb, async ({ body }) => {
        store = new Map();
        uuidCounter = 0;

        const res = await handler(
          makeEvent({ httpMethod: 'POST', body: JSON.stringify(body) }),
        );
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).error).toBe('VALIDATION_ERROR');

        // No record should have been persisted
        expect(store.size).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  it('Property 10: Invalid PUT bodies are rejected without persistence', async () => {
    const invalidMealTypeArb = fc
      .string({ minLength: 1, maxLength: 30 })
      .filter((s) => !['breakfast', 'lunch', 'dinner'].includes(s));

    const invalidUpdateArb = fc.oneof(
      // Invalid mealType
      invalidMealTypeArb.map((mealType) => ({ mealType })),
      // Invalid date
      fc
        .string({ minLength: 1, maxLength: 20 })
        .filter((s) => !/^\d{4}-\d{2}-\d{2}$/.test(s))
        .map((date) => ({ date })),
      // Empty recipeId
      fc.constant({ recipeId: '' }),
      // Empty recipeName
      fc.constant({ recipeName: '' }),
    );

    await fc.assert(
      fc.asyncProperty(validMealPlanBodyArb, invalidUpdateArb, async (createBody, updateBody) => {
        store = new Map();
        uuidCounter = 0;

        // First create a valid record
        const createRes = await handler(
          makeEvent({ httpMethod: 'POST', body: JSON.stringify(createBody) }),
        );
        expect(createRes.statusCode).toBe(201);
        const planId = JSON.parse(createRes.body).mealPlan.planId as string;
        const storeSnapBefore = new Map(store);

        // Now attempt invalid update
        const updateRes = await handler(
          makeEvent({
            httpMethod: 'PUT',
            pathParameters: { planId },
            body: JSON.stringify(updateBody),
          }),
        );
        expect(updateRes.statusCode).toBe(400);
        expect(JSON.parse(updateRes.body).error).toBe('VALIDATION_ERROR');

        // Store must remain unchanged (no new keys, same values for existing keys)
        expect(store.size).toBe(storeSnapBefore.size);
        for (const [k, v] of storeSnapBefore) {
          expect(store.get(k)).toEqual(v);
        }
      }),
      { numRuns: 100 },
    );
  });

  // Feature: meal-planner, Property 11: Date-range query parameters are validated
  // Validates: Requirements 7.3
  it('Property 11: Date-range query parameters are validated', async () => {
    const nonIsoDateArb = fc
      .string({ minLength: 1, maxLength: 20 })
      .filter((s) => !/^\d{4}-\d{2}-\d{2}$/.test(s));

    // Various invalid GET /meal-plans parameter combinations
    const invalidQueryArb = fc.oneof(
      // Missing startDate
      isoDateArb.map((endDate) => ({ queryStringParameters: { endDate } })),
      // Missing endDate
      isoDateArb.map((startDate) => ({ queryStringParameters: { startDate } })),
      // Both missing
      fc.constant({ queryStringParameters: {} }),
      // Non-ISO startDate
      fc
        .tuple(nonIsoDateArb, isoDateArb)
        .map(([startDate, endDate]) => ({ queryStringParameters: { startDate, endDate } })),
      // Non-ISO endDate
      fc
        .tuple(isoDateArb, nonIsoDateArb)
        .map(([startDate, endDate]) => ({ queryStringParameters: { startDate, endDate } })),
      // endDate before startDate
      fc
        .tuple(
          fc.date({ min: new Date('2025-02-01'), max: new Date('2025-12-31') }),
          fc.date({ min: new Date('2024-01-01'), max: new Date('2025-01-31') }),
        )
        .map(([laterDate, earlierDate]) => ({
          queryStringParameters: {
            startDate: laterDate.toISOString().split('T')[0],
            endDate: earlierDate.toISOString().split('T')[0],
          },
        })),
    );

    await fc.assert(
      fc.asyncProperty(invalidQueryArb, async ({ queryStringParameters }) => {
        const res = await handler(
          makeEvent({
            httpMethod: 'GET',
            queryStringParameters: queryStringParameters as Record<string, string>,
          }),
        );
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).error).toBe('VALIDATION_ERROR');
        // No mealPlans should be returned
        const body = JSON.parse(res.body);
        expect(body.mealPlans).toBeUndefined();
      }),
      { numRuns: 100 },
    );
  });
});
