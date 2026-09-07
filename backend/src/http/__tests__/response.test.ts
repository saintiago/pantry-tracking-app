import type { APIGatewayProxyEvent } from 'aws-lambda';
import { getUserId, response } from '../response';

test.each([undefined, {}, { claims: { sub: 42 } }, { sub: '' }])(
  'rejects missing or malformed authorizer identity: %p',
  (authorizer) => {
    const event = {
      requestContext: { authorizer },
      body: '{"userId":"other-user"}',
    } as APIGatewayProxyEvent;
    expect(getUserId(event)).toBeNull();
  },
);

test('uses the verified claim, with a custom-authorizer fallback', () => {
  expect(
    getUserId({
      requestContext: { authorizer: { claims: { sub: 'verified' }, sub: 'fallback' } },
    } as unknown as APIGatewayProxyEvent),
  ).toBe('verified');
  expect(
    getUserId({
      requestContext: { authorizer: { sub: 'fallback' } },
    } as unknown as APIGatewayProxyEvent),
  ).toBe('fallback');
});

test('preserves the existing API Gateway JSON response contract', () => {
  const result = response(400, { error: 'BadRequest', message: 'Invalid quantity' });
  expect(result.statusCode).toBe(400);
  expect(result.headers).toEqual({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  expect(JSON.parse(result.body)).toEqual({ error: 'BadRequest', message: 'Invalid quantity' });
});
