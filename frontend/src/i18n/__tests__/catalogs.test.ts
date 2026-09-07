import type { Catalog } from '../catalogs';

const spanish: Catalog = { messages: { Inventory: 'Inventario' }, singular: {} };
let fetchCatalog: jest.Mock;
beforeEach(() => {
  jest.resetModules();
  fetchCatalog = jest.fn();
  global.fetch = fetchCatalog;
});
afterEach(() => jest.useRealTimers());

test('English makes no request; selected catalogs download once and share in-flight work', async () => {
  const { loadCatalog } = await import('../catalogs');
  await loadCatalog('en');
  expect(fetchCatalog).not.toHaveBeenCalled();
  let resolve!: (value: unknown) => void;
  fetchCatalog.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const first = loadCatalog('es');
  const second = loadCatalog('es');
  expect(second).toBe(first);
  await Promise.resolve();
  expect(fetchCatalog).toHaveBeenCalledTimes(1);
  expect(fetchCatalog.mock.calls[0][0]).toBe('/catalogs/es.json');
  resolve({ ok: true, json: async () => spanish });
  expect(await first).toEqual(spanish);
  expect(await loadCatalog('es')).toEqual(spanish);
  expect(fetchCatalog).toHaveBeenCalledTimes(1);
});

test.each(['network', 'http', 'invalid'])(
  'a %s failure can be retried without caching the failure',
  async (failure) => {
    const { loadCatalog } = await import('../catalogs');
    if (failure === 'network') fetchCatalog.mockRejectedValueOnce(new Error('offline'));
    else
      fetchCatalog.mockResolvedValueOnce({
        ok: failure !== 'http',
        json: async () => ({ messages: { Inventory: 42 } }),
      });
    await expect(loadCatalog('es')).rejects.toThrow();
    fetchCatalog.mockResolvedValueOnce({ ok: true, json: async () => spanish });
    expect(await loadCatalog('es')).toEqual(spanish);
    expect(fetchCatalog).toHaveBeenCalledTimes(2);
  },
);

test('a stalled download is aborted after the deadline and can be retried', async () => {
  jest.useFakeTimers();
  const { loadCatalog } = await import('../catalogs');
  fetchCatalog.mockImplementation(
    (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')));
      }),
  );
  const failed = expect(loadCatalog('it')).rejects.toThrow('aborted');
  await jest.advanceTimersByTimeAsync(10000);
  await failed;
  fetchCatalog.mockResolvedValueOnce({ ok: true, json: async () => spanish });
  await expect(loadCatalog('it')).resolves.toEqual(spanish);
});
