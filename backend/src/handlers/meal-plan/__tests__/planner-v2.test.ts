import type { APIGatewayProxyEvent } from 'aws-lambda';
import { docClient, handler } from '../meal-plan';
import { PlannerMemory } from './memory';
import type { PlannerSnapshot, PlannerEntry, PlannerChange, CookingBatch } from '@pantry/domain';
const entry = (planId = 'source', date = '2026-09-07'): PlannerEntry => ({
  planId,
  date,
  mealType: 'dinner',
  recipeId: 'r1',
  recipeName: 'Rice',
  servings: 2,
  createdAt: '',
  updatedAt: '',
});
const batch: CookingBatch = {
  batchId: 'b1',
  sourcePlanId: 'source',
  recipeId: 'r1',
  recipeName: 'Rice',
  cookingDate: '2026-09-07',
  plannedYield: 6,
  status: 'planned',
  consumed: 0,
  discarded: 0,
};
const event = (body?: unknown, user = 'owner', method = 'POST', query?: Record<string, string>) =>
  ({
    httpMethod: method,
    body: body === undefined ? null : JSON.stringify(body),
    pathParameters: null,
    queryStringParameters: query ?? null,
    requestContext: { authorizer: user ? { claims: { sub: user } } : null, requestId: 'test' },
  }) as unknown as APIGatewayProxyEvent;
