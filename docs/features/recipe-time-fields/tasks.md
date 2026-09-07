# Implementation Plan: Recipe Time Fields

## Overview

Add optional `prepTime` and `cookTime` fields to the Recipe entity. Changes flow through five layers in order: backend pure functions and validation, backend persistence (create + update), API client types, RecipeEditor form, and RecipeDetail/RecipeList display components.

## Tasks

- [x] 1. Add pure helper functions to the backend recipe handler
  - [x] 1.1 Implement `validateTimeFields` in `backend/src/handlers/recipe/recipe.ts`
    - Export a pure function `validateTimeFields(parsed: Record<string, unknown>): string | null`
    - Returns the name of the first failing field (`'prepTime'` or `'cookTime'`) if the value is present but not a non-negative integer; returns `null` when both are absent or valid
    - _Requirements: 1.2, 1.3, 1.4, 1.5_

  - [x] 1.2 Implement `computeTotalTime` in `backend/src/handlers/recipe/recipe.ts`
    - Export a pure function `computeTotalTime(prepTime?: number, cookTime?: number): number | undefined`
    - Returns `undefined` when both inputs are absent; otherwise returns `(prepTime ?? 0) + (cookTime ?? 0)`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 1.3 Write property test for `computeTotalTime` (Property 1)
    - **Property 1: Total Time Calculation**
    - Generate all combinations of optional non-negative integers using `fc.option(fc.nat(), { nil: undefined })`
    - Assert: when both absent → `undefined`; otherwise → `(prepTime ?? 0) + (cookTime ?? 0)`
    - Create `backend/src/handlers/recipe/__tests__/recipe.property.test.ts`
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

- [x] 2. Wire time field validation and persistence into the backend handler
  - [x] 2.1 Call `validateTimeFields` inside `createRecipe` and `updateRecipe` in `backend/src/handlers/recipe/recipe.ts`
    - After existing validation, call `validateTimeFields(parsed)`; if it returns a field name, return 400 with `VALIDATION_ERROR` and `details: [{ field, message: '<field> must be a non-negative integer' }]`
    - _Requirements: 1.4, 1.5_

  - [x] 2.2 Persist `prepTime` and `cookTime` in `createRecipe`
    - After building the base recipe object, conditionally set `recipe.prepTime` and `recipe.cookTime` when present in `parsed`
    - _Requirements: 1.2, 1.3, 2.1_

  - [x] 2.3 Persist `prepTime` and `cookTime` in `updateRecipe`
    - Add `prepTime` and `cookTime` to the `updatableFields` map for normal SET updates
    - After building `updateParts`, collect any fields where `parsed[field] === null` into `removeParts` and build a `REMOVE` clause; combine SET and REMOVE into the final `UpdateExpression`
    - _Requirements: 2.2, 2.3_

  - [ ]* 2.4 Write unit tests for time field validation in `backend/src/handlers/recipe/__tests__/recipe.test.ts`
    - `POST /recipes` with valid `prepTime` and `cookTime` returns 201 with those values in the response
    - `POST /recipes` without time fields returns 201 with no time fields
    - `POST /recipes` with `prepTime: -1` returns 400 identifying `prepTime`
    - `POST /recipes` with `cookTime: 1.5` returns 400 identifying `cookTime`
    - `PUT /recipes/{recipeId}` with `prepTime: null` uses REMOVE expression (not SET)
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3_

  - [ ]* 2.5 Write property test for valid time fields accepted by Lambda (Property 2)
    - **Property 2: Valid Time Fields Accepted by Lambda**
    - Generate records with optional `fc.nat()` values for `prepTime` and `cookTime`; mock DynamoDB; call `createRecipe` handler; assert 201 and response contains the same values
    - Add to `backend/src/handlers/recipe/__tests__/recipe.property.test.ts`
    - **Validates: Requirements 1.2, 1.3, 2.1**

  - [ ]* 2.6 Write property test for invalid time fields rejected by Lambda (Property 3)
    - **Property 3: Invalid Time Fields Rejected by Lambda**
    - Generate invalid inputs (negative integers, floats, non-numeric strings) for `prepTime` or `cookTime`; assert 400 with `details` identifying the offending field
    - Add to `backend/src/handlers/recipe/__tests__/recipe.property.test.ts`
    - **Validates: Requirements 1.4, 1.5**

  - [ ]* 2.7 Write property test for time fields preserved through update (Property 4)
    - **Property 4: Time Fields Preserved Through Update**
    - Generate `fc.nat()` values for `prepTime` and `cookTime`; mock `UpdateCommand` to return `Attributes` with those values; call `updateRecipe` with a body that omits time fields; assert returned recipe still has original values
    - Add to `backend/src/handlers/recipe/__tests__/recipe.property.test.ts`
    - **Validates: Requirements 2.3**

