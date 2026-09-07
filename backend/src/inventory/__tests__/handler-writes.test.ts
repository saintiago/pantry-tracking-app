import type { APIGatewayProxyEvent } from 'aws-lambda';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { InventoryMemory } from './memory';

const memory = new InventoryMemory();
let handler: typeof import('../../handlers/inventory/inventory').handler;
let recipeHandler: typeof import('../../handlers/recipe/recipe').handler;
const event = (
  httpMethod: string,
  body?: unknown,
  itemId?: string,
  groupId?: string,
): APIGatewayProxyEvent =>
  ({
    httpMethod,
    body: body === undefined ? null : JSON.stringify(body),
    resource: groupId ? '/inventory/groups/{groupId}' : '/inventory',
    pathParameters: groupId ? { groupId } : itemId ? { itemId } : null,
    requestContext: { authorizer: { claims: { sub: 'u' } }, requestId: 'test' },
  }) as unknown as APIGatewayProxyEvent;
const input = {
  name: 'Rice',
  category: 'Food',
  unit: 'g',
  quantity: 500,
  expirationDate: '2030-01-01',
  locationId: 'pantry',
};

beforeAll(async () => {
  const originalSend = memory.client.send.bind(memory.client);
  const send = jest.fn(async (command: unknown) => {
    // Recipe persistence remains owned by its handler; inventory writes must be transactions.
    if (command instanceof PutCommand && command.input.Item?.entityType === 'Recipe') {
      memory.seed(command.input.Item);
      return {};
    }
    return originalSend(command as never);
  });
  jest
    .spyOn(DynamoDBDocumentClient, 'from')
    .mockReturnValue({ send } as unknown as DynamoDBDocumentClient);
  handler = (await import('../../handlers/inventory/inventory')).handler;
  recipeHandler = (await import('../../handlers/recipe/recipe')).handler;
});
beforeEach(() => memory.reset());
afterAll(() => jest.restoreAllMocks());

it('returns the persisted lot and group, then retains photo/shelf, category index and location edits', async () => {
  const created = await handler(
    event('POST', { ...input, pictureUrl: 'https://example.com/rice', locationDetails: 'Shelf 2' }),
  );
  expect(created.statusCode).toBe(201);
  const { item } = JSON.parse(created.body);
  expect(item).toMatchObject({
    location: 'pantry',
    quantity: 500,
    pictureUrl: 'https://example.com/rice',
  });
  expect(item.PK).toBeUndefined();
  const updated = await handler(
    event('PUT', { locationId: 'freezer', locationDetails: '', category: 'Grains' }, item.itemId),
  );
  expect(updated.statusCode).toBe(200);
  expect(JSON.parse(updated.body).item).toMatchObject({
    groupId: item.groupId,
    location: 'freezer',
    locationDetails: '',
    GSI1PK: 'USER#u#CAT#Grains',
    pictureUrl: item.pictureUrl,
  });
  expect(memory.get('u', `ITEM#${item.itemId}`)?.category).toBe('Grains');
});

it('preserves distinct purchases and exposes threshold conversions, clear and notification transitions', async () => {
  const first = JSON.parse((await handler(event('POST', input))).body).item;
  const second = JSON.parse((await handler(event('POST', input))).body).item;
  expect(first.itemId).not.toBe(second.itemId);
  expect(first.groupId).toBe(second.groupId);
  const threshold = await handler(
    event('PUT', { threshold: 1, thresholdUnit: 'kg' }, undefined, first.groupId),
  );
  expect(threshold.statusCode).toBe(200);
  expect(JSON.parse(threshold.body)).toMatchObject({
    group: { totalQuantity: 1000, thresholdUnit: 'kg', isLowStock: true },
    lowStockTransition: true,
  });
  const lowStock = await handler({ ...event('GET'), resource: '/inventory/low-stock' });
  expect(JSON.parse(lowStock.body).groups).toHaveLength(1);
  const cleared = await handler(event('PUT', { threshold: null }, undefined, first.groupId));
  expect(JSON.parse(cleared.body).group.threshold).toBeUndefined();
  expect(JSON.parse(cleared.body).group.isLowStock).toBe(false);
  await handler(event('DELETE', undefined, first.itemId));
  expect(memory.get('u', `GROUP#${first.groupId}`)?.totalQuantity).toBe(500);
});

