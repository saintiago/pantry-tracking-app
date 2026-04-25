# Requirements Document: Recipe Management

## Introduction

This spec covers the Recipe Management feature of the Pantry Tracking App (Stage 4). It implements Recipe Lambda CRUD, ingredient availability calculation, and the frontend recipe module.

Shared infrastructure terms (Pantry_App, Beautiful_User, Storage_Location, etc.) are defined in the main spec at `.kiro/specs/pantry-tracking-app/requirements.md`.

## Glossary

- **Recipe**: A user-owned record with a name, ingredients list, instructions, and optional source URL. Schema defined in `data-model.md`.
- **RecipeIngredient**: A single ingredient entry with `name`, `quantity`, `unit`, and optional `inventoryItemId`. Schema defined in `data-model.md`.
- **Recipe_Lambda**: The AWS Lambda handler at `backend/src/handlers/recipe/recipe.ts` that handles all `/recipes` API routes.
- **IngredientStatus**: The computed availability of one recipe ingredient against current inventory: `available`, `partial`, or `missing`.
- **RecipeWithAvailability**: The response shape for `GET /recipes/{recipeId}` — includes the recipe, per-ingredient availability, and a missing count.
- **Availability_Calculator**: The pure function inside Recipe_Lambda that computes ingredient availability by summing inventory quantities across all storage locations.
- **RecipesPage**: The frontend page at `frontend/src/pages/RecipesPage/` that hosts all recipe UI.
- **RecipeList**: Frontend component showing the user's recipe collection with search.
- **RecipeDetail**: Frontend component showing a full recipe with ingredient availability.
- **RecipeEditor**: Frontend component for creating and editing recipes with inventory name autocomplete.
- **IngredientAvailability**: Frontend component rendering per-ingredient availability status.

## Requirements

### Requirement 1: Recipe Management

**User Story:** As a beautiful user, I want to add and manage recipes, so that I can plan meals and generate shopping lists.

#### Acceptance Criteria

1. THE Pantry_App SHALL allow beautiful users to create recipes with a name, ingredients list, instructions, and an optional source URL.
2. WHEN creating a recipe, THE Pantry_App SHALL require at least one ingredient with a quantity and unit.
3. WHEN the beautiful user saves a valid recipe, THE Pantry_App SHALL store the recipe in the beautiful user's recipe collection.
4. THE Pantry_App SHALL allow beautiful users to edit existing recipes.
5. WHEN the beautiful user deletes a recipe, THE Pantry_App SHALL remove it from the recipe collection.
6. IF a recipe is assigned to a meal plan, THEN THE Pantry_App SHALL warn the beautiful user before deletion.
7. WHEN a recipe has a source URL, THE Pantry_App SHALL display a link to open the original recipe page.

### Requirement 2: Recipe Ingredient Availability Check

**User Story:** As a beautiful user, I want to see which recipe ingredients I already have, so that I know what I need to buy.

#### Acceptance Criteria

1. WHEN viewing a recipe, THE Pantry_App SHALL compare recipe ingredients against current inventory across all storage locations.
2. THE Pantry_App SHALL display each ingredient with its availability status (available, partial, missing).
3. WHEN an ingredient is partially available, THE Pantry_App SHALL show the quantity needed versus quantity in inventory.
4. THE Pantry_App SHALL calculate and display the total number of missing ingredients for each recipe.

### Requirement 3: Recipe CRUD via API

**User Story:** As a developer, I want the Recipe Lambda to implement all CRUD operations, so that the frontend can manage recipes through a consistent API.

#### Acceptance Criteria

1. WHEN `GET /recipes` is called with a valid auth token, THE Recipe_Lambda SHALL return all recipes belonging to the authenticated user.
2. WHEN `POST /recipes` is called with a valid recipe body, THE Recipe_Lambda SHALL persist the recipe and return it with a generated `recipeId`, `createdAt`, and `updatedAt`.
3. IF `POST /recipes` is called with an empty ingredients array or any ingredient missing `quantity` or `unit`, THEN THE Recipe_Lambda SHALL return a 400 response with a validation error.
4. WHEN `GET /recipes/{recipeId}` is called, THE Recipe_Lambda SHALL return a `RecipeWithAvailability` response including the recipe, per-ingredient availability statuses, and `missingCount`.
5. WHEN `PUT /recipes/{recipeId}` is called with valid update fields, THE Recipe_Lambda SHALL persist the changes and return the updated recipe.
6. WHEN `DELETE /recipes/{recipeId}` is called, THE Recipe_Lambda SHALL remove the recipe and return 200.
7. IF `GET`, `PUT`, or `DELETE` is called for a `recipeId` that does not belong to the authenticated user, THEN THE Recipe_Lambda SHALL return a 404 response.
8. IF any request is made without a valid auth token, THEN THE Recipe_Lambda SHALL return a 401 response.

### Requirement 4: Ingredient Availability Calculation

**User Story:** As a developer, I want the availability calculation to be correct and deterministic, so that users see accurate ingredient status.

#### Acceptance Criteria

