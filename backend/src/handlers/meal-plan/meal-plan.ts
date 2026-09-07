import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { getUserId, response } from '../../http/response';
import { PlannerStore, PlannerError } from './planner-store';
import { plannerRoute } from './planner-handler';
export { getUserId, response } from '../../http/response';
export * from './legacy-rules';
export const TABLE_NAME = process.env.TABLE_NAME ?? 'PantryApp';
export const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const userId = getUserId(event);
  if (!userId) return response(401, { error: 'UNAUTHORIZED', message: 'Unauthorized' });
  try {
    return await plannerRoute(event, new PlannerStore(docClient, TABLE_NAME, userId));
  } catch (error) {
    if (error instanceof PlannerError)
      return response(error.status, {
        error:
          error.status === 400
            ? 'VALIDATION_ERROR'
            : error.status === 404
              ? 'NOT_FOUND'
              : 'CONFLICT',
        message: error.message,
      });
    console.error('MealPlan Lambda error:', error);
    return response(500, {
      error: 'INTERNAL_ERROR',
      message: 'Internal server error',
      requestId: event.requestContext.requestId,
    });
  }
}
