/**
 * Property-based tests for normalizeTags and validateTags.
 * Feature: recipe-categories
 */
import * as fc from 'fast-check';
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
  randomUUID: jest.fn(() => 'recipe-uuid-prop'),
}));

import { handler, normalizeTags } from '../recipe';

function makePropEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
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
      authorizer: { claims: { sub: 'user-prop' } },
      requestId: 'req-prop',
    } as unknown as APIGatewayProxyEvent['requestContext'],
    resource: '',
    ...overrides,
  };
}

describe('normalizeTags — property tests', () => {
  // Property 1: Idempotence
  // Validates: Requirements 7.4, 7.5, 8.1
  it('Property 1: normalizeTags is idempotent', () => {
    fc.assert(
      fc.property(fc.array(fc.string()), (arr) => {
        const once = normalizeTags(arr);
        const twice = normalizeTags(once);
        expect(twice).toEqual(once);
      }),
      { numRuns: 100 },
    );
  });

  // Property 1 (output invariants): all lowercase, no duplicates, no empty strings
  // Validates: Requirements 7.4, 7.5, 8.1
  it('Property 1 (output invariants): output tags are lowercase, deduplicated, non-empty', () => {
    fc.assert(
      fc.property(fc.array(fc.string()), (arr) => {
        const result = normalizeTags(arr);
        // All lowercase
        result.forEach((tag) => expect(tag).toBe(tag.toLowerCase()));
        // No empty strings
        result.forEach((tag) => expect(tag.length).toBeGreaterThan(0));
        // No duplicates
        const unique = new Set(result);
        expect(unique.size).toBe(result.length);
      }),
      { numRuns: 100 },
    );
  });
});

describe('Backend tag validation — property tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Property 5: Backend rejects empty tags on create
  // Validates: Requirements 1.2
  it('Property 5: POST /recipes returns 400 for absent/empty/whitespace-only tags', async () => {
    const validBase = {
      name: 'Test Recipe',
      ingredients: [{ name: 'Flour', quantity: 100, unit: 'Gram' }],
      instructions: 'Mix.',
      portions: 2,
    };

    // Test absent tags
    const result1 = await handler(
      makePropEvent({ httpMethod: 'POST', body: JSON.stringify(validBase) }),
    );
    expect(JSON.parse(result1.body).error).toBe('VALIDATION_ERROR');
    expect(result1.statusCode).toBe(400);

    // Test empty array
    const result2 = await handler(
      makePropEvent({ httpMethod: 'POST', body: JSON.stringify({ ...validBase, tags: [] }) }),
    );
    expect(JSON.parse(result2.body).error).toBe('VALIDATION_ERROR');
    expect(result2.statusCode).toBe(400);

    // Property: for any array of whitespace-only strings, should return 400
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.stringMatching(/^\s*$/), { minLength: 1, maxLength: 5 }),
        async (whitespaceTags) => {
          const result = await handler(
            makePropEvent({
              httpMethod: 'POST',
              body: JSON.stringify({ ...validBase, tags: whitespaceTags }),
            }),
          );
          expect(result.statusCode).toBe(400);
          expect(JSON.parse(result.body).error).toBe('VALIDATION_ERROR');
        },
      ),
      { numRuns: 50 },
    );
  });

  // Property 6: Backend rejects empty tags on update
  // Validates: Requirements 1.3
  it('Property 6: PUT /recipes/{recipeId} returns 400 for tags: []', async () => {
    const result = await handler(
      makePropEvent({
        httpMethod: 'PUT',
        pathParameters: { recipeId: 'recipe-1' },
        body: JSON.stringify({ tags: [] }),
      }),
    );
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toBe('VALIDATION_ERROR');
  });
});
