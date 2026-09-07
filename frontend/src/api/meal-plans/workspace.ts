import type { PlannerSnapshot, PlannerChange } from '@pantry/domain';
import { apiRequest } from '../client';

export function fetchPlannerWorkspace(signal?: AbortSignal): Promise<PlannerSnapshot> {
  return apiRequest('/meal-plans?view=workspace', 'Could not load planner', {
    signal,
    timeoutMs: 15000,
  });
}
export function changePlanner(change: PlannerChange): Promise<PlannerSnapshot> {
  return apiRequest('/meal-plans', 'Could not save planner. Retry the pending save.', {
    method: 'POST',
    body: JSON.stringify({ action: 'change', change }),
    timeoutMs: 15000,
  });
}
export function reconcilePlanner(change: PlannerChange): Promise<PlannerSnapshot> {
  return apiRequest('/meal-plans', 'Could not reconcile the pending save. Try again.', {
    method: 'POST',
    body: JSON.stringify({ action: 'reconcile', change }),
    timeoutMs: 15000,
  });
}
