import type { RecipeIngredient, IngredientStatus } from '@pantry/domain';
export type { RecipeIngredient, IngredientStatus } from '@pantry/domain';
export { computeTotalTime, scaleIngredients } from '@pantry/domain';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface InventoryItem {
  name: string;
  quantity: number;
  [key: string]: unknown;
}

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Validates optional prepTime and cookTime fields in a parsed request body.
 * Returns the name of the first failing field, or null if both are absent or valid.
 * Note: null values are treated as explicit removal signals and are not validated here.
 */
export function validateTimeFields(parsed: Record<string, unknown>): string | null {
  for (const field of ['prepTime', 'cookTime'] as const) {
    if (parsed[field] !== undefined && parsed[field] !== null) {
      const v = parsed[field];
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
        return field;
      }
    }
  }
  return null;
}

/**
 * Validates the portions field in a parsed request body.
 * Returns an error message string if invalid, or null if valid or absent.
 * Absence is not an error here — the caller checks for required presence separately.
 */
export function validatePortions(parsed: Record<string, unknown>): string | null {
  if (parsed.portions === undefined) return null;
  const v = parsed.portions;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    return 'portions must be a positive integer';
  }
  return null;
}

/**
 * Normalizes a raw tags input: trims, lowercases, filters empty strings, deduplicates.
 * Pure function — no side effects.
 */
export function normalizeTags(raw: unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const normalized = item.trim().toLowerCase();
    if (normalized.length === 0) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

/**
 * Validates the tags field in a parsed request body.
 * Returns an error string if tags is absent, not an array, or empty after normalization.
 * Returns null if valid.
 */
export function validateTags(parsed: Record<string, unknown>): string | null {
  if (parsed.tags === undefined || parsed.tags === null) {
    return 'tags is required';
  }
  if (!Array.isArray(parsed.tags)) {
    return 'tags must be an array';
  }
  const normalized = normalizeTags(parsed.tags as unknown[]);
  if (normalized.length === 0) {
    return 'At least one tag is required';
  }
  return null;
}

/**
 * Validates the instructions field. Accepts either a non-empty string or a
 * non-empty array of non-empty strings (the array form is what new clients send).
 * `undefined` is allowed so callers can treat instructions as optional.
 */
export function validateInstructions(instructions: unknown): string | null {
  if (instructions === undefined) return null;
  if (typeof instructions === 'string') {
    return instructions.trim() === '' ? 'instructions must not be empty' : null;
  }
  if (Array.isArray(instructions)) {
    if (instructions.length === 0) return 'instructions must have at least one step';
    for (const step of instructions) {
      if (typeof step !== 'string' || step.trim() === '') {
        return 'Each instruction step must be a non-empty string';
      }
    }
    return null;
  }
  return 'instructions must be a string or an array of strings';
}

export function validateIngredients(ingredients: unknown): string | null {
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    return 'At least one ingredient is required';
  }
  for (const ing of ingredients) {
    if (!ing || typeof ing !== 'object') return 'Each ingredient must be an object';
    const ingredient = ing as Record<string, unknown>;
    if (!ingredient.unit || String(ingredient.unit).trim() === '') {
      return 'Each ingredient must have a unit';
    }
    const unit = String(ingredient.unit).trim();
    const quantity = ingredient.quantity;
    const validHandfulQuantity = unit === 'handful' && quantity === null;
    const validNumericQuantity =
      typeof quantity === 'number' && Number.isFinite(quantity) && quantity > 0;
    if (!validHandfulQuantity && !validNumericQuantity) {
      return 'Each ingredient must have a positive quantity, except handful may be empty';
    }
  }
  return null;
}

// ─── Availability Calculator (pure function) ─────────────────────────────────

export function computeAvailability(
  ingredients: RecipeIngredient[],
  inventoryItems: InventoryItem[],
): { ingredientAvailability: IngredientStatus[]; missingCount: number } {
  const ingredientAvailability = ingredients.map((ing) => {
    const totalAvailable = inventoryItems
      .filter((item) => item.name.toLowerCase() === ing.name.toLowerCase())
      .reduce((sum, item) => sum + item.quantity, 0);

    const status: 'available' | 'partial' | 'missing' =
      ing.quantity === null
        ? totalAvailable > 0
          ? 'available'
          : 'missing'
        : totalAvailable >= ing.quantity
          ? 'available'
          : totalAvailable > 0
            ? 'partial'
            : 'missing';

    return {
      name: ing.name,
      required: ing.quantity,
      unit: ing.unit,
      available: totalAvailable,
      status,
    };
  });

  const missingCount = ingredientAvailability.filter((a) => a.status !== 'available').length;
  return { ingredientAvailability, missingCount };
}
