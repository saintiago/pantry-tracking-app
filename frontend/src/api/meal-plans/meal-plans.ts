import { apiRequest } from '../client';

export interface MealPlan {
  servings?: number;
  planId: string;
  date: string; // YYYY-MM-DD
  mealType: 'breakfast' | 'lunch' | 'dinner';
  recipeId: string;
  recipeName: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMealPlanInput {
  servings?: number;
  date: string;
  mealType: 'breakfast' | 'lunch' | 'dinner';
  recipeId: string;
  recipeName: string;
}

export interface PlannableRecipe {
  recipeId: string;
  name: string;
  tags?: string[];
  portions?: number;
}

const timeoutMs = 10000;

export function updateMealPlan(
  planId: string,
  input: Partial<CreateMealPlanInput>,
): Promise<{ mealPlan: MealPlan }> {
  return apiRequest(`/meal-plans/${encodeURIComponent(planId)}`, 'Failed to update meal', {
    method: 'PUT',
    body: JSON.stringify(input),
    timeoutMs,
  });
}

export function fetchMealPlans(
  startDate: string,
  endDate: string,
): Promise<{ mealPlans: MealPlan[] }> {
  return apiRequest(
    `/meal-plans?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
    'Failed to fetch meal plans',
    { timeoutMs },
  );
}

export function createMealPlan(input: CreateMealPlanInput): Promise<{ mealPlan: MealPlan }> {
  return apiRequest('/meal-plans', 'Failed to create meal plan', {
    method: 'POST',
    body: JSON.stringify(input),
    timeoutMs,
  });
}

export function deleteMealPlan(planId: string): Promise<void> {
  return apiRequest(`/meal-plans/${encodeURIComponent(planId)}`, 'Failed to delete meal plan', {
    method: 'DELETE',
    responseType: 'empty',
    timeoutMs,
  });
}

export async function fetchRecipesForPlanning(): Promise<{ recipes: PlannableRecipe[] }> {
  const data = await apiRequest<{ recipes?: PlannableRecipe[] }>(
    '/recipes',
    'Failed to fetch recipes',
    { timeoutMs },
  );
  return {
    recipes: (data.recipes ?? []).map((recipe) => ({
      recipeId: recipe.recipeId,
      name: recipe.name,
      ...(recipe.tags ? { tags: recipe.tags } : {}),
      ...(recipe.portions ? { portions: recipe.portions } : {}),
    })),
  };
}

export function updateFutureServings(
  startDate: string,
  servings: number,
): Promise<{ updatedCount: number }> {
  return apiRequest('/meal-plans', 'Failed to update servings', {
    method: 'PUT',
    body: JSON.stringify({ startDate, servings }),
    timeoutMs,
  });
}
