# Requirements Document: Recipe Time Fields

## Introduction

This feature adds optional preparation time (`prepTime`) and cooking time (`cookTime`) fields to the Recipe entity. When either value is present, the UI displays a computed total time (`prepTime + cookTime`). Both fields are optional so that existing recipes remain valid without modification.

The feature touches the data model, the Recipe Lambda (create and update), the recipe API client, the RecipeEditor form, and the RecipeDetail and RecipeList display components.

## Glossary

- **Recipe**: A user-owned record as defined in `data-model.md`. Extended by this feature with optional `prepTime` and `cookTime` fields.
- **prepTime**: Optional non-negative integer representing preparation time in minutes.
- **cookTime**: Optional non-negative integer representing cooking time in minutes.
- **totalTime**: The computed sum `prepTime + cookTime`. Defined only when at least one of the two fields is present on a recipe.
- **Recipe_Lambda**: The AWS Lambda handler at `backend/src/handlers/recipe/recipe.ts`.
- **RecipeEditor**: The frontend form component at `frontend/src/pages/RecipesPage/RecipeEditor.tsx` used to create and edit recipes.
- **RecipeDetail**: The frontend component at `frontend/src/pages/RecipesPage/RecipeDetail.tsx` that displays a full recipe.
- **RecipeList**: The frontend component at `frontend/src/pages/RecipesPage/RecipeList.tsx` that shows the recipe collection.
- **Time_Calculator**: The pure function that computes `totalTime` from `prepTime` and `cookTime`.

## Requirements

### Requirement 1: Optional Time Fields on the Recipe Entity

**User Story:** As a user, I want to record how long a recipe takes to prepare and cook, so that I can plan my meals around available time.

#### Acceptance Criteria

1. THE Pantry_App SHALL allow `prepTime` and `cookTime` to be omitted when creating or updating a recipe.
2. WHEN `prepTime` is provided, THE Recipe_Lambda SHALL accept only a non-negative integer value representing minutes.
3. WHEN `cookTime` is provided, THE Recipe_Lambda SHALL accept only a non-negative integer value representing minutes.
4. IF `prepTime` is provided and is not a non-negative integer, THEN THE Recipe_Lambda SHALL return a 400 response with a validation error identifying the `prepTime` field.
5. IF `cookTime` is provided and is not a non-negative integer, THEN THE Recipe_Lambda SHALL return a 400 response with a validation error identifying the `cookTime` field.
6. WHEN a recipe is created without `prepTime` or `cookTime`, THE Recipe_Lambda SHALL store the recipe without those fields and return the recipe without them.

### Requirement 2: Persisting Time Fields

**User Story:** As a user, I want the time values I enter to be saved and retrievable, so that they are available every time I view the recipe.

#### Acceptance Criteria

1. WHEN `POST /recipes` is called with valid `prepTime` and/or `cookTime` values, THE Recipe_Lambda SHALL persist those values and return them in the response body.
2. WHEN `PUT /recipes/{recipeId}` is called with valid `prepTime` and/or `cookTime` values, THE Recipe_Lambda SHALL update those fields and return the updated recipe.
3. WHEN `PUT /recipes/{recipeId}` is called without `prepTime` or `cookTime` in the request body, THE Recipe_Lambda SHALL leave the existing time field values unchanged.
4. WHEN `GET /recipes/{recipeId}` is called for a recipe that has `prepTime` and/or `cookTime` stored, THE Recipe_Lambda SHALL include those values in the response.
5. WHEN `GET /recipes` is called, THE Recipe_Lambda SHALL include `prepTime` and `cookTime` in each recipe object where those fields are stored.

### Requirement 3: Total Time Calculation

**User Story:** As a user, I want to see the total time a recipe takes at a glance, so that I do not have to add up the values myself.

#### Acceptance Criteria

