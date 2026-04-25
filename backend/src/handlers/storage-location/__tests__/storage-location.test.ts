import { APIGatewayProxyEvent } from 'aws-lambda';

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

jest.mock('crypto', () => ({
  randomUUID: jest.fn(() => 'test-uuid-1234'),
}));

import { handler } from '../storage-location';

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
      authorizer: { claims: { sub: 'user-123' } },
      requestId: 'req-1',
    } as any,
    resource: '',
    ...overrides,
  };
}

describe('Storage Location Lambda handler', () => {
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

  describe('GET /locations', () => {
    it('returns existing locations sorted by createdAt', async () => {
      const locations = [
        { locationId: 'loc-2', name: 'Fridge', createdAt: '2024-01-02T00:00:00Z' },
        { locationId: 'loc-1', name: 'Pantry', createdAt: '2024-01-01T00:00:00Z' },
      ];
      mockSend.mockResolvedValueOnce({ Items: locations });

      const result = await handler(makeEvent());
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.locations).toHaveLength(2);
      expect(body.locations[0].name).toBe('Pantry');
      expect(body.locations[1].name).toBe('Fridge');
    });

    it('auto-creates default Pantry location when none exist', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] }); // query returns empty
      mockSend.mockResolvedValueOnce({}); // put succeeds

      const result = await handler(makeEvent());
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.locations).toHaveLength(1);
      expect(body.locations[0].name).toBe('Pantry');
      expect(body.locations[0].locationId).toBe('test-uuid-1234');
      expect(mockSend).toHaveBeenCalledTimes(2);
    });
  });

  describe('POST /locations', () => {
    it('creates a new location with a unique name', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] }); // no duplicates
      mockSend.mockResolvedValueOnce({}); // put succeeds

      const result = await handler(
        makeEvent({
          httpMethod: 'POST',
          body: JSON.stringify({ name: 'Freezer' }),
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(201);
      expect(body.location.name).toBe('Freezer');
      expect(body.location.locationId).toBe('test-uuid-1234');
    });

    it('rejects duplicate name (case-insensitive)', async () => {
      mockSend.mockResolvedValueOnce({
        Items: [{ locationId: 'loc-1', name: 'Pantry' }],
      });

      const result = await handler(
        makeEvent({
          httpMethod: 'POST',
          body: JSON.stringify({ name: 'pantry' }),
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.message).toContain('already exists');
    });

    it('returns 400 when name is missing', async () => {
      const result = await handler(
        makeEvent({ httpMethod: 'POST', body: JSON.stringify({}) }),
      );
      expect(result.statusCode).toBe(400);
    });

    it('returns 400 when body is missing', async () => {
      const result = await handler(makeEvent({ httpMethod: 'POST', body: null }));
      expect(result.statusCode).toBe(400);
    });

    it('returns 400 when body is invalid JSON', async () => {
      const result = await handler(makeEvent({ httpMethod: 'POST', body: 'not-json' }));
      expect(result.statusCode).toBe(400);
    });
  });

  describe('PUT /locations/{locationId}', () => {
    it('renames a location successfully', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] }); // no duplicates
      mockSend.mockResolvedValueOnce({
        Attributes: {
          locationId: 'loc-1',
          name: 'New Name',
          updatedAt: '2024-01-02T00:00:00Z',
        },
      });

      const result = await handler(
        makeEvent({
          httpMethod: 'PUT',
          pathParameters: { locationId: 'loc-1' },
          body: JSON.stringify({ name: 'New Name' }),
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.location.name).toBe('New Name');
    });

    it('rejects rename to duplicate name', async () => {
      mockSend.mockResolvedValueOnce({
        Items: [{ locationId: 'loc-2', name: 'Fridge' }],
      });

      const result = await handler(
        makeEvent({
          httpMethod: 'PUT',
          pathParameters: { locationId: 'loc-1' },
          body: JSON.stringify({ name: 'fridge' }),
        }),
      );

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('already exists');
    });

    it('returns 404 when location does not exist', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] }); // no duplicates
      const condErr = new Error('Condition not met');
      (condErr as any).name = 'ConditionalCheckFailedException';
      mockSend.mockRejectedValueOnce(condErr);

      const result = await handler(
        makeEvent({
          httpMethod: 'PUT',
          pathParameters: { locationId: 'nonexistent' },
          body: JSON.stringify({ name: 'Whatever' }),
        }),
      );

      expect(result.statusCode).toBe(404);
    });

    it('returns 400 when name is missing', async () => {
      const result = await handler(
        makeEvent({
          httpMethod: 'PUT',
          pathParameters: { locationId: 'loc-1' },
          body: JSON.stringify({}),
        }),
      );
      expect(result.statusCode).toBe(400);
    });
  });

  describe('DELETE /locations/{locationId}', () => {
    it('deletes a location with no inventory items', async () => {
      mockSend.mockResolvedValueOnce({
        Items: [
          { locationId: 'loc-1', name: 'Pantry' },
          { locationId: 'loc-2', name: 'Fridge' },
        ],
      }); // locations query
      mockSend.mockResolvedValueOnce({ Items: [] }); // inventory check - empty
      mockSend.mockResolvedValueOnce({}); // delete succeeds

      const result = await handler(
        makeEvent({
          httpMethod: 'DELETE',
          pathParameters: { locationId: 'loc-1' },
        }),
      );

      expect(result.statusCode).toBe(200);
    });

    it('rejects deletion of last remaining location', async () => {
      mockSend.mockResolvedValueOnce({
        Items: [{ locationId: 'loc-1', name: 'Pantry' }],
      });

      const result = await handler(
        makeEvent({
          httpMethod: 'DELETE',
          pathParameters: { locationId: 'loc-1' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.message).toContain('last remaining');
    });

    it('rejects deletion when location contains inventory items', async () => {
      mockSend.mockResolvedValueOnce({
        Items: [
          { locationId: 'loc-1', name: 'Pantry' },
          { locationId: 'loc-2', name: 'Fridge' },
        ],
      });
      mockSend.mockResolvedValueOnce({
        Items: [{ itemId: 'item-1' }],
      }); // inventory check - has items

      const result = await handler(
        makeEvent({
          httpMethod: 'DELETE',
          pathParameters: { locationId: 'loc-1' },
        }),
      );
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.message).toContain('contains inventory items');
    });

    it('returns 404 when location does not exist', async () => {
      mockSend.mockResolvedValueOnce({
        Items: [{ locationId: 'loc-1', name: 'Pantry' }],
      });

      const result = await handler(
        makeEvent({
          httpMethod: 'DELETE',
          pathParameters: { locationId: 'nonexistent' },
        }),
      );

      expect(result.statusCode).toBe(404);
    });
  });
});
