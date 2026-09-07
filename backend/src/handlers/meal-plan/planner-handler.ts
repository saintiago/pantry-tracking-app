import type { APIGatewayProxyEvent } from 'aws-lambda';
import type { PlannerChange, PlannerEntry } from '@pantry/domain';
import { randomUUID } from 'crypto';
import { parseObject } from '../../http/request';
import { response } from '../../http/response';
import { PlannerStore, PlannerError } from './planner-store';
import {
  validateCreateBody,
  validateUpdateBody,
  validateDateRange,
  isValidIsoDate,
  isValidServings,
} from './legacy-rules';

export async function plannerRoute(event: APIGatewayProxyEvent, store: PlannerStore) {
  const method = event.httpMethod;
  const planId = event.pathParameters?.planId;
  const query = event.queryStringParameters ?? {};
  if (method === 'GET' && !planId) {
    if (query.view === 'workspace') return response(200, await store.read());
    const error = validateDateRange(query.startDate, query.endDate);
    if (error) throw new PlannerError(400, error);
    const state = await store.read();
    return response(200, {
      mealPlans: state.mealPlans.filter(
        (e) => e.date >= query.startDate! && e.date <= query.endDate!,
      ),
      batches: state.batches,
    });
  }
  if (
    !['POST', 'PUT', 'DELETE'].includes(method) ||
    (method === 'POST' && planId) ||
    (method === 'DELETE' && !planId)
  )
    return response(405, { message: 'Method not allowed' });
  let body: Record<string, unknown> = {};
  if (method !== 'DELETE') {
    try {
      body = parseObject(event.body ?? '');
    } catch {
      throw new PlannerError(400, 'Invalid JSON body');
    }
  }
  if (method === 'POST' && body.action === 'change')
    return response(200, await store.change(body.change as PlannerChange));
  if (method === 'POST' && body.action === 'reconcile')
    return response(200, await store.reconcile(body.change as PlannerChange));
  // Older clients continue to work, but every writer participates in the same lock.
  const error =
    method === 'POST'
      ? validateCreateBody(body)
      : method === 'PUT' && planId
        ? validateUpdateBody(body)
        : null;
  if (error) throw new PlannerError(400, error);
  if (
    method === 'PUT' &&
    !planId &&
    (!isValidIsoDate(body.startDate) || !isValidServings(body.servings))
  )
    throw new PlannerError(400, 'A valid startDate and positive integer servings are required');
  const state = await store.read();
  const previous = planId ? state.mealPlans.find((e) => e.planId === planId) : undefined;
  if (planId && !previous) throw new PlannerError(404, 'Meal plan not found');
  const change: PlannerChange = { operationId: randomUUID(), revision: state.revision };
  let id = planId;
  if (method === 'DELETE') change.removeIds = [planId!];
  else if (method === 'PUT' && !planId) {
    change.entries = state.mealPlans
      .filter((e) => e.date >= (body.startDate as string) && !e.batchId)
      .map((e) => ({ ...e, servings: body.servings as number }));
  } else {
    id ??= randomUUID();
    const fields = Object.fromEntries(
      ['date', 'mealType', 'recipeId', 'recipeName', 'servings']
        .filter((key) => body[key] !== undefined)
        .map((key) => [key, body[key]]),
    );
    change.entries = [
      {
        ...previous,
        ...fields,
        planId: id,
        createdAt: previous?.createdAt ?? '',
        updatedAt: '',
      } as PlannerEntry,
    ];
  }
  const saved = await store.change(change, true);
  if (method === 'DELETE') return response(200, { message: 'Meal plan deleted' });
  if (method === 'PUT' && !planId) return response(200, { updatedCount: change.entries!.length });
  return response(method === 'POST' ? 201 : 200, {
    mealPlan: saved.mealPlans.find((e) => e.planId === id),
  });
}
