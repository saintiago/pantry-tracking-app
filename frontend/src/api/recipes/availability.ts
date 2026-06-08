import { RecipeIngredient } from './recipes';

/** Map of lowercase ingredient name -> total inventory quantity across all storage locations. */
export type InventoryIndex = Map<string, number>;

/**
 * Builds a name -> totalQuantity map from the user's inventory.
 * Sums quantities across all storage locations (matches backend computeAvailability).
 * Pure function. Does not mutate inputs.
 */
export function buildInventoryIndex(items: { name: string; quantity: number }[]): InventoryIndex {
  const index: InventoryIndex = new Map();
  for (const item of items) {
    const key = item.name.toLowerCase();
    index.set(key, (index.get(key) ?? 0) + item.quantity);
  }
  return index;
}

/**
 * Returns true iff every ingredient on the recipe has total inventory >= required.
 * Empty ingredient lists return true (vacuous truth).
 * Recipes with at least one ingredient on an empty inventory always return false.
 *
 * Pure function. Does not mutate inputs.
 */
export function computeAllAvailable(
  ingredients: RecipeIngredient[],
  inventoryIndex: InventoryIndex,
): boolean {
  for (const ing of ingredients) {
    const available = inventoryIndex.get(ing.name.toLowerCase()) ?? 0;
    if (ing.quantity === null) {
      if (available <= 0) return false;
    } else if (available < ing.quantity) {
      return false;
    }
  }
  return true;
}
