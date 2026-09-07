import type { APIGatewayProxyEvent } from 'aws-lambda';
import { handler, docClient } from '../meal-plan';
import { PlannerMemory } from './memory';
let db: PlannerMemory;
const body = {
  date: '2026-09-07',
  mealType: 'dinner',
  recipeId: 'r1',
  recipeName: 'Pasta',
  servings: 2,
};
const event = (method: string, data?: unknown, planId?: string) =>
  ({
    httpMethod: method,
    body: data === undefined ? null : JSON.stringify(data),
    pathParameters: planId ? { planId } : null,
    queryStringParameters: { startDate: '2026-09-01', endDate: '2026-09-30' },
    requestContext: { authorizer: { claims: { sub: 'owner' } }, requestId: 'test' },
  }) as unknown as APIGatewayProxyEvent;
beforeEach(() => {
  db = new PlannerMemory();
  jest
    .spyOn(docClient, 'send')
    .mockImplementation(async (command) =>
      db.send(command as unknown as Parameters<PlannerMemory['send']>[0]),
    );
});
afterEach(() => jest.restoreAllMocks());
test('legacy CRUD keeps public response shapes and stable IDs through date/meal moves', async () => {
  const created = await handler(event('POST', body));
  expect(created.statusCode).toBe(201);
  const plan = JSON.parse(created.body).mealPlan;
  expect(plan.PK).toBeUndefined();
  expect(plan.SK).toBeUndefined();
  const updated = await handler(
    event('PUT', { date: '2026-09-08', mealType: 'lunch', servings: 4 }, plan.planId),
  );
  expect(updated.statusCode).toBe(200);
  expect(JSON.parse(updated.body).mealPlan).toMatchObject({
    planId: plan.planId,
    servings: 4,
    createdAt: plan.createdAt,
  });
  const listed = await handler(event('GET'));
  expect(JSON.parse(listed.body).mealPlans).toHaveLength(1);
  expect((await handler(event('DELETE', undefined, plan.planId))).statusCode).toBe(200);
  expect(JSON.parse((await handler(event('GET'))).body).mealPlans).toEqual([]);
});
test('bulk servings update future ordinary meals across pages and leave the past alone', async () => {
  for (const date of ['2026-09-01', '2026-09-07', '2026-09-08', '2026-09-09'])
    await handler(event('POST', { ...body, date }));
  const result = await handler(event('PUT', { startDate: '2026-09-07', servings: 5 }));
  expect(JSON.parse(result.body)).toEqual({ updatedCount: 3 });
  const meals = JSON.parse((await handler(event('GET'))).body).mealPlans;
  expect(meals.map((meal: { servings: number }) => meal.servings)).toEqual([2, 5, 5, 5]);
});
test.each([0, -1, 1.5, null, '2'])(
  'legacy bulk servings rejects %p before persistence',
  async (servings) => {
    expect((await handler(event('PUT', { startDate: '2026-09-07', servings }))).statusCode).toBe(
      400,
    );
    expect(db.rows.size).toBe(0);
  },
);
test.each([
  {},
  { ...body, mealType: 'snack' },
  { ...body, date: '2026-02-30' },
  { ...body, recipeId: '' },
])('invalid legacy creation is rejected: %p', async (data) => {
  expect((await handler(event('POST', data))).statusCode).toBe(400);
  expect(db.rows.size).toBe(0);
});
test('missing/foreign assignment and unauthenticated access remain inaccessible', async () => {
  expect((await handler(event('PUT', { servings: 2 }, 'foreign'))).statusCode).toBe(404);
  const request = event('GET');
  request.requestContext.authorizer = null;
  expect((await handler(request)).statusCode).toBe(401);
});
test('invalid range and unsupported routes return explicit errors', async () => {
  const request = event('GET');
  request.queryStringParameters = null;
  expect((await handler(request)).statusCode).toBe(400);
  expect((await handler(event('PATCH'))).statusCode).toBe(405);
  expect((await handler(event('GET', undefined, 'id'))).statusCode).toBe(405);
});
test('database failure does not claim success', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(docClient, 'send').mockImplementationOnce(async () => {
    throw new Error('Unavailable');
  });
  expect((await handler(event('GET'))).statusCode).toBe(500);
});
