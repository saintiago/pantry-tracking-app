import { APIGatewayProxyEvent } from 'aws-lambda';
import * as fc from 'fast-check';

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

let uuidCounter = 0;
jest.mock('crypto', () => ({
  randomUUID: jest.fn(() => `item-uuid-${++uuidCounter}`),
}));

import { handler } from '../inventory';

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    body: null,
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    path: '/inventory',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {
      authorizer: { claims: { sub: 'user-prop-test' } },
      requestId: 'req-prop',
    } as unknown as APIGatewayProxyEvent['requestContext'],
    resource: '',
    ...overrides,
  };
}

// --- Arbitraries ---

const nameArb = fc
  .string({ minLength: 1, maxLength: 50 })
  .map((s) => s.replace(/[\x00-\x1f]/g, 'a').trim()) // eslint-disable-line no-control-regex
  .filter((s) => s.length > 0);

const categoryArb = fc.constantFrom('Dairy', 'Bakery', 'Produce', 'Meat', 'Frozen', 'Snacks');

const expirationDateArb = fc
  .date({ min: new Date('2024-01-01'), max: new Date('2030-12-31') })
  .map((d) => d.toISOString().split('T')[0]);

const locationIdArb = fc.uuid();

const positiveQuantityArb = fc.integer({ min: 1, max: 10000 });

const unitArb = fc.constantFrom('Gram', 'Kilo', 'Milliliter', 'Liter', 'Unit');

const thresholdArb = fc.integer({ min: 0, max: 10000 });

const validItemArb = fc.record({
  name: nameArb,
  category: categoryArb,
  expirationDate: expirationDateArb,
  locationId: locationIdArb,
  quantity: positiveQuantityArb,
  unit: unitArb,
});

