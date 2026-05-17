import { API_URL } from '../../config';
import { getCurrentSession } from '../../auth/cognitoClient/cognitoClient';

export interface RecipeIngredient {
  name: string;
  quantity: number;
  unit: string;
  inventoryItemId?: string;
}

export interface Recipe {
  recipeId: string;
  userId: string;
  name: string;
  tags: string[];
  ingredients: RecipeIngredient[];
  instructions: string;
  sourceUrl?: string;
  prepTime?: number;
  cookTime?: number;
  portions?: number;
  createdAt: string;
  updatedAt: string;
  syncVersion: number;
}

export interface IngredientStatus {
  name: string;
  required: number;
  unit: string;
  available: number;
  status: 'available' | 'partial' | 'missing';
}

export interface RecipeWithAvailability {
  recipe: Recipe;
  ingredientAvailability: IngredientStatus[];
  missingCount: number;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const session = await getCurrentSession();
  if (!session) {
    throw new Error('Not authenticated');
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.tokens.idToken}`,
  };
}

export async function fetchRecipes(): Promise<Recipe[]> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/recipes`, { headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? 'Failed to fetch recipes');
  }
  const data = await res.json();
  return data.recipes;
}

export async function createRecipe(
  data: Omit<Recipe, 'recipeId' | 'userId' | 'createdAt' | 'updatedAt' | 'syncVersion'>,
): Promise<Recipe> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/recipes`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? 'Failed to create recipe');
  }
  const body = await res.json();
  return body.recipe;
}

export async function fetchRecipeWithAvailability(recipeId: string): Promise<RecipeWithAvailability> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/recipes/${recipeId}`, { headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? 'Failed to fetch recipe');
  }
  return res.json();
}

export async function updateRecipe(
  recipeId: string,
  data: Partial<Pick<Recipe, 'name' | 'ingredients' | 'instructions' | 'sourceUrl' | 'portions' | 'tags'>> & {
    prepTime?: number | null;
    cookTime?: number | null;
  },
): Promise<Recipe> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/recipes/${recipeId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? 'Failed to update recipe');
  }
  const body = await res.json();
  return body.recipe;
}

export async function deleteRecipe(recipeId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/recipes/${recipeId}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? 'Failed to delete recipe');
  }
}

/**
 * Fetches all distinct tags across all of the user's recipes.
 * Returns a sorted, deduplicated, lowercased array of tag strings.
 */
export async function fetchRecipeTags(): Promise<string[]> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/recipes/tags`, { headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? 'Failed to fetch recipe tags');
  }
  const body = await res.json();
  return body.tags;
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
): number[] {
  const factor = toPortions / fromPortions;
  return ingredients.map((ing) => Math.round(ing.quantity * factor * 100) / 100);
}
