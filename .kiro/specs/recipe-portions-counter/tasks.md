# Implementation Plan: Recipe Portions Counter

## Overview

Add a `portions` field to the Recipe entity and a `scaleIngredients` pure function that scales ingredient quantities proportionally. Changes flow through five layers in order: backend pure functions and validation, backend persistence (create + update), API client types, `RecipeEditor` form (create mode input + edit mode scaler controls), and `RecipeDetail` / `RecipeList` display components.

## Tasks

- [x] 1. Add pure helper functions to the backend recipe handler
  - [x] 1.1 Implement `validatePortions` in `backend/src/handlers/recipe/recipe.ts`
    - Export a pure function `validatePortions(parsed: Record<string, unknown>): string | null`
    - Returns `'portions must be a positive integer'` when `portions` is present but not a positive integer; returns `null` when absent or valid
    - Absence is not an error here — the caller checks for required presence separately
    - _Requirements: 2.2, 2.3, 2.5_

  - [x] 1.2 Implement `scaleIngredients` in `backend/src/handlers/recipe/recipe.ts`
    - Export a pure function `scaleIngredients(ingredients: RecipeIngredient[], fromPortions: number, toPortions: number): number[]`
    - Returns a new array of scaled quantities (rounded to at most 2 decimal places via `Math.round(q * 100) / 100`)
    - Does NOT mutate the input ingredients
    - _Requirements: 5.1, 5.3, 7.1, 7.2, 7.3, 7.4_

  - [ ]* 1.3 Write property tests for `scaleIngredients` (Properties 4–8, 10)
    - Create `backend/src/handlers/recipe/__tests__/recipe.property.test.ts` (or add to existing if present)
    - **Property 4: Scaling Identity at Base Portions** — `scaleIngredients(ings, p, p)` returns quantities equal to originals (tolerance 0.01). **Validates: Requirement 7.2**
    - **Property 5: Scaling Proportionality** — `scaledQty / baseQty ≈ toPortions / fromPortions` for non-zero base quantities (tolerance 0.01). **Validates: Requirements 5.1, 7.1**
    - **Property 6: Scaling Non-Negativity** — all returned quantities are ≥ 0. **Validates: Requirement 7.3**
    - **Property 7: Scaling Immutability** — input ingredient objects are not mutated. **Validates: Requirement 7.4**
    - **Property 8: Scaling Rounding** — every result satisfies `Math.round(q * 100) / 100 === q`. **Validates: Requirements 3.7, 5.3**
    - **Property 10: Edit-Mode Rebase Composability** — two sequential rebases P→P₁→P₂ produce the same result as a single rebase P→P₂ (tolerance 0.01). **Validates: Requirement 3.6**