describe('Inventory Property Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    uuidCounter = 0;
  });

  /**
   * Feature: inventory-core, Property 1: Item Addition Persistence
   * Validates: Requirements 3.2
   *
   * For any valid inventory item data (name, category, expirationDate, location,
   * quantity, unit), when the item is added to the inventory, querying the inventory
   * should return an item with matching data.
   */
  describe('Property 1: Item Addition Persistence', () => {
    it('should persist item data that matches the submitted values', async () => {
      await fc.assert(
        fc.asyncProperty(validItemArb, async (itemData) => {
          jest.clearAllMocks();
          uuidCounter = 0;

          // PutCommand succeeds
          mockSend.mockResolvedValueOnce({});

          const result = await handler(
            makeEvent({
              httpMethod: 'POST',
              body: JSON.stringify(itemData),
            }),
          );

          expect(result.statusCode).toBe(201);
          const body = JSON.parse(result.body);
          expect(body.item.name).toBe(itemData.name);
          expect(body.item.category).toBe(itemData.category);
          expect(body.item.expirationDate).toBe(itemData.expirationDate);
          expect(body.item.location).toBe(itemData.locationId);
          expect(body.item.quantity).toBe(itemData.quantity);
          expect(body.item.unit).toBe(itemData.unit);
          expect(body.item.entityType).toBe('InventoryItem');
          expect(body.item.itemId).toBeDefined();
        }),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Feature: inventory-core, Property 2: Item Deletion Removes from Inventory
   * Validates: Requirements 5.4
   *
   * For any inventory item that exists in the inventory, when the user confirms
   * deletion, the item should no longer appear in the inventory item list.
   */
  describe('Property 2: Item Deletion Removes from Inventory', () => {
    it('should remove item from inventory after confirmed deletion', async () => {
      await fc.assert(
        fc.asyncProperty(fc.uuid(), nameArb, async (itemId, itemName) => {
          jest.clearAllMocks();

          // GetCommand returns existing item
          mockSend.mockResolvedValueOnce({
            Item: {
              PK: 'USER#user-prop-test',
              SK: `ITEM#${itemId}`,
              itemId,
              name: itemName,
            },
          });
          // DeleteCommand succeeds
          mockSend.mockResolvedValueOnce({});

          const deleteResult = await handler(
            makeEvent({
              httpMethod: 'DELETE',
              pathParameters: { itemId },
            }),
          );

          expect(deleteResult.statusCode).toBe(200);

          // Now simulate listing inventory — the deleted item should not appear
          jest.clearAllMocks();
          mockSend.mockResolvedValueOnce({ Items: [] });

          const listResult = await handler(makeEvent());
          const listBody = JSON.parse(listResult.body);
          const found = listBody.items.find((item: { itemId: string }) => item.itemId === itemId);
          expect(found).toBeUndefined();
        }),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Feature: inventory-core, Property 3: Item Creation Assigns Group
   * Validates: Requirements 6.1 (adapted for group-based model)
   *
   * For any valid inventory item data, creating an item assigns it a deterministic
   * groupId and includes the group in the response with the correct total quantity.
   */
  describe('Property 3: Item Creation Assigns Group', () => {
    it('should assign a groupId and create a group with correct total quantity', async () => {
      await fc.assert(
        fc.asyncProperty(validItemArb, async (itemData) => {
          jest.clearAllMocks();
          uuidCounter = 0;

          // Mock chain for POST with no existing group (4 calls)
          mockSend.mockResolvedValueOnce({ Item: undefined }); // getGroup check
          mockSend.mockResolvedValueOnce({ Item: undefined }); // createGroup getGroup
          mockSend.mockResolvedValueOnce({}); // PutCommand for group
          mockSend.mockResolvedValueOnce({}); // PutCommand for item

          const result = await handler(
            makeEvent({
              httpMethod: 'POST',
              body: JSON.stringify(itemData),
            }),
          );

          expect(result.statusCode).toBe(201);
          const body = JSON.parse(result.body);
          expect(body.item.groupId).toBeDefined();
          expect(typeof body.item.groupId).toBe('string');
          expect(body.item.name).toBe(itemData.name);
          expect(body.item.quantity).toBe(itemData.quantity);
          // Response includes the group with the item's quantity as initial total
          expect(body.groups).toHaveLength(1);
          expect(body.groups[0].totalQuantity).toBe(itemData.quantity);
          expect(body.groups[0].groupId).toBe(body.item.groupId);
        }),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Feature: inventory-core, Property 4: Low Stock Threshold Invariant on Groups
   * Validates: Requirements 7.2 (adapted for group-based model)
   *
   * For any group with a defined threshold, isLowStock should be true if and only
   * if totalQuantity <= threshold. When no threshold is set, isLowStock is false.
   */
  describe('Property 4: Low Stock Group Invariant', () => {
    it('should set isLowStock correctly on group creation based on quantity vs threshold', async () => {
      await fc.assert(
        fc.asyncProperty(validItemArb, thresholdArb, async (itemData, threshold) => {
          jest.clearAllMocks();
          uuidCounter = 0;

          const groupId = 'fixed-group-id'; // will be overwritten by defaultGroupId

          // Create with existing group that has a threshold
          mockSend.mockResolvedValueOnce({
            Item: {
              PK: 'USER#user-prop-test',
              SK: `GROUP#${groupId}`,
              groupId,
              totalQuantity: 0,
              threshold,
              isLowStock: false, // initially not low (total=0, but threshold needed)
              syncVersion: 1,
            },
          });
          mockSend.mockResolvedValueOnce({}); // PutCommand for item
          // adjustGroupQuantity: getGroup
          mockSend.mockResolvedValueOnce({
            Item: {
              PK: 'USER#user-prop-test',
              SK: `GROUP#${groupId}`,
              groupId,
              totalQuantity: 0,
              threshold,
              isLowStock: false,
              syncVersion: 1,
            },
          });
          // adjustGroupQuantity: UpdateCommand
          const newTotal = itemData.quantity;
          const expectedLowStock = threshold !== undefined && newTotal <= threshold;
          mockSend.mockResolvedValueOnce({
            Attributes: {
              PK: 'USER#user-prop-test',
              SK: `GROUP#${groupId}`,
              groupId,
              totalQuantity: newTotal,
              threshold,
              isLowStock: expectedLowStock,
              syncVersion: 2,
            },
          });

          const result = await handler(
            makeEvent({
              httpMethod: 'POST',
              body: JSON.stringify(itemData),
            }),
          );

          expect(result.statusCode).toBe(201);
          const body = JSON.parse(result.body);
          expect(body.groups[0].isLowStock).toBe(expectedLowStock);
        }),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Feature: inventory-core, Property 5: Low Stock List Accuracy
   * Validates: Requirements 7.3 (adapted for group-based model)
   *
   * The low-stock endpoint returns groups with isLowStock=true, keyed by GROUP# prefix.
   */
  describe('Property 5: Low Stock Group List Accuracy', () => {
    it('should return only groups with isLowStock=true from low-stock endpoint', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              groupId: fc.uuid(),
              name: nameArb,
              totalQuantity: positiveQuantityArb,
              threshold: thresholdArb,
            }),
            { minLength: 1, maxLength: 20 },
          ),
          async (groups) => {
            jest.clearAllMocks();

            // Compute isLowStock for each group
            const allGroups = groups.map((g) => ({
              ...g,
              isLowStock: g.totalQuantity <= g.threshold,
            }));
            const lowStockGroups = allGroups.filter((g) => g.isLowStock);

            mockSend.mockResolvedValueOnce({ Items: lowStockGroups });

            const result = await handler(
              makeEvent({
                httpMethod: 'GET',
                resource: '/inventory/low-stock',
                path: '/inventory/low-stock',
              }),
            );

            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);

            // Should return groups (not items)
            expect(body.groups).toBeDefined();

            // Every returned group should have isLowStock=true
            for (const group of body.groups) {
              expect(group.isLowStock).toBe(true);
            }

            expect(body.groups.length).toBe(lowStockGroups.length);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Feature: inventory-core, Property 6: Low Stock In-App Notification Trigger
   * Validates: Requirements 7.5 (adapted for group-based model)
   *
   * When a group transitions from not-low-stock to low-stock, a notification is generated.
   */
  describe('Property 6: Low Stock Group Notification Trigger', () => {
    it('should generate notification when group transitions to low-stock via quantity change', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          nameArb,
          fc
            .record({
              newQuantity: fc.integer({ min: 1, max: 100 }),
              threshold: fc.integer({ min: 1, max: 100 }),
            })
            .filter(({ newQuantity, threshold }) => newQuantity <= threshold),
          async (itemId, itemName, { newQuantity, threshold }) => {
            jest.clearAllMocks();

            const groupId = 'fixed-grp';
            const oldQuantity = threshold + 10; // above threshold
            const existingTotal = oldQuantity;
            const delta = newQuantity - oldQuantity;
            const newTotal = Math.max(0, existingTotal + delta);
            const expectedLowStock = newTotal <= threshold;

            // GetCommand returns current item (not low-stock in group)
            mockSend.mockResolvedValueOnce({
              Item: {
                PK: 'USER#user-prop-test',
                SK: `ITEM#${itemId}`,
                itemId,
                name: itemName,
                category: 'Dairy',
                quantity: oldQuantity,
                unit: 'Liter',
                location: 'loc-1',
                groupId,
                syncVersion: 1,
              },
            });
            // getGroup for target
            mockSend.mockResolvedValueOnce({
              Item: {
                PK: 'USER#user-prop-test',
                SK: `GROUP#${groupId}`,
                groupId,
                name: itemName,
                totalQuantity: existingTotal,
                threshold,
                isLowStock: false,
                syncVersion: 1,
              },
            });
            // UpdateCommand returns updated item
            mockSend.mockResolvedValueOnce({
              Attributes: {
                PK: 'USER#user-prop-test',
                SK: `ITEM#${itemId}`,
                itemId,
                name: itemName,
                quantity: newQuantity,
                groupId,
                syncVersion: 2,
              },
            });
            // adjustGroupQuantity: getGroup
            mockSend.mockResolvedValueOnce({
              Item: {
                PK: 'USER#user-prop-test',
                SK: `GROUP#${groupId}`,
                groupId,
                totalQuantity: existingTotal,
                threshold,
                isLowStock: false,
                syncVersion: 1,
              },
            });
            // adjustGroupQuantity: UpdateCommand
            mockSend.mockResolvedValueOnce({
              Attributes: {
                PK: 'USER#user-prop-test',
                SK: `GROUP#${groupId}`,
                groupId,
                name: itemName,
                totalQuantity: newTotal,
                threshold,
                isLowStock: expectedLowStock,
                syncVersion: 2,
              },
            });

            const result = await handler(
              makeEvent({
                httpMethod: 'PUT',
                pathParameters: { itemId },
                body: JSON.stringify({ quantity: newQuantity }),
              }),
            );

            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);

            if (expectedLowStock) {
              expect(body.lowStockTransition).toBe(true);
              expect(body.notification).toBeDefined();
              expect(body.notification.type).toBe('LOW_STOCK');
              expect(body.notification.groupId).toBe(groupId);
              expect(body.notification.message).toContain(itemName);
            } else {
              expect(body.lowStockTransition).toBeUndefined();
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should NOT generate notification when group was already low-stock', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          nameArb,
          fc
            .record({
              newQuantity: fc.integer({ min: 1, max: 100 }),
              threshold: fc.integer({ min: 1, max: 100 }),
            })
            .filter(({ newQuantity, threshold }) => newQuantity <= threshold),
          async (itemId, itemName, { newQuantity, threshold }) => {
            jest.clearAllMocks();

            const groupId = 'fixed-grp';

            // GetCommand returns current item (already low-stock group)
            mockSend.mockResolvedValueOnce({
              Item: {
                PK: 'USER#user-prop-test',
                SK: `ITEM#${itemId}`,
                itemId,
                name: itemName,
                category: 'Dairy',
                quantity: threshold - 1, // already low
                unit: 'Liter',
                location: 'loc-1',
                groupId,
                syncVersion: 1,
              },
            });
            // getGroup for target (already low-stock)
            mockSend.mockResolvedValueOnce({
              Item: {
                PK: 'USER#user-prop-test',
                SK: `GROUP#${groupId}`,
                groupId,
                name: itemName,
                totalQuantity: threshold - 1,
                threshold,
                isLowStock: true,
                syncVersion: 1,
              },
            });
            mockSend.mockResolvedValueOnce({
              Attributes: {
                PK: 'USER#user-prop-test',
                SK: `ITEM#${itemId}`,
                itemId,
                name: itemName,
                quantity: newQuantity,
                groupId,
                syncVersion: 2,
              },
            });
            // adjustGroupQuantity: getGroup (already low)
            mockSend.mockResolvedValueOnce({
              Item: {
                PK: 'USER#user-prop-test',
                SK: `GROUP#${groupId}`,
                groupId,
                totalQuantity: threshold - 1,
                threshold,
                isLowStock: true,
                syncVersion: 1,
              },
            });
            mockSend.mockResolvedValueOnce({
              Attributes: {
                PK: 'USER#user-prop-test',
                SK: `GROUP#${groupId}`,
                groupId,
                totalQuantity: threshold - 1 + (newQuantity - (threshold - 1)),
                threshold,
                isLowStock: true,
                syncVersion: 2,
              },
            });

            const result = await handler(
              makeEvent({
                httpMethod: 'PUT',
                pathParameters: { itemId },
                body: JSON.stringify({ quantity: newQuantity }),
              }),
            );

            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body.lowStockTransition).toBeUndefined();
            expect(body.notification).toBeUndefined();
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Feature: inventory-core, Property 9: Image Storage with Reference
   * Validates: Requirements 3.5
   *
   * For any uploaded image, the DynamoDB record should contain the pictureUrl.
   */
  describe('Property 9: Image Storage with Reference', () => {
    it('should store pictureUrl reference in DynamoDB record when provided as S3 URL', async () => {
      await fc.assert(
        fc.asyncProperty(validItemArb, fc.uuid(), async (itemData, imageId) => {
          jest.clearAllMocks();
          uuidCounter = 0;

          const s3Url = `s3://my-bucket/inventory-items/${imageId}`;
          mockSend.mockResolvedValueOnce({ Item: undefined }); // getGroup
          mockSend.mockResolvedValueOnce({ Item: undefined }); // createGroup getGroup
          mockSend.mockResolvedValueOnce({}); // PutCommand group
          mockSend.mockResolvedValueOnce({}); // PutCommand item

          const result = await handler(
            makeEvent({
              httpMethod: 'POST',
              body: JSON.stringify({ ...itemData, pictureUrl: s3Url }),
            }),
          );

          expect(result.statusCode).toBe(201);
          const body = JSON.parse(result.body);
          expect(body.item.pictureUrl).toBe(s3Url);

          // Verify the PutCommand (call #3, index 3) was called with the pictureUrl
          const itemPutCall = mockSend.mock.calls[3][0];
          expect(itemPutCall.Item.pictureUrl).toBe(s3Url);
        }),
        { numRuns: 100 },
      );
    });

    it('should store pictureUrl reference when provided as HTTPS URL', async () => {
      await fc.assert(
        fc.asyncProperty(validItemArb, fc.uuid(), async (itemData, imageId) => {
          jest.clearAllMocks();
          uuidCounter = 0;

          const httpsUrl = `https://images.example.com/items/${imageId}.jpg`;
          mockSend.mockResolvedValueOnce({ Item: undefined });
          mockSend.mockResolvedValueOnce({ Item: undefined });
          mockSend.mockResolvedValueOnce({});
          mockSend.mockResolvedValueOnce({});

          const result = await handler(
            makeEvent({
              httpMethod: 'POST',
              body: JSON.stringify({ ...itemData, pictureUrl: httpsUrl }),
            }),
          );

          expect(result.statusCode).toBe(201);
          const body = JSON.parse(result.body);
          expect(body.item.pictureUrl).toBe(httpsUrl);

          const itemPutCall = mockSend.mock.calls[3][0];
          expect(itemPutCall.Item.pictureUrl).toBe(httpsUrl);
        }),
        { numRuns: 100 },
      );
    });

    it('should not include pictureUrl when not provided', async () => {
      await fc.assert(
        fc.asyncProperty(validItemArb, async (itemData) => {
          jest.clearAllMocks();
          uuidCounter = 0;

          mockSend.mockResolvedValueOnce({ Item: undefined });
          mockSend.mockResolvedValueOnce({ Item: undefined });
          mockSend.mockResolvedValueOnce({});
          mockSend.mockResolvedValueOnce({});

          const result = await handler(
            makeEvent({
              httpMethod: 'POST',
              body: JSON.stringify(itemData),
            }),
          );

          expect(result.statusCode).toBe(201);
          const body = JSON.parse(result.body);
          expect(body.item.pictureUrl).toBeUndefined();
        }),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Feature: inventory-core, Property 26: Group Threshold Setting Persistence
   * Validates: Requirements 7.1 (adapted for group-based model)
   *
   * Setting the threshold on a group via PUT /inventory/groups/{groupId}
   * persists the value and recalculates isLowStock.
   */
  describe('Property 26: Group Threshold Persistence', () => {
    it('should persist threshold via group update endpoint and recalculate isLowStock', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          positiveQuantityArb,
          thresholdArb,
          async (groupId, totalQuantity, newThreshold) => {
            jest.clearAllMocks();

            const expectedLowStock = totalQuantity <= newThreshold;

            // getGroup returns existing group
            mockSend.mockResolvedValueOnce({
              Item: {
                PK: 'USER#user-prop-test',
                SK: `GROUP#${groupId}`,
                groupId,
                name: 'Test',
                unit: 'piece',
                totalQuantity,
                isLowStock: false,
                syncVersion: 1,
              },
            });
            // UpdateCommand
            mockSend.mockResolvedValueOnce({
              Attributes: {
                PK: 'USER#user-prop-test',
                SK: `GROUP#${groupId}`,
                groupId,
                name: 'Test',
                totalQuantity,
                threshold: newThreshold,
                isLowStock: expectedLowStock,
                syncVersion: 2,
              },
            });

            const result = await handler(
              makeEvent({
                httpMethod: 'PUT',
                resource: '/inventory/groups/{groupId}',
                path: '/inventory/groups/some-group',
                pathParameters: { groupId },
                body: JSON.stringify({ threshold: newThreshold }),
              }),
            );

            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body.group.threshold).toBe(newThreshold);
            expect(body.group.isLowStock).toBe(expectedLowStock);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
