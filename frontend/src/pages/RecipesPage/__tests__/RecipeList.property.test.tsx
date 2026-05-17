import * as fc from 'fast-check';

/**
 * Pure functions matching the filter/tag-cloud logic used inside RecipeList.
 * These mirror the inline `useMemo` filter and the tag-cloud derivation so we can
 * exercise the logic via property-based tests without rendering the component.
 *
 * Feature: recipe-categories
 */

function filterRecipes<T extends { name: string; tags?: string[] }>(
  recipes: T[],
  search: string,
  activeTagFilters: string[],
): T[] {
  return recipes
    .filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))
    .filter((r) => activeTagFilters.every((t) => (r.tags ?? []).includes(t)));
}

function computeAllDistinctTags<T extends { tags?: string[] }>(recipes: T[]): string[] {
  const all = new Set<string>();
  for (const r of recipes) {
    for (const tag of r.tags ?? []) {
      all.add(tag);
    }
  }
  return [...all].sort();
}

const recipeArb = fc.record({
  recipeId: fc.string({ minLength: 1, maxLength: 10 }),
  name: fc.string({ minLength: 1, maxLength: 20 }),
  tags: fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 5 }),
});

describe('RecipeList filter — property tests', () => {
  /**
   * Feature: recipe-categories, Property 2: AND filter correctness
   * Validates: Requirements 6.2, 8.2
   *
   * For any recipes and filter set, the filtered result contains exactly the
   * recipes whose tags include every tag in the active filter set.
   */
  it('Property 2: filter returns exactly the recipes containing all filter tags', () => {
    fc.assert(
      fc.property(
        fc.array(recipeArb, { maxLength: 20 }),
        fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 5 }),
        (recipes, filters) => {
          const result = filterRecipes(recipes, '', filters);

          // Every recipe in the result has all filter tags
          for (const r of result) {
            for (const t of filters) {
              expect((r.tags ?? []).includes(t)).toBe(true);
            }
          }

          // Every recipe NOT in the result either does not satisfy the AND filter.
          // (Search is '' so the name filter is a no-op.)
          for (const r of recipes) {
            if (!result.includes(r)) {
              const hasAll = filters.every((t) => (r.tags ?? []).includes(t));
              expect(hasAll).toBe(false);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: recipe-categories, Property 3: Filter result is a subset
   * Validates: Requirements 8.3
   *
   * Every recipe in the filtered result also appears in the original list.
   */
  it('Property 3: filter result is a subset of the original list', () => {
    fc.assert(
      fc.property(
        fc.array(recipeArb, { maxLength: 20 }),
        fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 5 }),
        (recipes, filters) => {
          const result = filterRecipes(recipes, '', filters);
          for (const r of result) {
            expect(recipes).toContain(r);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: recipe-categories, Property 4: Empty filter returns full list
   * Validates: Requirements 6.4, 8.4
   *
   * Filtering with an empty active filter set returns all recipes unchanged
   * (when the name search is also empty).
   */
  it('Property 4: filtering with empty active filter set returns all recipes (search empty)', () => {
    fc.assert(
      fc.property(fc.array(recipeArb, { maxLength: 20 }), (recipes) => {
        const result = filterRecipes(recipes, '', []);
        expect(result).toEqual(recipes);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: recipe-categories, Property 10: Tag cloud shows sorted distinct tags
   * Validates: Requirements 6.1
   *
   * The tags displayed in the tag cloud equal the sorted, deduplicated union
   * of all `recipe.tags` arrays across all recipes.
   */
  it('Property 10: tag cloud shows sorted distinct union of all recipe tags', () => {
    fc.assert(
      fc.property(fc.array(recipeArb, { maxLength: 20 }), (recipes) => {
        const result = computeAllDistinctTags(recipes);

        // Sorted
        const sorted = [...result].sort();
        expect(result).toEqual(sorted);

        // Distinct
        expect(new Set(result).size).toBe(result.length);

        // Union: every tag in any recipe is in the result
        for (const r of recipes) {
          for (const tag of r.tags ?? []) {
            expect(result).toContain(tag);
          }
        }
      }),
      { numRuns: 50 },
    );
  });
});