- [x] 2. Wire portions validation and persistence into the backend handler
  - [x] 2.1 Add `portions` to the `Recipe` interface in `backend/src/handlers/recipe/recipe.ts`
    - Add `portions: number` as a mandatory field on the `Recipe`-related types used in the handler
    - _Requirements: 2.1, 2.7, 2.8_

  - [x] 2.2 Validate and persist `portions` in `createRecipe`
    - After existing validations, call `validatePortions(parsed)`; if it returns an error string, return 400 with `VALIDATION_ERROR` and `details: [{ field: 'portions', message }]`
    - If `parsed.portions === undefined`, return 400 with `portions is required`
    - Set `recipe.portions = parsed.portions as number` in the recipe object before `PutCommand`
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 2.3 Validate and persist `portions` in `updateRecipe`
    - Call `validatePortions(parsed)` after existing validations; return 400 on error
    - Add `portions: 'portions'` to the `updatableFields` map so it is included in the SET expression when present
    - `portions` is never `null` in update (unlike `prepTime`/`cookTime`) — omitting it leaves the existing value unchanged
    - _Requirements: 2.4, 2.5, 2.6_

  - [ ]* 2.4 Write unit tests for portions validation in `backend/src/handlers/recipe/__tests__/recipe.test.ts`
    - `POST /recipes` with valid `portions` returns 201 with `portions` in the response
    - `POST /recipes` without `portions` returns 400 identifying `portions` field
    - `POST /recipes` with `portions: 0` returns 400 identifying `portions` field
    - `POST /recipes` with `portions: -1` returns 400 identifying `portions` field
    - `POST /recipes` with `portions: 1.5` returns 400 identifying `portions` field
    - `PUT /recipes/{recipeId}` with valid `portions` updates the field
    - `PUT /recipes/{recipeId}` without `portions` leaves existing value unchanged
    - `GET /recipes/{recipeId}` returns `portions` when stored
    - `GET /recipes` returns `portions` in each recipe object
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [ ]* 2.5 Write property test for portions persistence round-trip (Property 1)
    - **Property 1: Portions Field Persistence Round-Trip**
    - Generate `fc.integer({ min: 1, max: 1000 })` for `portions`; mock DynamoDB `PutCommand` + `GetCommand`; call `createRecipe` handler; assert `response.recipe.portions === portions`
    - Add to `backend/src/handlers/recipe/__tests__/recipe.property.test.ts`
    - **Validates: Requirements 2.1, 2.7**

  - [ ]* 2.6 Write property test for invalid portions rejection (Property 2)
    - **Property 2: Invalid Portions Rejection (Backend)**
    - Generate invalid values: `fc.oneof(fc.constant(0), fc.integer({ max: -1 }), fc.float().filter(n => !Number.isInteger(n) && n > 0), fc.string().filter(s => isNaN(Number(s))))`
    - Call `createRecipe` handler; assert 400 with `details` identifying `portions` field; assert `PutCommand` not called
    - Add to `backend/src/handlers/recipe/__tests__/recipe.property.test.ts`
    - **Validates: Requirements 2.2, 2.3, 2.5**

  - [ ]* 2.7 Write property test for portions omission preserving existing value (Property 3)
    - **Property 3: Portions Omission Preserves Existing Value (Backend)**
    - Generate `fc.integer({ min: 1, max: 1000 })` for existing `portions`; mock `UpdateCommand` to return `Attributes` with that value; call `updateRecipe` without `portions` in body; assert returned `recipe.portions` equals the original
    - Add to `backend/src/handlers/recipe/__tests__/recipe.property.test.ts`
    - **Validates: Requirement 2.6**

- [x] 3. Checkpoint — Ensure all backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Extend the frontend API client
  - [x] 4.1 Add `portions: number` to the `Recipe` interface in `frontend/src/api/recipes/recipes.ts`
    - _Requirements: 2.1, 2.7, 2.8_

  - [x] 4.2 Export `scaleIngredients` from `frontend/src/api/recipes/recipes.ts`
    - Implement the same pure function as in the backend: `scaleIngredients(ingredients: RecipeIngredient[], fromPortions: number, toPortions: number): number[]`
    - Rounds to at most 2 decimal places; does not mutate inputs
    - _Requirements: 5.1, 5.3, 7.1, 7.2, 7.3, 7.4_

  - [x] 4.3 Update `updateRecipe` signature to include optional `portions` in the data parameter
    - Extend the `data` type to include `portions?: number` in the `Partial<Pick<...>>` union
    - _Requirements: 2.4, 3.9_

  - [ ]* 4.4 Write unit tests for the updated API client in `frontend/src/api/recipes/__tests__/recipes.test.ts`
    - `createRecipe` with `portions` sends it in the request body
    - `updateRecipe` with `portions` sends it in the request body
    - `updateRecipe` without `portions` does not include it in the request body
    - _Requirements: 2.1, 2.4_

