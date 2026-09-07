# Requirements Document: Recipe Portions Counter

## Introduction

This feature adds a portions (servings) counter to the recipe management system of the Pantry Tracking App. The behavior differs across the three contexts in which `portions` appears:

- **Create mode (`RecipeEditor` — new recipe)**: The user enters a `portions` value as a mandatory label — "these ingredient quantities make X portions." Changing the counter in create mode does not recalculate or alter any ingredient quantities. The ingredient quantities and the `portions` count are stored as-is.

- **View mode (`RecipeDetail`) and Edit mode (`RecipeEditor` — existing recipe)**: Both modes display the stored `portions` value with `+` and `–` controls. Adjusting the counter scales ingredient quantities proportionally in real time. The difference is what happens with the scaled values:
  - In **view mode**, scaling is display-only and session-local — no API call is made and nothing is persisted. Navigating away resets the counter to the base `portions` value.
  - In **edit mode**, scaling updates the actual ingredient quantity fields in the form. When the user saves, the new `portions` count and the scaled ingredient quantities are persisted as the new base values for the recipe.

The feature touches the data model (`portions` field on `Recipe`), the Recipe Lambda (create and update validation), the recipe API client, the `RecipeEditor` form, and the `RecipeDetail` display component.

## Glossary

- **Recipe**: A user-owned record as defined in `data-model.md`. Extended by this feature with a mandatory `portions` field.
- **portions**: A positive integer stored on a `Recipe` representing the number of servings the recipe yields as written. This is the base reference value for scaling.
- **baseQuantity**: The ingredient quantity stored on the `Recipe` record, corresponding to the stored `portions` value.
- **selectedPortions**: The session-local integer the user has chosen via the `+`/`–` controls. Starts equal to `portions`. In view mode, not persisted. In edit mode, drives the recalculation of form fields.
- **scalingFactor**: The ratio `selectedPortions / portions`. Applied to each ingredient's `baseQuantity` to compute the scaled quantity.
- **scaledQuantity**: The result of `baseQuantity × scalingFactor` for a given ingredient at a given `selectedPortions` value. In view mode, used for display only. In edit mode, written back into the form fields.
- **Recipe_Lambda**: The AWS Lambda handler at `backend/src/handlers/recipe/recipe.ts`.
- **RecipeEditor**: The frontend form component at `frontend/src/pages/RecipesPage/RecipeEditor.tsx`.
- **RecipeDetail**: The frontend component at `frontend/src/pages/RecipesPage/RecipeDetail.tsx`.
- **Portions_Scaler**: The pure function that computes scaled quantities for a list of ingredients given a base `portions` value and a target portions value. Used for both view-mode display scaling and edit-mode form field recalculation.

## Requirements

### Requirement 1: Portions Field on Recipe Creation (Create Mode)

**User Story:** As a user, I want to specify how many portions a recipe makes when I create it, so that I have a reference base for scaling ingredient quantities later.

#### Acceptance Criteria

1. WHEN the user opens the `RecipeEditor` in create mode, THE `RecipeEditor` SHALL display a mandatory numeric input field for `portions` labeled "Portions".
2. IF the user submits the recipe creation form with the `portions` field empty, THEN THE `RecipeEditor` SHALL display a validation error for the `portions` field and not submit the form.
3. IF the user submits the recipe creation form with a `portions` value that is not a positive integer (i.e., zero, negative, or non-integer), THEN THE `RecipeEditor` SHALL display a validation error for the `portions` field and not submit the form.
4. WHEN the user changes the `portions` value in create mode, THE `RecipeEditor` SHALL NOT recalculate or modify any ingredient quantity fields.
5. WHEN the user submits a valid recipe creation form, THE `RecipeEditor` SHALL include the `portions` value and the ingredient quantities as entered by the user in the create recipe API request.

### Requirement 2: Portions Field Persistence via API

**User Story:** As a developer, I want the Recipe Lambda to store and validate the `portions` field, so that the frontend can rely on it being present and correct for all recipes.

#### Acceptance Criteria

1. WHEN `POST /recipes` is called with a valid `portions` value, THE `Recipe_Lambda` SHALL persist the `portions` field and return it in the response body.
2. IF `POST /recipes` is called without a `portions` field, THEN THE `Recipe_Lambda` SHALL return a 400 response with a validation error identifying the `portions` field.
3. IF `POST /recipes` is called with a `portions` value that is not a positive integer, THEN THE `Recipe_Lambda` SHALL return a 400 response with a validation error identifying the `portions` field.
4. WHEN `PUT /recipes/{recipeId}` is called with a valid `portions` value, THE `Recipe_Lambda` SHALL update the `portions` field and the ingredient quantities in the same request and return the updated recipe.
5. IF `PUT /recipes/{recipeId}` is called with a `portions` value that is not a positive integer, THEN THE `Recipe_Lambda` SHALL return a 400 response with a validation error identifying the `portions` field.
6. WHEN `PUT /recipes/{recipeId}` is called without a `portions` field in the request body, THE `Recipe_Lambda` SHALL leave the existing `portions` value unchanged.
7. WHEN `GET /recipes/{recipeId}` is called for a recipe that has a `portions` value stored, THE `Recipe_Lambda` SHALL include `portions` in the response.
8. WHEN `GET /recipes` is called, THE `Recipe_Lambda` SHALL include `portions` in each recipe object.

