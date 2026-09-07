export interface RecipeIngredient {
  name: string;
  quantity: number | null;
  unit: string;
  section?: string;
  inventoryItemId?: string;
}

export interface IngredientStatus {
  name: string;
  required: number | null;
  unit: string;
  available: number;
  status: 'available' | 'partial' | 'missing';
}

/**
 * Computes total time from optional prepTime and cookTime.
 * Returns undefined when both are absent; otherwise returns (prepTime ?? 0) + (cookTime ?? 0).
 */
export function computeTotalTime(prepTime?: number, cookTime?: number): number | undefined {
  if (prepTime === undefined && cookTime === undefined) return undefined;
  return (prepTime ?? 0) + (cookTime ?? 0);
}

/**
 * Scales a list of ingredient quantities from one portions base to another.
 * Returns a new array of scaled quantities (rounded to at most 2 decimal places).
 * Does NOT mutate the input ingredients.
 *
 * @param ingredients - The source ingredient list
 * @param fromPortions - The base portions value (positive integer)
 * @param toPortions - The target portions value (positive integer)
 * @returns Array of scaled quantities in the same order as the input
 */
export function scaleIngredients(
  ingredients: RecipeIngredient[],
  fromPortions: number,
  toPortions: number,
): Array<number | null> {
  const factor = toPortions / fromPortions;
  return ingredients.map((ing) =>
    ing.quantity === null ? null : Math.round(ing.quantity * factor * 100) / 100,
  );
}
