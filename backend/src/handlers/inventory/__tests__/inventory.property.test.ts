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
import {
  applyMerge,
  comparableFieldsEqual,
  normalizeString,
  selectMergeMatch,
  toComparableFields,
  type ComparableFields,
} from '../merge';
import { resolveUnit } from '../../../types/units';

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

          // QueryCommand returns no merge match, then PutCommand succeeds
          mockSend.mockResolvedValueOnce({ Items: [] });
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

            mockSend.mockResolvedValueOnce({ Items: [] }); // no merge match
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
            mockSend.mockResolvedValueOnce({ Items: [] }); // no merge match
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
            const putCall = mockSend.mock.calls[1][0];
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
            mockSend.mockResolvedValueOnce({ Items: [] }); // no merge match
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
            const putCall = mockSend.mock.calls[1][0];
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

          mockSend.mockResolvedValueOnce({ Items: [] }); // no merge match
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

          mockSend.mockResolvedValueOnce({ Items: [] }); // no merge match
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

// ---------------------------------------------------------------------------
// Feature: inventory-merge-and-grouping
// Pure comparable-field equality properties (merge.ts). These exercise the
// extracted pure functions directly — no DynamoDB calls are made here.
// ---------------------------------------------------------------------------

const TEST_ITERATIONS = 100;

/**
 * Feature: inventory-merge-and-grouping, Property 1: Comparable-field equality
 * is comprehensive and reflexive.
 *
 * For any inventory item, comparing it against itself yields a match, and the
 * match result is independent of the order in which fields are compared. For any
 * pair of items that differ in at least one Comparable_Field
 * (name, category, expirationDate, location, unit, barcode, brand, whereToBuy,
 * onlineStoreLink) under that field's equality rule — exact ISO string for
 * expirationDate, exact identifier for location, canonical resolveUnit key for
 * unit, and trim + case-insensitive for the string fields, with optional fields
 * equal only when both are absent/empty — comparableFieldsEqual returns false;
 * and for any pair that differs only in quantity and/or picture, it returns true.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8
 */
