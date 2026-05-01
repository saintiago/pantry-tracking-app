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
  ingredients: RecipeIngredient[];
  instructions: string;
  sourceUrl?: string;
  prepTime?: number;
  cookTime?: number;
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
  data: Partial<Pick<Recipe, 'name' | 'ingredients' | 'instructions' | 'sourceUrl'>> & {
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
 * Computes total time from optional prepTime and cookTime.
 * Returns undefined when both are absent; otherwise returns (prepTime ?? 0) + (cookTime ?? 0).
 */
export function computeTotalTime(prepTime?: number, cookTime?: number): number | undefined {
  if (prepTime === undefined && cookTime === undefined) return undefined;
  return (prepTime ?? 0) + (cookTime ?? 0);
}
