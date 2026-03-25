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
  unit: 'liters',
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
      expect(body.item.unit).toBe('liters');
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
          unit: 'liters',
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
          unit: 'liters',
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
          unit: 'liters',
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
});