it('reassigns between groups and removes the last unconfigured group on deletion', async () => {
  const item = JSON.parse((await handler(event('POST', input))).body).item;
  const moved = await handler(
    event('PUT', { name: 'Beans', unit: 'piece', reassignGroup: true }, item.itemId),
  );
  expect(moved.statusCode).toBe(200);
  expect(JSON.parse(moved.body).item.groupId).not.toBe(item.groupId);
  expect(memory.get('u', `GROUP#${item.groupId}`)).toBeUndefined();
  expect((await handler(event('DELETE', undefined, item.itemId))).statusCode).toBe(200);
  expect(memory.all('GROUP#')).toHaveLength(0);
});

it.each([
  undefined,
  null,
  [],
  5,
  'bad',
  {},
  { ...input, quantity: -1 },
  { ...input, quantity: '5' },
  { ...input, unit: 'bad' },
  { ...input, locationDetails: 5 },
  { ...input, expirationDate: 'bad' },
  { ...input, name: '' },
])('rejects invalid POST without writing: %j', async (body) => {
  expect((await handler(event('POST', body))).statusCode).toBe(400);
  expect(memory.transactions).toHaveLength(0);
});

it.each([
  undefined,
  null,
  [],
  {},
  { quantity: -1 },
  { quantity: '5' },
  { unit: 'bad' },
  { locationDetails: 5 },
  { reassignGroup: 'yes' },
])('rejects invalid PUT without writing: %j', async (body) => {
  expect((await handler(event('PUT', body, 'missing'))).statusCode).toBe(400);
  expect(memory.transactions).toHaveLength(0);
});

it.each([
  undefined,
  null,
  [],
  {},
  { threshold: -1 },
  { threshold: '1' },
  { threshold: 1, thresholdUnit: 'invalid' },
])('rejects invalid threshold requests: %j', async (body) => {
  expect((await handler(event('PUT', body, undefined, 'missing'))).statusCode).toBe(400);
  expect(memory.transactions).toHaveLength(0);
});

it('rejects malformed JSON, infinity and incompatible threshold units', async () => {
  expect((await handler({ ...event('POST'), body: 'not-json' })).statusCode).toBe(400);
  expect(
    (await handler({ ...event('PUT', {}, 'missing'), body: '{"quantity":1e999}' })).statusCode,
  ).toBe(400);
  const item = JSON.parse((await handler(event('POST', input))).body).item;
  expect(
    (
      await handler(
        event('PUT', { threshold: 1, thresholdUnit: 'bottle' }, undefined, item.groupId),
      )
    ).statusCode,
  ).toBe(400);
});

it('returns 404 for missing items/groups, and 500 on an unclassified failed transaction', async () => {
  expect((await handler(event('PUT', { quantity: 1 }, 'missing'))).statusCode).toBe(404);
  expect((await handler(event('DELETE', undefined, 'missing'))).statusCode).toBe(404);
  expect((await handler(event('PUT', { threshold: 1 }, undefined, 'missing'))).statusCode).toBe(
    404,
  );
  memory.failure = new Error('Unavailable');
  expect((await handler(event('POST', input))).statusCode).toBe(500);
  expect(memory.rows.size).toBe(0);
});

it('routes recipe placeholders through the atomic writer and suppresses repeated names', async () => {
  const recipe = {
    name: 'Soup',
    tags: ['dinner'],
    instructions: 'Mix.',
    portions: 1,
    ingredients: [
      { name: 'Milk', unit: 'Liter', quantity: 1 },
      { name: 'milk', unit: 'l', quantity: 1 },
      { name: 'Spice', unit: 'unknown', quantity: 1 },
    ],
  };
  const result = await recipeHandler({ ...event('POST', recipe), resource: '/recipes' });
  expect(result.statusCode).toBe(201);
  expect(memory.all('ITEM#')).toHaveLength(2);
  expect(
    memory
      .all('ITEM#')
      .map((i) => i.unit)
      .sort(),
  ).toEqual(['l', 'piece']);
  expect(memory.all('ITEM#').every((i) => i.groupId && i.isLowStock === undefined)).toBe(true);
  expect(memory.all('GROUP#').every((g) => g.threshold === 0 && g.isLowStock === true)).toBe(true);
  expect(memory.all('LOCATION#')).toHaveLength(1);
});
