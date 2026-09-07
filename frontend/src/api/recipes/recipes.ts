import type { Recipe, RecipeWithAvailability } from '../../domain/recipes/types';
export type {
  Recipe,
  RecipeIngredient,
  IngredientStatus,
  RecipeWithAvailability,
} from '../../domain/recipes/types';
export { computeTotalTime, scaleIngredients } from '@pantry/domain';
import { apiRequest } from '../client';

export async function fetchRecipes(): Promise<Recipe[]> {
  const result = await apiRequest<{ recipes: Recipe[] }>(`/recipes`, 'Failed to fetch recipes');
  const data = result;
  return data.recipes;
}

export async function createRecipe(
  data: Omit<Recipe, 'recipeId' | 'userId' | 'createdAt' | 'updatedAt' | 'syncVersion'>,
): Promise<Recipe> {
  const result = await apiRequest<{ recipe: Recipe }>(`/recipes`, 'Failed to create recipe', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  const body = result;
  return body.recipe;
}

export async function fetchRecipeWithAvailability(
  recipeId: string,
): Promise<RecipeWithAvailability> {
  const result = await apiRequest<RecipeWithAvailability>(
    `/recipes/${encodeURIComponent(recipeId)}`,
    'Failed to fetch recipe',
  );
  return result;
}

export async function updateRecipe(
  recipeId: string,
  data: Partial<
    Pick<Recipe, 'name' | 'ingredients' | 'instructions' | 'sourceUrl' | 'portions' | 'tags'>
  > & {
    chefNotes?: string | null;
    imageId?: string | null;
    instructionImageIds?: (string | null)[] | null;
    prepTime?: number | null;
    cookTime?: number | null;
  },
): Promise<Recipe> {
  const result = await apiRequest<{ recipe: Recipe }>(
    `/recipes/${encodeURIComponent(recipeId)}`,
    'Failed to update recipe',
    {
      method: 'PUT',
      body: JSON.stringify(data),
    },
  );
  const body = result;
  return body.recipe;
}

export async function deleteRecipe(recipeId: string): Promise<void> {
  await apiRequest<void>(`/recipes/${encodeURIComponent(recipeId)}`, 'Failed to delete recipe', {
    method: 'DELETE',
    responseType: 'empty',
  });
}

/**
 * Fetches all distinct tags across all of the user's recipes.
 * Returns a sorted, deduplicated, lowercased array of tag strings.
 */
export async function fetchRecipeTags(): Promise<string[]> {
  const result = await apiRequest<{ tags: string[] }>(
    `/recipes/tags`,
    'Failed to fetch recipe tags',
  );
  const body = result;
  return body.tags;
}
