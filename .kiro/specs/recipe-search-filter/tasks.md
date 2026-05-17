# Implementation Plan: Recipe Search & Filter

## Overview

Add a `RecipeFilterPanel` to the Recipes page hosting four new filters (max prep time, max cook time, max total time, "Only recipes I can make now") that compose additively with the existing name-search input and tag-cloud filter. The work is contained to the frontend.

The implementation follows the design's File Layout Summary in order: pure helpers under `frontend/src/api/recipes/` first (`availability.ts`, then `filter.ts`), then the `RecipeFilterPanel` component, then the `RecipeList` integration, and finally the `RecipesPage` inventory fetch on mount. Tests are colocated per module with `.test.ts(x)` for unit/example tests and `.property.test.ts(x)` for fast-check property tests (`numRuns: 100`).

## Tasks

- [x] 1. Add the inventory-index helpers in `frontend/src/api/recipes/availability.ts`
  - [x] 1.1 Create `frontend/src/api/recipes/availability.ts` with `InventoryIndex`, `buildInventoryIndex`, and `computeAllAvailable`
    - Export `type InventoryIndex = Map<string, number>`
    - Export `buildInventoryIndex(items: { name: string; quantity: number }[]): InventoryIndex` — sums quantities into a lowercase-name keyed `Map`; pure, does not mutate inputs
    - Export `computeAllAvailable(ingredients: RecipeIngredient[], inventoryIndex: InventoryIndex): boolean` — returns `false` as soon as any ingredient's required quantity exceeds the index value (treating absent keys as `0`); empty ingredient lists return `true` (vacuous)
    - Import `RecipeIngredient` from `./recipes`
    - _Requirements: 5.1, 5.3, 5.4, 5.5_

  - [x] 1.2 Write unit tests in `frontend/src/api/recipes/__tests__/availability.test.ts`
    - `buildInventoryIndex` produces an empty `Map` for an empty input
    - `buildInventoryIndex` lowercases names — items `"Eggs"` and `"eggs"` are merged into one entry whose value is the sum of their quantities
    - `computeAllAvailable` returns `true` for an empty ingredient list (vacuous)
    - `computeAllAvailable` returns `false` when any ingredient's required quantity exceeds the index value
    - `computeAllAvailable` against an empty `InventoryIndex` returns `false` for any recipe with at least one ingredient (Requirement 5.4)
    - _Requirements: 5.1, 5.3, 5.4, 5.5_

  - [x] 1.3 Write property test in `frontend/src/api/recipes/__tests__/availability.property.test.ts`
    - `// Feature: recipe-search-filter, Property 7: Inventory index sums correctly per lowercase name`
    - For any list of inventory items `I` and any string `name`, `buildInventoryIndex(I).get(name.toLowerCase())` equals the sum of `item.quantity` over items whose lowercased name matches; absent key resolves to `undefined` (treated as `0`)
    - Use `{ numRuns: 100 }`
    - **Validates: Requirement 5.5**