- [x] 3. Checkpoint — Ensure all backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Extend the frontend API client types and `updateRecipe` signature
  - [x] 4.1 Add `prepTime?: number` and `cookTime?: number` to the `Recipe` interface in `frontend/src/api/recipes/recipes.ts`
    - _Requirements: 1.1_

  - [x] 4.2 Update the `updateRecipe` function signature to accept `prepTime?: number | null` and `cookTime?: number | null` in the data parameter
    - Extend the `data` type to `Partial<Pick<Recipe, 'name' | 'ingredients' | 'instructions' | 'sourceUrl'>> & { prepTime?: number | null; cookTime?: number | null }`
    - _Requirements: 2.2, 6.7_

  - [ ]* 4.3 Write unit tests for the updated API client in `frontend/src/api/recipes/__tests__/recipes.test.ts`
    - `createRecipe` with time fields sends them in the request body
    - `updateRecipe` with `prepTime: null` sends `null` in the request body
    - `updateRecipe` without time fields does not include them in the request body
    - _Requirements: 2.1, 2.2, 6.7_

- [x] 5. Add time inputs to RecipeEditor
  - [x] 5.1 Add `prepTime` and `cookTime` state and error keys to `RecipeEditor.tsx`
    - Add `const [prepTime, setPrepTime] = useState<string>('')` and `cookTime` counterpart
    - Add `prepTime?: string` and `cookTime?: string` to the `FormErrors` interface
    - In edit mode, pre-populate from `recipe.prepTime` / `recipe.cookTime` using `String(value)` or `''`
    - Store original values (`originalPrepTime`, `originalCookTime`) to distinguish "never set" from "cleared"
    - _Requirements: 6.1, 6.2, 6.6_

  - [x] 5.2 Render the two optional number inputs in the form, below `sourceUrl` and above the ingredients section
    - Label the first input "Prep time (min)" with `id="recipe-prep-time"` and `aria-label`
    - Label the second input "Cook time (min)" with `id="recipe-cook-time"` and `aria-label`
    - Use `type="number"` with `min="0"` and `step="1"`; display inline field errors below each input using the existing `fieldError` style
    - _Requirements: 6.1, 6.2_

  - [x] 5.3 Add client-side validation for time fields inside the `validate()` function
    - Implement `validateTimeField(value: string, fieldName: string): string | undefined` — returns an error message when the value is non-empty and is not a non-negative integer
    - Call it for both fields and attach errors to `errs.prepTime` / `errs.cookTime`
    - _Requirements: 6.3, 6.4_

  - [x] 5.4 Build the time field payload in `handleSubmit` and pass it to `createRecipe` / `updateRecipe`
    - Create mode: include `prepTime` / `cookTime` as numbers only when the input is non-empty
    - Edit mode: send `null` for a field that was previously set and is now cleared; omit entirely if it was never set and is still empty
    - _Requirements: 6.5, 6.7_

  - [ ]* 5.5 Write unit tests for RecipeEditor time fields in `frontend/src/pages/RecipesPage/__tests__/RecipeEditor.test.tsx`
    - Renders labeled "Prep time (min)" and "Cook time (min)" inputs
    - Pre-populates time fields in edit mode when recipe has stored values
    - Submits without time fields when both inputs are empty in create mode
    - Sends `null` for a cleared time field in edit mode
    - _Requirements: 6.1, 6.2, 6.5, 6.6, 6.7_

  - [ ]* 5.6 Write property test for RecipeEditor pre-population in edit mode (Property 7)
    - **Property 7: RecipeEditor Pre-populates Time Fields in Edit Mode**
    - Generate recipes with optional `fc.nat()` values; render `RecipeEditor` in edit mode; assert input values match stored values
    - Create `frontend/src/pages/RecipesPage/__tests__/RecipeEditor.property.test.tsx`
    - **Validates: Requirements 6.6**

  - [ ]* 5.7 Write property test for RecipeEditor rejecting invalid time inputs (Property 8)
    - **Property 8: RecipeEditor Rejects Invalid Time Inputs**
    - Generate negative integers and non-integer floats; simulate user input; assert validation error is shown and form is not submitted
    - Add to `frontend/src/pages/RecipesPage/__tests__/RecipeEditor.property.test.tsx`
    - **Validates: Requirements 6.3, 6.4**

