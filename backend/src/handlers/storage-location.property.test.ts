import { APIGatewayProxyEvent } from 'aws-lambda';
import * as fc from 'fast-check';

// Mock DynamoDB
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
}));

let uuidCounter = 0;
jest.mock('crypto', () => ({
  randomUUID: jest.fn(() => `uuid-${++uuidCounter}`),
}));

import { handler } from './storage-location';

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    body: null,
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    path: '/locations',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {
      authorizer: { claims: { sub: 'user-prop-test' } },
      requestId: 'req-prop',
    } as any,
    resource: '',
    ...overrides,
  };
}

/** Arbitrary for valid location names: non-empty trimmed strings */
const locationNameArb = fc
  .string({ minLength: 1, maxLength: 50 })
  .map((s) => s.replace(/[\x00-\x1f]/g, 'a').trim())
  .filter((s) => s.length > 0);

describe('Storage Location Property Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    uuidCounter = 0;
  });

  /**
   * Feature: inventory-core, Property 30: Storage Location Add with Uniqueness
   * Validates: Requirements 18.2, 18.7
   *
   * For any user and any location name, adding a storage location should succeed
   * if and only if no existing location has the same name (case-insensitive).
   */
  describe('Property 30: Storage Location Add with Uniqueness', () => {
    it('should succeed when no existing location has the same name (case-insensitive)', async () => {
      await fc.assert(
        fc.asyncProperty(locationNameArb, async (name) => {
          jest.clearAllMocks();

          // No existing locations with this name
          mockSend.mockResolvedValueOnce({ Items: [] });
          // Put succeeds
          mockSend.mockResolvedValueOnce({});

          const result = await handler(
            makeEvent({
              httpMethod: 'POST',
              body: JSON.stringify({ name }),
            }),
          );

          expect(result.statusCode).toBe(201);
          const body = JSON.parse(result.body);
          expect(body.location.name).toBe(name);
        }),
        { numRuns: 100 },
      );
    });

    it('should fail when an existing location has the same name (case-insensitive)', async () => {
      await fc.assert(
        fc.asyncProperty(locationNameArb, async (name) => {
          jest.clearAllMocks();

          // Existing location with same name (different case)
          mockSend.mockResolvedValueOnce({
            Items: [{ locationId: 'existing-loc', name: name.toUpperCase() }],
          });

          const result = await handler(
            makeEvent({
              httpMethod: 'POST',
              body: JSON.stringify({ name: name.toLowerCase() }),
            }),
          );

          expect(result.statusCode).toBe(400);
          const body = JSON.parse(result.body);
          expect(body.message).toContain('already exists');
        }),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Feature: inventory-core, Property 31: Storage Location Removal Guard
   * Validates: Requirements 18.4, 18.5, 18.6
   *
   * For any storage location, removing it should succeed if and only if it contains
   * no inventory items AND it is not the user's last remaining location.
   */
  describe('Property 31: Storage Location Removal Guard', () => {
    const scenarioArb = fc.record({
      locationId: fc.uuid(),
      isLastLocation: fc.boolean(),
      hasInventoryItems: fc.boolean(),
    });

    it('should succeed or fail based on item presence and last-location status', async () => {
      await fc.assert(
        fc.asyncProperty(scenarioArb, async ({ locationId, isLastLocation, hasInventoryItems }) => {
          jest.clearAllMocks();

          const locations = isLastLocation
            ? [{ locationId, name: 'Only Location' }]
            : [
                { locationId, name: 'Target' },
                { locationId: 'other-loc', name: 'Other' },
              ];

          // Query for all locations
          mockSend.mockResolvedValueOnce({ Items: locations });

          if (!isLastLocation) {
            // Inventory items check
            mockSend.mockResolvedValueOnce({
              Items: hasInventoryItems ? [{ itemId: 'item-1' }] : [],
            });

            if (!hasInventoryItems) {
              // Delete succeeds
              mockSend.mockResolvedValueOnce({});
            }
          }

          const result = await handler(
            makeEvent({
              httpMethod: 'DELETE',
              pathParameters: { locationId },
            }),
          );

          const shouldSucceed = !isLastLocation && !hasInventoryItems;

          if (shouldSucceed) {
            expect(result.statusCode).toBe(200);
          } else if (isLastLocation) {
            expect(result.statusCode).toBe(400);
            expect(JSON.parse(result.body).message).toContain('last remaining');
          } else {
            // hasInventoryItems
            expect(result.statusCode).toBe(400);
            expect(JSON.parse(result.body).message).toContain('contains inventory items');
          }
        }),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Feature: inventory-core, Property 32: Storage Location Rename Round-Trip
   * Validates: Requirements 18.3
   *
   * For any existing storage location and any new unique name, renaming and then
   * retrieving should return the updated name.
   */
  describe('Property 32: Storage Location Rename Round-Trip', () => {
    it('should return the updated name after rename', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          locationNameArb,
          async (locationId, newName) => {
            jest.clearAllMocks();

            // No duplicate names for rename check
            mockSend.mockResolvedValueOnce({ Items: [] });
            // Update returns the new attributes
            mockSend.mockResolvedValueOnce({
              Attributes: {
                locationId,
                name: newName,
                updatedAt: new Date().toISOString(),
              },
            });

            const renameResult = await handler(
              makeEvent({
                httpMethod: 'PUT',
                pathParameters: { locationId },
                body: JSON.stringify({ name: newName }),
              }),
            );

            expect(renameResult.statusCode).toBe(200);
            const renameBody = JSON.parse(renameResult.body);
            expect(renameBody.location.name).toBe(newName);

            // Now simulate GET returning the renamed location
            jest.clearAllMocks();
            mockSend.mockResolvedValueOnce({
              Items: [
                {
                  locationId,
                  name: newName,
                  createdAt: '2024-01-01T00:00:00Z',
                },
              ],
            });

            const getResult = await handler(makeEvent());
            expect(getResult.statusCode).toBe(200);
            const getBody = JSON.parse(getResult.body);
            const found = getBody.locations.find(
              (loc: { locationId: string }) => loc.locationId === locationId,
            );
            expect(found).toBeDefined();
            expect(found.name).toBe(newName);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Feature: inventory-core, Property 33: Storage Location Creation Order
   * Validates: Requirements 18.8
   *
   * For any sequence of storage locations created, retrieving the location list
   * should return them in creation order.
   */
  describe('Property 33: Storage Location Creation Order', () => {
    it('should return locations sorted by createdAt', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(locationNameArb, { minLength: 2, maxLength: 10 }),
          async (names) => {
            jest.clearAllMocks();

            // Build locations with sequential createdAt timestamps
            const baseTime = new Date('2024-01-01T00:00:00Z').getTime();
            const locations = names.map((name, i) => ({
              locationId: `loc-${i}`,
              name,
              createdAt: new Date(baseTime + i * 60000).toISOString(),
            }));

            // Shuffle the locations to simulate DynamoDB returning in arbitrary order
            const shuffled = [...locations].sort(() => Math.random() - 0.5);
            mockSend.mockResolvedValueOnce({ Items: shuffled });

            const result = await handler(makeEvent());
            expect(result.statusCode).toBe(200);

            const body = JSON.parse(result.body);
            const returnedNames = body.locations.map((loc: { name: string }) => loc.name);
            const expectedNames = locations.map((loc) => loc.name);

            expect(returnedNames).toEqual(expectedNames);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