- [x] 2. Add the filter helpers in `frontend/src/api/recipes/filter.ts`
  - [x] 2.1 Create `frontend/src/api/recipes/filter.ts` with `RecipeFilters`, `EMPTY_FILTERS`, `validateMaxTimeInput`, and `filterRecipes`
    - Export `interface RecipeFilters { nameQuery: string; activeTags: string[]; maxPrepTime?: number; maxCookTime?: number; maxTotalTime?: number; onlyAllAvailable: boolean }`
    - Export `EMPTY_FILTERS: RecipeFilters` with `nameQuery: ''`, `activeTags: []`, all `max*Time` undefined, `onlyAllAvailable: false`
    - Export `validateMaxTimeInput(raw: string): { value?: number; error?: string }` — returns `{}` for `''`; returns `{ error: 'Enter a non-negative whole number.' }` when `Number(raw)` is NaN, not an integer, or negative; returns `{ value: n }` for valid non-negative integers
    - Export `filterRecipes(recipes: Recipe[], filters: RecipeFilters, inventoryIndex: InventoryIndex): Recipe[]` — pure, AND across active filters, preserves input order, uses `computeTotalTime` from `./recipes` and `computeAllAvailable` from `./availability`
    - Filter semantics per the design: `nameQuery` is case-insensitive substring match (after `trim().toLowerCase()`); `activeTags` requires every tag to be in `(recipe.tags ?? [])`; `maxPrepTime` excludes recipes with `prepTime === undefined`; `maxCookTime` excludes recipes with `cookTime === undefined`; `maxTotalTime` excludes recipes whose `computeTotalTime(prepTime, cookTime)` is `undefined`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.3, 5.4, 6.1, 6.2, 6.3_

  - [x] 2.2 Write unit tests in `frontend/src/api/recipes/__tests__/filter.test.ts`
    - `filterRecipes` with `EMPTY_FILTERS` returns the input unchanged (same recipes, same order)
    - `filterRecipes` with `nameQuery` filters case-insensitively on `recipe.name`
    - `filterRecipes` honours `activeTags` with AND across tags (sanity check that the existing tag-filter behaviour is preserved through the new helper)
    - `filterRecipes` excludes recipes with `prepTime === undefined` when `maxPrepTime` is set (Requirement 2.4)
    - `filterRecipes` excludes recipes with `cookTime === undefined` when `maxCookTime` is set (Requirement 3.4)
    - `filterRecipes` excludes recipes with neither `prepTime` nor `cookTime` when `maxTotalTime` is set (Requirement 4.4)
    - `filterRecipes` total-time predicate uses `computeTotalTime` (recipe with `prepTime: 5, cookTime: 10` is included by `maxTotalTime: 15` and excluded by `maxTotalTime: 14`) (Requirement 4.5)
    - `filterRecipes` with `onlyAllAvailable: true` and an empty `InventoryIndex` excludes every recipe with at least one ingredient (Requirement 5.4)
    - `validateMaxTimeInput('')` returns `{}`; `validateMaxTimeInput('15')` returns `{ value: 15 }`; `validateMaxTimeInput('-1')`, `validateMaxTimeInput('1.5')`, and `validateMaxTimeInput('abc')` return a non-empty `error` and no `value` (Requirements 2.3, 3.3, 4.3)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.3, 5.4, 6.1, 6.2, 6.3_

  - [x] 2.3 Write property tests in `frontend/src/api/recipes/__tests__/filter.property.test.ts`
    - `// Feature: recipe-search-filter, Property 1: Filter result is a subset of the input`
      - For any recipes, any inventory items, any filter values: every recipe in the result is also in the input
      - **Validates: Requirements 2.1, 3.1, 4.1, 5.1, 6.1**
    - `// Feature: recipe-search-filter, Property 2: All filters inactive returns the full list unchanged`
      - For any recipes and any inventory items: `filterRecipes(recipes, EMPTY_FILTERS, idx)` returns the input list with the same recipes in the same order
      - **Validates: Requirements 2.2, 3.2, 4.2, 5.2, 6.2**
    - `// Feature: recipe-search-filter, Property 3: Time filter inclusion predicate (prep, cook, total)`
      - For any recipes, any non-negative integer `V`, and any inventory items, run three branches in a single test:
        - With only `maxPrepTime = V` active: a recipe is in the result iff `recipe.prepTime !== undefined && recipe.prepTime <= V`
        - With only `maxCookTime = V` active: a recipe is in the result iff `recipe.cookTime !== undefined && recipe.cookTime <= V`
        - With only `maxTotalTime = V` active: a recipe is in the result iff `computeTotalTime(recipe.prepTime, recipe.cookTime) !== undefined && that total <= V`
      - **Validates: Requirements 2.1, 2.4, 3.1, 3.4, 4.1, 4.4, 4.5**
    - `// Feature: recipe-search-filter, Property 4: All-available inclusion predicate`
      - For any recipes and any inventory items, with only `onlyAllAvailable: true` active: a recipe is in the result iff `computeAllAvailable(recipe.ingredients, idx)` is `true`
      - **Validates: Requirements 5.1, 5.3, 5.4, 5.5**
    - `// Feature: recipe-search-filter, Property 5: AND conjunction correctness`
      - For any recipes, any inventory items, and any filter values: `filterRecipes(recipes, filters, idx)` equals the order-preserving intersection of the per-filter results computed one filter at a time
      - **Validates: Requirements 6.1, 6.3**
    - `// Feature: recipe-search-filter, Property 6: Filter idempotence`
      - For any recipes, any inventory items, and any filter `f`: `filterRecipes(filterRecipes(recipes, f, idx), f, idx)` equals `filterRecipes(recipes, f, idx)`
      - **Validates: Requirements 2.1, 3.1, 4.1, 5.1, 6.1**
    - `// Feature: recipe-search-filter, Property 8: Invalid time inputs are not applied as filters`
      - For any non-empty raw string that does not represent a non-negative integer (negatives, decimals, non-numeric): `validateMaxTimeInput(raw)` returns `{ value: undefined, error: <non-empty string> }`
      - **Validates: Requirements 2.3, 3.3, 4.3**
    - All properties use `{ numRuns: 100 }`

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Build the `RecipeFilterPanel` component
  - [x] 4.1 Create `frontend/src/pages/RecipesPage/RecipeFilterPanel.tsx`
    - Export `interface RecipeFilterPanelValue { maxPrepTimeInput: string; maxCookTimeInput: string; maxTotalTimeInput: string; onlyAllAvailable: boolean }`
    - Export `EMPTY_PANEL_VALUE: RecipeFilterPanelValue` and a small `isAllInactive(value)` helper
    - Export `interface RecipeFilterPanelProps { value: RecipeFilterPanelValue; onChange: (next: RecipeFilterPanelValue) => void; isAllInactive: boolean; onClear: () => void; inventoryLoading?: boolean }`
    - Render three labelled `<input type="number" min="0" step="1">` controls — "Max prep time (min)", "Max cook time (min)", "Max total time (min)" — and a labelled `<input type="checkbox">` toggle "Only recipes I can make now" inside its `<label>` (min-height 44px tap target)
    - Render an inline `<p>` validation error below each numeric input when `validateMaxTimeInput(value).error` is set, using the existing `RecipeEditor` `fieldError` style (`#dc2626`, font-size `0.8125rem`); link via `aria-describedby`
    - Render a "Clear filters" button; `disabled={isAllInactive}`; calls `onClear` on click
    - When `inventoryLoading === true`, render an inline "Loading inventory…" hint next to the toggle
    - Wrap the panel root in `<section role="region" aria-label="Recipe filters">` with inline `React.CSSProperties` styles per project convention; reuse the tag-cloud palette (`#dbeafe`/`#1e40af`) for the active toggle state
    - Import `validateMaxTimeInput` from `frontend/src/api/recipes/filter`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.3, 3.3, 4.3, 8.1, 8.2_

  - [x] 4.2 Write unit tests in `frontend/src/pages/RecipesPage/__tests__/RecipeFilterPanel.test.tsx`
    - Renders the four labelled controls and the "Clear filters" button (Requirements 1.2-1.6)
    - Typing a valid value calls `onChange` with the new raw input preserved
    - Typing `"-1"` shows the inline error message and the resolved helper output for that field is `{ value: undefined, error }` (Requirement 2.3)
    - Typing `"1.5"` shows the inline error message (Requirements 2.3, 3.3, 4.3)
    - Typing `"abc"` shows the inline error message (Requirements 2.3, 3.3, 4.3)
    - Toggling "Only recipes I can make now" calls `onChange` with `onlyAllAvailable: true`
    - Clicking "Clear filters" calls `onClear`
    - "Clear filters" is `disabled` when `isAllInactive === true` and enabled otherwise (Requirement 8.2)
    - When `inventoryLoading === true`, the "Loading inventory…" hint is rendered next to the toggle
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 2.3, 3.3, 4.3, 5.1, 8.2_

  - [x] 4.3 Write property tests in `frontend/src/pages/RecipesPage/__tests__/RecipeFilterPanel.property.test.tsx`
    - `// Feature: recipe-search-filter, Property 9: Clear filters resets the panel`
      - For any `RecipeFilterPanelValue` `v`, clicking "Clear filters" produces a panel value equal to `EMPTY_PANEL_VALUE`
      - **Validates: Requirements 1.6, 8.1**
    - `// Feature: recipe-search-filter, Property 10: Clear filters disabled iff all controls inactive`
      - For any `RecipeFilterPanelValue` `v`, the rendered "Clear filters" button's `disabled` attribute equals `isAllInactive(v)` (i.e., all three inputs empty AND `onlyAllAvailable === false`)
      - **Validates: Requirement 8.2**
    - Both properties use `{ numRuns: 100 }`

