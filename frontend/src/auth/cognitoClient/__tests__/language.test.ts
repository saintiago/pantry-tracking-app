import { CognitoUserAttribute } from 'amazon-cognito-identity-js';
import { getAccountLanguage, saveAccountLanguage } from '../cognitoClient';

const mockAttributes = jest.fn();
const mockUpdate = jest.fn();
const mockSession = jest.fn();
let mockUsername = 'alice';
let mockCurrent: {
  getUsername: () => string;
  getSession: typeof mockSession;
  getUserAttributes: typeof mockAttributes;
  updateAttributes: typeof mockUpdate;
} | null;
jest.mock('../../../config', () => ({
  USER_POOL_ID: 'eu-north-1_test',
  USER_POOL_CLIENT_ID: 'test',
}));
jest.mock('amazon-cognito-identity-js', () => ({
  CognitoUserPool: jest.fn(() => ({ getCurrentUser: () => mockCurrent })),
  CognitoUserAttribute: jest.fn(({ Name, Value }) => ({
    getName: () => Name,
    getValue: () => Value,
  })),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockUsername = 'alice';
  mockCurrent = {
    getUsername: () => mockUsername,
    getSession: mockSession,
    getUserAttributes: mockAttributes,
    updateAttributes: mockUpdate,
  };
  mockSession.mockImplementation((callback) =>
    callback(null, {
      isValid: () => true,
      getIdToken: () => ({
        decodePayload: () => ({ sub: 'alice-id', email: 'alice@example.test', locale: 'en' }),
        getJwtToken: () => 'id',
      }),
      getAccessToken: () => ({ getJwtToken: () => 'access' }),
      getRefreshToken: () => ({ getToken: () => 'refresh' }),
    }),
  );
  mockAttributes.mockImplementation((callback) =>
    callback(null, [{ getName: () => 'locale', getValue: () => 'es' }]),
  );
  mockUpdate.mockImplementation((_attributes, callback) => callback(null, 'SUCCESS'));
});

test('reads fresh locale from the profile rather than the old ID token', async () => {
  expect(await getAccountLanguage()).toBe('es');
  expect(mockAttributes).toHaveBeenCalledTimes(1);
});
test('updates only the standard locale attribute', async () => {
  await saveAccountLanguage('it');
  expect(CognitoUserAttribute).toHaveBeenCalledWith({ Name: 'locale', Value: 'it' });
  expect(mockUpdate.mock.calls[0][0]).toHaveLength(1);
});
test('missing locale returns no account preference', async () => {
  mockAttributes.mockImplementation((callback) => callback(null, []));
  expect(await getAccountLanguage()).toBeUndefined();
});
test('network errors propagate without reporting a successful save', async () => {
  mockUpdate.mockImplementation((_attributes, callback) => callback(new Error('offline')));
  await expect(saveAccountLanguage('es')).rejects.toThrow('offline');
});
test('logged-out callers cannot write an account preference', async () => {
  mockCurrent = null;
  await expect(saveAccountLanguage('it')).rejects.toThrow('Not authenticated');
  expect(mockUpdate).not.toHaveBeenCalled();
});