- [x] 6. Display time information in RecipeDetail
  - [x] 6.1 Add a `computeTotalTime` utility to the frontend (duplicate from backend or extract to a shared location)
    - Implement `computeTotalTime(prepTime?: number, cookTime?: number): number | undefined` in `frontend/src/api/recipes/recipes.ts` or a small utility file alongside it
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 6.2 Add a `TimeDisplay` sub-component inside `RecipeDetail.tsx`
    - Render a `<section aria-label="Recipe time">` only when `computeTotalTime` returns a defined value
    - When both `prepTime` and `cookTime` are present, show all three values with clear labels ("Prep:", "Cook:", "Total:")
    - When only one is present, show only the total
    - Insert the section between the page header and the `IngredientAvailability` section
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ]* 6.3 Write unit tests for `RecipeDetail` time display in `frontend/src/pages/RecipesPage/__tests__/RecipeDetail.test.tsx`
    - Renders total time when only `prepTime` is set
    - Renders total time when only `cookTime` is set
    - Renders `prepTime`, `cookTime`, and total when both are set
    - Renders no time section when neither field is set
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ]* 6.4 Write property test for RecipeDetail time display (Property 5)
    - **Property 5: RecipeDetail Displays Correct Time Information**
    - Generate recipes with at least one of `prepTime` or `cookTime` set; render `RecipeDetail`; assert total time is visible; when both present, assert individual values are also visible
    - Create `frontend/src/pages/RecipesPage/__tests__/RecipeDetail.property.test.tsx`
    - **Validates: Requirements 4.1, 4.2, 4.4**

- [x] 7. Display time badge in RecipeList
  - [x] 7.1 Add a time badge to each recipe row in `RecipeList.tsx`
    - Call `computeTotalTime(recipe.prepTime, recipe.cookTime)` per row
    - Render a `<span aria-label="{total} minutes total">` badge with a neutral style (grey background) when `total` is defined; render nothing when `total` is `undefined`
    - Position the badge alongside the existing missing-ingredient badge
    - _Requirements: 5.1, 5.2_

  - [ ]* 7.2 Write unit tests for `RecipeList` time badge in `frontend/src/pages/RecipesPage/__tests__/RecipeList.test.tsx`
    - Renders time badge for recipes with time fields
    - Renders no time badge for recipes without time fields
    - _Requirements: 5.1, 5.2_

  - [ ]* 7.3 Write property test for RecipeList time display (Property 6)
    - **Property 6: RecipeList Displays Total Time**
    - Generate arrays of recipes with varying `prepTime`/`cookTime` combinations; render `RecipeList`; for each recipe assert badge presence matches whether `computeTotalTime` returns a defined value
    - Create `frontend/src/pages/RecipesPage/__tests__/RecipeList.property.test.tsx`
    - **Validates: Requirements 5.1, 5.2**

- [x] 8. Update the e2e test suite for recipe time fields
  - [x] 8.1 Add time field data to mock recipes in `e2e/recipe-management.spec.ts`
    - Update at least one mock recipe to include `prepTime` and `cookTime`; update the corresponding mock API responses
    - _Requirements: 4.1, 5.1_

  - [x] 8.2 Add e2e tests for creating a recipe with time fields
    - Fill in "Prep time (min)" and "Cook time (min)" inputs; submit; assert the detail view shows the correct total time badge
    - _Requirements: 6.1, 6.2, 4.1_

  - [x] 8.3 Add e2e tests for editing and clearing a time field
    - Open an existing recipe with time fields in the editor; clear one field; save; assert the detail view reflects the updated time
    - _Requirements: 6.6, 6.7, 4.1_

  - [x] 8.4 Add e2e test for time field validation error in RecipeEditor
    - Enter a negative number in a time field; assert the inline validation error is shown and the form is not submitted
    - _Requirements: 6.3, 6.4_

  - [x] 8.5 Add e2e test for time badge visibility in RecipeList
    - Assert that recipes with time fields show a time badge and recipes without do not
    - _Requirements: 5.1, 5.2_

- [x] 9. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- The backend `computeTotalTime` is exported so it can be directly imported in property tests without going through the Lambda handler
- The frontend `computeTotalTime` is a duplicate of the backend function — both are pure and trivial; no shared package is needed
- Property tests use `fast-check` (already in the project) with a minimum of 100 runs per property
- The `null` sentinel in the update payload signals explicit field removal (DynamoDB `REMOVE`); `undefined` means "leave unchanged"
