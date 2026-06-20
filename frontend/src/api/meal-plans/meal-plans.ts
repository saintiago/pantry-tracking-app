import { API_URL } from '../../config';
import { getCurrentSession } from '../../auth/cognitoClient/cognitoClient';

export interface MealPlan {
  planId: string;
  date: string; // YYYY-MM-DD
  mealType: 'breakfast' | 'lunch' | 'dinner';
  recipeId: string;
  recipeName: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMealPlanInput {
  date: string;
  mealType: 'breakfast' | 'lunch' | 'dinner';
  recipeId: string;
  recipeName: string;
}

export interface PlannableRecipe {
  recipeId: string;
  name: string;
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

export async function fetchMealPlans(
  startDate: string,
  endDate: string,
): Promise<{ mealPlans: MealPlan[] }> {
  const headers = await getAuthHeaders();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(
      `${API_URL}/meal-plans?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
      { headers, signal: controller.signal },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message ?? 'Failed to fetch meal plans');
    }
    return res.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function createMealPlan(
  input: CreateMealPlanInput,
): Promise<{ mealPlan: MealPlan }> {
  const headers = await getAuthHeaders();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${API_URL}/meal-plans`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message ?? 'Failed to create meal plan');
    }
    return res.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function deleteMealPlan(planId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${API_URL}/meal-plans/${planId}`, {
      method: 'DELETE',
      headers,
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message ?? 'Failed to delete meal plan');
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchRecipesForPlanning(): Promise<{ recipes: PlannableRecipe[] }> {
  const headers = await getAuthHeaders();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${API_URL}/recipes`, {
      headers,
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message ?? 'Failed to fetch recipes');
    }
    const data = await res.json();
    // Map full Recipe objects to PlannableRecipe (pick recipeId and name only)
    const recipes: PlannableRecipe[] = (data.recipes ?? []).map(
      (r: { recipeId: string; name: string }) => ({
        recipeId: r.recipeId,
        name: r.name,
      }),
    );
    return { recipes };
  } finally {
    clearTimeout(timeoutId);
  }
}
