/**
 * Property-based tests for AddRecipeDialog recipe ordering.
 * Feature: meal-planner
 */

// Feature: meal-planner, Property 6: Available recipes are ordered alphabetically, case-insensitively, with no loss

import * as fc from 'fast-check';
import { sortRecipes } from '../AddRecipeDialog';
import { type PlannableRecipe } from '../../../api/meal-plans/meal-plans';

/* ── Arbitrary: PlannableRecipe ─────────────────────────────────── */

/**
 * Generates PlannableRecipe objects with arbitrary, possibly mixed-case or
 * Unicode names. Name length is 1–80 to avoid empty-string edge cases while
 * still exercising Unicode characters beyond ASCII.
 */
const plannableRecipeArb: fc.Arbitrary<PlannableRecipe> = fc.record({
  recipeId: fc.uuid(),
  // unicode strings cover ASCII, accented chars, CJK, emoji, mixed case, etc.
  name: fc.string({ minLength: 1, maxLength: 80 }),
});

/* ── Property 6: Available recipes are ordered alphabetically, case-insensitively, with no loss ── */

describe('Property 6: Available recipes are ordered alphabetically, case-insensitively, with no loss', () => {
  it(
    'sortRecipes produces same length, preserves every recipe by recipeId, and is case-insensitively alphabetical',
    () => {
      fc.assert(
        fc.property(
          fc.array(plannableRecipeArb, { minLength: 0, maxLength: 50 }),
          (recipes) => {
            const sorted = sortRecipes(recipes);

            // (a) same length as input — no recipes are dropped
            expect(sorted).toHaveLength(recipes.length);

            // (b) every input recipe appears exactly once in the output (by recipeId)
            const inputIds = recipes.map((r) => r.recipeId).sort();
            const outputIds = sorted.map((r) => r.recipeId).sort();
            expect(outputIds).toEqual(inputIds);

            // (c) the output is ordered by name using case-insensitive comparison —
            //     each consecutive pair must satisfy localeCompare(..., { sensitivity: 'base' }) ≤ 0
            for (let i = 0; i < sorted.length - 1; i++) {
              const cmp = sorted[i].name.localeCompare(sorted[i + 1].name, undefined, {
                sensitivity: 'base',
              });
              expect(cmp).toBeLessThanOrEqual(0);
            }

            // (d) sortRecipes does not mutate the original array
            expect(sorted).not.toBe(recipes);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
