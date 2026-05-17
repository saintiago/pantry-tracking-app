import { filterRecipes, validateMaxTimeInput, EMPTY_FILTERS, RecipeFilters } from '../filter';
import type { InventoryIndex } from '../availability';
import type { Recipe } from '../recipes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    recipeId: 'r1',
    userId: 'u1',
    name: 'Test Recipe',
    tags: [],
    ingredients: [],
    instructions: '',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    syncVersion: 1,
    ...overrides,
  };
}

const emptyIndex: InventoryIndex = new Map();

// ---------------------------------------------------------------------------
// filterRecipes
// ---------------------------------------------------------------------------

describe('filterRecipes', () => {
  it('with EMPTY_FILTERS returns the input unchanged (same recipes, same order)', () => {
    const recipes = [
      makeRecipe({ recipeId: 'r1', name: 'Pasta' }),
      makeRecipe({ recipeId: 'r2', name: 'Soup' }),
      makeRecipe({ recipeId: 'r3', name: 'Salad' }),
    ];
    const result = filterRecipes(recipes, EMPTY_FILTERS, emptyIndex);
    expect(result).toEqual(recipes);
    expect(result.map((r) => r.recipeId)).toEqual(['r1', 'r2', 'r3']);
  });

  it('with nameQuery filters case-insensitively on recipe.name', () => {
    const recipes = [
      makeRecipe({ recipeId: 'r1', name: 'Pasta Carbonara' }),
      makeRecipe({ recipeId: 'r2', name: 'Tomato Soup' }),
      makeRecipe({ recipeId: 'r3', name: 'pasta salad' }),
    ];
    const filters: RecipeFilters = { ...EMPTY_FILTERS, nameQuery: 'PASTA' };
    const result = filterRecipes(recipes, filters, emptyIndex);
    expect(result.map((r) => r.recipeId)).toEqual(['r1', 'r3']);
  });

  it('honours activeTags with AND across tags', () => {
    const recipes = [
      makeRecipe({ recipeId: 'r1', tags: ['italian', 'quick'] }),
      makeRecipe({ recipeId: 'r2', tags: ['italian'] }),
      makeRecipe({ recipeId: 'r3', tags: ['quick'] }),
      makeRecipe({ recipeId: 'r4', tags: ['italian', 'quick', 'pasta'] }),
    ];
    const filters: RecipeFilters = { ...EMPTY_FILTERS, activeTags: ['italian', 'quick'] };
    const result = filterRecipes(recipes, filters, emptyIndex);
    expect(result.map((r) => r.recipeId)).toEqual(['r1', 'r4']);
  });

  it('excludes recipes with prepTime === undefined when maxPrepTime is set (Requirement 2.4)', () => {
    const recipes = [
      makeRecipe({ recipeId: 'r1', prepTime: 10 }),
      makeRecipe({ recipeId: 'r2', prepTime: undefined }),
      makeRecipe({ recipeId: 'r3', prepTime: 20 }),
    ];
    const filters: RecipeFilters = { ...EMPTY_FILTERS, maxPrepTime: 15 };
    const result = filterRecipes(recipes, filters, emptyIndex);
    expect(result.map((r) => r.recipeId)).toEqual(['r1']);
  });

  it('excludes recipes with cookTime === undefined when maxCookTime is set (Requirement 3.4)', () => {
    const recipes = [
      makeRecipe({ recipeId: 'r1', cookTime: 10 }),
      makeRecipe({ recipeId: 'r2', cookTime: undefined }),
      makeRecipe({ recipeId: 'r3', cookTime: 30 }),
    ];
    const filters: RecipeFilters = { ...EMPTY_FILTERS, maxCookTime: 20 };
    const result = filterRecipes(recipes, filters, emptyIndex);
    expect(result.map((r) => r.recipeId)).toEqual(['r1']);
  });

  it('excludes recipes with neither prepTime nor cookTime when maxTotalTime is set (Requirement 4.4)', () => {
    const recipes = [
      makeRecipe({ recipeId: 'r1', prepTime: 5, cookTime: 10 }),
      makeRecipe({ recipeId: 'r2', prepTime: undefined, cookTime: undefined }),
      makeRecipe({ recipeId: 'r3', prepTime: 10 }),
    ];
    const filters: RecipeFilters = { ...EMPTY_FILTERS, maxTotalTime: 20 };
    const result = filterRecipes(recipes, filters, emptyIndex);
    // r2 excluded (both undefined → computeTotalTime returns undefined)
    // r3 included (prepTime=10, cookTime=undefined → total=10 ≤ 20)
    expect(result.map((r) => r.recipeId)).toEqual(['r1', 'r3']);
  });

  it('total-time predicate uses computeTotalTime: prepTime:5 + cookTime:10 = 15 (Requirement 4.5)', () => {
    const recipe = makeRecipe({ recipeId: 'r1', prepTime: 5, cookTime: 10 });

    const includedResult = filterRecipes(
      [recipe],
      { ...EMPTY_FILTERS, maxTotalTime: 15 },
      emptyIndex,
    );
    expect(includedResult).toHaveLength(1);

    const excludedResult = filterRecipes(
      [recipe],
      { ...EMPTY_FILTERS, maxTotalTime: 14 },
      emptyIndex,
    );
    expect(excludedResult).toHaveLength(0);
  });

  it('with onlyAllAvailable:true and empty InventoryIndex excludes every recipe with at least one ingredient (Requirement 5.4)', () => {
    const recipes = [
      makeRecipe({
        recipeId: 'r1',
        ingredients: [{ name: 'Eggs', quantity: 2, unit: 'Unit' }],
      }),
      makeRecipe({ recipeId: 'r2', ingredients: [] }),
      makeRecipe({
        recipeId: 'r3',
        ingredients: [{ name: 'Milk', quantity: 1, unit: 'Liter' }],
      }),
    ];
    const filters: RecipeFilters = { ...EMPTY_FILTERS, onlyAllAvailable: true };
    const result = filterRecipes(recipes, filters, emptyIndex);
    // r1 and r3 have ingredients → excluded; r2 has no ingredients → included (vacuous truth)
    expect(result.map((r) => r.recipeId)).toEqual(['r2']);
  });
});

// ---------------------------------------------------------------------------
// validateMaxTimeInput
// ---------------------------------------------------------------------------

describe('validateMaxTimeInput', () => {
  it("returns {} for empty string ''", () => {
    expect(validateMaxTimeInput('')).toEqual({});
  });

  it("returns { value: 15 } for '15'", () => {
    expect(validateMaxTimeInput('15')).toEqual({ value: 15 });
  });

  it("returns { value: 0 } for '0'", () => {
    expect(validateMaxTimeInput('0')).toEqual({ value: 0 });
  });

  it("returns error (no value) for '-1' (Requirement 2.3)", () => {
    const result = validateMaxTimeInput('-1');
    expect(result.error).toBeTruthy();
    expect(result.value).toBeUndefined();
  });

  it("returns error (no value) for '1.5' (Requirement 2.3)", () => {
    const result = validateMaxTimeInput('1.5');
    expect(result.error).toBeTruthy();
    expect(result.value).toBeUndefined();
  });

  it("returns error (no value) for 'abc' (Requirement 2.3)", () => {
    const result = validateMaxTimeInput('abc');
    expect(result.error).toBeTruthy();
    expect(result.value).toBeUndefined();
  });
});
