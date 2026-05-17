// Feature: recipe-search-filter

import * as fc from 'fast-check';
import { filterRecipes, validateMaxTimeInput, EMPTY_FILTERS, RecipeFilters } from '../filter';
import { buildInventoryIndex, computeAllAvailable, InventoryIndex } from '../availability';
import { computeTotalTime } from '../recipes';
import type { Recipe, RecipeIngredient } from '../recipes';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const ingredientArb: fc.Arbitrary<RecipeIngredient> = fc.record({
  name: fc.string({ minLength: 1, maxLength: 20 }),
  quantity: fc.integer({ min: 1, max: 100 }),
  unit: fc.constantFrom('Unit', 'Gram', 'Milliliter', 'Liter', 'Kilo'),
});

const recipeArb: fc.Arbitrary<Recipe> = fc.record({
  recipeId: fc.uuid(),
  userId: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  tags: fc.array(fc.string({ minLength: 1, maxLength: 15 }), { maxLength: 5 }),
  ingredients: fc.array(ingredientArb, { maxLength: 5 }),
  instructions: fc.string(),
  sourceUrl: fc.option(fc.webUrl(), { nil: undefined }),
  prepTime: fc.option(fc.integer({ min: 0, max: 300 }), { nil: undefined }),
  cookTime: fc.option(fc.integer({ min: 0, max: 300 }), { nil: undefined }),
  portions: fc.option(fc.integer({ min: 1, max: 20 }), { nil: undefined }),
  createdAt: fc.constant('2024-01-01T00:00:00Z'),
  updatedAt: fc.constant('2024-01-01T00:00:00Z'),
  syncVersion: fc.integer({ min: 1, max: 100 }),
});

const inventoryItemArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 20 }),
  quantity: fc.integer({ min: 0, max: 100 }),
});

const filtersArb: fc.Arbitrary<RecipeFilters> = fc.record({
  nameQuery: fc.string({ maxLength: 20 }),
  activeTags: fc.array(fc.string({ minLength: 1, maxLength: 15 }), { maxLength: 3 }),
  maxPrepTime: fc.option(fc.integer({ min: 0, max: 300 }), { nil: undefined }),
  maxCookTime: fc.option(fc.integer({ min: 0, max: 300 }), { nil: undefined }),
  maxTotalTime: fc.option(fc.integer({ min: 0, max: 600 }), { nil: undefined }),
  onlyAllAvailable: fc.boolean(),
});

function buildIndex(items: { name: string; quantity: number }[]): InventoryIndex {
  return buildInventoryIndex(items);
}

// ---------------------------------------------------------------------------
// Property 1: Filter result is a subset of the input
// Validates: Requirements 2.1, 3.1, 4.1, 5.1, 6.1
// ---------------------------------------------------------------------------