- [x] 5. Wire `RecipeFilterPanel` into `RecipeList`
  - [x] 5.1 Update `frontend/src/pages/RecipesPage/RecipeList.tsx` to accept and use the inventory props and the panel
    - Add `inventoryIndex: InventoryIndex` and `inventoryLoading: boolean` to `RecipeListProps`
    - Add `const [panel, setPanel] = useState<RecipeFilterPanelValue>(EMPTY_PANEL_VALUE)`
    - Render `<RecipeFilterPanel ... />` between the existing `TagCloud` section and the recipe list, passing `panel`, `setPanel`, `isAllInactive(panel)`, an `onClear` handler that resets `panel` to `EMPTY_PANEL_VALUE`, and `inventoryLoading`
    - Replace the existing inline `recipes.filter(...)` chain with a single `useMemo` over `filterRecipes(recipes, resolvedFilters, inventoryIndex)` where `resolvedFilters` builds the `RecipeFilters` object from `search`, `activeTagFilters`, the three resolved `validateMaxTimeInput(...)` values, and `panel.onlyAllAvailable`; depend on `[recipes, search, activeTagFilters, panel, inventoryIndex]`
    - Add `isAnyFilterActive` derived from `search.trim() !== '' || activeTagFilters.length > 0 || panel.maxPrepTimeInput !== '' || panel.maxCookTimeInput !== '' || panel.maxTotalTimeInput !== '' || panel.onlyAllAvailable`
    - _Requirements: 1.1, 1.7, 6.1, 6.2, 6.3_

  - [x] 5.2 Update the empty-state branch in `RecipeList.tsx` for the unified message
    - When `recipes.length === 0`: keep the existing "No recipes yet. Tap "New Recipe" to add one." message (Requirement 7.2)
    - Else when `filtered.length === 0 && isAnyFilterActive`: render `"No recipes match the selected filters."` (Requirement 7.1) — replaces the previous tag-only message
    - Else when `filtered.length === 0`: keep the existing "No recipes match your search." fallback for an empty search input
    - _Requirements: 7.1, 7.2_

  - [x] 5.3 Update unit tests in `frontend/src/pages/RecipesPage/__tests__/RecipeList.test.tsx`
    - The filter panel renders below the tag cloud and above the recipe list (Requirement 1.1 — DOM-order check)
    - Setting "Max prep time (min)" to `"15"` excludes recipes with `prepTime > 15` and recipes with no `prepTime` (Requirements 2.1, 2.4)
    - Setting "Max cook time (min)" excludes accordingly (Requirements 3.1, 3.4)
    - Setting "Max total time (min)" excludes accordingly using `computeTotalTime` (Requirements 4.1, 4.4, 4.5)
    - Activating "Only recipes I can make now" with a non-empty `inventoryIndex` excludes recipes with at least one missing or partial ingredient (Requirements 5.1, 5.3)
    - Activating "Only recipes I can make now" with an empty `inventoryIndex` excludes every recipe with at least one ingredient (Requirement 5.4)
    - When `recipes.length > 0` but the active filter combination produces an empty result, the message "No recipes match the selected filters." is shown (Requirement 7.1)
    - When `recipes.length === 0`, the existing "No recipes yet." message is shown and the filter empty-result message is NOT shown (Requirement 7.2)
    - Combining a name-search query, an active tag filter, and a `maxPrepTime` value applies all three (Requirements 6.1, 6.3)
    - _Requirements: 1.1, 2.1, 2.4, 3.1, 3.4, 4.1, 4.4, 4.5, 5.1, 5.3, 5.4, 6.1, 6.3, 7.1, 7.2_