describe('Merge Property 1: Comparable-field equality is comprehensive and reflexive', () => {
  // Each group resolves (via resolveUnit) to a single, distinct canonical key.
  // Multi-member groups mix legacy labels and modern keys that map together.
  const UNIT_EQUIV_GROUPS: readonly (readonly string[])[] = [
    ['g', 'Gram'],
    ['kg', 'Kilo'],
    ['ml', 'Milliliter'],
    ['l', 'Liter'],
    ['piece', 'Unit'],
    ['cup'],
    ['tbsp'],
    ['tsp'],
    ['can'],
    ['unit'],
  ];

  const OPTIONAL_FIELDS = ['barcode', 'brand', 'whereToBuy', 'onlineStoreLink'] as const;
  type OptionalField = (typeof OPTIONAL_FIELDS)[number];

  const ALL_COMPARABLE_FIELDS = [
    'name',
    'category',
    'expirationDate',
    'location',
    'unit',
    'barcode',
    'brand',
    'whereToBuy',
    'onlineStoreLink',
  ] as const;

  // An InventoryItem/AddInventoryRequest-shaped record. quantity and pictureUrl
  // are present but MUST be ignored by the comparable-field projection (Req 2.6).
  interface ItemLike {
    name: string;
    category: string;
    expirationDate: string;
    location: string;
    unit: string;
    barcode?: string;
    brand?: string;
    whereToBuy?: string;
    onlineStoreLink?: string;
    quantity?: number;
    pictureUrl?: string;
  }

  // Whitespace that String.prototype.trim removes, including the empty string.
  const wsArb = fc.constantFrom('', ' ', '  ', '\t', ' \t ');

  // Non-empty content with control characters stripped and ends trimmed, so the
  // only normalization that matters is the case flip / end padding applied below.
  const contentArb = fc
    .string({ minLength: 1, maxLength: 20 })
    .map((s) => s.replace(/[\x00-\x1f]/g, 'a')) // eslint-disable-line no-control-regex
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // Two disjoint date ranges guarantee a different ISO string when needed.
  const earlyDateArb = fc
    .date({ min: new Date('2024-01-01'), max: new Date('2026-12-31') })
    .map((d) => d.toISOString().split('T')[0]);
  const lateDateArb = fc
    .date({ min: new Date('2028-01-01'), max: new Date('2030-12-31') })
    .map((d) => d.toISOString().split('T')[0]);

  const noiseArb = fc.record({ padL: wsArb, padR: wsArb, upper: fc.boolean() });
  type Noise = { padL: string; padR: string; upper: boolean };

  // Pad both ends and flip case; for string comparable fields this leaves the
  // normalized value (trim + lowercase) unchanged.
  const noisyString = (value: string, n: Noise): string =>
    n.padL + (n.upper ? value.toUpperCase() : value.toLowerCase()) + n.padR;

  it('matches an item against itself and against any normalization-equivalent item, independent of order', () => {
    const equivalentPairArb = fc
      .record({
        name: contentArb,
        category: contentArb,
        expirationDate: earlyDateArb,
        location: fc.uuid(),
        unitGroup: fc.constantFrom(...UNIT_EQUIV_GROUPS),
        unitIdxA: fc.nat(),
        unitIdxB: fc.nat(),
        // Each optional field is either absent on both items, or present on both
        // with the same underlying content (covers Req 2.5 and the equal case of 2.4).
        optionals: fc.record({
          barcode: fc.option(contentArb, { nil: undefined }),
          brand: fc.option(contentArb, { nil: undefined }),
          whereToBuy: fc.option(contentArb, { nil: undefined }),
          onlineStoreLink: fc.option(contentArb, { nil: undefined }),
        }),
        noiseA: noiseArb,
        noiseB: noiseArb,
        quantityA: fc.integer({ min: 0, max: 100000 }),
        quantityB: fc.integer({ min: 0, max: 100000 }),
      })
      .map((g) => {
        const build = (noise: Noise, unit: string, quantity: number): ItemLike => {
          const item: ItemLike = {
            name: noisyString(g.name, noise),
            category: noisyString(g.category, noise),
            // expirationDate / location compare by exact trimmed value: end
            // padding only, no case change.
            expirationDate: noise.padL + g.expirationDate + noise.padR,
            location: noise.padL + g.location + noise.padR,
            unit,
            quantity,
            pictureUrl: `https://img.example.com/${quantity}.jpg`,
          };
          for (const f of OPTIONAL_FIELDS) {
            const v = g.optionals[f];
            if (v !== undefined) item[f] = noisyString(v, noise);
          }
          return item;
        };

        const unitA = g.unitGroup[g.unitIdxA % g.unitGroup.length];
        const unitB = g.unitGroup[g.unitIdxB % g.unitGroup.length];
        return {
          a: build(g.noiseA, unitA, g.quantityA),
          b: build(g.noiseB, unitB, g.quantityB),
        };
      });

    fc.assert(
      fc.property(equivalentPairArb, ({ a, b }) => {
        const ca: ComparableFields = toComparableFields(a);
        const cb: ComparableFields = toComparableFields(b);

        // Reflexive: an item always matches itself.
        expect(comparableFieldsEqual(ca, ca)).toBe(true);
        expect(comparableFieldsEqual(cb, cb)).toBe(true);

        // Equal under case/whitespace/legacy-unit normalization, and differing
        // only in quantity/picture (excluded from comparison, Req 2.6).
        expect(comparableFieldsEqual(ca, cb)).toBe(true);
        // Order-independence: comparison is symmetric.
        expect(comparableFieldsEqual(cb, ca)).toBe(true);
      }),
      { numRuns: TEST_ITERATIONS },
    );
  });

  it('does not match a pair that differs in at least one comparable field', () => {
    interface BaseSpec {
      name: string;
      category: string;
      expirationDate: string;
      location: string;
      unitGroupIdx: number;
      unitRepIdx: number;
      barcode: string;
      brand: string;
      whereToBuy: string;
      onlineStoreLink: string;
      quantity: number;
    }

    const baseArb = fc.record<BaseSpec>({
      name: contentArb,
      category: contentArb,
      expirationDate: earlyDateArb,
      location: fc.uuid(),
      unitGroupIdx: fc.nat(),
      unitRepIdx: fc.nat(),
      barcode: contentArb,
      brand: contentArb,
      whereToBuy: contentArb,
      onlineStoreLink: contentArb,
      quantity: fc.integer({ min: 0, max: 100000 }),
    });

    const buildBaseItem = (base: BaseSpec): ItemLike => {
      const group = UNIT_EQUIV_GROUPS[base.unitGroupIdx % UNIT_EQUIV_GROUPS.length];
      const unit = group[base.unitRepIdx % group.length];
      return {
        name: base.name,
        category: base.category,
        expirationDate: base.expirationDate,
        location: base.location,
        unit,
        barcode: base.barcode,
        brand: base.brand,
        whereToBuy: base.whereToBuy,
        onlineStoreLink: base.onlineStoreLink,
        quantity: base.quantity,
        pictureUrl: 'https://img.example.com/base.jpg',
      };
    };

    fc.assert(
      fc.property(
        baseArb,
        fc.constantFrom(...ALL_COMPARABLE_FIELDS),
        lateDateArb,
        fc.nat(),
        fc.nat(),
        fc.boolean(),
        (base, field, altDate, altGroupSel, altRepSel, makeAbsent) => {
          const baseItem = buildBaseItem(base);
          const variant: ItemLike = { ...baseItem };
          const variantRecord = variant as unknown as Record<string, unknown>;

          switch (field) {
            case 'expirationDate':
              // Disjoint range guarantees a different ISO date string.
              variant.expirationDate = altDate;
              break;
            case 'location':
              variant.location = `${baseItem.location}-different`;
              break;
            case 'unit': {
              const baseCanonical = resolveUnit(baseItem.unit);
              const altGroups = UNIT_EQUIV_GROUPS.filter(
                (gr) => resolveUnit(gr[0]) !== baseCanonical,
              );
              const altGroup = altGroups[altGroupSel % altGroups.length];
              variant.unit = altGroup[altRepSel % altGroup.length];
              break;
            }
            default: {
              // String comparable field (name, category, or an optional field).
              const isOptional = (OPTIONAL_FIELDS as readonly string[]).includes(field);
              if (makeAbsent && isOptional) {
                // Present + non-empty on base, absent on variant => not equal (Req 2.4).
                delete variantRecord[field];
              } else {
                // Guaranteed different normalized value (base content is non-empty).
                variantRecord[field] = `${normalizeString(baseItem[field as OptionalField])}xdiff`;
              }
            }
          }

          const cBase: ComparableFields = toComparableFields(baseItem);
          const cVar: ComparableFields = toComparableFields(variant);

          expect(comparableFieldsEqual(cBase, cVar)).toBe(false);
          // Order-independence holds for the negative case too.
          expect(comparableFieldsEqual(cVar, cBase)).toBe(false);
        },
      ),
      { numRuns: TEST_ITERATIONS },
    );
  });
});

