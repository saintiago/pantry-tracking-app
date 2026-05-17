# Implementation Plan: Recipe Categories (Tags)

## Overview

Implement a tag-based category system for recipes. The work spans five layers: backend validation and a new `GET /recipes/tags` endpoint, the frontend API client, a new `TagInput` component, and updates to `RecipeEditor`, `RecipeList`, `RecipeDetail`, and `RecipesPage`.

## Tasks

- [x] 1. Add `validateTags` and `normalizeTags` to the backend recipe handler
  - [x] 1.1 Implement `normalizeTags` and `validateTags` pure functions in `backend/src/handlers/recipe/recipe.ts`
    - `normalizeTags(raw: unknown[]): string[]` — trims, lowercases, filters empty strings, deduplicates
    - `validateTags(parsed: Record<string, unknown>): string | null` — returns error string or null
    - _Requirements: 7.4, 7.5, 8.1_

  - [x] 1.2 Write property tests for `normalizeTags` and `validateTags`
    - **Property 1: Tag normalization idempotence** — `normalizeTags(normalizeTags(arr))` equals `normalizeTags(arr)` for any string array
    - **Property 1 (output invariants)** — output tags are all lowercase, no duplicates, no empty strings
    - Add to `backend/src/handlers/recipe/__tests__/recipe.property.test.ts`
    - **Validates: Requirements 7.4, 7.5, 8.1**

- [x] 2. Wire tag validation into `createRecipe` and `updateRecipe` handlers
  - [x] 2.1 Add tag validation and normalization to the `POST /recipes` handler path in `backend/src/handlers/recipe/recipe.ts`
    - Call `validateTags(parsed)` after existing validations; return 400 on error
    - Call `normalizeTags(parsed.tags)` and assign to `recipe.tags` before writing to DynamoDB
    - _Requirements: 1.2, 1.4, 7.1_

  - [x] 2.2 Add tag validation and normalization to the `PUT /recipes/{recipeId}` handler path
    - Only validate when `parsed.tags !== undefined`; return 400 if tags present but empty/invalid
    - Normalize and include in the DynamoDB update expression
    - _Requirements: 1.3, 1.4, 7.1_

  - [x] 2.3 Write unit tests for tag validation in `backend/src/handlers/recipe/__tests__/recipe.test.ts`
    - `POST /recipes` with valid tags returns 201 with normalized (lowercased, deduplicated) tags
    - `POST /recipes` with absent `tags` returns 400
    - `POST /recipes` with `tags: []` returns 400
    - `POST /recipes` with whitespace-only tags returns 400
    - `PUT /recipes/{recipeId}` with `tags: []` returns 400
    - `PUT /recipes/{recipeId}` with valid tags updates the tags field
    - _Requirements: 1.2, 1.3, 1.4_

  - [x] 2.4 Write property tests for backend tag rejection in `backend/src/handlers/recipe/__tests__/recipe.property.test.ts`
    - **Property 5: Backend rejects empty tags on create** — for any valid recipe body with absent/empty/whitespace-only tags, handler returns 400 with `VALIDATION_ERROR`
    - **Property 6: Backend rejects empty tags on update** — for any update body with `tags: []`, handler returns 400
    - **Validates: Requirements 1.2, 1.3**

- [x] 3. Add `GET /recipes/tags` endpoint to the backend
  - [x] 3.1 Implement `listRecipeTags(userId: string)` in `backend/src/handlers/recipe/recipe.ts`
    - Query DynamoDB with `PK = USER#<userId>`, `SK begins_with RECIPE#`, using `ProjectionExpression: 'tags'`
    - Flatten all tags arrays, deduplicate, lowercase, sort alphabetically
    - Return `{ tags: string[] }`
    - _Requirements: 7.2, 7.3_

  - [x] 3.2 Register the `GET /recipes/tags` route in the handler dispatcher **before** `GET /recipes/{recipeId}`
    - Ensures the literal string `"tags"` is not matched as a `recipeId` path segment
    - _Requirements: 7.2_

  - [x] 3.3 Write unit tests for `GET /recipes/tags` in `backend/src/handlers/recipe/__tests__/recipe.test.ts`
    - Returns sorted distinct tags across all user's recipes
    - Returns empty array when user has no recipes
    - Route does not conflict with `GET /recipes/{recipeId}`
    - _Requirements: 7.2, 7.3_