- [x] 6. Fetch the inventory on mount in `RecipesPage` and pass the index down
  - [x] 6.1 Update `frontend/src/pages/RecipesPage/RecipesPage.tsx` to fetch the inventory in parallel with recipes/tags
    - Add `const [inventoryIndex, setInventoryIndex] = useState<InventoryIndex>(new Map())` and `const [inventoryLoading, setInventoryLoading] = useState(true)`
    - Add a mount `useEffect` that calls `fetchInventory()` from `frontend/src/api/inventory/inventory`, builds the index via `buildInventoryIndex(res.items)`, sets `inventoryIndex`, and sets `inventoryLoading` to `false` in `finally`
    - Use a `cancelled` flag in the cleanup so a late response after unmount is ignored
    - The fetch must run in parallel with the existing `fetchRecipes`/`fetchRecipeTags` calls (no `await` chaining between them), satisfying the parallel-fetch behaviour described in the design
    - On rejection, swallow the error (silent fail) — `inventoryIndex` stays as the initial empty `Map`, `inventoryLoading` becomes `false`
    - Pass `inventoryIndex` and `inventoryLoading` to `RecipeList` only (not to `RecipeEditor` or `RecipeDetail`)
    - _Requirements: 1.7, 5.1, 5.4, 5.5_

  - [x] 6.2 Add unit tests in `frontend/src/pages/RecipesPage/__tests__/RecipesPage.test.tsx` (create the file if it does not exist)
    - On mount, `fetchInventory` is called in parallel with `fetchRecipes` and `fetchRecipeTags` (all three calls fire before any of them resolves)
    - `inventoryIndex` and `inventoryLoading` are passed to `RecipeList`
    - A failed `fetchInventory` call does not crash the page — the page continues to render and `RecipeList` receives an empty `InventoryIndex` (silent-fail behaviour)
    - Navigating to detail then back to list resets the filter inputs to empty (Requirement 1.7) — the panel mounts clean because `RecipesPage` unmounts `RecipeList` on view change
    - _Requirements: 1.7, 5.1, 5.4, 5.5_

