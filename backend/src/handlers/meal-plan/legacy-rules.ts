export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner'] as const;
export type MealType = (typeof MEAL_TYPES)[number];

// ─── Pure Validation Helpers ─────────────────────────────────────────────────

/**
 * Returns true iff value is one of the three valid MealType strings.
 */
export function isValidMealType(value: unknown): value is MealType {
  return MEAL_TYPES.includes(value as MealType);
}

/**
 * Returns true iff value is a string that strictly matches YYYY-MM-DD.
 * Does not accept ISO timestamps — date-only strings only.
 */
export function isValidIsoDate(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  // Ensure the string represents an actual calendar date
  const d = new Date(value + 'T00:00:00.000Z');
  return !isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

/**
 * Validates the startDate/endDate pair for GET /meal-plans query parameters.
 * Returns an error message string on failure, or null if both params are valid.
 * Requirements 7.3: missing, non-ISO, or endDate < startDate all return 400.
 */
export function validateDateRange(startDate?: string, endDate?: string): string | null {
  if (!startDate) return 'startDate is required';
  if (!endDate) return 'endDate is required';
  if (!isValidIsoDate(startDate)) return 'startDate must be a valid ISO date (YYYY-MM-DD)';
  if (!isValidIsoDate(endDate)) return 'endDate must be a valid ISO date (YYYY-MM-DD)';
  if (endDate < startDate) return 'endDate must be on or after startDate';
  return null;
}

/**
 * Validates the body of a POST /meal-plans request.
 * Returns an error message on the first failing field, or null if valid.
 * Requirements 7.5, 7.6: invalid mealType, missing/invalid date, missing recipeId/recipeName.
 */
export function validateCreateBody(parsed: Record<string, unknown>): string | null {
  if (parsed.servings !== undefined && !isValidServings(parsed.servings))
    return 'servings must be a positive integer';
  if (!parsed.date) return 'date is required';
  if (!isValidIsoDate(parsed.date)) return 'date must be a valid ISO date (YYYY-MM-DD)';
  if (!parsed.mealType) return 'mealType is required';
  if (!isValidMealType(parsed.mealType)) return `mealType must be one of: ${MEAL_TYPES.join(', ')}`;
  if (!parsed.recipeId || String(parsed.recipeId).trim() === '') return 'recipeId is required';
  if (!parsed.recipeName || String(parsed.recipeName).trim() === '')
    return 'recipeName is required';
  return null;
}

/**
 * Validates the body of a PUT /meal-plans/{planId} request.
 * Only validates fields that are present — all fields are optional on update.
 * Returns an error message on the first failing field, or null if valid.
 * Requirements 7.8: invalid mealType, non-ISO date, empty recipeId/recipeName.
 */
export function validateUpdateBody(parsed: Record<string, unknown>): string | null {
  if (parsed.servings !== undefined && !isValidServings(parsed.servings))
    return 'servings must be a positive integer';
  if (parsed.date !== undefined) {
    if (!isValidIsoDate(parsed.date)) return 'date must be a valid ISO date (YYYY-MM-DD)';
  }
  if (parsed.mealType !== undefined) {
    if (!isValidMealType(parsed.mealType))
      return `mealType must be one of: ${MEAL_TYPES.join(', ')}`;
  }
  if (parsed.recipeId !== undefined) {
    if (!parsed.recipeId || String(parsed.recipeId).trim() === '')
      return 'recipeId must not be empty';
  }
  if (parsed.recipeName !== undefined) {
    if (!parsed.recipeName || String(parsed.recipeName).trim() === '')
      return 'recipeName must not be empty';
  }
  return null;
}

/**
 * Filters an array of records to those whose `date` falls within the inclusive
 * [startDate, endDate] range using lexicographic YYYY-MM-DD comparison.
 * Requirements 7.1, 7.2: inclusive range, empty result when no records match.
 */
export function filterByDateRange<T extends { date: string }>(
  records: T[],
  startDate: string,
  endDate: string,
): T[] {
  return records.filter((r) => r.date >= startDate && r.date <= endDate);
}

export function isValidServings(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
