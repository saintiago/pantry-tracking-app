import type { APIGatewayProxyEvent } from 'aws-lambda';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { handler as inventory } from '../../handlers/inventory/inventory';
import { handler as recipe } from '../../handlers/recipe/recipe';
import { handler as location } from '../../handlers/storage-location/storage-location';
import { handler as mealPlan } from '../../handlers/meal-plan/meal-plan';

const send = jest.spyOn(DynamoDBDocumentClient.prototype, 'send');
beforeEach(() => send.mockClear());
afterAll(() => send.mockRestore());

describe.each([
  ['inventory', inventory, 'itemId'],
  ['recipes', recipe, 'recipeId'],
  ['locations', location, 'locationId'],
  ['meal-plans', mealPlan, 'planId'],
] as const)('%s mutation envelopes', (route, handler, idField) => {
  test.each(['null', '[]', '"text"', '42', '{'])(
    'returns 400 before accessing storage for %s',
    async (body) => {
      for (const method of ['POST', 'PUT']) {
        const event = {
          httpMethod: method,
          resource: `/${route}`,
          body,
          pathParameters: method === 'PUT' ? { [idField]: 'test-id' } : null,
          requestContext: {
            authorizer: { claims: { sub: 'test-user' } },
            requestId: 'test-request',
          },
        } as unknown as APIGatewayProxyEvent;
        expect((await handler(event)).statusCode).toBe(400);
      }
      expect(send).not.toHaveBeenCalled();
    },
  );
});
