import { EventEmitter } from 'node:events';
import { lookup } from 'node:dns/promises';
import https from 'node:https';
import { fetchImport, importUrl, isPublicAddress } from '../import-fetch';
jest.mock('node:dns/promises', () => ({ lookup: jest.fn() }));
jest.mock('node:https', () => ({ __esModule: true, default: { get: jest.fn() } }));
beforeEach(() => jest.clearAllMocks());
test.each([
  '127.0.0.1',
  '10.0.0.1',
  '169.254.169.254',
  '192.168.1.1',
  '::1',
  '::ffff:127.0.0.1',
  'fc00::1',
  'fe80::1',
  '0.0.0.0',
  '224.0.0.1',
])('blocks non-public address %s', (value) => expect(isPublicAddress(value)).toBe(false));
test.each([
  'http://example.org',
  'https://user:pass@example.org',
  'https://example.org:8443',
  'https://127.1',
  'https://[::1]',
])('rejects unsafe URL %s', (value) => expect(() => importUrl(value)).toThrow());
test('rejects hostname resolving to any internal address before connecting', async () => {
  jest.mocked(lookup).mockResolvedValue([
    { address: '8.8.8.8', family: 4 },
    { address: '127.0.0.1', family: 4 },
  ] as never);
  await expect(fetchImport('https://example.org')).rejects.toThrow('not publicly accessible');
  expect(https.get).not.toHaveBeenCalled();
});
test('redirect target is revalidated, and the initial connection pins the validated address', async () => {
  jest.mocked(lookup).mockResolvedValue([{ address: '8.8.8.8', family: 4 }] as never);
  jest.mocked(https.get).mockImplementation(((
    _url: unknown,
    options: {
      lookup: (
        host: string,
        options: object,
        callback: (error: unknown, address: string) => void,
      ) => void;
    },
    callback: (response: {
      statusCode: number;
      headers: { location: string };
      resume: () => void;
    }) => void,
  ) => {
    options.lookup('example.org', {}, (error: unknown, address: string) => {
      expect(error).toBeNull();
      expect(address).toBe('8.8.8.8');
    });
    const request = new EventEmitter();
    Object.assign(request, { destroy: jest.fn() });
    queueMicrotask(() =>
      callback({
        statusCode: 302,
        headers: { location: 'https://169.254.169.254/latest' },
        resume: jest.fn(),
      }),
    );
    return request;
  }) as never);
  await expect(fetchImport('https://example.org')).rejects.toThrow('not publicly accessible');
  expect(https.get).toHaveBeenCalledTimes(1);
});
