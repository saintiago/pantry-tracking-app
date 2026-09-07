import { apiRequest } from '../client';
import { fetchInventory } from '../inventory/inventory';
import type { ShoppingData } from './types';

/** Load a complete snapshot; never compute from a truncated inventory page. */
export async function fetchShoppingData(
  start: string,
  end: string,
  signal: AbortSignal,
): Promise<ShoppingData> {
  function get<T>(path: string): Promise<T> {
    return apiRequest<T>(path, 'Could not load shopping list', { signal });
  }
  const [stock, recipes, plans] = await Promise.all([
    fetchInventory(signal),
    get<{ recipes: ShoppingData['recipes'] }>('/recipes'),
    get<{ mealPlans: ShoppingData['plans'] }>(
      `/meal-plans?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`,
    ),
  ]);
  return {
    items: stock.items,
    groups: stock.groups ?? [],
    recipes: recipes.recipes,
    plans: plans.mealPlans,
  };
}
