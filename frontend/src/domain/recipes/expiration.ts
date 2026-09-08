import type { InventoryItem } from '../inventory/types';
import type { Recipe } from './types';
import { canonicalStockUnit, STOCK_MEASURES } from '@pantry/domain';

const normalized = (name: string) => name.trim().toLocaleLowerCase();
const dimension = (unit: string) => {
  const resolved = canonicalStockUnit(unit);
  return STOCK_MEASURES[resolved]?.dimension ?? resolved;
};

/** Only positive, unexpired stock can prioritize a recipe. Linked lots use their group. */
export function recipeExpiration(
  recipe: Recipe,
  items: InventoryItem[],
  today: string,
  days: number,
) {
  const date = new Date(today + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  const until = date.toISOString().slice(0, 10);
  const matches: { name: string; expiration: string }[] = [];
  for (const ingredient of recipe.ingredients) {
    const linked = items.find((item) => item.itemId === ingredient.inventoryItemId);
    const eligible = items
      .filter((item) => {
        const identity = linked
          ? linked.groupId
            ? item.groupId === linked.groupId
            : item.itemId === linked.itemId
          : normalized(item.name) === normalized(ingredient.name);
        return (
          identity &&
          Number.isFinite(item.quantity) &&
          item.quantity > 0 &&
          dimension(item.unit) === dimension(ingredient.unit) &&
          typeof item.expirationDate === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(item.expirationDate) &&
          Number.isFinite(Date.parse(item.expirationDate + 'T12:00:00Z')) &&
          new Date(item.expirationDate + 'T12:00:00Z').toISOString().slice(0, 10) ===
            item.expirationDate &&
          item.expirationDate >= today &&
          item.expirationDate <= until
        );
      })
      .sort((a, b) => (a.expirationDate ?? '').localeCompare(b.expirationDate ?? ''));
    if (eligible[0])
      matches.push({ name: ingredient.name, expiration: eligible[0].expirationDate! });
  }
  matches.sort((a, b) => a.expiration.localeCompare(b.expiration));
  return matches;
}

export function prioritizeExpiringRecipes(
  recipes: Recipe[],
  items: InventoryItem[],
  today: string,
  days: number,
): Recipe[] {
  if (!days) return recipes;
  return recipes
    .map((recipe) => ({ recipe, matches: recipeExpiration(recipe, items, today, days) }))
    .filter((entry) => entry.matches.length > 0)
    .sort(
      (a, b) =>
        a.matches[0].expiration.localeCompare(b.matches[0].expiration) ||
        b.matches.length - a.matches.length ||
        a.recipe.name.localeCompare(b.recipe.name),
    )
    .map((entry) => entry.recipe);
}