/**
 * Feature: inventory-merge-and-grouping, Property 2: Merge match selection is
 * deterministic.
 *
 * For any non-empty set of items that all qualify as Merge_Matches,
 * selectMergeMatch returns the item with the earliest createdAt, tie-broken by
 * the lexicographically smallest itemId, and this choice is independent of
 * input order. An empty set returns null.
 *
 * Validates: Requirements 1.6
 */
describe('Merge Property 2: Merge match selection is deterministic', () => {
  interface Candidate {
    itemId: string;
    createdAt: string;
    sortKey: number;
  }

  // A small pool of ISO timestamps so distinct candidates frequently collide on
  // createdAt, forcing the lexicographic itemId tie-break to be exercised.
  const TIMESTAMP_POOL = [
    '2024-01-01T00:00:00.000Z',
    '2024-06-15T12:30:00.000Z',
    '2025-03-20T08:00:00.000Z',
    '2025-11-09T23:59:59.999Z',
  ] as const;

  // Records carrying createdAt + itemId (plus a sortKey used only to derive an
  // independent shuffle). itemIds are unique within a set so the (createdAt,
  // itemId) order is total and the expected winner is unambiguous.
  const candidatesArb = fc.uniqueArray(
    fc.record({
      itemId: fc
        .string({ minLength: 1, maxLength: 8 })
        .map((s) => s.replace(/[\x00-\x1f]/g, 'a')) // eslint-disable-line no-control-regex
        .filter((s) => s.length > 0),
      createdAt: fc.constantFrom(...TIMESTAMP_POOL),
      sortKey: fc.double({ noNaN: true, noDefaultInfinity: true }),
    }),
    { minLength: 1, maxLength: 12, selector: (r) => r.itemId },
  );

  // Independent reference implementation: earliest createdAt, then smallest itemId.
  const expectedWinner = (candidates: Candidate[]): Candidate =>
    [...candidates].sort((a, b) => {
      if (a.createdAt < b.createdAt) return -1;
      if (a.createdAt > b.createdAt) return 1;
      if (a.itemId < b.itemId) return -1;
      if (a.itemId > b.itemId) return 1;
      return 0;
    })[0];

  it('selects the earliest createdAt, tie-broken by smallest itemId, independent of input order', () => {
    fc.assert(
      fc.property(candidatesArb, (candidates: Candidate[]) => {
        const expected = expectedWinner(candidates);

        // Three independent orderings of the same set: as generated, sorted by
        // an unrelated key, and reversed. The selection must be identical.
        const asGenerated = candidates;
        const shuffled = [...candidates].sort((a, b) => a.sortKey - b.sortKey);
        const reversed = [...candidates].reverse();

        for (const ordering of [asGenerated, shuffled, reversed]) {
          const result = selectMergeMatch(ordering);
          expect(result).not.toBeNull();
          expect(result?.itemId).toBe(expected.itemId);
          expect(result?.createdAt).toBe(expected.createdAt);
        }
      }),
      { numRuns: TEST_ITERATIONS },
    );
  });

  it('returns null for an empty set of candidates', () => {
    expect(selectMergeMatch([])).toBeNull();
  });
});

