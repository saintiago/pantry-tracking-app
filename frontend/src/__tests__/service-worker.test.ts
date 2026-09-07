/** @jest-environment node */
import { readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';

const source = readFileSync(path.resolve(__dirname, '../../public/sw.js'), 'utf8');

function worker() {
  const listeners: Record<string, (event: unknown) => void> = {};
  const cache = { put: jest.fn().mockResolvedValue(undefined), addAll: jest.fn() };
  const caches = {
    keys: jest.fn().mockResolvedValue(['other-app', 'pantry-app-old', 'pantry-app-__VERSION__']),
    delete: jest.fn().mockResolvedValue(true),
    open: jest.fn().mockResolvedValue(cache),
    match: jest.fn(),
  };
  const fetch = jest.fn().mockResolvedValue({ ok: true, type: 'basic', clone: () => ({}) });
  vm.runInNewContext(source, {
    self: {
      addEventListener: (name: string, callback: (event: unknown) => void) => {
        listeners[name] = callback;
      },
      location: { origin: 'https://pantry.test' },
      skipWaiting: jest.fn(),
      clients: { claim: jest.fn() },
    },
    caches,
    fetch,
    URL,
  });
  return { listeners, caches, fetch };
}

test('activation removes only obsolete pantry caches', async () => {
  const { listeners, caches } = worker();
  let completion: Promise<unknown> = Promise.resolve();
  listeners.activate({
    waitUntil: (promise: Promise<unknown>) => {
      completion = promise;
    },
  });
  await completion;
  expect(caches.delete.mock.calls).toEqual([['pantry-app-old']]);
});

test.each(['index-Bx9_k-Q2.js', 'styles-XaBC12_3.css'])(
  'serves Vite asset %s from cache',
  async (asset) => {
    const { listeners, caches, fetch } = worker();
    const cached = { cached: true };
    caches.match.mockResolvedValue(cached);
    let result: Promise<unknown> = Promise.resolve();
    listeners.fetch({
      request: { method: 'GET', mode: 'cors', url: `https://pantry.test/assets/${asset}` },
      respondWith: (promise: Promise<unknown>) => {
        result = promise;
      },
    });
    expect(await result).toBe(cached);
    expect(fetch).not.toHaveBeenCalled();
  },
);

test('never intercepts remote API requests', () => {
  const { listeners } = worker();
  const respondWith = jest.fn();
  listeners.fetch({ request: { method: 'GET', url: 'https://api.test/inventory' }, respondWith });
  expect(respondWith).not.toHaveBeenCalled();
});
