import { apiRequest } from '../client';
import { getCurrentSession } from '../../auth/cognitoClient/cognitoClient';

jest.mock('../../config', () => ({ API_URL: 'https://api.test' }));
jest.mock('../../auth/cognitoClient/cognitoClient', () => ({ getCurrentSession: jest.fn() }));

beforeEach(() => {
  jest.resetAllMocks();
  (getCurrentSession as jest.Mock).mockResolvedValue({ tokens: { idToken: 'current-token' } });
  global.fetch = jest.fn();
});

afterEach(() => jest.useRealTimers());

test('obtains current credentials for every request and refuses unauthenticated calls', async () => {
  (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
  await apiRequest('/inventory', 'Unavailable');
  expect(global.fetch).toHaveBeenCalledWith('https://api.test/inventory', {
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer current-token' },
  });
  (getCurrentSession as jest.Mock).mockResolvedValue(null);
  await expect(apiRequest('/inventory', 'Unavailable')).rejects.toThrow('Not authenticated');
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test.each([null, {}, { message: 123 }, { message: '' }, ['unavailable']])(
  'falls back safely for an unexpected API error body: %p',
  async (body) => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, json: async () => body });
    await expect(apiRequest('/inventory', 'Unavailable')).rejects.toThrow('Unavailable');
  },
);

test('uses canonical server messages and falls back for non-JSON gateway errors', async () => {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: false,
    json: async () => ({ message: 'Invalid quantity' }),
  });
  await expect(apiRequest('/inventory', 'Unavailable')).rejects.toThrow('Invalid quantity');
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: false,
    json: async () => {
      throw new SyntaxError('HTML response');
    },
  });
  await expect(apiRequest('/inventory', 'Unavailable')).rejects.toThrow('Unavailable');
});

test('accepts empty deletes and 204 responses without parsing JSON', async () => {
  const json = jest.fn();
  (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json });
  await expect(
    apiRequest('/inventory/item', 'Unavailable', { method: 'DELETE', responseType: 'empty' }),
  ).resolves.toBeUndefined();
  (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 204, json });
  await expect(apiRequest('/inventory/item', 'Unavailable')).resolves.toBeUndefined();
  expect(json).not.toHaveBeenCalled();
});

test('keeps the timeout active while reading a stalled response body', async () => {
  jest.useFakeTimers();
  (global.fetch as jest.Mock).mockImplementation(async (_url, init: RequestInit) => ({
    ok: true,
    json: () =>
      new Promise((_resolve, reject) => {
        init.signal!.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        );
      }),
  }));
  const request = apiRequest('/meal-plans', 'Unavailable', { timeoutMs: 100 });
  const result = expect(request).rejects.toMatchObject({ name: 'AbortError' });
  await jest.advanceTimersByTimeAsync(100);
  await result;
  expect(jest.getTimerCount()).toBe(0);
});

test('propagates caller cancellation and releases listeners after failure without retrying writes', async () => {
  const controller = new AbortController();
  const remove = jest.spyOn(controller.signal, 'removeEventListener');
  (global.fetch as jest.Mock).mockImplementation(async (_url, init: RequestInit) => {
    controller.abort();
    expect(init.signal!.aborted).toBe(true);
    throw new DOMException('Aborted', 'AbortError');
  });
  await expect(
    apiRequest('/inventory', 'Unavailable', {
      method: 'POST',
      signal: controller.signal,
      timeoutMs: 1000,
    }),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
});