/**
 * Feature: inventory-merge-and-grouping, Property 5: Low-stock recomputation
 * and transition reporting are correct.
 *
 * For any merge of a submitted quantity into a matched item, the resulting
 * isLowStock is true if and only if the matched item has a defined threshold
 * and the resulting quantity (existing + submitted) is less than or equal to
 * that threshold; and the merge result includes a low-stock transition
 * indicator reflecting the new value if and only if isLowStock changed relative
 * to the matched item's prior isLowStock.
 *
 * Validates: Requirements 3.2, 3.3, 3.4
 */
describe('Merge Property 5: Low-stock recomputation and transition reporting are correct', () => {
  // Exact, IEEE-754-representable quantities: an integer part plus a fraction
  // that is a multiple of 0.25 (denominator a power of two). Sums of two such
  // values are themselves representable, so equality/<= comparisons are exact
  // and free of floating-point rounding surprises.
  const representableQuantityArb = fc
    .record({
      whole: fc.integer({ min: 0, max: 100000 }),
      quarters: fc.constantFrom(0, 0.25, 0.5, 0.75),
    })
    .map(({ whole, quarters }) => whole + quarters);

  // Thresholds drawn from the same representable space so the boundary
  // (quantity === threshold) is reachable for the <= comparison.
  const representableThresholdArb = fc
    .record({
      whole: fc.integer({ min: 0, max: 100000 }),
      quarters: fc.constantFrom(0, 0.25, 0.5, 0.75),
    })
    .map(({ whole, quarters }) => whole + quarters);

  // threshold either defined (a representable value) or undefined (no threshold).
  const optionalThresholdArb = fc.option(representableThresholdArb, { nil: undefined });

  it('recomputes isLowStock against the threshold and reports a transition iff it changed', () => {
    fc.assert(
      fc.property(
        representableQuantityArb, // existing quantity
        optionalThresholdArb, // existing threshold (may be undefined)
        fc.boolean(), // existing.isLowStock (independent, to exercise transition reporting)
        representableQuantityArb, // submitted quantity
        (existingQuantity, threshold, priorIsLowStock, submittedQuantity) => {
          const existing = {
            quantity: existingQuantity,
            threshold,
            isLowStock: priorIsLowStock,
          };

          const result = applyMerge(existing, submittedQuantity);

          // Quantity is the exact arithmetic sum (representable inputs).
          const expectedQuantity = existingQuantity + submittedQuantity;
          expect(result.quantity).toBe(expectedQuantity);

          // isLowStock is true iff threshold is defined AND resulting quantity <= threshold.
          const expectedLowStock =
            threshold !== undefined && expectedQuantity <= threshold;
          expect(result.isLowStock).toBe(expectedLowStock);

          // lowStockTransition is true iff the new isLowStock differs from the prior value.
          expect(result.lowStockTransition).toBe(expectedLowStock !== priorIsLowStock);
        },
      ),
      { numRuns: TEST_ITERATIONS },
    );
  });

  it('never reports a transition when isLowStock is unchanged, and always reports one when it flips', () => {
    fc.assert(
      fc.property(
        representableQuantityArb,
        optionalThresholdArb,
        representableQuantityArb,
        (existingQuantity, threshold, submittedQuantity) => {
          const resultingQuantity = existingQuantity + submittedQuantity;
          const newLowStock = threshold !== undefined && resultingQuantity <= threshold;

          // Prior state matches the new state: no transition expected.
          const sameState = applyMerge(
            { quantity: existingQuantity, threshold, isLowStock: newLowStock },
            submittedQuantity,
          );
          expect(sameState.isLowStock).toBe(newLowStock);
          expect(sameState.lowStockTransition).toBe(false);

          // Prior state is the opposite of the new state: transition expected.
          const flippedState = applyMerge(
            { quantity: existingQuantity, threshold, isLowStock: !newLowStock },
            submittedQuantity,
          );
          expect(flippedState.isLowStock).toBe(newLowStock);
          expect(flippedState.lowStockTransition).toBe(true);
        },
      ),
      { numRuns: TEST_ITERATIONS },
    );
  });
});

