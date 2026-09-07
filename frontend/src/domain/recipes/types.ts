import type { RecipeIngredient, IngredientStatus } from '@pantry/domain';
export type { RecipeIngredient, IngredientStatus } from '@pantry/domain';

export interface Recipe {
  recipeId: string;
  userId: string;
  name: string;
  tags: string[];
  ingredients: RecipeIngredient[];
  instructions: string | string[];
  chefNotes?: string;
  imageId?: string;
  instructionImageIds?: (string | null)[];
  sourceUrl?: string;
  prepTime?: number;
  cookTime?: number;
  portions?: number;
  createdAt: string;
  updatedAt: string;
  syncVersion: number;
}

export interface RecipeWithAvailability {
  recipe: Recipe;
  ingredientAvailability: IngredientStatus[];
  missingCount: number;
}
