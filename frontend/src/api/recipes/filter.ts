import { Recipe } from './recipes';
import { computeTotalTime } from './recipes';
import { computeAllAvailable, InventoryIndex } from './availability';

export interface RecipeFilters {
  nameQuery: string;
  activeTags: string[];
  maxPrepTime?: number;
  maxCookTime?: number;
  maxTotalTime?: number;
  onlyAllAvailable: boolean;
}

export const EMPTY_FILTERS: RecipeFilters = {
  nameQuery: '',
  activeTags: [],
  maxPrepTime: undefined,
  maxCookTime: undefined,
  maxTotalTime: undefined,
  onlyAllAvailable: false,
};

/**
 * Validates a raw string input for a max-time filter field.
 * - Returns `{}` for an empty string (no filter applied).
 * - Returns `{ error }` for non-integer, negative, or non-numeric input.
 * - Returns `{ value: n }` for valid non-negative integers.
 */
export function validateMaxTimeInput(raw: string): { value?: number; error?: string } {
  if (raw === '') return {};

  const n = Number(raw);
  if (Number.isNaN(n) || !Number.isInteger(n) || n < 0) {
    return { error: 'Enter a non-negative whole number.' };
  }

  return { value: n };
}

/**
 * Filters a list of recipes by the given filters and inventory index.
 * Applies all active filters with AND semantics.
 * Preserves the input order. Pure function — does not mutate inputs.
 */
export function filterRecipes(
  recipes: Recipe[],
  filters: RecipeFilters,
  inventoryIndex: InventoryIndex,
): Recipe[] {
  const nameQuery = filters.nameQuery.trim().toLowerCase();

  return recipes.filter((recipe) => {
    // Name filter: case-insensitive substring match
    if (nameQuery !== '' && !recipe.name.toLowerCase().includes(nameQuery)) {
      return false;
    }

    // Tags filter: every active tag must be present in the recipe's tags
    if (filters.activeTags.length > 0) {
      const recipeTags = recipe.tags ?? [];
      if (!filters.activeTags.every((tag) => recipeTags.includes(tag))) {
        return false;
      }
    }

    // Max prep time filter: excludes recipes with undefined prepTime
    if (filters.maxPrepTime !== undefined) {
      if (recipe.prepTime === undefined || recipe.prepTime > filters.maxPrepTime) {
        return false;
      }
    }

    // Max cook time filter: excludes recipes with undefined cookTime
    if (filters.maxCookTime !== undefined) {
      if (recipe.cookTime === undefined || recipe.cookTime > filters.maxCookTime) {
        return false;
      }
    }

    // Max total time filter: excludes recipes where computeTotalTime returns undefined
    if (filters.maxTotalTime !== undefined) {
      const total = computeTotalTime(recipe.prepTime, recipe.cookTime);
      if (total === undefined || total > filters.maxTotalTime) {
        return false;
      }
    }

    // Only all-available filter
    if (filters.onlyAllAvailable) {
      if (!computeAllAvailable(recipe.ingredients, inventoryIndex)) {
        return false;
      }
    }

    return true;
  });
}