1. WHEN a recipe has both `prepTime` and `cookTime`, THE Time_Calculator SHALL compute `totalTime` as `prepTime + cookTime`.
2. WHEN a recipe has only `prepTime` and no `cookTime`, THE Time_Calculator SHALL compute `totalTime` as `prepTime`.
3. WHEN a recipe has only `cookTime` and no `prepTime`, THE Time_Calculator SHALL compute `totalTime` as `cookTime`.
4. WHEN a recipe has neither `prepTime` nor `cookTime`, THE Time_Calculator SHALL produce no `totalTime` value.
5. THE Time_Calculator SHALL treat an absent field as contributing 0 to the sum when the other field is present.

### Requirement 4: Displaying Time in RecipeDetail

**User Story:** As a user, I want to see prep time, cook time, and total time on the recipe detail screen, so that I know how long the recipe will take before I start cooking.

#### Acceptance Criteria

1. WHEN a recipe has at least one of `prepTime` or `cookTime`, THE RecipeDetail SHALL display the total time in minutes.
2. WHEN a recipe has both `prepTime` and `cookTime`, THE RecipeDetail SHALL display `prepTime` and `cookTime` individually in addition to the total time.
3. WHEN a recipe has neither `prepTime` nor `cookTime`, THE RecipeDetail SHALL not display any time information.
4. THE RecipeDetail SHALL label time values clearly so the user can distinguish preparation time, cooking time, and total time.

### Requirement 5: Displaying Time in RecipeList

**User Story:** As a user, I want to see the total time for each recipe in the list, so that I can quickly identify recipes that fit my available time.

#### Acceptance Criteria

1. WHEN a recipe in the list has a computable `totalTime`, THE RecipeList SHALL display the total time next to the recipe name.
2. WHEN a recipe in the list has no `prepTime` or `cookTime`, THE RecipeList SHALL not display any time indicator for that recipe.

### Requirement 6: Editing Time Fields in RecipeEditor

**User Story:** As a user, I want to enter and update prep time and cook time when creating or editing a recipe, so that the time information stays accurate.

#### Acceptance Criteria

1. THE RecipeEditor SHALL provide an optional numeric input field for `prepTime` labeled "Prep time (min)".
2. THE RecipeEditor SHALL provide an optional numeric input field for `cookTime` labeled "Cook time (min)".
3. WHEN the user enters a value in either time field, THE RecipeEditor SHALL accept only non-negative integers.
4. IF the user enters a negative number or a non-integer in a time field, THEN THE RecipeEditor SHALL display a validation error for that field and not submit the form.
5. WHEN the user leaves both time fields empty, THE RecipeEditor SHALL submit the recipe without `prepTime` or `cookTime`.
6. WHEN the RecipeEditor is opened in edit mode for a recipe that has `prepTime` and/or `cookTime`, THE RecipeEditor SHALL pre-populate those fields with the stored values.
7. WHEN the user clears a time field that previously had a value and saves, THE RecipeEditor SHALL send an explicit update to remove that field from the recipe.

## Correctness Properties

### Property 1: Total Time Calculation Correctness

*For any* combination of optional non-negative integer `prepTime` and `cookTime` values, the Time_Calculator SHALL produce `totalTime` equal to the sum of the present values, treating absent values as 0. When both are absent, no `totalTime` SHALL be produced.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

### Property 2: Time Field Persistence Round-Trip

*For any* valid recipe with optional `prepTime` and/or `cookTime`, creating the recipe via `POST /recipes` and then retrieving it via `GET /recipes/{recipeId}` SHALL return `prepTime` and `cookTime` values that are identical to those submitted. Recipes created without time fields SHALL be returned without them.

**Validates: Requirements 2.1, 2.4**

### Property 3: Invalid Time Field Rejection

*For any* `POST /recipes` or `PUT /recipes/{recipeId}` request where `prepTime` or `cookTime` is a negative number, a non-integer, or a non-numeric value, THE Recipe_Lambda SHALL return a 400 validation error and not persist the recipe or the update.

**Validates: Requirements 1.4, 1.5**