### Requirement 3: Portions Counter in RecipeEditor (Edit Mode)

**User Story:** As a user, I want to adjust the portions count in edit mode with "+" and "–" controls and have ingredient quantities update in the form fields in real time, so that I can rebase the recipe to a new yield and save it.

#### Acceptance Criteria

1. WHEN the `RecipeEditor` is opened in edit mode for a recipe, THE `RecipeEditor` SHALL pre-populate the `portions` field with the recipe's stored `portions` value and all ingredient quantity fields with the recipe's stored ingredient quantities.
2. THE `RecipeEditor` SHALL display a "–" button and a "+" button adjacent to the `portions` field in edit mode.
3. WHEN the user taps the "+" button in edit mode, THE `RecipeEditor` SHALL increment `selectedPortions` by 1 and immediately recalculate each ingredient quantity field as `scaledQuantity = currentFieldQuantity × newSelectedPortions / previousSelectedPortions`.
4. WHEN the user taps the "–" button in edit mode and `selectedPortions` is greater than 1, THE `RecipeEditor` SHALL decrement `selectedPortions` by 1 and immediately recalculate each ingredient quantity field as `scaledQuantity = currentFieldQuantity × newSelectedPortions / previousSelectedPortions`.
5. IF `selectedPortions` equals 1 in edit mode, THEN THE `RecipeEditor` SHALL disable the "–" button so that `selectedPortions` cannot be decremented below 1.
6. WHEN the user adjusts `selectedPortions` in edit mode multiple times, THE `RecipeEditor` SHALL apply each recalculation relative to the quantity values currently in the form fields at the time of the change, not relative to the originally loaded quantities.
7. WHEN the user adjusts `selectedPortions` in edit mode, THE `RecipeEditor` SHALL display the recalculated quantities rounded to at most 2 decimal places in the ingredient quantity fields.
8. IF the user submits the edit form with the `portions` field empty or not a positive integer, THEN THE `RecipeEditor` SHALL display a validation error for the `portions` field and not submit the form.
9. WHEN the user saves a valid edit, THE `RecipeEditor` SHALL include the current `selectedPortions` value as the new `portions` and the recalculated ingredient quantities as the new ingredient quantities in the update recipe API request.

### Requirement 4: Portions Counter Display in RecipeDetail (View Mode and Edit Mode)

**User Story:** As a user, I want to see the portions value and adjust it with "+" and "–" controls on the recipe detail screen, so that I can scale the recipe up or down for the number of people I am cooking for.

#### Acceptance Criteria

1. WHEN the `RecipeDetail` loads a recipe, THE `RecipeDetail` SHALL display the recipe's `portions` value as the initial `selectedPortions`.
2. THE `RecipeDetail` SHALL display a "–" button and a "+" button adjacent to the `selectedPortions` value.
3. WHEN the user taps the "+" button, THE `RecipeDetail` SHALL increment `selectedPortions` by 1.
4. WHEN the user taps the "–" button and `selectedPortions` is greater than 1, THE `RecipeDetail` SHALL decrement `selectedPortions` by 1.
5. IF `selectedPortions` equals 1, THEN THE `RecipeDetail` SHALL disable the "–" button so that `selectedPortions` cannot be decremented below 1.
6. THE `RecipeDetail` SHALL display the current `selectedPortions` value between the "–" and "+" buttons with a label that identifies it as the serving count.
7. WHEN the user navigates away from `RecipeDetail` and returns, THE `RecipeDetail` SHALL reset `selectedPortions` to the recipe's base `portions` value.
8. WHEN the user adjusts `selectedPortions` in `RecipeDetail`, THE `RecipeDetail` SHALL NOT make any API call and SHALL NOT persist the adjusted value.

### Requirement 5: Proportional Ingredient Scaling

**User Story:** As a user, I want ingredient quantities to update automatically when I adjust the serving count, so that I know exactly how much of each ingredient to use for my desired number of servings.

#### Acceptance Criteria

1. WHEN `selectedPortions` differs from the recipe's base `portions` in `RecipeDetail`, THE `RecipeDetail` SHALL display each ingredient's quantity as `scaledQuantity = baseQuantity × (selectedPortions / portions)`.
2. WHEN `selectedPortions` equals the recipe's base `portions` in `RecipeDetail`, THE `RecipeDetail` SHALL display each ingredient's base quantity without modification.
3. THE `Portions_Scaler` SHALL compute `scaledQuantity` as a floating-point result rounded to at most 2 decimal places for display.
4. THE `RecipeDetail` SHALL display the scaled quantities alongside the ingredient names and units.
5. WHEN `selectedPortions` changes in `RecipeDetail`, THE `RecipeDetail` SHALL update all displayed ingredient quantities simultaneously without requiring a page reload or API call.
6. WHEN `selectedPortions` changes in `RecipeEditor` edit mode, THE `RecipeEditor` SHALL update all ingredient quantity form fields simultaneously using the same `Portions_Scaler` function.

