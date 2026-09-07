import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/** Identity is supplied by API Gateway's verified authorizer, never request data. */
export function getUserId(event: APIGatewayProxyEvent): string | null {
  const subject =
    event.requestContext.authorizer?.claims?.sub ?? event.requestContext.authorizer?.sub;
  return typeof subject === 'string' && subject.length > 0 ? subject : null;
}

export function response(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(body),
  };
}