1. WHEN computing availability for a recipe ingredient, THE Availability_Calculator SHALL sum the `quantity` field across all inventory items belonging to the authenticated user that match the ingredient by name (case-insensitive).
2. THE Availability_Calculator SHALL assign status `available` when total inventory quantity >= required ingredient quantity.
3. THE Availability_Calculator SHALL assign status `partial` when total inventory quantity > 0 and < required ingredient quantity.
4. THE Availability_Calculator SHALL assign status `missing` when total inventory quantity = 0 or no matching inventory item exists.
5. THE Availability_Calculator SHALL set `missingCount` to the number of ingredients with status `partial` or `missing`.
6. WHEN computing availability, THE Availability_Calculator SHALL aggregate inventory across all of the user's storage locations, not just a single location.

### Requirement 5: Frontend Recipe Module

**User Story:** As a user, I want a recipe management UI, so that I can create, view, edit, and delete my recipes.

#### Acceptance Criteria

1. THE RecipesPage SHALL display the RecipeList component as its default view.
2. WHEN the user selects a recipe from RecipeList, THE RecipesPage SHALL display the RecipeDetail component for that recipe.
3. WHEN the user activates the "New Recipe" action, THE RecipesPage SHALL display the RecipeEditor in create mode.
4. WHEN the user activates "Edit" on a recipe, THE RecipesPage SHALL display the RecipeEditor pre-populated with the recipe's current data.
5. WHEN the user submits a valid recipe form, THE RecipeEditor SHALL call the recipes API and navigate back to RecipeDetail on success.
6. IF the user submits a recipe form with no ingredients or an ingredient missing quantity or unit, THEN THE RecipeEditor SHALL display a validation error and not submit.
7. WHEN the user deletes a recipe that is assigned to a meal plan, THE RecipeEditor SHALL display a warning before confirming deletion.
8. WHEN a recipe has a `sourceUrl`, THE RecipeDetail SHALL render a link that opens the original recipe page in a new tab.
9. WHEN the user types 3 or more characters in an ingredient name field, THE RecipeEditor SHALL query the inventory search API across all relevant fields (name, barcode, brand, category, whereToBuy) in parallel and display matching inventory items as autocomplete suggestions.
10. WHEN the user selects an autocomplete suggestion for an ingredient name, THE RecipeEditor SHALL fill the ingredient name and autofill the unit from the matched inventory item.
11. THE inventory search API SHALL return matching inventory items for all searchable fields (name, barcode, brand, category, whereToBuy, onlineStoreLink), not just name and barcode.
12. WHEN the user saves a recipe (create or update), THE Pantry_App SHALL automatically create a placeholder inventory item for each ingredient whose name does not match any existing inventory item (case-insensitive). The placeholder SHALL have quantity 0, isLowStock true, category "Uncategorized", and the ingredient's unit. The placeholder SHALL appear under the "Uncategorized" category in the inventory list.
13. THE RecipeEditor ingredient unit field SHALL be a dropdown constrained to the same `UnitType` enum used by the inventory system (`Gram`, `Kilo`, `Milliliter`, `Liter`, `Unit`).

### Requirement 6: Ingredient Availability Display

**User Story:** As a user, I want to see which ingredients I have, partially have, or am missing, so that I can decide whether to cook a recipe.

#### Acceptance Criteria

1. THE IngredientAvailability component SHALL render each ingredient with a visual indicator for its status: `available`, `partial`, or `missing`.
2. WHEN an ingredient status is `partial`, THE IngredientAvailability component SHALL display the required quantity and the quantity currently in inventory.
3. THE IngredientAvailability component SHALL display the total `missingCount` from the `RecipeWithAvailability` response.
4. THE IngredientAvailability component SHALL reflect inventory across all storage locations (not per-location).

## Correctness Properties

### Property 10: Recipe CRUD Persistence

*For any* valid recipe data, creating a recipe via `POST /recipes` and then retrieving it via `GET /recipes/{recipeId}` SHALL return matching `name`, `ingredients`, `instructions`, and `sourceUrl`. Updating via `PUT` SHALL persist the changed fields. Deleting via `DELETE` SHALL cause subsequent `GET` to return 404.

**Validates: Requirements 1.3, 1.4, 1.5**

### Property 11: Recipe Requires Ingredients

*For any* `POST /recipes` or `PUT /recipes/{recipeId}` request where the ingredients array is empty or any ingredient is missing `quantity` or `unit`, THE Recipe_Lambda SHALL return a 400 validation error and not persist the recipe.

**Validates: Requirement 1.2**

### Property 12: Ingredient Availability Calculation

*For any* recipe ingredient and inventory state, the Availability_Calculator SHALL produce:
- `available` iff total inventory quantity >= required quantity
- `partial` iff 0 < total inventory quantity < required quantity
- `missing` iff total inventory quantity = 0 or ingredient not found

**Validates: Requirements 2.1, 2.2, 2.3**

### Property 13: Missing Ingredient Count Accuracy

*For any* recipe, `missingCount` SHALL equal the number of ingredients whose status is `partial` or `missing`.

**Validates: Requirement 2.4**