- [x] 5. Add portions input to RecipeEditor (create mode)
  - [x] 5.1 Add `portions` state and error key to `RecipeEditor.tsx`
    - Add `const [portions, setPortions] = useState<string>('')` for create mode
    - Add `portions?: string` to the `FormErrors` interface
    - In create mode, `portions` is a plain mandatory input — changing it does NOT recalculate ingredient quantities
    - _Requirements: 1.1, 1.4_

  - [x] 5.2 Render the mandatory `portions` number input in the form (create mode only)
    - Label: "Portions", `id="recipe-portions"`, `type="number"`, `min="1"`, `step="1"`, `aria-required="true"`
    - Position below the time fields and above the ingredients section
    - Display inline field error below the input using the existing `fieldError` style
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 5.3 Add client-side validation for `portions` inside the `validate()` function
    - Implement `validatePortionsField(value: string): string | undefined` — returns `'Portions is required.'` when empty; returns `'Portions must be a positive whole number (at least 1).'` when not a positive integer
    - Call it and attach the error to `errs.portions`
    - _Requirements: 1.2, 1.3_

  - [x] 5.4 Include `portions` in the create recipe API payload in `handleSubmit`
    - In create mode, pass `portions: Number(portions)` in the payload to `createRecipe`
    - _Requirements: 1.5_

  - [ ]* 5.5 Write unit tests for RecipeEditor portions input (create mode) in `frontend/src/pages/RecipesPage/__tests__/RecipeEditor.test.tsx`
    - Renders a labeled "Portions" input in create mode
    - Shows validation error when `portions` is empty on submit
    - Shows validation error when `portions` is 0 or negative on submit
    - Does not recalculate ingredient quantities when `portions` changes in create mode
    - Includes `portions` in the create API call payload
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [ ]* 5.6 Write property test for create-mode portions not affecting ingredient quantities (Property 9)
    - **Property 9: Create-Mode Portions Does Not Affect Ingredient Quantities**
    - Generate arbitrary ingredient quantities and positive integer `portions` values; render `RecipeEditor` in create mode; change the `portions` field; assert all ingredient quantity fields are unchanged
    - Create `frontend/src/pages/RecipesPage/__tests__/RecipeEditor.property.test.tsx`
    - **Validates: Requirement 1.4**

- [x] 6. Add portions scaler controls to RecipeEditor (edit mode)
  - [x] 6.1 Add `selectedPortions` state to `RecipeEditor.tsx` for edit mode
    - Add `const [selectedPortions, setSelectedPortions] = useState<number>(1)`
    - In edit mode pre-population, set `selectedPortions` from `recipe.portions ?? 1`
    - _Requirements: 3.1_

  - [x] 6.2 Render `+`/`–` scaler controls adjacent to the portions value in edit mode
    - Replace the plain `portions` input with a scaler control: `[ – ] [ N portions ] [ + ]`
    - Disable the `–` button when `selectedPortions === 1`
    - _Requirements: 3.2, 3.5_

  - [x] 6.3 Implement `handlePortionsIncrement` and `handlePortionsDecrement` in `RecipeEditor.tsx`
    - Increment: call `scaleIngredients(prev, selectedPortions, selectedPortions + 1)`, update ingredient rows with scaled quantities, then increment `selectedPortions`
    - Decrement: guard `selectedPortions > 1`; call `scaleIngredients(prev, selectedPortions, selectedPortions - 1)`, update ingredient rows, then decrement `selectedPortions`
    - Each recalculation is relative to the current form field values, not the originally loaded quantities
    - Scaled quantities are rounded to at most 2 decimal places (handled by `scaleIngredients`)
    - _Requirements: 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x] 6.4 Include `selectedPortions` as `portions` in the edit recipe API payload in `handleSubmit`
    - Pass `portions: selectedPortions` in the payload to `updateRecipe`
    - _Requirements: 3.9_

  - [ ]* 6.5 Write unit tests for RecipeEditor scaler controls (edit mode) in `frontend/src/pages/RecipesPage/__tests__/RecipeEditor.test.tsx`
    - Renders `+`/`–` controls in edit mode instead of a plain input
    - Pre-populates `selectedPortions` from `recipe.portions`
    - Disables `–` button when `selectedPortions === 1`
    - Recalculates ingredient quantity fields when `+` is tapped
    - Recalculates ingredient quantity fields when `–` is tapped
    - Includes `selectedPortions` as `portions` in the update API call payload
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.9_

  - [ ]* 6.6 Write property test for invalid portions rejection in frontend (Property 2 — frontend)
    - **Property 2 (Frontend): Invalid Portions Rejection (Frontend)**
    - Generate non-positive-integer values; simulate user input in create mode; assert validation error is shown and no `fetch` call is made
    - Add to `frontend/src/pages/RecipesPage/__tests__/RecipeEditor.property.test.tsx`
    - **Validates: Requirements 1.2, 1.3**