- [x] 4. Checkpoint — Ensure all backend tests pass
  - Run `npm test` from the backend workspace; ensure all tests pass. Ask the user if questions arise.

- [x] 5. Extend the frontend `Recipe` interface and API client
  - [x] 5.1 Add `tags: string[]` to the `Recipe` interface in `frontend/src/api/recipes/recipes.ts`
    - Field is required and non-optional on the interface
    - Update `updateRecipe` parameter type to include `tags` in the `Pick`
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 5.2 Add `fetchRecipeTags(): Promise<string[]>` to `frontend/src/api/recipes/recipes.ts`
    - Calls `GET /recipes/tags`; returns the `tags` array from the response body
    - _Requirements: 7.2_

  - [x] 5.3 Write unit tests for the updated API client in `frontend/src/api/recipes/__tests__/recipes.test.ts`
    - `fetchRecipeTags` calls the correct endpoint and returns the tags array
    - `createRecipe` and `updateRecipe` include `tags` in the request body
    - _Requirements: 7.1, 7.2_

- [x] 6. Build the `TagInput` component
  - [x] 6.1 Create `frontend/src/components/TagInput/TagInput.tsx` with chip display, text input, and autocomplete dropdown
    - Props: `tags`, `onChange`, `allTags`, `tagsLoading`, `error`
    - Delimiter keys: `Enter`, `,`, `;`, `.` — commit trimmed+lowercased non-empty input; discard duplicates silently
    - On focus: open dropdown showing `allTags` not in `tags`, up to 10 items
    - On input change: filter `allTags` by case-insensitive substring match, exclude current tags, up to 10
    - On `Escape`: close dropdown without committing
    - On suggestion `mousedown`: commit tag, keep focus, close dropdown
    - When `tagsLoading` is `true`: disable autocomplete, show `"Loading tags…"` placeholder
    - Chip style: `backgroundColor: '#dbeafe'`, `color: '#1e40af'`, `borderRadius: 16`, `fontWeight: 600`
    - Accessibility: `role="combobox"`, `aria-expanded`, `aria-autocomplete="list"`, `role="listbox"`, `role="option"`, remove button `aria-label="Remove tag {tagName}"`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 6.2 Write unit tests for `TagInput` in `frontend/src/components/TagInput/__tests__/TagInput.test.tsx`
    - Renders chips for each tag in `tags` prop
    - Pressing `Enter`, `,`, `;`, `.` commits trimmed+lowercased input as a chip
    - Pressing `Escape` closes autocomplete without committing
    - Clicking a suggestion commits that tag and clears the input
    - Clicking the remove button removes that tag
    - Remove button has `aria-label="Remove tag {tagName}"`
    - Duplicate input is silently discarded
    - Empty/whitespace input is not committed
    - On focus, autocomplete shows `allTags` not in `tags` (up to 10)
    - Error message is rendered when `error` prop is set
    - When `tagsLoading` is `true`, autocomplete does not open and placeholder shows `"Loading tags…"`
    - _Requirements: 2.2, 2.3, 2.4, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 6.3 Write property tests for `TagInput` in `frontend/src/components/TagInput/__tests__/TagInput.property.test.tsx`
    - **Property 7: Committed tags are always lowercase** — for any non-empty string input committed via delimiter, the resulting tag equals the trimmed+lowercased version
    - **Property 8: Deduplication prevents duplicate chips** — for any existing tags array and any duplicate input, the array is unchanged after commit attempt
    - **Property 9: Autocomplete suggestions are bounded and filtered** — for any `allTags` and `inputValue`, suggestions are ≤ 10, contain `inputValue` as substring, and exclude current tags
    - Use `{ numRuns: 50 }` to avoid timeout
    - **Validates: Requirements 2.2, 2.4, 4.1, 4.4, 4.6**

