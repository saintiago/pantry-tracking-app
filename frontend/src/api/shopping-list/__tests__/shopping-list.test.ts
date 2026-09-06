import { fetchShoppingData } from '../shopping-list';
import { getCurrentSession } from '../../../auth/cognitoClient/cognitoClient';
jest.mock('../../../config', () => ({ API_URL: 'https://api.test' }));
jest.mock('../../../auth/cognitoClient/cognitoClient', () => ({ getCurrentSession: jest.fn() }));
beforeEach(() => {
  jest.resetAllMocks();
  (getCurrentSession as jest.Mock).mockResolvedValue({ tokens: { idToken: 'test-token' } });
});
test('follows encoded inventory cursors and retains groups from every page', async () => {
  const paths: string[] = [];
  global.fetch = jest.fn(async (url: string) => {
    paths.push(url);
    const body = url.endsWith('/recipes')
      ? { recipes: [] }
      : url.includes('/meal-plans')
        ? { mealPlans: [] }
        : url.includes('lastEvaluatedKey')
          ? { items: [{ itemId: 'second' }], groups: [{ groupId: 'b' }] }
          : {
              items: [{ itemId: 'first' }],
              groups: [{ groupId: 'a' }],
              lastEvaluatedKey: '%7Bcursor%7D',
            };
    return { ok: true, json: async () => body } as Response;
  }) as jest.Mock;
  const result = await fetchShoppingData('2026-09-07', '2026-09-13', new AbortController().signal);
  expect(result.items).toHaveLength(2);
  expect(result.groups).toHaveLength(2);
  expect(paths).toContain('https://api.test/inventory?lastEvaluatedKey=%257Bcursor%257D');
});
test('rejects incomplete snapshots and requests without authentication', async () => {
  global.fetch = jest
    .fn()
    .mockResolvedValue({ ok: false, json: async () => ({ message: 'Unavailable' }) });
  await expect(fetchShoppingData('a', 'b', new AbortController().signal)).rejects.toThrow(
    'Unavailable',
  );
  (getCurrentSession as jest.Mock).mockResolvedValue(null);
  await expect(fetchShoppingData('a', 'b', new AbortController().signal)).rejects.toThrow(
    'Not authenticated',
  );
});
test('rejects a repeated cursor rather than returning partial data or looping', async () => {
  global.fetch = jest.fn(async (url: string) => ({
    ok: true,
    json: async () =>
      url.includes('/inventory')
        ? { items: [], lastEvaluatedKey: 'same' }
        : url.includes('/recipes')
          ? { recipes: [] }
          : { mealPlans: [] },
  })) as jest.Mock;
  await expect(fetchShoppingData('a', 'b', new AbortController().signal)).rejects.toThrow(
    'pagination did not advance',
  );
});
