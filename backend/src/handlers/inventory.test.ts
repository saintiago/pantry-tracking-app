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
  randomUUID: jest.fn(() => 'item-uuid-1234'),
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
      authorizer: { claims: { sub: 'user-123' } },
      requestId: 'req-1',
    } as any,
    resource: '',
    ...overrides,
  };
}

const validItem = {
  name: 'Milk',
  category: 'Dairy',
  expirationDate: '2025-02-01',
  locationId: 'loc-1',
  quantity: 2,
  unit: 'Liter',
};

describe('Inventory Lambda handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when userId is missing', async () => {
    const result = await handler(
      makeEvent({ requestContext: { authorizer: {}, requestId: 'req-1' } as any }),
    );
    expect(result.statusCode).toBe(401);
  });

  it('returns 405 for unsupported methods', async () => {
    const result = await handler(makeEvent({ httpMethod: 'PATCH' }));
    expect(result.statusCode).toBe(405);
  });

  describe('GET /inventory', () => {
    it('returns inventory items', async () => {
      const items = [
        { itemId: 'item-1', name: 'Milk', category: 'Dairy', quantity: 2 },
        { itemId: 'item-2', name: 'Bread', category: 'Bakery', quantity: 1 },
      ];
      mockSend.mockResolvedValueOnce({ Items: items });

      const result = await handler(makeEvent());
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.items).toHaveLength(2);
      expect(body.items[0].name).toBe('Milk');
      expect(body.lastEvaluatedKey).toBeUndefined();
    });

    it('returns empty list when no items exist', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      const result = await handler(makeEvent());
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.items).toHaveLength(0);
    });

    it('returns lastEvaluatedKey for pagination', async () => {
      const lastKey = { PK: 'USER#user-123', SK: 'ITEM#item-5' };
      mockSend.mockResolvedValueOnce({
        Items: [{ itemId: 'item-5', name: 'Eggs' }],
        LastEvaluatedKey: lastKey,
      });

      const result = await handler(makeEvent());
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.lastEvaluatedKey).toBeDefined();
    });

    it('passes limit query parameter to DynamoDB', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      await handler(
        makeEvent({ queryStringParameters: { limit: '10' } }),
      );

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({ Limit: 10 }),
      );
    });
  });

  describe('POST /inventory', () => {
    it('creates an inventory item with required fields', async () => {
      mockSend.mockResolvedValueOnce({}); // put succeeds

      const result = await handler(
        makeEvent({
          httpMethod: 'POST',
          body: JSON.stringify(validItem),
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(201);
      expect(body.item.name).toBe('Milk');
      expect(body.item.category).toBe('Dairy');
      expect(body.item.quantity).toBe(2);
      expect(body.item.unit).toBe('Liter');
      expect(body.item.location).toBe('loc-1');
      expect(body.item.itemId).toBe('item-uuid-1234');
      expect(body.item.entityType).toBe('InventoryItem');
      expect(body.item.isLowStock).toBe(false);
      expect(body.item.syncVersion).toBe(1);
    });

    it('creates item with optional fields', async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await handler(
        makeEvent({
          httpMethod: 'POST',
          body: JSON.stringify({
            ...validItem,
            barcode: '1234567890',
            brand: 'FarmFresh',
            whereToBuy: 'Supermarket',
            onlineStoreLink: 'https://store.example.com/milk',
            pictureUrl: 'https://images.example.com/milk.jpg',
            threshold: 1,
          }),
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(201);
      expect(body.item.barcode).toBe('1234567890');
      expect(body.item.brand).toBe('FarmFresh');
      expect(body.item.whereToBuy).toBe('Supermarket');
      expect(body.item.onlineStoreLink).toBe('https://store.example.com/milk');
      expect(body.item.pictureUrl).toBe('https://images.example.com/milk.jpg');
      expect(body.item.threshold).toBe(1);
    });

    it('sets GSI1PK for category queries', async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await handler(
        makeEvent({
          httpMethod: 'POST',
          body: JSON.stringify(validItem),
        }),
      );
      const body = JSON.parse(result.body);

      expect(body.item.GSI1PK).toBe('USER#user-123#CAT#Dairy');
      expect(body.item.GSI1SK).toBe('ITEM#item-uuid-1234');
    });

    it('calculates isLowStock correctly when quantity <= threshold', async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await handler(
        makeEvent({
          httpMethod: 'POST',
          body: JSON.stringify({ ...validItem, quantity: 1, threshold: 2 }),
        }),
      );
      const body = JSON.parse(result.body);

      expect(body.item.isLowStock).toBe(true);
    });

    it('calculates isLowStock correctly when quantity equals threshold', async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await handler(
        makeEvent({
          httpMethod: 'POST',
          body: JSON.stringify({ ...validItem, quantity: 3, threshold: 3 }),
        }),
      );
      const body = JSON.parse(result.body);

      expect(body.item.isLowStock).toBe(true);
    });

    it('sets isLowStock false when no threshold is set', async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await handler(
        makeEvent({
          httpMethod: 'POST',
          body: JSON.stringify(validItem),
        }),
      );
      const body = JSON.parse(result.body);

      expect(body.item.isLowStock).toBe(false);
      expect(body.item.threshold).toBeUndefined();
    });

    it('returns 400 when body is missing', async () => {
      const result = await handler(makeEvent({ httpMethod: 'POST', body: null }));
      expect(result.statusCode).toBe(400);
    });

    it('returns 400 when body is invalid JSON', async () => {
      const result = await handler(makeEvent({ httpMethod: 'POST', body: 'not-json' }));
      expect(result.statusCode).toBe(400);
    });

    it('returns 400 with details when required fields are missing', async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await handler(
        makeEvent({
          httpMethod: 'POST',
          body: JSON.stringify({ name: 'Milk' }),
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.error).toBe('VALIDATION_ERROR');
      expect(body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'category' }),
          expect.objectContaining({ field: 'expirationDate' }),
          expect.objectContaining({ field: 'locationId' }),
          expect.objectContaining({ field: 'quantity' }),
          expect.objectContaining({ field: 'unit' }),
        ]),
      );
    });

    it('returns 400 when all required fields are missing', async () => {
      const result = await handler(
        makeEvent({
          httpMethod: 'POST',
          body: JSON.stringify({}),
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.details).toHaveLength(6);
    });
  });

  describe('error handling', () => {
    it('returns 500 on unexpected DynamoDB error', async () => {
      mockSend.mockReset();
      mockSend.mockRejectedValue(new Error('DynamoDB failure'));

      const result = await handler(
        makeEvent({ httpMethod: 'POST', body: JSON.stringify(validItem) }),
      );

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).error).toBe('INTERNAL_ERROR');
    });
  });

  describe('PUT /inventory/{itemId}', () => {
    it('updates an inventory item with partial fields', async () => {
      // GetCommand returns current item
      mockSend.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-123',
          SK: 'ITEM#item-1',
          name: 'Milk',
          category: 'Dairy',
          quantity: 2,
          unit: 'Liter',
          location: 'loc-1',
          isLowStock: false,
          syncVersion: 1,
        },
      });
      // UpdateCommand returns updated item
      mockSend.mockResolvedValueOnce({
        Attributes: {
          PK: 'USER#user-123',
          SK: 'ITEM#item-1',
          name: 'Milk',
          category: 'Dairy',
          quantity: 5,
          unit: 'Liter',
          location: 'loc-1',
          isLowStock: false,
          syncVersion: 2,
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      });

      const result = await handler(
        makeEvent({
          httpMethod: 'PUT',
          pathParameters: { itemId: 'item-1' },
          body: JSON.stringify({ quantity: 5 }),
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.item.quantity).toBe(5);
      expect(body.item.syncVersion).toBe(2);
    });

    it('updates category and recalculates GSI1PK', async () => {
      mockSend.mockResolvedValueOnce({
        Attributes: {
          PK: 'USER#user-123',
          SK: 'ITEM#item-1',
          name: 'Milk',
          category: 'Beverages',
          GSI1PK: 'USER#user-123#CAT#Beverages',
          GSI1SK: 'ITEM#item-1',
          quantity: 2,
          unit: 'Liter',
          syncVersion: 2,
        },
      });

      const result = await handler(
        makeEvent({
          httpMethod: 'PUT',
          pathParameters: { itemId: 'item-1' },
          body: JSON.stringify({ category: 'Beverages' }),
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.item.category).toBe('Beverages');
      expect(body.item.GSI1PK).toBe('USER#user-123#CAT#Beverages');
    });

    it('recalculates isLowStock when quantity changes', async () => {
      // GetCommand returns current item with threshold
      mockSend.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-123',
          SK: 'ITEM#item-1',
          quantity: 5,
          threshold: 3,
          isLowStock: false,
          syncVersion: 1,
        },
      });
      // UpdateCommand returns updated item
      mockSend.mockResolvedValueOnce({
        Attributes: {
          PK: 'USER#user-123',
          SK: 'ITEM#item-1',
          quantity: 2,
          threshold: 3,
          isLowStock: true,
          syncVersion: 2,
        },
      });

      const result = await handler(
        makeEvent({
          httpMethod: 'PUT',
          pathParameters: { itemId: 'item-1' },
          body: JSON.stringify({ quantity: 2 }),
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.item.isLowStock).toBe(true);
    });

    it('updates locationId field', async () => {
      mockSend.mockResolvedValueOnce({
        Attributes: {
          PK: 'USER#user-123',
          SK: 'ITEM#item-1',
          location: 'loc-2',
          syncVersion: 2,
        },
      });

      const result = await handler(
        makeEvent({
          httpMethod: 'PUT',
          pathParameters: { itemId: 'item-1' },
          body: JSON.stringify({ locationId: 'loc-2' }),
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.item.location).toBe('loc-2');
    });

    it('returns 404 when item does not exist (ConditionalCheckFailedException)', async () => {
      const error = new Error('Condition not met');
      error.name = 'ConditionalCheckFailedException';
      mockSend.mockRejectedValueOnce(error);

      const result = await handler(
        makeEvent({
          httpMethod: 'PUT',
          pathParameters: { itemId: 'nonexistent' },
          body: JSON.stringify({ name: 'Updated' }),
        }),
      );

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).error).toBe('NOT_FOUND');
    });

    it('returns 400 when body is missing', async () => {
      const result = await handler(
        makeEvent({
          httpMethod: 'PUT',
          pathParameters: { itemId: 'item-1' },
          body: null,
        }),
      );

      expect(result.statusCode).toBe(400);
    });

    it('returns 400 when body is invalid JSON', async () => {
      const result = await handler(
        makeEvent({
          httpMethod: 'PUT',
          pathParameters: { itemId: 'item-1' },
          body: 'not-json',
        }),
      );

      expect(result.statusCode).toBe(400);
    });

    it('returns 400 when no fields to update', async () => {
      const result = await handler(
        makeEvent({
          httpMethod: 'PUT',
          pathParameters: { itemId: 'item-1' },
          body: JSON.stringify({}),
        }),
      );

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('No fields to update');
    });
  });

  describe('DELETE /inventory/{itemId}', () => {
    it('deletes an existing inventory item', async () => {
      // GetCommand returns existing item
      mockSend.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-123',
          SK: 'ITEM#item-1',
          name: 'Milk',
        },
      });
      // DeleteCommand succeeds
      mockSend.mockResolvedValueOnce({});

      const result = await handler(
        makeEvent({
          httpMethod: 'DELETE',
          pathParameters: { itemId: 'item-1' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.message).toBe('Inventory item deleted');
    });

    it('returns 404 when item does not exist', async () => {
      // GetCommand returns no item
      mockSend.mockResolvedValueOnce({ Item: undefined });

      const result = await handler(
        makeEvent({
          httpMethod: 'DELETE',
          pathParameters: { itemId: 'nonexistent' },
        }),
      );

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).error).toBe('NOT_FOUND');
    });
  });

  describe('GET /inventory/low-stock', () => {
    it('returns only low-stock items', async () => {
      const lowStockItems = [
        { itemId: 'item-1', name: 'Milk', isLowStock: true, quantity: 1, threshold: 2 },
        { itemId: 'item-2', name: 'Eggs', isLowStock: true, quantity: 0, threshold: 3 },
      ];
      mockSend.mockResolvedValueOnce({ Items: lowStockItems });

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/low-stock',
          path: '/inventory/low-stock',
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.items).toHaveLength(2);
      expect(body.items[0].name).toBe('Milk');
      expect(body.items[1].name).toBe('Eggs');
    });

    it('returns empty list when no low-stock items exist', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/low-stock',
          path: '/inventory/low-stock',
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.items).toHaveLength(0);
    });

    it('queries with correct filter expression for isLowStock', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/low-stock',
          path: '/inventory/low-stock',
        }),
      );

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          FilterExpression: 'isLowStock = :true',
          ExpressionAttributeValues: expect.objectContaining({
            ':true': true,
          }),
        }),
      );
    });
  });

  describe('POST /inventory - low-stock GSI1', () => {
    it('sets GSI1PK to LOWSTOCK when item is low-stock on create', async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await handler(
        makeEvent({
          httpMethod: 'POST',
          body: JSON.stringify({ ...validItem, quantity: 1, threshold: 2 }),
        }),
      );
      const body = JSON.parse(result.body);

      expect(body.item.isLowStock).toBe(true);
      expect(body.item.GSI1PK).toBe('USER#user-123#LOWSTOCK');
      expect(body.item.GSI1SK).toBe('ITEM#item-uuid-1234');
    });

    it('sets GSI1PK to category when item is not low-stock on create', async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await handler(
        makeEvent({
          httpMethod: 'POST',
          body: JSON.stringify({ ...validItem, quantity: 5, threshold: 2 }),
        }),
      );
      const body = JSON.parse(result.body);

      expect(body.item.isLowStock).toBe(false);
      expect(body.item.GSI1PK).toBe('USER#user-123#CAT#Dairy');
    });
  });

  describe('GET /inventory/search', () => {
    it('searches by barcode and returns matching items', async () => {
      // Mock returns items that match the barcode query (DynamoDB FilterExpression does this)
      const items = [
        { itemId: 'item-1', name: 'Milk', barcode: '1234567890', brand: 'FarmFresh' },
        { itemId: 'item-2', name: 'Yogurt', barcode: '1234567891', brand: 'FarmFresh' },
      ];
      mockSend.mockResolvedValueOnce({ Items: items });

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'barcode', query: '123456' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.field).toBe('barcode');
      expect(body.query).toBe('123456');
      expect(body.resultType).toBe('items');
      expect(body.items).toHaveLength(2);
      expect(body.count).toBe(2);
    });

    it('searches by name and returns matching items (case-insensitive)', async () => {
      const items = [
        { itemId: 'item-1', name: 'Milk', category: 'Dairy' },
        { itemId: 'item-2', name: 'Almond Milk', category: 'Dairy' },
        { itemId: 'item-3', name: 'Bread', category: 'Bakery' },
      ];
      mockSend.mockResolvedValueOnce({ Items: items });

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'name', query: 'milk' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.resultType).toBe('items');
      expect(body.items).toHaveLength(2);
      expect(body.items[0].name).toBe('Milk');
      expect(body.items[1].name).toBe('Almond Milk');
      expect(body.count).toBe(2);
    });

    it('searches by category and returns distinct values', async () => {
      const items = [
        { itemId: 'item-1', name: 'Milk', category: 'Dairy' },
        { itemId: 'item-2', name: 'Cheese', category: 'Dairy' },
        { itemId: 'item-3', name: 'Bread', category: 'Bakery' },
        { itemId: 'item-4', name: 'Snacks', category: 'Snacks' },
      ];
      mockSend.mockResolvedValueOnce({ Items: items });

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'category', query: 'da' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.resultType).toBe('values');
      expect(body.values).toEqual(['Dairy']);
      expect(body.count).toBe(1);
    });

    it('searches by brand and returns distinct values', async () => {
      const items = [
        { itemId: 'item-1', name: 'Milk', brand: 'FarmFresh' },
        { itemId: 'item-2', name: 'Cheese', brand: 'FarmFresh' },
        { itemId: 'item-3', name: 'Bread', brand: 'BakeryBest' },
      ];
      mockSend.mockResolvedValueOnce({ Items: items });

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'brand', query: 'farm' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.resultType).toBe('values');
      expect(body.values).toEqual(['FarmFresh']);
      expect(body.count).toBe(1);
    });

    it('searches by whereToBuy and returns distinct values', async () => {
      const items = [
        { itemId: 'item-1', name: 'Milk', whereToBuy: 'Supermarket' },
        { itemId: 'item-2', name: 'Cheese', whereToBuy: 'Supermarket' },
        { itemId: 'item-3', name: 'Bread', whereToBuy: 'Local Bakery' },
      ];
      mockSend.mockResolvedValueOnce({ Items: items });

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'whereToBuy', query: 'super' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.resultType).toBe('values');
      expect(body.values).toEqual(['Supermarket']);
      expect(body.count).toBe(1);
    });

    it('searches by onlineStoreLink and returns distinct values', async () => {
      const items = [
        { itemId: 'item-1', name: 'Milk', onlineStoreLink: 'https://store.com/milk' },
        { itemId: 'item-2', name: 'Cheese', onlineStoreLink: 'https://store.com/cheese' },
        { itemId: 'item-3', name: 'Bread', onlineStoreLink: 'https://bakery.com/bread' },
      ];
      mockSend.mockResolvedValueOnce({ Items: items });

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'onlineStoreLink', query: 'store.com' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.resultType).toBe('values');
      expect(body.values).toHaveLength(2);
      expect(body.count).toBe(2);
    });

    it('returns max 10 results for barcode search', async () => {
      const items = Array.from({ length: 15 }, (_, i) => ({
        itemId: `item-${i}`,
        name: `Item ${i}`,
        barcode: `123456789${i}`,
      }));
      mockSend.mockResolvedValueOnce({ Items: items.slice(0, 10) });

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'barcode', query: '123' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.items).toHaveLength(10);
      expect(body.count).toBe(10);
    });

    it('returns max 10 results for name search', async () => {
      const items = Array.from({ length: 15 }, (_, i) => ({
        itemId: `item-${i}`,
        name: `Milk ${i}`,
      }));
      mockSend.mockResolvedValueOnce({ Items: items });

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'name', query: 'milk' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.items).toHaveLength(10);
      expect(body.count).toBe(10);
    });

    it('returns max 10 distinct values for category search', async () => {
      const items = Array.from({ length: 15 }, (_, i) => ({
        itemId: `item-${i}`,
        name: `Item ${i}`,
        category: `Category ${i}`,
      }));
      mockSend.mockResolvedValueOnce({ Items: items });

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'category', query: 'cat' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.values).toHaveLength(10);
      expect(body.count).toBe(10);
    });

    it('returns empty results when no matches found', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'barcode', query: 'nonexistent' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.items).toHaveLength(0);
      expect(body.count).toBe(0);
    });

    it('filters out empty values for distinct value searches', async () => {
      const items = [
        { itemId: 'item-1', name: 'Milk', brand: 'FarmFresh' },
        { itemId: 'item-2', name: 'Cheese', brand: '' },
        { itemId: 'item-3', name: 'Bread', brand: 'BakeryBest' },
        { itemId: 'item-4', name: 'Eggs' }, // no brand field
      ];
      mockSend.mockResolvedValueOnce({ Items: items });

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'brand', query: 'farm' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.values).toHaveLength(1);
      expect(body.values).toContain('FarmFresh');
    });

    it('returns 400 when field parameter is missing', async () => {
      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { query: 'test' },
        }),
      );

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when query parameter is missing', async () => {
      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'barcode' },
        }),
      );

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when field is invalid', async () => {
      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'invalid', query: 'test' },
        }),
      );

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toBe('VALIDATION_ERROR');
      expect(JSON.parse(result.body).message).toContain('field must be one of');
    });

    it('returns 400 when query is empty after trimming', async () => {
      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'barcode', query: '   ' },
        }),
      );

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('query cannot be empty');
    });

    it('handles DynamoDB errors gracefully', async () => {
      mockSend.mockRejectedValueOnce(new Error('DynamoDB failure'));

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'barcode', query: 'test' },
        }),
      );

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).error).toBe('INTERNAL_ERROR');
    });

    it('returns correct result format for barcode field (items)', async () => {
      const items = [
        { itemId: 'item-1', name: 'Milk', barcode: '123456', brand: 'FarmFresh' },
      ];
      mockSend.mockResolvedValueOnce({ Items: items });

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'barcode', query: '123' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(body).toHaveProperty('field', 'barcode');
      expect(body).toHaveProperty('query', '123');
      expect(body).toHaveProperty('resultType', 'items');
      expect(body).toHaveProperty('items');
      expect(body).toHaveProperty('count', 1);
      expect(body).not.toHaveProperty('values');
    });

    it('returns correct result format for name field (items)', async () => {
      const items = [{ itemId: 'item-1', name: 'Milk', category: 'Dairy' }];
      mockSend.mockResolvedValueOnce({ Items: items });

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'name', query: 'milk' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(body).toHaveProperty('field', 'name');
      expect(body).toHaveProperty('query', 'milk');
      expect(body).toHaveProperty('resultType', 'items');
      expect(body).toHaveProperty('items');
      expect(body).toHaveProperty('count', 1);
      expect(body).not.toHaveProperty('values');
    });

    it('returns correct result format for category field (values)', async () => {
      const items = [{ itemId: 'item-1', name: 'Milk', category: 'Dairy' }];
      mockSend.mockResolvedValueOnce({ Items: items });

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'category', query: 'da' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(body).toHaveProperty('field', 'category');
      expect(body).toHaveProperty('query', 'da');
      expect(body).toHaveProperty('resultType', 'values');
      expect(body).toHaveProperty('values');
      expect(body).toHaveProperty('count', 1);
      expect(body).not.toHaveProperty('items');
    });

    it('returns correct result format for brand field (values)', async () => {
      const items = [
        { itemId: 'item-1', name: 'Milk', brand: 'FarmFresh' },
        { itemId: 'item-2', name: 'Cheese', brand: 'OtherBrand' },
      ];
      mockSend.mockResolvedValueOnce({ Items: items });

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'brand', query: 'farm' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(body).toHaveProperty('field', 'brand');
      expect(body).toHaveProperty('query', 'farm');
      expect(body).toHaveProperty('resultType', 'values');
      expect(body).toHaveProperty('values');
      expect(body).toHaveProperty('count', 1);
      expect(body).not.toHaveProperty('items');
    });

    it('returns correct result format for whereToBuy field (values)', async () => {
      const items = [
        { itemId: 'item-1', name: 'Milk', whereToBuy: 'Supermarket' },
        { itemId: 'item-2', name: 'Bread', whereToBuy: 'Bakery' },
      ];
      mockSend.mockResolvedValueOnce({ Items: items });

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'whereToBuy', query: 'super' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(body).toHaveProperty('field', 'whereToBuy');
      expect(body).toHaveProperty('query', 'super');
      expect(body).toHaveProperty('resultType', 'values');
      expect(body).toHaveProperty('values');
      expect(body).toHaveProperty('count', 1);
      expect(body).not.toHaveProperty('items');
    });

    it('returns correct result format for onlineStoreLink field (values)', async () => {
      const items = [
        { itemId: 'item-1', name: 'Milk', onlineStoreLink: 'https://store.com' },
        { itemId: 'item-2', name: 'Bread', onlineStoreLink: 'https://bakery.com' },
      ];
      mockSend.mockResolvedValueOnce({ Items: items });

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'onlineStoreLink', query: 'store' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(body).toHaveProperty('field', 'onlineStoreLink');
      expect(body).toHaveProperty('query', 'store');
      expect(body).toHaveProperty('resultType', 'values');
      expect(body).toHaveProperty('values');
      expect(body).toHaveProperty('count', 1);
      expect(body).not.toHaveProperty('items');
    });

    it('performs case-insensitive matching for name field', async () => {
      const items = [
        { itemId: 'item-1', name: 'Milk', brand: 'FarmFresh' },
        { itemId: 'item-2', name: 'ALMOND MILK' },
        { itemId: 'item-3', name: 'milk chocolate' },
      ];
      mockSend.mockResolvedValueOnce({ Items: items });

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'name', query: 'MILK' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.items).toHaveLength(3);
    });

    it('performs case-insensitive matching for category field', async () => {
      const items = [
        { itemId: 'item-1', name: 'Milk', category: 'Dairy' },
        { itemId: 'item-2', name: 'Cheese', category: 'DAIRY' },
        { itemId: 'item-3', name: 'Yogurt', category: 'dairy' },
      ];
      mockSend.mockResolvedValueOnce({ Items: items });

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'category', query: 'DAIRY' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.values).toHaveLength(3);
      expect(body.values).toContain('Dairy');
      expect(body.values).toContain('DAIRY');
      expect(body.values).toContain('dairy');
    });

    it('performs case-insensitive matching for brand field', async () => {
      const items = [
        { itemId: 'item-1', name: 'Milk', brand: 'FarmFresh' },
        { itemId: 'item-2', name: 'Cheese', brand: 'FARMFRESH' },
        { itemId: 'item-3', name: 'Yogurt', brand: 'farmfresh' },
      ];
      mockSend.mockResolvedValueOnce({ Items: items });

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'brand', query: 'FARM' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.values).toHaveLength(3);
      expect(body.values).toContain('FarmFresh');
      expect(body.values).toContain('FARMFRESH');
      expect(body.values).toContain('farmfresh');
    });

    it('performs case-insensitive matching for whereToBuy field', async () => {
      const items = [
        { itemId: 'item-1', name: 'Milk', whereToBuy: 'Supermarket' },
        { itemId: 'item-2', name: 'Cheese', whereToBuy: 'SUPERMARKET' },
        { itemId: 'item-3', name: 'Yogurt', whereToBuy: 'supermarket' },
      ];
      mockSend.mockResolvedValueOnce({ Items: items });

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'whereToBuy', query: 'SUPER' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.values).toHaveLength(3);
      expect(body.values).toContain('Supermarket');
      expect(body.values).toContain('SUPERMARKET');
      expect(body.values).toContain('supermarket');
    });

    it('performs case-insensitive matching for onlineStoreLink field', async () => {
      const items = [
        { itemId: 'item-1', name: 'Milk', onlineStoreLink: 'https://Store.com/milk' },
        { itemId: 'item-2', name: 'Cheese', onlineStoreLink: 'https://STORE.com/cheese' },
        { itemId: 'item-3', name: 'Yogurt', onlineStoreLink: 'https://store.com/yogurt' },
      ];
      mockSend.mockResolvedValueOnce({ Items: items });

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'onlineStoreLink', query: 'STORE' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.values).toHaveLength(3);
    });

    it('handles empty results for barcode search', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] }); // DynamoDB FilterExpression returns no items

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'barcode', query: 'nonexistent' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.resultType).toBe('items');
      expect(body.items).toEqual([]);
      expect(body.count).toBe(0);
    });

    it('handles empty results for name search', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'name', query: 'nonexistent' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.resultType).toBe('items');
      expect(body.items).toEqual([]);
      expect(body.count).toBe(0);
    });

    it('handles empty results for category search', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'category', query: 'nonexistent' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.resultType).toBe('values');
      expect(body.values).toEqual([]);
      expect(body.count).toBe(0);
    });

    it('trims whitespace from query parameter', async () => {
      const items = [{ itemId: 'item-1', name: 'Milk', barcode: '123456' }];
      mockSend.mockResolvedValueOnce({ Items: items });

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'barcode', query: '  123456  ' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.query).toBe('123456');
    });

    it('returns distinct values only once for category field', async () => {
      const items = [
        { itemId: 'item-1', name: 'Milk', category: 'Dairy' },
        { itemId: 'item-2', name: 'Cheese', category: 'Dairy' },
        { itemId: 'item-3', name: 'Yogurt', category: 'Dairy' },
      ];
      mockSend.mockResolvedValueOnce({ Items: items });

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'category', query: 'da' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.values).toEqual(['Dairy']);
      expect(body.count).toBe(1);
    });

    it('returns distinct values only once for brand field', async () => {
      const items = [
        { itemId: 'item-1', name: 'Milk', brand: 'FarmFresh' },
        { itemId: 'item-2', name: 'Cheese', brand: 'FarmFresh' },
        { itemId: 'item-3', name: 'Yogurt', brand: 'FarmFresh' },
      ];
      mockSend.mockResolvedValueOnce({ Items: items });

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'brand', query: 'farm' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.values).toEqual(['FarmFresh']);
      expect(body.count).toBe(1);
    });

    it('supports substring matching in the middle of text for name field', async () => {
      const items = [
        { itemId: 'item-1', name: 'Almond Milk', brand: 'FarmFresh' },
        { itemId: 'item-2', name: 'Soy Milk' },
      ];
      mockSend.mockResolvedValueOnce({ Items: items });

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'name', query: 'milk' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.items).toHaveLength(2);
    });

    it('supports substring matching at the end of text for category field', async () => {
      const items = [
        { itemId: 'item-1', name: 'Milk', category: 'Fresh Dairy' },
        { itemId: 'item-2', name: 'Cheese', category: 'Aged Dairy' },
      ];
      mockSend.mockResolvedValueOnce({ Items: items });

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'category', query: 'dairy' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.values).toHaveLength(2);
      expect(body.values).toContain('Fresh Dairy');
      expect(body.values).toContain('Aged Dairy');
    });

    it('handles items with missing optional fields for brand search', async () => {
      const items = [
        { itemId: 'item-1', name: 'Milk', brand: 'FarmFresh' },
        { itemId: 'item-2', name: 'Cheese' }, // no brand
        { itemId: 'item-3', name: 'Yogurt', brand: 'FarmFresh' },
      ];
      mockSend.mockResolvedValueOnce({ Items: items });

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'brand', query: 'farm' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.values).toEqual(['FarmFresh']);
      expect(body.count).toBe(1);
    });

    it('handles items with missing optional fields for whereToBuy search', async () => {
      const items = [
        { itemId: 'item-1', name: 'Milk', whereToBuy: 'Supermarket' },
        { itemId: 'item-2', name: 'Cheese' }, // no whereToBuy
        { itemId: 'item-3', name: 'Yogurt', whereToBuy: 'Local Store' },
      ];
      mockSend.mockResolvedValueOnce({ Items: items });

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'whereToBuy', query: 'store' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.values).toEqual(['Local Store']);
      expect(body.count).toBe(1);
    });

    it('handles items with missing optional fields for onlineStoreLink search', async () => {
      const items = [
        { itemId: 'item-1', name: 'Milk', onlineStoreLink: 'https://store.com/milk' },
        { itemId: 'item-2', name: 'Cheese' }, // no onlineStoreLink
        { itemId: 'item-3', name: 'Yogurt', onlineStoreLink: 'https://shop.com/yogurt' },
      ];
      mockSend.mockResolvedValueOnce({ Items: items });

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'onlineStoreLink', query: 'store' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.values).toEqual(['https://store.com/milk']);
      expect(body.count).toBe(1);
    });

    it('handles query with special characters for name search', async () => {
      const items = [
        { itemId: 'item-1', name: 'Milk & Honey' },
        { itemId: 'item-2', name: 'Bread' },
      ];
      mockSend.mockResolvedValueOnce({ Items: items });

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'name', query: '&' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.items).toHaveLength(1);
      expect(body.items[0].name).toBe('Milk & Honey');
    });

    it('returns empty array when no items match name query', async () => {
      const items = [
        { itemId: 'item-1', name: 'Milk' },
        { itemId: 'item-2', name: 'Bread' },
      ];
      mockSend.mockResolvedValueOnce({ Items: items });

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'name', query: 'xyz' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.items).toEqual([]);
      expect(body.count).toBe(0);
    });

    it('returns empty array when no distinct values match category query', async () => {
      const items = [
        { itemId: 'item-1', name: 'Milk', category: 'Dairy' },
        { itemId: 'item-2', name: 'Bread', category: 'Bakery' },
      ];
      mockSend.mockResolvedValueOnce({ Items: items });

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'category', query: 'xyz' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.values).toEqual([]);
      expect(body.count).toBe(0);
    });

    it('handles barcode search with exact match', async () => {
      const items = [
        { itemId: 'item-1', name: 'Milk', barcode: '1234567890' },
      ];
      mockSend.mockResolvedValueOnce({ Items: items }); // DynamoDB FilterExpression returns matching item

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'barcode', query: '1234567890' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.items).toHaveLength(1);
      expect(body.items[0].barcode).toBe('1234567890');
    });

    it('handles barcode search with partial match', async () => {
      const items = [
        { itemId: 'item-1', name: 'Milk', barcode: '1234567890' },
        { itemId: 'item-2', name: 'Yogurt', barcode: '1234567891' },
      ];
      mockSend.mockResolvedValueOnce({ Items: items }); // DynamoDB FilterExpression returns matching items

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'barcode', query: '12345' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.items).toHaveLength(2);
    });

    it('handles single character query for category field', async () => {
      const items = [
        { itemId: 'item-1', name: 'Milk', category: 'Dairy' },
        { itemId: 'item-2', name: 'Bread', category: 'Bakery' },
      ];
      mockSend.mockResolvedValueOnce({ Items: items });

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'category', query: 'D' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.values).toEqual(['Dairy']);
      expect(body.count).toBe(1);
    });

    it('handles numeric query for brand field', async () => {
      const items = [
        { itemId: 'item-1', name: 'Milk', brand: 'Brand123' },
        { itemId: 'item-2', name: 'Cheese', brand: 'BrandABC' },
      ];
      mockSend.mockResolvedValueOnce({ Items: items });

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'brand', query: '123' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.values).toEqual(['Brand123']);
      expect(body.count).toBe(1);
    });

    it('handles URL query for onlineStoreLink field', async () => {
      const items = [
        { itemId: 'item-1', name: 'Milk', onlineStoreLink: 'https://store.com/milk' },
        { itemId: 'item-2', name: 'Cheese', onlineStoreLink: 'https://shop.com/cheese' },
      ];
      mockSend.mockResolvedValueOnce({ Items: items });

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'onlineStoreLink', query: 'https://store' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.values).toEqual(['https://store.com/milk']);
      expect(body.count).toBe(1);
    });

    it('handles whereToBuy search with multiple word query', async () => {
      const items = [
        { itemId: 'item-1', name: 'Milk', whereToBuy: 'Local Farmers Market' },
        { itemId: 'item-2', name: 'Cheese', whereToBuy: 'Supermarket' },
      ];
      mockSend.mockResolvedValueOnce({ Items: items });

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'whereToBuy', query: 'Farmers Market' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.values).toEqual(['Local Farmers Market']);
      expect(body.count).toBe(1);
    });

    it('preserves original casing in returned distinct values', async () => {
      const items = [
        { itemId: 'item-1', name: 'Milk', category: 'Fresh Dairy' },
        { itemId: 'item-2', name: 'Cheese', category: 'Aged Cheese' },
      ];
      mockSend.mockResolvedValueOnce({ Items: items });

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'category', query: 'e' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.values).toContain('Fresh Dairy');
      expect(body.values).toContain('Aged Cheese');
    });

    it('handles items with null values for optional fields', async () => {
      const items = [
        { itemId: 'item-1', name: 'Milk', brand: 'FarmFresh' },
        { itemId: 'item-2', name: 'Cheese', brand: null },
        { itemId: 'item-3', name: 'Yogurt', brand: 'YogurtCo' },
      ];
      mockSend.mockResolvedValueOnce({ Items: items });

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/search',
          path: '/inventory/search',
          queryStringParameters: { field: 'brand', query: 'farm' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.values).toEqual(['FarmFresh']);
      expect(body.count).toBe(1);
    });
  });

  describe('PUT /inventory/{itemId} - low-stock transition', () => {
    it('includes lowStockTransition flag when item transitions to low-stock', async () => {
      // GetCommand returns current item (not low-stock)
      mockSend.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-123',
          SK: 'ITEM#item-1',
          name: 'Milk',
          category: 'Dairy',
          quantity: 5,
          threshold: 3,
          isLowStock: false,
          syncVersion: 1,
        },
      });
      // UpdateCommand returns updated item (now low-stock)
      mockSend.mockResolvedValueOnce({
        Attributes: {
          PK: 'USER#user-123',
          SK: 'ITEM#item-1',
          name: 'Milk',
          category: 'Dairy',
          quantity: 2,
          threshold: 3,
          isLowStock: true,
          syncVersion: 2,
        },
      });

      const result = await handler(
        makeEvent({
          httpMethod: 'PUT',
          pathParameters: { itemId: 'item-1' },
          body: JSON.stringify({ quantity: 2 }),
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.lowStockTransition).toBe(true);
      expect(body.notification).toBeDefined();
      expect(body.notification.type).toBe('LOW_STOCK');
      expect(body.notification.message).toContain('Milk');
      expect(body.notification.itemId).toBe('item-1');
    });

    it('does not include lowStockTransition when item was already low-stock', async () => {
      // GetCommand returns current item (already low-stock)
      mockSend.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-123',
          SK: 'ITEM#item-1',
          name: 'Milk',
          category: 'Dairy',
          quantity: 2,
          threshold: 3,
          isLowStock: true,
          syncVersion: 1,
        },
      });
      // UpdateCommand returns updated item (still low-stock)
      mockSend.mockResolvedValueOnce({
        Attributes: {
          PK: 'USER#user-123',
          SK: 'ITEM#item-1',
          name: 'Milk',
          category: 'Dairy',
          quantity: 1,
          threshold: 3,
          isLowStock: true,
          syncVersion: 2,
        },
      });

      const result = await handler(
        makeEvent({
          httpMethod: 'PUT',
          pathParameters: { itemId: 'item-1' },
          body: JSON.stringify({ quantity: 1 }),
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.lowStockTransition).toBeUndefined();
      expect(body.notification).toBeUndefined();
    });

    it('does not include lowStockTransition when item moves out of low-stock', async () => {
      // GetCommand returns current item (low-stock)
      mockSend.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-123',
          SK: 'ITEM#item-1',
          name: 'Milk',
          category: 'Dairy',
          quantity: 2,
          threshold: 3,
          isLowStock: true,
          syncVersion: 1,
        },
      });
      // UpdateCommand returns updated item (no longer low-stock)
      mockSend.mockResolvedValueOnce({
        Attributes: {
          PK: 'USER#user-123',
          SK: 'ITEM#item-1',
          name: 'Milk',
          category: 'Dairy',
          quantity: 10,
          threshold: 3,
          isLowStock: false,
          syncVersion: 2,
        },
      });

      const result = await handler(
        makeEvent({
          httpMethod: 'PUT',
          pathParameters: { itemId: 'item-1' },
          body: JSON.stringify({ quantity: 10 }),
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.lowStockTransition).toBeUndefined();
    });

    it('updates GSI1PK to LOWSTOCK when transitioning to low-stock', async () => {
      mockSend.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-123',
          SK: 'ITEM#item-1',
          name: 'Milk',
          category: 'Dairy',
          quantity: 5,
          threshold: 3,
          isLowStock: false,
          syncVersion: 1,
        },
      });
      mockSend.mockResolvedValueOnce({
        Attributes: {
          PK: 'USER#user-123',
          SK: 'ITEM#item-1',
          name: 'Milk',
          category: 'Dairy',
          quantity: 2,
          threshold: 3,
          isLowStock: true,
          GSI1PK: 'USER#user-123#LOWSTOCK',
          syncVersion: 2,
        },
      });

      await handler(
        makeEvent({
          httpMethod: 'PUT',
          pathParameters: { itemId: 'item-1' },
          body: JSON.stringify({ quantity: 2 }),
        }),
      );

      // Verify the UpdateCommand was called with GSI1PK set to LOWSTOCK
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          ExpressionAttributeValues: expect.objectContaining({
            ':v_gsi1pk': 'USER#user-123#LOWSTOCK',
          }),
        }),
      );
    });

    it('updates GSI1PK back to category when moving out of low-stock', async () => {
      mockSend.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-123',
          SK: 'ITEM#item-1',
          name: 'Milk',
          category: 'Dairy',
          quantity: 2,
          threshold: 3,
          isLowStock: true,
          syncVersion: 1,
        },
      });
      mockSend.mockResolvedValueOnce({
        Attributes: {
          PK: 'USER#user-123',
          SK: 'ITEM#item-1',
          name: 'Milk',
          category: 'Dairy',
          quantity: 10,
          threshold: 3,
          isLowStock: false,
          GSI1PK: 'USER#user-123#CAT#Dairy',
          syncVersion: 2,
        },
      });

      await handler(
        makeEvent({
          httpMethod: 'PUT',
          pathParameters: { itemId: 'item-1' },
          body: JSON.stringify({ quantity: 10 }),
        }),
      );

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          ExpressionAttributeValues: expect.objectContaining({
            ':v_gsi1pk': 'USER#user-123#CAT#Dairy',
          }),
        }),
      );
    });
  });

  describe('POST /inventory/barcode-lookup', () => {
    const mockFetch = jest.fn();

    beforeEach(() => {
      global.fetch = mockFetch;
      mockFetch.mockReset();
    });

    function makeLookupEvent(barcode: string) {
      return makeEvent({
        httpMethod: 'POST',
        resource: '/inventory/barcode-lookup',
        path: '/inventory/barcode-lookup',
        body: JSON.stringify({ barcode }),
      });
    }

    function mockOpenFoodFacts(product: Record<string, unknown> | null) {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          product
            ? { status: 1, product }
            : { status: 0, product: null },
      });
    }

    it('strips locale prefix from categories_tags (en:dairy-products → Dairy Products)', async () => {
      mockOpenFoodFacts({
        product_name: 'Organic Milk',
        brands: 'Organic Valley',
        categories_tags: ['en:dairy-products', 'en:milks'],
      });

      const result = await handler(makeLookupEvent('012345678901'));
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.found).toBe(true);
      expect(body.product.category).toBe('Dairy Products');
    });

    it('prefers English tag over other language tags', async () => {
      mockOpenFoodFacts({
        product_name: 'Brie',
        brands: 'President',
        categories_tags: ['fr:fromages', 'en:cheeses', 'de:kase'],
      });

      const result = await handler(makeLookupEvent('012345678902'));
      const body = JSON.parse(result.body);

      expect(body.product.category).toBe('Cheeses');
    });

    it('falls back to first tag when no English tag exists', async () => {
      mockOpenFoodFacts({
        product_name: 'Baguette',
        brands: 'Poilane',
        categories_tags: ['fr:pains', 'de:brote'],
      });

      const result = await handler(makeLookupEvent('012345678903'));
      const body = JSON.parse(result.body);

      expect(body.product.category).toBe('Pains');
    });

    it('takes only the first brand when multiple are comma-separated', async () => {
      mockOpenFoodFacts({
        product_name: 'Mixed Nuts',
        brands: 'Planters, Kraft, Heinz',
        categories_tags: ['en:snacks'],
      });

      const result = await handler(makeLookupEvent('012345678904'));
      const body = JSON.parse(result.body);

      expect(body.product.brand).toBe('Planters');
    });

    it('converts hyphenated slug to title case (plant-based-foods → Plant Based Foods)', async () => {
      mockOpenFoodFacts({
        product_name: 'Oat Milk',
        brands: 'Oatly',
        categories_tags: ['en:plant-based-foods', 'en:non-dairy-milks'],
      });

      const result = await handler(makeLookupEvent('012345678905'));
      const body = JSON.parse(result.body);

      expect(body.product.category).toBe('Plant Based Foods');
    });

    it('returns found: false when product has no name', async () => {
      mockOpenFoodFacts({ brands: 'Unknown', categories_tags: ['en:snacks'] });

      const result = await handler(makeLookupEvent('012345678906'));
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.found).toBe(false);
    });

    it('returns found: false when Open Food Facts returns status 0', async () => {
      mockOpenFoodFacts(null);

      const result = await handler(makeLookupEvent('012345678907'));
      const body = JSON.parse(result.body);

      expect(body.found).toBe(false);
    });

    it('returns 400 when barcode is missing', async () => {
      const result = await handler(
        makeEvent({
          httpMethod: 'POST',
          resource: '/inventory/barcode-lookup',
          path: '/inventory/barcode-lookup',
          body: JSON.stringify({}),
        }),
      );

      expect(result.statusCode).toBe(400);
    });
  });
});