describe('Property 1: Filter result is a subset of the input', () => {
  it('every recipe in the result is also in the input', () => {
    fc.assert(
      fc.property(
        fc.array(recipeArb, { maxLength: 20 }),
        fc.array(inventoryItemArb, { maxLength: 20 }),
        filtersArb,
        (recipes, inventoryItems, filters) => {
          const idx = buildIndex(inventoryItems);
          const result = filterRecipes(recipes, filters, idx);
          for (const r of result) {
            expect(recipes).toContain(r);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: All filters inactive returns the full list unchanged
// Validates: Requirements 2.2, 3.2, 4.2, 5.2, 6.2
// ---------------------------------------------------------------------------

describe('Property 2: All filters inactive returns the full list unchanged', () => {
  it('filterRecipes(recipes, EMPTY_FILTERS, idx) returns the input list unchanged', () => {
    fc.assert(
      fc.property(
        fc.array(recipeArb, { maxLength: 20 }),
        fc.array(inventoryItemArb, { maxLength: 20 }),
        (recipes, inventoryItems) => {
          const idx = buildIndex(inventoryItems);
          const result = filterRecipes(recipes, EMPTY_FILTERS, idx);
          expect(result).toEqual(recipes);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: Time filter inclusion predicate (prep, cook, total)
// Validates: Requirements 2.1, 2.4, 3.1, 3.4, 4.1, 4.4, 4.5
// ---------------------------------------------------------------------------

describe('Property 3: Time filter inclusion predicate (prep, cook, total)', () => {
  it('a recipe is in the result iff it satisfies the time predicate', () => {
    fc.assert(
      fc.property(
        fc.array(recipeArb, { maxLength: 20 }),
        fc.integer({ min: 0, max: 600 }),
        fc.array(inventoryItemArb, { maxLength: 20 }),
        (recipes, V, inventoryItems) => {
          const idx = buildIndex(inventoryItems);

          // Branch 1: maxPrepTime = V
          const prepResult = filterRecipes(recipes, { ...EMPTY_FILTERS, maxPrepTime: V }, idx);
          for (const recipe of recipes) {
            const shouldBeIn = recipe.prepTime !== undefined && recipe.prepTime <= V;
            expect(prepResult.includes(recipe)).toBe(shouldBeIn);
          }

          // Branch 2: maxCookTime = V
          const cookResult = filterRecipes(recipes, { ...EMPTY_FILTERS, maxCookTime: V }, idx);
          for (const recipe of recipes) {
            const shouldBeIn = recipe.cookTime !== undefined && recipe.cookTime <= V;
            expect(cookResult.includes(recipe)).toBe(shouldBeIn);
          }

          // Branch 3: maxTotalTime = V
          const totalResult = filterRecipes(recipes, { ...EMPTY_FILTERS, maxTotalTime: V }, idx);
          for (const recipe of recipes) {
            const total = computeTotalTime(recipe.prepTime, recipe.cookTime);
            const shouldBeIn = total !== undefined && total <= V;
            expect(totalResult.includes(recipe)).toBe(shouldBeIn);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4: All-available inclusion predicate
// Validates: Requirements 5.1, 5.3, 5.4, 5.5
// ---------------------------------------------------------------------------

describe('Property 4: All-available inclusion predicate', () => {
  it('a recipe is in the result iff computeAllAvailable returns true', () => {
    fc.assert(
      fc.property(
        fc.array(recipeArb, { maxLength: 20 }),
        fc.array(inventoryItemArb, { maxLength: 20 }),
        (recipes, inventoryItems) => {
          const idx = buildIndex(inventoryItems);
          const result = filterRecipes(
            recipes,
            { ...EMPTY_FILTERS, onlyAllAvailable: true },
            idx,
          );
          for (const recipe of recipes) {
            const shouldBeIn = computeAllAvailable(recipe.ingredients, idx);
            expect(result.includes(recipe)).toBe(shouldBeIn);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5: AND conjunction correctness
// Validates: Requirements 6.1, 6.3
// ---------------------------------------------------------------------------

describe('Property 5: AND conjunction correctness', () => {
  it('filterRecipes equals the order-preserving intersection of per-filter results', () => {
    fc.assert(
      fc.property(
        fc.array(recipeArb, { maxLength: 20 }),
        fc.array(inventoryItemArb, { maxLength: 20 }),
        filtersArb,
        (recipes, inventoryItems, filters) => {
          const idx = buildIndex(inventoryItems);
          const combined = filterRecipes(recipes, filters, idx);

          // Compute per-filter results individually and intersect
          const perFilterResults: Recipe[][] = [];

          if (filters.nameQuery.trim() !== '') {
            perFilterResults.push(
              filterRecipes(recipes, { ...EMPTY_FILTERS, nameQuery: filters.nameQuery }, idx),
            );
          }
          if (filters.activeTags.length > 0) {
            perFilterResults.push(
              filterRecipes(recipes, { ...EMPTY_FILTERS, activeTags: filters.activeTags }, idx),
            );
          }
          if (filters.maxPrepTime !== undefined) {
            perFilterResults.push(
              filterRecipes(
                recipes,
                { ...EMPTY_FILTERS, maxPrepTime: filters.maxPrepTime },
                idx,
              ),
            );
          }
          if (filters.maxCookTime !== undefined) {
            perFilterResults.push(
              filterRecipes(
                recipes,
                { ...EMPTY_FILTERS, maxCookTime: filters.maxCookTime },
                idx,
              ),
            );
          }
          if (filters.maxTotalTime !== undefined) {
            perFilterResults.push(
              filterRecipes(
                recipes,
                { ...EMPTY_FILTERS, maxTotalTime: filters.maxTotalTime },
                idx,
              ),
            );
          }
          if (filters.onlyAllAvailable) {
            perFilterResults.push(
              filterRecipes(
                recipes,
                { ...EMPTY_FILTERS, onlyAllAvailable: true },
                idx,
              ),
            );
          }

          // If no filters are active, intersection is the full list
          const intersection =
            perFilterResults.length === 0
              ? recipes
              : recipes.filter((r) => perFilterResults.every((set) => set.includes(r)));

          expect(combined).toEqual(intersection);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 6: Filter idempotence
// Validates: Requirements 2.1, 3.1, 4.1, 5.1, 6.1
// ---------------------------------------------------------------------------

describe('Property 6: Filter idempotence', () => {
  it('applying the same filter twice equals applying it once', () => {
    fc.assert(
      fc.property(
        fc.array(recipeArb, { maxLength: 20 }),
        fc.array(inventoryItemArb, { maxLength: 20 }),
        filtersArb,
        (recipes, inventoryItems, filters) => {
          const idx = buildIndex(inventoryItems);
          const once = filterRecipes(recipes, filters, idx);
          const twice = filterRecipes(once, filters, idx);
          expect(twice).toEqual(once);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 8: Invalid time inputs are not applied as filters
// Validates: Requirements 2.3, 3.3, 4.3
// ---------------------------------------------------------------------------

describe('Property 8: Invalid time inputs are not applied as filters', () => {
  it('validateMaxTimeInput returns { error } for non-negative-integer strings', () => {
    // Arbitrary for strings that are NOT valid non-negative integers
    const invalidRawArb = fc.oneof(
      // Negative integers
      fc.integer({ min: -10000, max: -1 }).map(String),
      // Decimals (non-integer numbers): generate as "integer.fraction" strings
      fc
        .tuple(fc.integer({ min: 0, max: 9999 }), fc.integer({ min: 1, max: 99 }))
        .map(([whole, frac]) => `${whole}.${frac}`),
      // Non-numeric strings (at least one char, not parseable as a number)
      fc
        .string({ minLength: 1, maxLength: 20 })
        .filter((s) => s.trim() !== '' && Number.isNaN(Number(s))),
    );

    fc.assert(
      fc.property(invalidRawArb, (raw) => {
        const result = validateMaxTimeInput(raw);
        expect(result.value).toBeUndefined();
        expect(typeof result.error).toBe('string');
        expect((result.error as string).length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });
});