let db: PlannerMemory;
let sequence = 0;
beforeEach(() => {
  db = new PlannerMemory();
  db.seed({ PK: 'USER#owner', SK: 'RECIPE#r1', portions: 4 });
  sequence = 0;
  jest
    .spyOn(docClient, 'send')
    .mockImplementation(async (command) =>
      db.send(command as unknown as Parameters<PlannerMemory['send']>[0]),
    );
});
afterEach(() => jest.restoreAllMocks());
async function read(user = 'owner'): Promise<PlannerSnapshot> {
  const result = await handler(event(undefined, user, 'GET', { view: 'workspace' }));
  expect(result.statusCode).toBe(200);
  return JSON.parse(result.body);
}
async function change(fields: Partial<PlannerChange>, status = 200) {
  const revision = (await read()).revision;
  const change = { revision, operationId: `op-${++sequence}`, ...fields };
  const result = await handler(event({ action: 'change', change }));
  expect(result.statusCode).toBe(status);
  return { change, body: JSON.parse(result.body) as PlannerSnapshot };
}
test('legacy creation, paginated reads, moving with stable identity, and ownership', async () => {
  for (let index = 0; index < 5; index++) await change({ entries: [entry(`meal-${index}`)] });
  expect((await read()).mealPlans).toHaveLength(5);
  expect((await read('other')).mealPlans).toEqual([]);
  const before = (await read()).mealPlans[0];
  await change({ entries: [{ ...before, date: '2026-09-09', mealType: 'lunch' }] });
  const after = (await read()).mealPlans.find((e) => e.planId === before.planId)!;
  expect(after.date).toBe('2026-09-09');
  expect(after.createdAt).toBe(before.createdAt);
  expect((await read()).mealPlans).toHaveLength(5);
  const unauthorized = await handler(event({ action: 'change', change: {} }, ''));
  expect(unauthorized.statusCode).toBe(401);
});
test('six portions split across three meals; over-allocation, invalid dates and source deletion rejected atomically', async () => {
  await change({
    entries: [
      { ...entry(), batchId: 'b1' },
      { ...entry('tuesday', '2026-09-08'), entryType: 'leftovers', batchId: 'b1' },
      { ...entry('wednesday', '2026-09-09'), entryType: 'leftovers', batchId: 'b1' },
    ],
    batches: [batch],
  });
  const before = await read();
  await change(
    { entries: [{ ...entry('extra', '2026-09-10'), entryType: 'leftovers', batchId: 'b1' }] },
    400,
  );
  await change({ entries: [{ ...before.mealPlans[1], date: '2026-09-01' }] }, 400);
  await change({ removeIds: ['source'] }, 400);
  expect(await read()).toEqual(before);
});
test('a prepared batch freezes server recipe nutrition and survives removal; eating and undo never double-decrement', async () => {
  db.seed({ PK: 'USER#owner', SK: 'RECIPE#r1', totalKcal: 1600, portions: 4 });
  await change({ entries: [{ ...entry(), batchId: 'b1' }], batches: [batch] });
  await change({
    batches: [
      {
        ...batch,
        status: 'prepared',
        actualYield: 6,
        preparedDate: '2026-09-07',
        storage: 'Freezer',
        kcalPerPortion: 999,
      },
    ],
  });
  expect((await read()).batches[0].kcalPerPortion).toBe(400);
  const meal = (await read()).mealPlans[0];
  await change({ entries: [{ ...meal, consumed: true }] });
  expect((await read()).batches[0].consumed).toBe(2);
  await change({ removeIds: ['source'] });
  expect((await read()).batches).toHaveLength(1);
  await change({ entries: [{ ...meal, consumed: true }] });
  expect((await read()).batches[0].consumed).toBe(2);
  await change({ entries: [{ ...meal, consumed: false }] }, 400);
  await change({ removeBatchIds: ['b1'] }, 400);
});
test('actual yield shortages require resolution; consumption and discard cannot reserve food twice', async () => {
  db.seed({ PK: 'USER#owner', SK: 'RECIPE#r1', portions: 4 });
  await change({
    entries: [
      { ...entry(), batchId: 'b1' },
      { ...entry('other', '2026-09-08'), batchId: 'b1', entryType: 'leftovers' },
    ],
    batches: [batch],
  });
  await change(
    {
      batches: [
        {
          ...batch,
          status: 'prepared',
          actualYield: 3,
          preparedDate: '2026-09-07',
          storage: 'Fridge',
        },
      ],
    },
    400,
  );
  await change({
    removeIds: ['other'],
    batches: [
      {
        ...batch,
        status: 'prepared',
        actualYield: 3,
        preparedDate: '2026-09-07',
        storage: 'Fridge',
      },
    ],
  });
  await change({ batches: [{ ...(await read()).batches[0], discarded: 2 }] }, 400);
});
test('durable idempotency reconciles an uncertain commit and rejects changed payloads or stale revisions', async () => {
  db.failAfterCommit = true;
  const saved = await change({ entries: [entry()] });
  const replay = await handler(event({ action: 'change', change: saved.change }));
  expect(replay.statusCode).toBe(200);
  expect((await read()).mealPlans).toHaveLength(1);
  await change({ entries: [entry('another')], revision: 0 }, 409);
  const conflict = await handler(
    event({ action: 'change', change: { ...saved.change, removeIds: ['source'] } }),
  );
  expect(conflict.statusCode).toBe(409);
});
test('reconciliation fences a delayed request and concurrent operations cannot over-allocate', async () => {
  const pending: PlannerChange = { revision: 0, operationId: 'late', entries: [entry()] };
  expect((await handler(event({ action: 'reconcile', change: pending }))).statusCode).toBe(200);
  expect((await handler(event({ action: 'change', change: pending }))).statusCode).toBe(409);
  expect((await read()).mealPlans).toHaveLength(0);
  await change({
    entries: [{ ...entry(), batchId: 'b1' }],
    batches: [{ ...batch, plannedYield: 3 }],
  });
  const revision = (await read()).revision;
  const attempts = ['a', 'b'].map((id) =>
    handler(
      event({
        action: 'change',
        change: {
          revision,
          operationId: id,
          entries: [
            { ...entry(id, '2026-09-08'), batchId: 'b1', entryType: 'leftovers', servings: 1 },
          ],
        },
      }),
    ),
  );
  const results = await Promise.all(attempts);
  expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
});
test.each([null, [], { entries: [null] }, { entries: 'bad' }])(
  'malformed changes fail safely: %p',
  async (body) => {
    const result = await handler(event({ action: 'change', change: body }));
    expect(result.statusCode).toBe(400);
  },
);