- [x] 7. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP.
- Each task references specific requirements for traceability; property tasks additionally name the design property they validate.
- All property-based tests use `fast-check` with `{ numRuns: 100 }` and are tagged `// Feature: recipe-search-filter, Property N: <title>` per the design.
- The `frontend/src/api/recipes/recipes.ts` module is unchanged — `computeTotalTime`, `scaleIngredients`, `fetchRecipes`, `fetchRecipeTags`, etc. continue to live there. The new helpers are kept in their own focused modules (`availability.ts`, `filter.ts`) so each module owns one concern and the property tests can be colocated.
- No backend, infrastructure, or shared-type files change as part of this feature.
- Filter state reset on navigation (Requirement 1.7) is satisfied by `RecipesPage` unmounting `RecipeList` when the view changes — no extra logic is needed.
- The 200 ms perf budget (Requirement 9.1) is enforced by the algorithmic analysis in the design (O(R × max-ingredients) `Map.get` lookups at 500 recipes / 500 inventory items); no automated perf test is added because Jest+jsdom is unsuitable for measuring real-device latency.

## Workflow Completion

This workflow is complete once `tasks.md` is created. To begin executing tasks, open `.kiro/specs/recipe-search-filter/tasks.md` and click "Start task" next to a task item. The implementation should not begin as part of this workflow.