- [x] 7. Update `RecipeEditor` to include the `TagInput` field
  - [x] 7.1 Add `allTags: string[]` and `tagsLoading: boolean` to `RecipeEditorProps` in `frontend/src/pages/RecipesPage/RecipeEditor.tsx`
    - _Requirements: 1.1_

  - [x] 7.2 Add `tags` state, `FormErrors.tags` field, and `TagInput` rendering in `RecipeEditor`
    - Initialize `tags` state as `[]`; pre-populate from `recipe.tags ?? []` in edit mode
    - Render `TagInput` below the recipe name field and above the instructions field
    - Validate: if `tags.length === 0`, set `errors.tags = 'At least one tag is required.'`
    - Include `tags` in both `createRecipe` and `updateRecipe` call payloads
    - _Requirements: 1.1, 2.1, 2.5_

  - [x] 7.3 Write unit tests for the updated `RecipeEditor` (add to existing test file or create `frontend/src/pages/RecipesPage/__tests__/RecipeEditor.test.tsx`)
    - `TagInput` is rendered in the form
    - Submitting with no tags shows the inline error "At least one tag is required."
    - Tags are included in the create/update API call payload
    - In edit mode, existing tags are pre-populated in `TagInput`
    - _Requirements: 1.1, 2.5_

- [x] 8. Update `RecipeList` to show tag chips per row and the `TagCloud` filter
  - [x] 8.1 Add `allTags: string[]` and `tagsLoading: boolean` to `RecipeListProps`; remove `onRecipesLoaded` prop if present; add `activeTagFilters` state in `frontend/src/pages/RecipesPage/RecipeList.tsx`
    - _Requirements: 6.1, 6.7_

  - [x] 8.2 Add the `TagCloud` section between the search input and the recipe list
    - Show inline spinner while `tagsLoading` is `true`
    - Hide when `allTags.length === 0`
    - Toggle tags in/out of `activeTagFilters` on click; use `aria-pressed` for active state
    - Active button style: `backgroundColor: '#1e40af'`, `color: '#ffffff'`; inactive: `backgroundColor: '#dbeafe'`, `color: '#1e40af'`
    - _Requirements: 6.1, 6.2, 6.3, 6.5, 6.7_

  - [x] 8.3 Apply AND filter logic and add per-row tag chips
    - Filter recipes by `activeTagFilters.every(t => recipe.tags.includes(t))` in addition to existing name search
    - Render tag chips below the recipe name in each row (read-only, no remove button)
    - Show "No recipes match the selected tags." when `filtered.length === 0` and `activeTagFilters.length > 0`
    - _Requirements: 5.1, 5.3, 6.2, 6.4, 6.6_

  - [x] 8.4 Write property tests for filter logic in `frontend/src/pages/RecipesPage/__tests__/RecipeList.property.test.tsx`
    - **Property 2: AND filter correctness** — for any recipes and filter set, filtered result contains exactly the recipes having all filter tags
    - **Property 3: Filter result is a subset** — every recipe in the filtered result appears in the original list
    - **Property 4: Empty filter returns full list** — filtering with empty active filter set returns all recipes unchanged
    - **Property 10: Tag cloud shows sorted distinct tags** — tags displayed equal the sorted, deduplicated union of all `recipe.tags` arrays
    - Use `{ numRuns: 100 }` for Properties 2–4; `{ numRuns: 50 }` for Property 10
    - **Validates: Requirements 6.1, 6.2, 8.2, 8.3, 8.4**

