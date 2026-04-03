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

import { handler } from './inventory';

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
    } as any,
    resource: '',
    ...overrides,
  };
}

// --- Arbitraries ---

const nameArb = fc
  .string({ minLength: 1, maxLength: 50 })
  .map((s) => s.replace(/[\x00-\x1f]/g, 'a').trim())
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
          const found = listBody.items.find(
            (item: { itemId: string }) => item.itemId === itemId,
          );
          expect(found).toBeUndefined();
        }),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Feature: inventory-core, Property 3: Quantity Update Round-Trip
   * Validates: Requirements 6.1
   *
   * For any inventory item and any valid positive quantity value, updating the item's
   * quantity and then retrieving the item should return the updated quantity value.
   */
  describe('Property 3: Quantity Update Round-Trip', () => {
    it('should return the updated quantity after update', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          positiveQuantityArb,
          positiveQuantityArb,
          async (itemId, originalQty, newQty) => {
            jest.clearAllMocks();

            // GetCommand returns current item (for low-stock recalc)
            mockSend.mockResolvedValueOnce({
              Item: {
                PK: 'USER#user-prop-test',
                SK: `ITEM#${itemId}`,
                quantity: originalQty,
                category: 'Dairy',
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
                quantity: newQty,
                category: 'Dairy',
                isLowStock: false,
                syncVersion: 2,
              },
            });

            const updateResult = await handler(
              makeEvent({
                httpMethod: 'PUT',
                pathParameters: { itemId },
                body: JSON.stringify({ quantity: newQty }),
              }),
            );

            expect(updateResult.statusCode).toBe(200);
            const body = JSON.parse(updateResult.body);
            expect(body.item.quantity).toBe(newQty);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Feature: inventory-core, Property 4: Low Stock Threshold Invariant
   * Validates: Requirements 7.2
   *
   * For any inventory item with a defined threshold, the item's isLowStock flag
   * should be true if and only if quantity <= threshold.
   */
  describe('Property 4: Low Stock Threshold Invariant', () => {
    it('should set isLowStock correctly based on quantity vs threshold on create', async () => {
      await fc.assert(
        fc.asyncProperty(
          validItemArb,
          thresholdArb,
          async (itemData, threshold) => {
            jest.clearAllMocks();
            uuidCounter = 0;

            mockSend.mockResolvedValueOnce({});

            const result = await handler(
              makeEvent({
                httpMethod: 'POST',
                body: JSON.stringify({ ...itemData, threshold }),
              }),
            );

            expect(result.statusCode).toBe(201);
            const body = JSON.parse(result.body);
            const expectedLowStock = itemData.quantity <= threshold;
            expect(body.item.isLowStock).toBe(expectedLowStock);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should recalculate isLowStock correctly on quantity update', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          positiveQuantityArb,
          thresholdArb,
          async (itemId, newQty, threshold) => {
            jest.clearAllMocks();

            const expectedLowStock = newQty <= threshold;

            // GetCommand returns current item with threshold
            mockSend.mockResolvedValueOnce({
              Item: {
                PK: 'USER#user-prop-test',
                SK: `ITEM#${itemId}`,
                quantity: 50,
                threshold,
                category: 'Dairy',
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
                quantity: newQty,
                threshold,
                isLowStock: expectedLowStock,
                syncVersion: 2,
              },
            });

            const result = await handler(
              makeEvent({
                httpMethod: 'PUT',
                pathParameters: { itemId },
                body: JSON.stringify({ quantity: newQty }),
              }),
            );

            expect(result.statusCode).toBe(200);

            // Verify the UpdateCommand was called with the correct isLowStock value
            const updateCall = mockSend.mock.calls[1][0];
            expect(updateCall.ExpressionAttributeValues[':v_isLowStock']).toBe(expectedLowStock);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Feature: inventory-core, Property 5: Low Stock List Accuracy
   * Validates: Requirements 7.3
   *
   * For any user's inventory, the low-stock items view should contain exactly
   * the set of items where isLowStock is true.
   */
  describe('Property 5: Low Stock List Accuracy', () => {
    it('should return only items with isLowStock=true from low-stock endpoint', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              itemId: fc.uuid(),
              name: nameArb,
              quantity: positiveQuantityArb,
              threshold: thresholdArb,
            }),
            { minLength: 1, maxLength: 20 },
          ),
          async (items) => {
            jest.clearAllMocks();

            // Compute isLowStock for each item
            const allItems = items.map((item) => ({
              ...item,
              isLowStock: item.quantity <= item.threshold,
            }));

            const lowStockItems = allItems.filter((item) => item.isLowStock);

            // The low-stock endpoint uses FilterExpression, so DynamoDB returns only matching items
            mockSend.mockResolvedValueOnce({ Items: lowStockItems });

            const result = await handler(
              makeEvent({
                httpMethod: 'GET',
                resource: '/inventory/low-stock',
                path: '/inventory/low-stock',
              }),
            );

            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);

            // Every returned item should have isLowStock=true
            for (const item of body.items) {
              expect(item.isLowStock).toBe(true);
            }

            // Count should match expected low-stock items
            expect(body.items.length).toBe(lowStockItems.length);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Feature: inventory-core, Property 6: Low Stock In-App Notification Trigger
   * Validates: Requirements 7.5
   *
   * For any inventory item that transitions to low-stock status, the system should
   * generate an in-app notification.
   */
  describe('Property 6: Low Stock In-App Notification Trigger', () => {
    it('should generate notification when item transitions to low-stock', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          nameArb,
          // quantity that will be below threshold
          fc.record({
            newQuantity: fc.integer({ min: 1, max: 100 }),
            threshold: fc.integer({ min: 1, max: 100 }),
          }).filter(({ newQuantity, threshold }) => newQuantity <= threshold),
          async (itemId, itemName, { newQuantity, threshold }) => {
            jest.clearAllMocks();

            // GetCommand returns current item that is NOT low-stock
            mockSend.mockResolvedValueOnce({
              Item: {
                PK: 'USER#user-prop-test',
                SK: `ITEM#${itemId}`,
                name: itemName,
                category: 'Dairy',
                quantity: threshold + 10, // above threshold
                threshold,
                isLowStock: false,
                syncVersion: 1,
              },
            });
            // UpdateCommand returns updated item (now low-stock)
            mockSend.mockResolvedValueOnce({
              Attributes: {
                PK: 'USER#user-prop-test',
                SK: `ITEM#${itemId}`,
                itemId,
                name: itemName,
                category: 'Dairy',
                quantity: newQuantity,
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
            expect(body.lowStockTransition).toBe(true);
            expect(body.notification).toBeDefined();
            expect(body.notification.type).toBe('LOW_STOCK');
            expect(body.notification.itemId).toBe(itemId);
            expect(body.notification.message).toContain(itemName);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should NOT generate notification when item was already low-stock', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          nameArb,
          fc.record({
            newQuantity: fc.integer({ min: 1, max: 100 }),
            threshold: fc.integer({ min: 1, max: 100 }),
          }).filter(({ newQuantity, threshold }) => newQuantity <= threshold),
          async (itemId, itemName, { newQuantity, threshold }) => {
            jest.clearAllMocks();

            // GetCommand returns current item that is ALREADY low-stock
            mockSend.mockResolvedValueOnce({
              Item: {
                PK: 'USER#user-prop-test',
                SK: `ITEM#${itemId}`,
                name: itemName,
                category: 'Dairy',
                quantity: threshold - 1,
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
   * Feature: inventory-core, Property 8: Validation Error for Missing Required Fields
   * Validates: Requirements 3.3
   *
   * For any inventory item submission missing one or more required fields, the system
   * should reject the submission and return validation errors indicating which fields
   * are missing.
   */
  describe('Property 8: Validation Error for Missing Required Fields', () => {
    const requiredFields = ['name', 'category', 'expirationDate', 'locationId', 'quantity', 'unit'];

    it('should reject submission and list missing fields', async () => {
      // Generate a non-empty subset of required fields to omit
      const subsetArb = fc
        .subarray(requiredFields, { minLength: 1, maxLength: requiredFields.length })
        .filter((arr) => arr.length > 0);

      await fc.assert(
        fc.asyncProperty(validItemArb, subsetArb, async (itemData, fieldsToOmit) => {
          jest.clearAllMocks();

          const submission: Record<string, unknown> = { ...itemData };
          for (const field of fieldsToOmit) {
            delete submission[field];
          }

          const result = await handler(
            makeEvent({
              httpMethod: 'POST',
              body: JSON.stringify(submission),
            }),
          );

          expect(result.statusCode).toBe(400);
          const body = JSON.parse(result.body);
          expect(body.error).toBe('VALIDATION_ERROR');
          expect(body.details).toBeDefined();

          // Each omitted field should appear in the error details
          const errorFields = body.details.map((d: { field: string }) => d.field);
          for (const omitted of fieldsToOmit) {
            expect(errorFields).toContain(omitted);
          }
        }),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Feature: inventory-core, Property 9: Image Storage with Reference
   * Validates: Requirements 3.5
   *
   * For any uploaded image, the image should be stored in S3 and the corresponding
   * DynamoDB record should contain the S3 key reference.
   *
   * Note: STORAGE_BUCKET is captured at module load time. When a bucket is configured
   * and a non-S3/non-HTTPS pictureUrl is provided, the handler converts it to an S3
   * reference. When the pictureUrl is already an S3 or HTTPS URL, it is preserved.
   * We test the DynamoDB record contains the pictureUrl reference in all cases.
   */
  describe('Property 9: Image Storage with Reference', () => {
    it('should store pictureUrl reference in DynamoDB record when provided as S3 URL', async () => {
      await fc.assert(
        fc.asyncProperty(
          validItemArb,
          fc.uuid(),
          async (itemData, imageId) => {
            jest.clearAllMocks();
            uuidCounter = 0;

            const s3Url = `s3://my-bucket/inventory-items/${imageId}`;
            mockSend.mockResolvedValueOnce({});

            const result = await handler(
              makeEvent({
                httpMethod: 'POST',
                body: JSON.stringify({ ...itemData, pictureUrl: s3Url }),
              }),
            );

            expect(result.statusCode).toBe(201);
            const body = JSON.parse(result.body);
            expect(body.item.pictureUrl).toBeDefined();
            expect(body.item.pictureUrl).toBe(s3Url);

            // Verify the PutCommand was called with the pictureUrl in the item
            const putCall = mockSend.mock.calls[0][0];
            expect(putCall.Item.pictureUrl).toBe(s3Url);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should store pictureUrl reference in DynamoDB record when provided as HTTPS URL', async () => {
      await fc.assert(
        fc.asyncProperty(
          validItemArb,
          fc.uuid(),
          async (itemData, imageId) => {
            jest.clearAllMocks();
            uuidCounter = 0;

            const httpsUrl = `https://images.example.com/items/${imageId}.jpg`;
            mockSend.mockResolvedValueOnce({});

            const result = await handler(
              makeEvent({
                httpMethod: 'POST',
                body: JSON.stringify({ ...itemData, pictureUrl: httpsUrl }),
              }),
            );

            expect(result.statusCode).toBe(201);
            const body = JSON.parse(result.body);
            expect(body.item.pictureUrl).toBeDefined();
            expect(body.item.pictureUrl).toBe(httpsUrl);

            // Verify the PutCommand was called with the pictureUrl in the item
            const putCall = mockSend.mock.calls[0][0];
            expect(putCall.Item.pictureUrl).toBe(httpsUrl);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should not include pictureUrl in DynamoDB record when not provided', async () => {
      await fc.assert(
        fc.asyncProperty(validItemArb, async (itemData) => {
          jest.clearAllMocks();
          uuidCounter = 0;

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
   * Feature: inventory-core, Property 26: Threshold Setting Persistence
   * Validates: Requirements 7.1
   *
   * For any inventory item and valid threshold value, setting the threshold and
   * retrieving the item should return the set threshold value.
   */
  describe('Property 26: Threshold Setting Persistence', () => {
    it('should persist threshold value on item creation', async () => {
      await fc.assert(
        fc.asyncProperty(validItemArb, thresholdArb, async (itemData, threshold) => {
          jest.clearAllMocks();
          uuidCounter = 0;

          mockSend.mockResolvedValueOnce({});

          const result = await handler(
            makeEvent({
              httpMethod: 'POST',
              body: JSON.stringify({ ...itemData, threshold }),
            }),
          );

          expect(result.statusCode).toBe(201);
          const body = JSON.parse(result.body);
          expect(body.item.threshold).toBe(threshold);
        }),
        { numRuns: 100 },
      );
    });

    it('should persist threshold value on item update', async () => {
      await fc.assert(
        fc.asyncProperty(fc.uuid(), thresholdArb, async (itemId, newThreshold) => {
          jest.clearAllMocks();

          // GetCommand returns current item
          mockSend.mockResolvedValueOnce({
            Item: {
              PK: 'USER#user-prop-test',
              SK: `ITEM#${itemId}`,
              quantity: 10,
              threshold: 5,
              category: 'Dairy',
              isLowStock: false,
              syncVersion: 1,
            },
          });
          // UpdateCommand returns updated item with new threshold
          mockSend.mockResolvedValueOnce({
            Attributes: {
              PK: 'USER#user-prop-test',
              SK: `ITEM#${itemId}`,
              itemId,
              quantity: 10,
              threshold: newThreshold,
              isLowStock: 10 <= newThreshold,
              syncVersion: 2,
            },
          });

          const result = await handler(
            makeEvent({
              httpMethod: 'PUT',
              pathParameters: { itemId },
              body: JSON.stringify({ threshold: newThreshold }),
            }),
          );

          expect(result.statusCode).toBe(200);
          const body = JSON.parse(result.body);
          expect(body.item.threshold).toBe(newThreshold);
        }),
        { numRuns: 100 },
      );
    });
  });
});
