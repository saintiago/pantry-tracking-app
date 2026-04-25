import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

const USER_POOL_ID = process.env.USER_POOL_ID ?? '';
const USER_POOL_CLIENT_ID = process.env.USER_POOL_CLIENT_ID ?? '';

const verifier = CognitoJwtVerifier.create({
  userPoolId: USER_POOL_ID,
  tokenUse: 'id',
  clientId: USER_POOL_CLIENT_ID,
});

export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  if (!event.body) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Missing request body' }),
    };
  }

  let token: string;
  try {
    const parsed = JSON.parse(event.body);
    token = parsed.token;
  } catch {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    };
  }

  if (!token) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Token is required' }),
    };
  }

  try {
    const payload = await verifier.verify(token);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        userId: payload.sub,
        email: payload.email ?? '',
        valid: true,
      }),
    };
  } catch (err) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({
        userId: '',
        email: '',
        valid: false,
        error: err instanceof Error ? err.message : 'Token verification failed',
      }),
    };
  }
}
