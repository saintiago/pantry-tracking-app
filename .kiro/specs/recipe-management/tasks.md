# Implementation Plan: Recipe Management (Stage 4)

## Overview

Recipe management with ingredient availability checking. Covers Recipe Lambda CRUD, ingredient availability calculation, frontend recipe components, API client, App.tsx wiring, and e2e tests.

- [x] 1. Implement Recipe Lambda
  - [x] 1.1 Create Recipe Lambda with CRUD operations
    - Implement GET /recipes endpoint
    - Implement POST /recipes with ingredient validation (at least one ingredient with quantity and unit)
    - Implement GET /recipes/{recipeId} with ingredient availability calculation across all storage locations
    - Implement PUT /recipes/{recipeId} for updates
    - Implement DELETE /recipes/{recipeId} with meal plan warning
    - Support optional sourceUrl field for recipe links
    - Register Lambda and routes in `infrastructure/src/pantry-stack.ts`

  - [x] 1.2 Implement ingredient availability calculation
    - Extract `computeAvailability(ingredients, inventoryItems)` as a pure exported function
    - Compare recipe ingredients against inventory across all user-defined storage locations
    - Calculate availability status: available (total >= required), partial (0 < total < required), missing (total = 0)
    - Return missing ingredient count

  - [x] 1.3 Write unit tests for Recipe Lambda
    - Test each route handler (list, create, get with availability, update, delete)
    - Test validation errors (empty ingredients, missing quantity/unit)
    - Test 401 for missing auth, 404 for wrong user's recipe
    - Test file: `backend/src/handlers/recipe/__tests__/recipe.test.ts`

  - [ ]* 1.4 Write property tests for recipe operations
    - **Property 10: Recipe CRUD Persistence**
    - **Property 11: Recipe Requires Ingredients**
    - **Property 12: Ingredient Availability Calculation**
    - **Property 13: Missing Ingredient Count Accuracy**
    - Test file: `backend/src/handlers/recipe/__tests__/recipe.property.test.ts`

- [x] 2. Implement recipes API client
  - [x] 2.1 Create `frontend/src/api/recipes/recipes.ts`
    - Implement `fetchRecipes()`, `createRecipe()`, `fetchRecipeWithAvailability()`, `updateRecipe()`, `deleteRecipe()`
    - Use `getCurrentSession()` for auth headers, `API_URL` from config
    - Export `Recipe`, `RecipeIngredient`, `IngredientStatus`, `RecipeWithAvailability` interfaces

  - [x] 2.2 Write unit tests for recipes API client
    - Test each function with mocked fetch responses
    - Test error handling (4xx, 5xx, network failure)
    - Test file: `frontend/src/api/recipes/__tests__/recipes.test.ts`

- [x] 3. Implement frontend recipe module
  - [x] 3.1 Create RecipeList component
    - Fetch all recipes on mount via `fetchRecipes()`
    - Render search input filtering by recipe name (client-side, case-insensitive)
    - Show missing-ingredient badge on each row when `missingCount > 0`
    - "New Recipe" button navigates to editor
    - File: `frontend/src/pages/RecipesPage/RecipeList.tsx`

  - [x] 3.2 Create RecipeDetail component
    - Fetch `RecipeWithAvailability` on mount via `fetchRecipeWithAvailability(recipeId)`
    - Render recipe name, instructions, source URL link (`target="_blank" rel="noopener noreferrer"`) when present
    - Render `IngredientAvailability` component
    - Edit and Delete buttons; Delete shows confirmation with meal-plan warning when applicable
    - File: `frontend/src/pages/RecipesPage/RecipeDetail.tsx`

  - [x] 3.3 Implement RecipeEditor component
    - Create/edit form: name (required), instructions (required), sourceUrl (optional), dynamic ingredients list
    - Ingredient rows: name, quantity (number > 0), unit (non-empty) with add/remove controls
    - Client-side validation before submit
    - Calls `createRecipe` or `updateRecipe` on submit, navigates to detail on success
    - File: `frontend/src/pages/RecipesPage/RecipeEditor.tsx`

  - [x] 3.4 Implement IngredientAvailability component
    - Summary line: "X ingredient(s) missing or partial"
    - Per-ingredient status chip: green (available), amber (partial), red (missing)
    - For partial items: show "have X / need Y unit"
    - File: `frontend/src/pages/RecipesPage/IngredientAvailability.tsx`

  - [x] 3.5 Assemble RecipesPage with view-state router
    - View states: `list | detail | editor-new | editor-edit`
    - Wire navigation between RecipeList, RecipeDetail, RecipeEditor
    - File: `frontend/src/pages/RecipesPage/RecipesPage.tsx`

  - [x] 3.6 Write unit tests for recipe components
    - RecipeList: renders recipes, search filter, empty state
    - RecipeDetail: renders availability, source URL link, delete confirmation
    - RecipeEditor: validation errors, create/edit submit, cancel
    - IngredientAvailability: all three status chips, partial quantity display

- [x] 4. Wire RecipesPage into App.tsx
  - Confirm `RecipesPage` is imported and registered under `PageId` `'recipes'` in `App.tsx`
  - Verify bottom nav "Recipes" button navigates to the page
  - Confirm no modal/overlay pattern is used (full-page only, per project convention)

- [x] 5. Write e2e tests for recipe management
  - Navigate to Recipes page from bottom nav
  - Create a new recipe (fill form, submit, verify appears in list)
  - View recipe detail with ingredient availability statuses
  - Edit an existing recipe and verify changes persist
  - Delete a recipe (confirm dialog, verify removed from list)
  - Search/filter in recipe list
  - File: `e2e/recipe-management.spec.ts`

- [x] 6. Deploy and verify recipe management works
  - Confirm Recipe Lambda is registered in CDK stack (`pantry-stack.ts`)
  - Confirm API Gateway routes are wired for all five recipe endpoints
  - Run `npm run type-check` and `npm run lint` with no errors
  - Run `npm test` (unit + property) with no failures
