import type { APIGatewayProxyEvent } from 'aws-lambda';

const mockSend = jest.fn();
jest.mock('@aws-sdk/client-dynamodb', () => ({ DynamoDBClient: jest.fn() }));
jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: () => ({ send: mockSend }) },
  QueryCommand: jest.fn((input) => ({ ...input, kind: 'query' })),
  GetCommand: jest.fn((input) => ({ ...input, kind: 'get' })),
  PutCommand: jest.fn((input) => ({ ...input, kind: 'put' })),
  UpdateCommand: jest.fn((input) => ({ ...input, kind: 'update' })),
  DeleteCommand: jest.fn((input) => ({ ...input, kind: 'delete' })),
}));
import { handler } from '../inventory';

function event(overrides: Partial<APIGatewayProxyEvent>): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: '/inventory/search',
    resource: '/inventory/search',
    pathParameters: null,
    queryStringParameters: null,
    body: null,
    requestContext: { authorizer: { claims: { sub: 'test-user' } }, requestId: 'test' },
    ...overrides,
  } as APIGatewayProxyEvent;
}

beforeEach(() => mockSend.mockReset());

it.each(['barcode', 'name'])(
  'finds the latest matching lot across all pages for %s',
  async (field) => {
    const old = {
      itemId: 'old',
      name: 'Rice',
      barcode: '5901234123457',
      category: 'Grains',
      unit: 'g',
      createdAt: '2026-01-01',
      updatedAt: '2026-09-04',
    };
    const latest = {
      ...old,
      itemId: 'latest',
      createdAt: '2026-09-01',
      updatedAt: '2026-09-01',
      expirationDate: '2028-01-01',
      pictureUrl: 'https://example.com/rice.jpg',
      locationDetails: 'Shelf 2A',
    };
    const cursor = { PK: 'USER#test-user', SK: 'ITEM#old' };
    mockSend
      .mockResolvedValueOnce({ Items: [old], LastEvaluatedKey: cursor })
      .mockResolvedValueOnce({ Items: [latest] });
    const result = await handler(
      event({ queryStringParameters: { field, query: field === 'name' ? 'ric' : '590' } }),
    );
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).items).toEqual([latest]);
    expect(mockSend.mock.calls[1][0].ExclusiveStartKey).toEqual(cursor);
  },
);

it.each(['POST', 'PUT'])('rejects non-text Location Details on %s', async (httpMethod) => {
  const result = await handler(
    event({
      httpMethod,
      resource: httpMethod === 'POST' ? '/inventory' : '/inventory/{itemId}',
      pathParameters: httpMethod === 'PUT' ? { itemId: 'rice' } : null,
      body: JSON.stringify({ locationDetails: 123 }),
    }),
  );
  expect(result.statusCode).toBe(400);
  expect(mockSend).not.toHaveBeenCalled();
});

it('returns all inventory groups including low-stock groups beyond the first database page', async () => {
  const cursor = { PK: 'USER#test-user', SK: 'GROUP#first' };
  mockSend
    .mockResolvedValueOnce({ Items: [] })
    .mockResolvedValueOnce({ Items: [{ groupId: 'first' }], LastEvaluatedKey: cursor })
    .mockResolvedValueOnce({
      Items: [{ groupId: 'empty-low', isLowStock: true, totalQuantity: 0 }],
    });
  const result = await handler(event({ path: '/inventory', resource: '/inventory' }));
  expect(JSON.parse(result.body).groups).toEqual([
    { groupId: 'first' },
    { groupId: 'empty-low', isLowStock: true, totalQuantity: 0 },
  ]);
  expect(mockSend.mock.calls[2][0].ExclusiveStartKey).toEqual(cursor);
});