- [x] 7. Checkpoint — Ensure all frontend editor tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Add portions scaler and scaled ingredient display to RecipeDetail
  - [x] 8.1 Add `selectedPortions` state to `RecipeDetail.tsx`
    - Add `const [selectedPortions, setSelectedPortions] = useState<number>(data?.recipe.portions ?? 1)`
    - Reset `selectedPortions` to `data.recipe.portions` in a `useEffect` keyed on `data?.recipe.recipeId` so navigating to a different recipe resets the counter
    - _Requirements: 4.1, 4.7_

  - [x] 8.2 Render `+`/`–` scaler controls in `RecipeDetail.tsx`
    - Add a `<section aria-label="Portions">` between the time section and `IngredientAvailability`
    - Render `[ – ] [ N ] [ + ]` with a label identifying the value as the serving count
    - Disable `–` when `selectedPortions === 1`
    - Increment/decrement handlers must NOT make any API call
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6, 4.8_

  - [x] 8.3 Render scaled ingredient quantities in `RecipeDetail.tsx`
    - Compute `displayedIngredients` inline (no extra state): `recipe.ingredients.map((ing, i) => ({ ...ing, quantity: scaleIngredients(recipe.ingredients, recipe.portions ?? 1, selectedPortions)[i] }))`
    - Add an `IngredientsDisplay` section above `IngredientAvailability` that lists each ingredient with its scaled quantity and unit
    - _Requirements: 5.1, 5.2, 5.4, 5.5_

  - [ ]* 8.4 Write unit tests for `RecipeDetail` portions scaler in `frontend/src/pages/RecipesPage/__tests__/RecipeDetail.test.tsx`
    - Renders `+`/`–` buttons and the `selectedPortions` value
    - Initialises `selectedPortions` to `recipe.portions`
    - Disables `–` button when `selectedPortions === 1`
    - Does not call `fetch` when `+`/`–` is tapped
    - Displays scaled ingredient quantities when `selectedPortions` differs from `recipe.portions`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.8, 5.1, 5.4_

- [x] 9. Add portions badge to RecipeList
  - [x] 9.1 Render a portions badge per recipe row in `RecipeList.tsx`
    - When `recipe.portions !== undefined`, render `<span aria-label="{recipe.portions} portions">{recipe.portions} portions</span>` alongside the existing time and missing-ingredient badges
    - _Requirements: 2.8_

  - [ ]* 9.2 Write unit tests for `RecipeList` portions badge in `frontend/src/pages/RecipesPage/__tests__/RecipeList.test.tsx`
    - Renders portions badge for recipes with a `portions` value
    - Does not render portions badge for recipes without `portions`
    - _Requirements: 2.8_

- [x] 10. Update the e2e test suite for recipe portions counter
  - [x] 10.1 Add `portions` to mock recipes in `e2e/recipe-management.spec.ts`
    - Update existing mock recipe fixtures to include a `portions` field; update corresponding mock API responses
    - _Requirements: 2.1, 2.7, 2.8_

  - [x] 10.2 Add e2e test for creating a recipe with a portions value
    - Fill in the "Portions" input; submit; assert the detail view shows the portions scaler initialised to the submitted value
    - _Requirements: 1.1, 1.5, 4.1_

  - [x] 10.3 Add e2e test for portions validation error in create mode
    - Leave "Portions" empty or enter 0; assert the inline validation error is shown and the form is not submitted
    - _Requirements: 1.2, 1.3_

  - [x] 10.4 Add e2e test for portions scaler in RecipeDetail
    - Open a recipe detail view; tap `+`; assert `selectedPortions` increments and ingredient quantities update; tap `–`; assert they decrement; assert no network request is made
    - _Requirements: 4.3, 4.4, 4.8, 5.1, 5.5_

  - [x] 10.5 Add e2e test for portions scaler in RecipeEditor edit mode
    - Open a recipe in edit mode; tap `+` on the scaler; assert ingredient quantity fields update; save; assert the detail view reflects the new portions and scaled quantities
    - _Requirements: 3.3, 3.7, 3.9, 6.1, 6.2, 6.3_

  - [x] 10.6 Add e2e test for portions badge in RecipeList
    - Assert that recipes with a `portions` value show a portions badge in the list
    - _Requirements: 2.8_

- [x] 11. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- `scaleIngredients` is implemented in both backend and frontend as identical pure functions — no shared package is needed
- The backend export of `scaleIngredients` is primarily for direct property testing without going through the Lambda handler
- In edit mode, each `+`/`–` tap recalculates relative to the current form field values (not the originally loaded values), so sequential taps compose correctly (Property 10)
- Backward compatibility: existing recipes without `portions` fall back to `1` in the frontend for display and scaler initialisation; `RecipeList` omits the badge when `portions` is `undefined`
- Property tests use `fast-check` (already in the project) with a minimum of 100 runs per property