### Requirement 6: Saving Scaled Values in Edit Mode

**User Story:** As a user, I want saving a recipe in edit mode after adjusting the portions count to persist the scaled ingredient quantities as the new base, so that the recipe reflects the yield I saved it for.

#### Acceptance Criteria

1. WHEN the user saves a recipe in edit mode after adjusting `selectedPortions`, THE `Recipe_Lambda` SHALL persist the submitted `portions` value and the submitted ingredient quantities as the new base values for the recipe.
2. WHEN the user retrieves the recipe after saving, THE `Recipe_Lambda` SHALL return the new `portions` value and the new ingredient quantities that were submitted at save time.
3. WHEN the user opens the saved recipe in `RecipeDetail`, THE `RecipeDetail` SHALL display the new `portions` value as the initial `selectedPortions` and the new ingredient quantities as the base quantities.

### Requirement 7: Portions Scaling Correctness (Pure Function)

**User Story:** As a developer, I want the scaling calculation to be a pure, deterministic function shared by both view-mode display and edit-mode form field recalculation, so that it is easy to test and reason about.

#### Acceptance Criteria

1. THE `Portions_Scaler` SHALL accept a list of `RecipeIngredient` objects, a `fromPortions` base value, and a `toPortions` target value, and SHALL return a list of scaled quantities in the same order as the input ingredients.
2. WHEN `toPortions` equals `fromPortions`, THE `Portions_Scaler` SHALL return quantities identical to the input quantities.
3. WHEN `toPortions` is a positive integer and `fromPortions` is a positive integer, THE `Portions_Scaler` SHALL return only non-negative quantities.
4. THE `Portions_Scaler` SHALL NOT mutate the input `RecipeIngredient` objects.

## Correctness Properties

### Property 1: Portions Field Persistence Round-Trip

*For any* valid recipe with a positive integer `portions` value, creating the recipe via `POST /recipes` and then retrieving it via `GET /recipes/{recipeId}` SHALL return a `portions` value identical to the one submitted.

**Validates: Requirements 2.1, 2.7**

### Property 2: Invalid Portions Rejection

*For any* `POST /recipes` or `PUT /recipes/{recipeId}` request where `portions` is absent, zero, negative, a non-integer number, or a non-numeric value, THE `Recipe_Lambda` SHALL return a 400 validation error and not persist the recipe or the update.

**Validates: Requirements 2.2, 2.3, 2.5**

### Property 3: Scaling Identity at Base Portions

*For any* list of `RecipeIngredient` objects and any positive integer `portions`, calling `Portions_Scaler` with `toPortions = fromPortions` SHALL return quantities equal to the original input quantities.

**Validates: Requirement 7.2**

### Property 4: Scaling Proportionality

*For any* positive integer `fromPortions`, positive integer `toPortions`, and list of `RecipeIngredient` objects with non-negative quantities, the `Portions_Scaler` SHALL return scaled quantities such that `scaledQuantity / baseQuantity = toPortions / fromPortions` for every ingredient with a non-zero base quantity (within floating-point rounding tolerance of 0.01).

**Validates: Requirements 5.1, 7.1**

### Property 5: Scaling Non-Negativity

*For any* valid inputs (positive integer `fromPortions`, positive integer `toPortions`, non-negative ingredient quantities), THE `Portions_Scaler` SHALL return only non-negative scaled quantities.

**Validates: Requirement 7.3**

### Property 6: Edit-Mode Rebase Composability

*For any* recipe with stored `portions` P and ingredient quantities Q, applying two sequential rebase operations — first from P to P₁, then from P₁ to P₂ — SHALL produce the same ingredient quantities as a single rebase from P to P₂ (within floating-point rounding tolerance of 0.01).

**Validates: Requirement 3.6**

### Property 7: Create-Mode Portions Does Not Affect Ingredient Quantities

*For any* set of ingredient quantities entered in create mode, changing the `portions` field to any positive integer value SHALL leave all ingredient quantity fields unchanged.

**Validates: Requirement 1.4**

### Property 8: Edit-Mode Save Persists Scaled Values

*For any* recipe with stored `portions` P and ingredient quantities Q, when the user adjusts `selectedPortions` to P′ in edit mode and saves, retrieving the recipe via `GET /recipes/{recipeId}` SHALL return `portions = P′` and ingredient quantities Q′ such that `Q′[i] / Q[i] = P′ / P` for every ingredient with a non-zero base quantity (within floating-point rounding tolerance of 0.01).

**Validates: Requirements 6.1, 6.2**
