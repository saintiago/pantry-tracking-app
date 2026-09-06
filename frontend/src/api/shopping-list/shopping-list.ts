import { API_URL } from '../../config';
import { getCurrentSession } from '../../auth/cognitoClient/cognitoClient';
import type { FetchInventoryResponse } from '../inventory/inventory';
import type { ShoppingData } from '../../pages/ShoppingListPage/shopping';

/** Load a complete snapshot; never compute from a truncated inventory page. */
export async function fetchShoppingData(
  start: string,
  end: string,
  signal: AbortSignal,
): Promise<ShoppingData> {
  const session = await getCurrentSession();
  if (!session) throw new Error('Not authenticated');
  const headers = { Authorization: `Bearer ${session.tokens.idToken}` };
  async function get(path: string) {
    const response = await fetch(`${API_URL}${path}`, { headers, signal });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message ?? 'Could not load shopping list');
    return body;
  }
  async function inventory() {
    const items: ShoppingData['items'] = [];
    const groups = new Map<string, ShoppingData['groups'][number]>();
    let cursor: string | undefined;
    const seen = new Set<string>();
    do {
      const page: FetchInventoryResponse = await get(
        `/inventory${cursor ? `?lastEvaluatedKey=${encodeURIComponent(cursor)}` : ''}`,
      );
      items.push(...page.items);
      page.groups?.forEach((group) => groups.set(group.groupId, group));
      cursor = page.lastEvaluatedKey;
      if (cursor && seen.has(cursor))
        throw new Error('Inventory pagination did not advance. Please retry.');
      if (cursor) seen.add(cursor);
    } while (cursor);
    return { items, groups: [...groups.values()] };
  }
  const [stock, recipes, plans] = await Promise.all([
    inventory(),
    get('/recipes'),
    get(`/meal-plans?startDate=${start}&endDate=${end}`),
  ]);
  return { ...stock, recipes: recipes.recipes, plans: plans.mealPlans };
}