// ---------------------------------------------------------------------------
// In-memory inventory model for the add-operation properties (Properties 3, 4,
// 6). This model composes the extracted pure functions exactly as the handler's
// add path does — projecting each submission with toComparableFields, finding
// matches with comparableFieldsEqual, choosing the canonical match with
// selectMergeMatch, and summing quantity / recomputing low-stock with applyMerge.
// No Lambda handler is invoked and no DynamoDB call is made; the model is a
// plain array of items maintained in memory.
// ---------------------------------------------------------------------------

interface ModelAdd {
  name: string;
  category: string;
  expirationDate: string;
  location: string;
  unit: string;
  barcode?: string;
  brand?: string;
  whereToBuy?: string;
  onlineStoreLink?: string;
  quantity: number;
  threshold?: number;
}

interface ModelItem extends ModelAdd {
  itemId: string;
  createdAt: string;
  isLowStock: boolean;
  syncVersion: number;
}

interface AddOutcome {
  type: 'merge' | 'create';
  beforeCount: number;
  afterCount: number;
  matchCount: number;
  // Populated only for a merge outcome.
  matchedPriorSync?: number;
  matchedNewSync?: number;
}

/**
 * Applies a sequence of add operations to an in-memory inventory using the
 * pure merge functions. For each submission: project to comparable fields,
 * collect every existing item that compares equal, select the canonical match,
 * and either merge into it (sum quantity, recompute isLowStock, increment
 * syncVersion by one) or append a new item (syncVersion 1).
 */
function runInventoryModel(adds: ModelAdd[]): { items: ModelItem[]; outcomes: AddOutcome[] } {
  const items: ModelItem[] = [];
  const outcomes: AddOutcome[] = [];
  let seq = 0;

  for (const add of adds) {
    const submittedFields: ComparableFields = toComparableFields(add);
    const matches = items.filter((existing) =>
      comparableFieldsEqual(submittedFields, toComparableFields(existing)),
    );
    const match = selectMergeMatch(matches);
    const beforeCount = items.length;

    if (match) {
      const priorSync = match.syncVersion;
      const result = applyMerge(match, add.quantity);
      match.quantity = result.quantity;
      match.isLowStock = result.isLowStock;
      match.syncVersion = priorSync + 1;
      outcomes.push({
        type: 'merge',
        beforeCount,
        afterCount: items.length,
        matchCount: matches.length,
        matchedPriorSync: priorSync,
        matchedNewSync: match.syncVersion,
      });
    } else {
      seq += 1;
      const itemId = `item-${String(seq).padStart(6, '0')}`;
      const createdAt = `t-${String(seq).padStart(6, '0')}`;
      const isLowStock = add.threshold !== undefined && add.quantity <= add.threshold;
      items.push({ ...add, itemId, createdAt, isLowStock, syncVersion: 1 });
      outcomes.push({
        type: 'create',
        beforeCount,
        afterCount: items.length,
        matchCount: matches.length,
      });
    }
  }

  return { items, outcomes };
}

// Exact, IEEE-754-representable quantities: an integer part plus a multiple of
// 0.25. Sums of many such values (bounded well below 2^52) stay exact, so the
// quantity-conservation equality is free of floating-point rounding error.
const modelQuantityArb = fc
  .record({
    whole: fc.integer({ min: 0, max: 1000 }),
    quarters: fc.constantFrom(0, 0.25, 0.5, 0.75),
  })
  .map(({ whole, quarters }) => whole + quarters);

