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
      authorizer: { claims: { sub: 'user-123' } },
      requestId: 'req-1',
    } as unknown as APIGatewayProxyEvent['requestContext'],
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
      makeEvent({
        requestContext: {
          authorizer: {},
          requestId: 'req-1',
        } as unknown as APIGatewayProxyEvent['requestContext'],
      }),
    );
    expect(result.statusCode).toBe(401);
  });

  it('returns 405 for unsupported methods', async () => {
    const result = await handler(makeEvent({ httpMethod: 'PATCH' }));
    expect(result.statusCode).toBe(405);
  });

  describe('GET /inventory', () => {
    it('returns inventory items and groups', async () => {
      const items = [
        { itemId: 'item-1', name: 'Milk', category: 'Dairy', quantity: 2 },
        { itemId: 'item-2', name: 'Bread', category: 'Bakery', quantity: 1 },
      ];
      const groups = [
        { groupId: 'abc123', name: 'Milk', totalQuantity: 2, isLowStock: false },
      ];
      mockSend.mockResolvedValueOnce({ Items: items }); // items query
      mockSend.mockResolvedValueOnce({ Items: groups }); // groups query

      const result = await handler(makeEvent());
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.items).toHaveLength(2);
      expect(body.items[0].name).toBe('Milk');
      expect(body.groups).toHaveLength(1);
      expect(body.groups[0].name).toBe('Milk');
      expect(body.lastEvaluatedKey).toBeUndefined();
    });

    it('returns empty list when no items exist', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] }); // items query
      mockSend.mockResolvedValueOnce({ Items: [] }); // groups query

      const result = await handler(makeEvent());
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.items).toHaveLength(0);
      expect(body.groups).toHaveLength(0);
    });

    it('returns lastEvaluatedKey for pagination', async () => {
      const lastKey = { PK: 'USER#user-123', SK: 'ITEM#item-5' };
      mockSend.mockResolvedValueOnce({
        Items: [{ itemId: 'item-5', name: 'Eggs' }],
        LastEvaluatedKey: lastKey,
      });
      mockSend.mockResolvedValueOnce({ Items: [] }); // groups query

      const result = await handler(makeEvent());
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.lastEvaluatedKey).toBeDefined();
    });

    it('passes limit query parameter to DynamoDB', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] }); // items query
      mockSend.mockResolvedValueOnce({ Items: [] }); // groups query

      await handler(makeEvent({ queryStringParameters: { limit: '10' } }));

      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ Limit: 10 }));
    });
  });

  describe('POST /inventory', () => {
    it('creates an inventory item with groupId and creates a new group', async () => {
      // call #1: getGroup → no existing group
      mockSend.mockResolvedValueOnce({ Item: undefined });
      // call #2: getGroup inside createGroup → no existing
      mockSend.mockResolvedValueOnce({ Item: undefined });
      // call #3: PutCommand for group creation
      mockSend.mockResolvedValueOnce({});
      // call #4: PutCommand for item creation
      mockSend.mockResolvedValueOnce({});

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
      expect(body.item.groupId).toBeDefined();
      expect(typeof body.item.groupId).toBe('string');
      expect(body.item.syncVersion).toBe(1);
      // should NOT have legacy item-level fields
      expect(body.item.isLowStock).toBeUndefined();
      expect(body.item.threshold).toBeUndefined();
      // group should be in response
      expect(body.groups).toHaveLength(1);
      expect(body.groups[0].groupId).toBe(body.item.groupId);
      expect(body.groups[0].totalQuantity).toBe(2);
      expect(body.groups[0].isLowStock).toBe(false);
    });

    it('creates item joining an existing group and adjusts its quantity', async () => {
      const groupId = '972166f5862ccab9'; // defaultGroupId for Milk|Dairy|Liter
      const existingGroup = {
        PK: 'USER#user-123',
        SK: `GROUP#${groupId}`,
        groupId,
        name: 'Milk',
        category: 'Dairy',
        unit: 'l',
        totalQuantity: 5,
        threshold: 3,
        isLowStock: false,
        syncVersion: 1,
      };
      // call #1: getGroup → existing group found
      mockSend.mockResolvedValueOnce({ Item: existingGroup });
      // call #2: PutCommand for item
      mockSend.mockResolvedValueOnce({});
      // call #3: getGroup inside adjustGroupQuantity
      mockSend.mockResolvedValueOnce({ Item: { ...existingGroup, totalQuantity: 5, isLowStock: false } });
      // call #4: UpdateCommand for group quantity adjustment
      mockSend.mockResolvedValueOnce({
        Attributes: { ...existingGroup, totalQuantity: 7, isLowStock: false, syncVersion: 2 },
      });

      const result = await handler(
        makeEvent({
          httpMethod: 'POST',
          body: JSON.stringify(validItem),
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(201);
      expect(body.item.groupId).toBe(groupId);
      expect(body.groups).toHaveLength(1);
      expect(body.groups[0].totalQuantity).toBe(7);
    });

    it('creates item with optional fields', async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined }); // no existing group
      mockSend.mockResolvedValueOnce({ Item: undefined }); // createGroup check
      mockSend.mockResolvedValueOnce({}); // PutCommand group
      mockSend.mockResolvedValueOnce({}); // PutCommand item

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
    });

    it('sets GSI1PK for category queries', async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined }); // no existing group
      mockSend.mockResolvedValueOnce({ Item: undefined }); // createGroup check
      mockSend.mockResolvedValueOnce({}); // PutCommand group
      mockSend.mockResolvedValueOnce({}); // PutCommand item

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

    it('triggers low-stock notification when group transitions to low-stock', async () => {
      const groupId = '972166f5862ccab9'; // defaultGroupId for Milk|Dairy|Liter
      const existingGroup = {
        PK: 'USER#user-123',
        SK: `GROUP#${groupId}`,
        groupId,
        name: 'Milk',
        category: 'Dairy',
        unit: 'l',
        totalQuantity: 5,
        threshold: 10,
        isLowStock: false,
        syncVersion: 1,
      };
      mockSend.mockResolvedValueOnce({ Item: existingGroup }); // getGroup → exists
      mockSend.mockResolvedValueOnce({}); // PutCommand item
      // adjustGroupQuantity: getGroup then UpdateCommand
      mockSend.mockResolvedValueOnce({ Item: { ...existingGroup, totalQuantity: 5, isLowStock: false } });
      mockSend.mockResolvedValueOnce({
        Attributes: { ...existingGroup, totalQuantity: 7, isLowStock: true, syncVersion: 2 },
      });

      const result = await handler(
        makeEvent({
          httpMethod: 'POST',
          body: JSON.stringify({ ...validItem, quantity: 2 }),
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(201);
      expect(body.lowStockTransition).toBe(true);
      expect(body.notification).toBeDefined();
      expect(body.notification.type).toBe('LOW_STOCK');
      expect(body.notification.groupId).toBe(groupId);
      expect(body.notification.message).toContain('Milk');
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
    const currentItem = {
      PK: 'USER#user-123',
      SK: 'ITEM#item-1',
      itemId: 'item-1',
      name: 'Milk',
      category: 'Dairy',
      quantity: 2,
      unit: 'Liter',
      location: 'loc-1',
      groupId: 'abc123',
      syncVersion: 1,
    };

    it('updates an inventory item quantity and adjusts group total', async () => {
      // call #1: GetCommand for current item
      mockSend.mockResolvedValueOnce({ Item: currentItem });
      // call #2: getGroup for target group
      mockSend.mockResolvedValueOnce({
        Item: { PK: 'USER#user-123', SK: 'GROUP#abc123', groupId: 'abc123', name: 'Milk', totalQuantity: 2, threshold: 3, isLowStock: true, syncVersion: 1 },
      });
      // call #3: UpdateCommand for item
      mockSend.mockResolvedValueOnce({
        Attributes: { ...currentItem, quantity: 5, syncVersion: 2, updatedAt: '2025-01-01T00:00:00.000Z' },
      });
      // call #4: adjustGroupQuantity → getGroup
      mockSend.mockResolvedValueOnce({
        Item: { PK: 'USER#user-123', SK: 'GROUP#abc123', groupId: 'abc123', totalQuantity: 2, threshold: 3, isLowStock: true, syncVersion: 1 },
      });
      // call #5: adjustGroupQuantity → UpdateCommand
      mockSend.mockResolvedValueOnce({
        Attributes: { PK: 'USER#user-123', SK: 'GROUP#abc123', groupId: 'abc123', totalQuantity: 5, threshold: 3, isLowStock: false, syncVersion: 2 },
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
      expect(body.groups).toBeDefined();
      expect(body.groups[0].totalQuantity).toBe(5);
    });

    it('updates category and recalculates GSI1PK', async () => {
      mockSend.mockResolvedValueOnce({ Item: currentItem }); // GetCommand item
      mockSend.mockResolvedValueOnce({ // getGroup
        Item: { PK: 'USER#user-123', SK: 'GROUP#abc123', groupId: 'abc123', totalQuantity: 2, isLowStock: false, syncVersion: 1 },
      });
      mockSend.mockResolvedValueOnce({ // UpdateCommand item
        Attributes: { ...currentItem, category: 'Beverages', GSI1PK: 'USER#user-123#CAT#Beverages', GSI1SK: 'ITEM#item-1', syncVersion: 2 },
      });
      mockSend.mockResolvedValueOnce({ // adjustGroupQuantity getGroup
        Item: { PK: 'USER#user-123', SK: 'GROUP#abc123', groupId: 'abc123', totalQuantity: 2, isLowStock: false, syncVersion: 1 },
      });
      mockSend.mockResolvedValueOnce({ // adjustGroupQuantity UpdateCommand
        Attributes: { PK: 'USER#user-123', SK: 'GROUP#abc123', totalQuantity: 2, isLowStock: false, syncVersion: 2 },
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

    it('reassigns item to a new group when identity fields change and reassignGroup is true', async () => {
      mockSend.mockResolvedValueOnce({ Item: currentItem }); // GetCommand for current item
      // getGroup for target (new) group → doesn't exist, createGroup will be called
      mockSend.mockResolvedValueOnce({ Item: undefined });
      // createGroup → getGroup inside
      mockSend.mockResolvedValueOnce({ Item: undefined });
      // createGroup → PutCommand for new group
      mockSend.mockResolvedValueOnce({});
      // UpdateCommand for item
      mockSend.mockResolvedValueOnce({
        Attributes: { ...currentItem, name: 'Almond Milk', category: 'Dairy Alternative', unit: 'Liter', groupId: expect.any(String), syncVersion: 2 },
      });
      // adjustGroupQuantity for OLD group → getGroup
      mockSend.mockResolvedValueOnce({
        Item: { PK: 'USER#user-123', SK: 'GROUP#abc123', groupId: 'abc123', totalQuantity: 2, isLowStock: false, syncVersion: 1 },
      });
      // adjustGroupQuantity for OLD group → UpdateCommand (totalQuantity goes to 0)
      mockSend.mockResolvedValueOnce({
        Attributes: { PK: 'USER#user-123', SK: 'GROUP#abc123', groupId: 'abc123', totalQuantity: 0, isLowStock: false, syncVersion: 2 },
      });
      // adjustGroupQuantity for NEW group → getGroup
      mockSend.mockResolvedValueOnce({
        Item: { PK: 'USER#user-123', SK: 'GROUP#def456', groupId: 'def456', totalQuantity: 0, isLowStock: false, syncVersion: 1 },
      });
      // adjustGroupQuantity for NEW group → UpdateCommand
      mockSend.mockResolvedValueOnce({
        Attributes: { PK: 'USER#user-123', SK: 'GROUP#def456', groupId: 'def456', totalQuantity: 2, isLowStock: false, syncVersion: 2 },
      });

      const result = await handler(
        makeEvent({
          httpMethod: 'PUT',
          pathParameters: { itemId: 'item-1' },
          body: JSON.stringify({ name: 'Almond Milk', category: 'Dairy Alternative', reassignGroup: true }),
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.item.name).toBe('Almond Milk');
      expect(body.item.groupId).not.toBe('abc123');
      expect(body.groups).toBeDefined();
    });

    it('updates locationId field', async () => {
      mockSend.mockResolvedValueOnce({ Item: currentItem }); // GetCommand
      mockSend.mockResolvedValueOnce({ // getGroup
        Item: { PK: 'USER#user-123', SK: 'GROUP#abc123', groupId: 'abc123', totalQuantity: 2, isLowStock: false, syncVersion: 1 },
      });
      mockSend.mockResolvedValueOnce({ // UpdateCommand item
        Attributes: { ...currentItem, location: 'loc-2', syncVersion: 2 },
      });
      mockSend.mockResolvedValueOnce({ // adjustGroupQuantity getGroup
        Item: { PK: 'USER#user-123', SK: 'GROUP#abc123', groupId: 'abc123', totalQuantity: 2, isLowStock: false, syncVersion: 1 },
      });
      mockSend.mockResolvedValueOnce({ // adjustGroupQuantity UpdateCommand
        Attributes: { PK: 'USER#user-123', SK: 'GROUP#abc123', totalQuantity: 2, isLowStock: false, syncVersion: 2 },
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
      mockSend.mockResolvedValueOnce({ Item: undefined }); // GetCommand returns no item

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

    it('triggers low-stock notification when group transitions from not-low to low', async () => {
      mockSend.mockResolvedValueOnce({ Item: { ...currentItem, quantity: 3 } }); // GetCommand item (old qty=3)
      mockSend.mockResolvedValueOnce({ // getGroup
        Item: { PK: 'USER#user-123', SK: 'GROUP#abc123', groupId: 'abc123', name: 'Milk', totalQuantity: 3, threshold: 3, isLowStock: false, syncVersion: 1 },
      });
      mockSend.mockResolvedValueOnce({ // UpdateCommand item
        Attributes: { ...currentItem, quantity: 1, syncVersion: 2 },
      });
      // adjustGroupQuantity: totalQuantity=3, delta=(1-3)=-2, new total=1, threshold=3
      mockSend.mockResolvedValueOnce({ // getGroup
        Item: { PK: 'USER#user-123', SK: 'GROUP#abc123', groupId: 'abc123', totalQuantity: 3, threshold: 3, isLowStock: false, syncVersion: 1 },
      });
      mockSend.mockResolvedValueOnce({ // UpdateCommand group → low stock transition
        Attributes: { PK: 'USER#user-123', SK: 'GROUP#abc123', groupId: 'abc123', name: 'Milk', totalQuantity: 1, threshold: 3, isLowStock: true, syncVersion: 2 },
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
      expect(body.lowStockTransition).toBe(true);
      expect(body.notification).toBeDefined();
      expect(body.notification.type).toBe('LOW_STOCK');
      expect(body.notification.groupId).toBe('abc123');
    });
  });

  describe('DELETE /inventory/{itemId}', () => {
    it('deletes an existing inventory item and adjusts group quantity', async () => {
      // GetCommand returns existing item
      mockSend.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-123',
          SK: 'ITEM#item-1',
          itemId: 'item-1',
          name: 'Milk',
          quantity: 2,
          groupId: 'abc123',
        },
      });
      // DeleteCommand succeeds
      mockSend.mockResolvedValueOnce({});
      // adjustGroupQuantity → getGroup
      mockSend.mockResolvedValueOnce({
        Item: { PK: 'USER#user-123', SK: 'GROUP#abc123', groupId: 'abc123', totalQuantity: 2, isLowStock: false, syncVersion: 1 },
      });
      // adjustGroupQuantity → UpdateCommand (total goes to 0, no threshold → group deleted)
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

    it('removes empty group without threshold when last item is deleted', async () => {
      mockSend.mockResolvedValueOnce({
        Item: { PK: 'USER#user-123', SK: 'ITEM#item-1', itemId: 'item-1', quantity: 1, groupId: 'abc123' },
      });
      mockSend.mockResolvedValueOnce({}); // DeleteCommand item
      // adjustGroupQuantity → getGroup (total=1, no threshold)
      mockSend.mockResolvedValueOnce({
        Item: { PK: 'USER#user-123', SK: 'GROUP#abc123', groupId: 'abc123', totalQuantity: 1, isLowStock: false, syncVersion: 1 },
      });
      // adjustGroupQuantity → DeleteCommand (total becomes 0, no threshold)
      mockSend.mockResolvedValueOnce({});

      const result = await handler(
        makeEvent({ httpMethod: 'DELETE', pathParameters: { itemId: 'item-1' } }),
      );

      expect(result.statusCode).toBe(200);
    });
  });

  describe('GET /inventory/low-stock', () => {
    it('returns low-stock groups with aggregate quantities', async () => {
      const lowStockGroups = [
        { groupId: 'group-1', name: 'Milk', totalQuantity: 1, threshold: 2, isLowStock: true },
        { groupId: 'group-2', name: 'Eggs', totalQuantity: 0, threshold: 3, isLowStock: true },
      ];
      mockSend.mockResolvedValueOnce({ Items: lowStockGroups });

      const result = await handler(
        makeEvent({
          httpMethod: 'GET',
          resource: '/inventory/low-stock',
          path: '/inventory/low-stock',
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.groups).toHaveLength(2);
      expect(body.groups[0].name).toBe('Milk');
      expect(body.groups[1].name).toBe('Eggs');
      // should NOT return items array (legacy format)
      expect(body.items).toBeUndefined();
    });

    it('returns empty list when no low-stock groups exist', async () => {
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
      expect(body.groups).toHaveLength(0);
    });

    it('queries GROUP entities with isLowStock filter', async () => {
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
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
          FilterExpression: 'isLowStock = :true',
          ExpressionAttributeValues: expect.objectContaining({
            ':pk': 'USER#user-123',
            ':skPrefix': 'GROUP#',
            ':true': true,
          }),
        }),
      );
    });
  });

  describe('PUT /inventory/groups/{groupId}', () => {
    const existingGroup = {
      PK: 'USER#user-123',
      SK: 'GROUP#abc123',
      entityType: 'InventoryGroup',
      groupId: 'abc123',
      canonicalKey: 'milk|dairy|l',
      name: 'Milk',
      category: 'Dairy',
      unit: 'l',
      totalQuantity: 5,
      isLowStock: false,
      syncVersion: 1,
    };

    it('sets the threshold on a group', async () => {
      mockSend.mockResolvedValueOnce({ Item: existingGroup }); // getGroup
      mockSend.mockResolvedValueOnce({ // UpdateCommand
        Attributes: { ...existingGroup, threshold: 2, isLowStock: false, syncVersion: 2 },
      });

      const result = await handler(
        makeEvent({
          httpMethod: 'PUT',
          resource: '/inventory/groups/{groupId}',
          path: '/inventory/groups/abc123',
          pathParameters: { groupId: 'abc123' },
          body: JSON.stringify({ threshold: 2 }),
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.group.threshold).toBe(2);
      expect(body.group.isLowStock).toBe(false);
    });

    it('clears the threshold when null is passed', async () => {
      const groupWithThreshold = { ...existingGroup, threshold: 2, isLowStock: true };
      mockSend.mockResolvedValueOnce({ Item: groupWithThreshold }); // getGroup
      mockSend.mockResolvedValueOnce({ // UpdateCommand with REMOVE
        Attributes: { ...existingGroup, isLowStock: false, syncVersion: 2 },
      });

      const result = await handler(
        makeEvent({
          httpMethod: 'PUT',
          resource: '/inventory/groups/{groupId}',
          path: '/inventory/groups/abc123',
          pathParameters: { groupId: 'abc123' },
          body: JSON.stringify({ threshold: null }),
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.group.threshold).toBeUndefined();
    });

    it('triggers low-stock notification when threshold causes transition', async () => {
      // totalQuantity=5, threshold=10 → isLowStock=true (transition)
      mockSend.mockResolvedValueOnce({ Item: existingGroup }); // getGroup
      mockSend.mockResolvedValueOnce({ // UpdateCommand
        Attributes: { ...existingGroup, threshold: 10, isLowStock: true, syncVersion: 2 },
      });

      const result = await handler(
        makeEvent({
          httpMethod: 'PUT',
          resource: '/inventory/groups/{groupId}',
          path: '/inventory/groups/abc123',
          pathParameters: { groupId: 'abc123' },
          body: JSON.stringify({ threshold: 10 }),
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.lowStockTransition).toBe(true);
      expect(body.notification).toBeDefined();
      expect(body.notification.type).toBe('LOW_STOCK');
      expect(body.notification.groupId).toBe('abc123');
    });

    it('does not trigger notification when group was already low-stock', async () => {
      const alreadyLow = { ...existingGroup, threshold: 10, isLowStock: true };
      mockSend.mockResolvedValueOnce({ Item: alreadyLow }); // getGroup
      mockSend.mockResolvedValueOnce({ // UpdateCommand
        Attributes: { ...alreadyLow, threshold: 5, isLowStock: true, syncVersion: 2 },
      });

      const result = await handler(
        makeEvent({
          httpMethod: 'PUT',
          resource: '/inventory/groups/{groupId}',
          path: '/inventory/groups/abc123',
          pathParameters: { groupId: 'abc123' },
          body: JSON.stringify({ threshold: 5 }),
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.lowStockTransition).toBeUndefined();
    });

    it('returns 404 when group does not exist', async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined }); // getGroup

      const result = await handler(
        makeEvent({
          httpMethod: 'PUT',
          resource: '/inventory/groups/{groupId}',
          path: '/inventory/groups/nonexistent',
          pathParameters: { groupId: 'nonexistent' },
          body: JSON.stringify({ threshold: 2 }),
        }),
      );

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).error).toBe('NOT_FOUND');
    });

    it('returns 400 when threshold is negative', async () => {
      const result = await handler(
        makeEvent({
          httpMethod: 'PUT',
          resource: '/inventory/groups/{groupId}',
          path: '/inventory/groups/abc123',
          pathParameters: { groupId: 'abc123' },
          body: JSON.stringify({ threshold: -1 }),
        }),
      );

      expect(result.statusCode).toBe(400);
    });

    it('returns 400 when body is missing', async () => {
      const result = await handler(
        makeEvent({
          httpMethod: 'PUT',
          resource: '/inventory/groups/{groupId}',
          path: '/inventory/groups/abc123',
          pathParameters: { groupId: 'abc123' },
          body: null,
        }),
      );

      expect(result.statusCode).toBe(400);
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
      expect(body.resultType).toBe('items');
      expect(body.items).toHaveLength(2); // Milk and Cheese match 'da' in 'Dairy'
      expect(body.values).toContain('Dairy');
      expect(body.count).toBe(2);
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
      expect(body.resultType).toBe('items');
      expect(body.items).toHaveLength(2); // Milk and Cheese both have FarmFresh
      expect(body.values).toContain('FarmFresh');
      expect(body.count).toBe(2);
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
      expect(body.resultType).toBe('items');
      expect(body.items).toHaveLength(2); // Milk and Cheese both match 'super'
      expect(body.values).toContain('Supermarket');
      expect(body.count).toBe(2);
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
      expect(body.resultType).toBe('items');
      expect(body.items).toHaveLength(2);
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
      const items = [{ itemId: 'item-1', name: 'Milk', barcode: '123456', brand: 'FarmFresh' }];
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

    it('returns correct result format for category field (items)', async () => {
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
      expect(body).toHaveProperty('resultType', 'items');
      expect(body).toHaveProperty('items');
      expect(body).toHaveProperty('values');
      expect(body).toHaveProperty('count', 1);
    });

    it('returns correct result format for brand field (items)', async () => {
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
      expect(body).toHaveProperty('resultType', 'items');
      expect(body).toHaveProperty('items');
      expect(body).toHaveProperty('values');
      expect(body).toHaveProperty('count', 1);
    });

    it('returns correct result format for whereToBuy field (items)', async () => {
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
      expect(body).toHaveProperty('resultType', 'items');
      expect(body).toHaveProperty('items');
      expect(body).toHaveProperty('values');
      expect(body).toHaveProperty('count', 1);
    });

    it('returns correct result format for onlineStoreLink field (items)', async () => {
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
      expect(body).toHaveProperty('resultType', 'items');
      expect(body).toHaveProperty('items');
      expect(body).toHaveProperty('values');
      expect(body).toHaveProperty('count', 1);
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
      expect(body.items).toHaveLength(3);
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
      expect(body.items).toHaveLength(3);
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
      expect(body.items).toHaveLength(3);
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
      expect(body.resultType).toBe('items');
      expect(body.items).toEqual([]);
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
      expect(body.resultType).toBe('items');
      expect(body.items).toHaveLength(3); // all 3 items match
      expect(body.values).toEqual(['Dairy']); // distinct value still deduplicated
      expect(body.count).toBe(3);
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
      expect(body.resultType).toBe('items');
      expect(body.items).toHaveLength(3);
      expect(body.values).toEqual(['FarmFresh']);
      expect(body.count).toBe(3);
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
      expect(body.items).toHaveLength(2);
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
      expect(body.resultType).toBe('items');
      expect(body.items).toHaveLength(2); // only Milk and Yogurt have FarmFresh brand
      expect(body.values).toEqual(['FarmFresh']);
      expect(body.count).toBe(2);
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
      expect(body.resultType).toBe('items');
      expect(body.items).toHaveLength(1); // only Yogurt matches 'store'
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
      expect(body.resultType).toBe('items');
      expect(body.items).toHaveLength(1); // only Milk matches 'store'
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
      const items = [{ itemId: 'item-1', name: 'Milk', barcode: '1234567890' }];
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
        json: async () => (product ? { status: 1, product } : { status: 0, product: null }),
      });
    }

    it('strips locale prefix from categories_tags (en:dairy-products â†’ Dairy Products)', async () => {
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

    it('converts hyphenated slug to title case (plant-based-foods â†’ Plant Based Foods)', async () => {
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
