import { APIGatewayProxyEvent } from 'aws-lambda';

// Mock aws-jwt-verify before importing handler
const mockVerify = jest.fn();
jest.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: {
    create: () => ({ verify: mockVerify }),
  },
}));

import { handler } from './auth';

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    body: JSON.stringify({ token: 'valid-token' }),
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    path: '/auth/verify',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {} as any,
    resource: '',
    ...overrides,
  };
}

describe('Auth Lambda handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 with userId and email for a valid token', async () => {
    mockVerify.mockResolvedValue({
      sub: 'user-123',
      email: 'test@example.com',
    });

    const result = await handler(makeEvent());
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body).toEqual({
      userId: 'user-123',
      email: 'test@example.com',
      valid: true,
    });
  });

  it('returns 401 for an invalid token', async () => {
    mockVerify.mockRejectedValue(new Error('Token expired'));

    const result = await handler(makeEvent());
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(401);
    expect(body.valid).toBe(false);
    expect(body.error).toBe('Token expired');
  });

  it('returns 405 for non-POST methods', async () => {
    const result = await handler(makeEvent({ httpMethod: 'GET' }));
    expect(result.statusCode).toBe(405);
  });

  it('returns 400 when body is missing', async () => {
    const result = await handler(makeEvent({ body: null }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toBe('Missing request body');
  });

  it('returns 400 when body is invalid JSON', async () => {
    const result = await handler(makeEvent({ body: 'not-json' }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toBe('Invalid JSON body');
  });

  it('returns 400 when token field is missing', async () => {
    const result = await handler(makeEvent({ body: JSON.stringify({}) }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toBe('Token is required');
  });

  it('returns empty email when token payload has no email', async () => {
    mockVerify.mockResolvedValue({ sub: 'user-456' });

    const result = await handler(makeEvent());
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.email).toBe('');
    expect(body.userId).toBe('user-456');
  });
});