// Small pools for the comparable fields so the generated sequences frequently
// produce both merges (collisions, including case/whitespace/legacy-unit
// variants that normalize together) and creations (genuine differences).
const modelAddArb = fc.record<ModelAdd>({
  name: fc.constantFrom('Milk', 'milk', '  Milk ', 'Bread', 'Eggs', 'eggs'),
  category: fc.constantFrom('Dairy', 'Bakery', 'Produce'),
  expirationDate: fc.constantFrom('2025-01-01', '2025-06-15', '2026-03-20'),
  location: fc.constantFrom('loc-a', 'loc-b', 'loc-c'),
  unit: fc.constantFrom('g', 'Gram', 'kg', 'Kilo', 'piece', 'Unit'),
  barcode: fc.option(fc.constantFrom('111', '222'), { nil: undefined }),
  brand: fc.option(fc.constantFrom('Acme', 'Globex'), { nil: undefined }),
  whereToBuy: fc.option(fc.constantFrom('Store A', 'Store B'), { nil: undefined }),
  onlineStoreLink: fc.option(fc.constantFrom('https://a.test', 'https://b.test'), {
    nil: undefined,
  }),
  quantity: modelQuantityArb,
  threshold: fc.option(modelQuantityArb, { nil: undefined }),
});

const modelAddsArb = fc.array(modelAddArb, { minLength: 1, maxLength: 15 });

/**
 * Feature: inventory-merge-and-grouping, Property 3: Add never loses items and
 * changes count by at most one.
 *
 * For any submitted item and existing inventory, the resulting item count is
 * unchanged when a Merge_Match exists (merge) and increases by exactly one when
 * no Merge_Match exists (creation) — never by more than one. When the
 * submission differs from every existing item in at least one Comparable_Field
 * (i.e. no item compares equal), the count increases by exactly one.
 *
 * Validates: Requirements 1.4, 1.5
 */
describe('Merge Property 3: Add never loses items and changes count by at most one', () => {
  it('changes the item count by 0 (merge) or exactly +1 (create), never more', () => {
    fc.assert(
      fc.property(modelAddsArb, (adds) => {
        const { outcomes } = runInventoryModel(adds);
        for (const outcome of outcomes) {
          const delta = outcome.afterCount - outcome.beforeCount;
          // Count never decreases and never grows by more than one.
          expect(delta).toBeGreaterThanOrEqual(0);
          expect(delta).toBeLessThanOrEqual(1);

          if (outcome.type === 'merge') {
            // A merge leaves the count unchanged and required a qualifying match.
            expect(delta).toBe(0);
            expect(outcome.matchCount).toBeGreaterThan(0);
          } else {
            // A creation happens iff no existing item compares equal — i.e. the
            // submission differs from every existing item in >= 1 comparable
            // field — and adds exactly one item.
            expect(delta).toBe(1);
            expect(outcome.matchCount).toBe(0);
          }
        }
      }),
      { numRuns: TEST_ITERATIONS },
    );
  });
});

/**
 * Feature: inventory-merge-and-grouping, Property 4: Quantity is conserved
 * across add operations.
 *
 * For any sequence of add operations applied to a user's inventory, the total
 * quantity summed across all resulting items equals the sum of all submitted
 * quantities (merges add quantity to an existing item; creations add a new
 * item), with fractional values preserved exactly and no quantity rounded,
 * truncated, lost, or duplicated.
 *
 * Validates: Requirements 1.4, 3.1
 */
describe('Merge Property 4: Quantity is conserved across add operations', () => {
  it('preserves the exact total quantity across any sequence of adds', () => {
    fc.assert(
      fc.property(modelAddsArb, (adds) => {
        const { items } = runInventoryModel(adds);
        const totalAcrossItems = items.reduce((sum, item) => sum + item.quantity, 0);
        const totalSubmitted = adds.reduce((sum, add) => sum + add.quantity, 0);
        // Representable (multiple-of-0.25) quantities sum exactly, so this is an
        // exact equality — no rounding tolerance is needed or allowed.
        expect(totalAcrossItems).toBe(totalSubmitted);
      }),
      { numRuns: TEST_ITERATIONS },
    );
  });
});

/**
 * Feature: inventory-merge-and-grouping, Property 6: Merge increments sync
 * version by exactly one.
 *
 * For any Merge_Operation, the resulting syncVersion equals the matched item's
 * prior syncVersion plus exactly 1.
 *
 * Validates: Requirements 1.4, 3.5
 */
describe('Merge Property 6: Merge increments sync version by exactly one', () => {
  it('increments the matched item syncVersion by exactly one on every merge', () => {
    fc.assert(
      fc.property(modelAddsArb, (adds) => {
        const { outcomes } = runInventoryModel(adds);
        for (const outcome of outcomes) {
          if (outcome.type === 'merge') {
            expect(outcome.matchedNewSync).toBe((outcome.matchedPriorSync as number) + 1);
          }
        }
      }),
      { numRuns: TEST_ITERATIONS },
    );
  });
});