- [x] 9. Update `RecipeDetail` to display read-only tag chips
  - [x] 9.1 Add a read-only tags section to `frontend/src/pages/RecipesPage/RecipeDetail.tsx`
    - Render below the page title and above the time section
    - Use `recipe.tags ?? []` for safe access; skip rendering if empty
    - Chip style: `backgroundColor: '#dbeafe'`, `color: '#1e40af'`, `borderRadius: 16`, `fontWeight: 600`
    - No remove button — read-only display only
    - _Requirements: 5.2, 5.3_

  - [x] 9.2 Write unit tests for the updated `RecipeDetail` (add to existing test file or create `frontend/src/pages/RecipesPage/__tests__/RecipeDetail.test.tsx`)
    - Tag chips are rendered for a recipe with tags
    - No chips rendered for a recipe with no tags (or `tags: undefined` for old records)
    - Chips have no remove button
    - _Requirements: 5.2, 5.3_

- [x] 10. Update `RecipesPage` to fetch tags and pass them down
  - [x] 10.1 Add `allTags` and `tagsLoading` state to `frontend/src/pages/RecipesPage/RecipesPage.tsx`; fetch tags on mount via `fetchRecipeTags()`
    - Fire `fetchRecipeTags()` in parallel with the recipe list fetch (non-blocking)
    - Silent fail on error — `allTags` stays `[]`, `tagsLoading` set to `false`
    - Pass `allTags` and `tagsLoading` to both `RecipeList` and `RecipeEditor`
    - _Requirements: 4.1, 4.5, 6.1_

  - [x] 10.2 Write unit tests for the updated `RecipesPage` (add to existing test file or create `frontend/src/pages/RecipesPage/__tests__/RecipesPage.test.tsx`)
    - `fetchRecipeTags` is called on mount
    - `allTags` and `tagsLoading` are passed to `RecipeList` and `RecipeEditor`
    - A failed `fetchRecipeTags` call does not crash the page
    - _Requirements: 4.1, 4.5_

- [x] 11. Add e2e tests for recipe categories in `e2e/recipe-management.spec.ts`
  - [x] 11.1 Update mock data and `setupMockAPI` to include tags and the `GET /recipes/tags` route
    - Add `tags` field to all `mockRecipes` entries (e.g. `['italian', 'quick']` and `['soup', 'vegetarian']`)
    - Add `await page.route('**/recipes/tags', ...)` returning `{ tags: ['italian', 'quick', 'soup', 'vegetarian'] }`
    - Update `newRecipe`, `updatedRecipe` mock objects to include `tags`
    - _Requirements: 7.2_

  - [x] 11.2 Write e2e tests for tag display
    - Tag chips are visible on recipe list rows below the recipe name
    - Tag chips are visible on recipe detail view below the title
    - Read-only chips in list/detail have no remove button
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 11.3 Write e2e tests for the TagCloud filter
    - Tag cloud is visible above the recipe list
    - Clicking a tag filters the list (only matching recipes shown)
    - Clicking an active tag removes the filter (all recipes shown again)
    - "No recipes match the selected tags." shown when no recipes match
    - Tag cloud shows a spinner while tags are loading
    - _Requirements: 6.1, 6.2, 6.3, 6.6, 6.7_

  - [x] 11.4 Write e2e tests for tag input in RecipeEditor
    - Submitting the form with no tags shows "At least one tag is required."
    - Typing a tag and pressing Enter commits it as a chip
    - Typing a tag and pressing comma commits it as a chip
    - Pressing the remove button on a chip removes it
    - Tag autocomplete shows suggestions on focus
    - Selecting a suggestion from autocomplete commits it as a chip
    - Tags are pre-populated when editing an existing recipe
    - Tags are included in the create/update API request body
    - _Requirements: 1.1, 2.2, 2.3, 3.2, 3.3, 4.2, 4.5_

- [x] 12. Final checkpoint — Ensure all tests pass
  - Run `npm test` from the workspace root; ensure all unit and property tests pass. Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties (Properties 1–10 from the design)
- Unit tests validate specific examples and edge cases
- The `GET /recipes/tags` route must be registered before `GET /recipes/{recipeId}` to avoid path conflicts
- Old DynamoDB records without `tags` are handled gracefully via `recipe.tags ?? []` on the frontend
