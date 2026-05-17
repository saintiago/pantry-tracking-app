# Requirements Document: Recipe Search & Filter

## Introduction

This feature adds a dedicated search/filter section to the Recipes page so users can narrow down their recipe list by time and ingredient-availability criteria. It composes additively with the existing name-search input and tag-cloud filter introduced by the `recipe-categories` spec.

Four new filters are introduced:

1. **Maximum preparation time** — show recipes whose `prepTime` is at most a given number of minutes.
2. **Maximum cooking time** — show recipes whose `cookTime` is at most a given number of minutes.
3. **Maximum total time** — show recipes whose `totalTime` (computed via the existing `computeTotalTime` helper from `recipe-time-fields`) is at most a given number of minutes.
4. **All ingredients available** — show only recipes whose every ingredient has status `available` against current inventory (i.e., `missingCount === 0`).

The four time fields and the ingredient-availability fields already exist on the Recipe entity and the `GET /recipes/{recipeId}` response. This feature does not change the Recipe data model; it adds UI controls and the filter logic that drives them.

## Glossary

- **Recipe**: A user-owned record as defined in `data-model.md`, with optional `prepTime` and `cookTime` (non-negative integers, minutes) and required `ingredients`.
- **prepTime**: Optional non-negative integer on a Recipe representing preparation time in minutes (defined by `recipe-time-fields`).
- **cookTime**: Optional non-negative integer on a Recipe representing cooking time in minutes (defined by `recipe-time-fields`).
- **totalTime**: The result of `computeTotalTime(prepTime, cookTime)`. Equals `(prepTime ?? 0) + (cookTime ?? 0)` when at least one of the two fields is defined; `undefined` when both are absent.
- **IngredientStatus**: The per-ingredient availability record returned by the recipe API: one of `available`, `partial`, or `missing` (defined by `recipe-management`).
- **missingCount**: The number of ingredients on a recipe whose status is `partial` or `missing` (defined by `recipe-management`).
- **AllAvailable**: A predicate that holds for a recipe if and only if every one of its ingredients has status `available` against the user's current inventory (equivalently, `missingCount === 0`).
- **RecipeFilterPanel**: The new UI section on the Recipes page that hosts the four filter controls and their reset action.
- **RecipeList**: The frontend component at `frontend/src/pages/RecipesPage/RecipeList.tsx` that renders the recipe collection.
- **RecipesPage**: The frontend page at `frontend/src/pages/RecipesPage/RecipesPage.tsx`.
- **Recipe_Filter**: The pure function that takes the full recipe collection plus the active filter values and returns the filtered subset.
- **Pantry_App**: The pantry tracking application as a whole.

## Requirements

### Requirement 1: Filter Panel on the Recipes Page

**User Story:** As a user, I want a dedicated search/filter section on the Recipes page, so that I can narrow down my recipe list by time and ingredient availability.

#### Acceptance Criteria

1. WHILE the list view is active, THE RecipesPage SHALL display the RecipeFilterPanel above the recipe list.
2. THE RecipeFilterPanel SHALL contain a numeric input labeled "Max prep time (min)" for the maximum preparation time filter.
3. THE RecipeFilterPanel SHALL contain a numeric input labeled "Max cook time (min)" for the maximum cooking time filter.
4. THE RecipeFilterPanel SHALL contain a numeric input labeled "Max total time (min)" for the maximum total time filter.
5. THE RecipeFilterPanel SHALL contain a toggle control labeled "Only recipes I can make now" for the all-ingredients-available filter.
6. THE RecipeFilterPanel SHALL contain a "Clear filters" action that resets all four controls to their inactive state.
7. WHEN the user navigates away from the list view and returns, THE RecipeFilterPanel SHALL reset all four filter controls to their inactive state.

### Requirement 2: Maximum Preparation Time Filter

**User Story:** As a user, I want to filter recipes by maximum preparation time, so that I can find recipes that fit the time I have to prep.

#### Acceptance Criteria

1. WHEN the user enters a non-negative integer value V in the "Max prep time (min)" input, THE RecipeList SHALL display only recipes whose `prepTime` is defined and whose `prepTime` is less than or equal to V.
2. WHEN the "Max prep time (min)" input is empty, THE RecipeList SHALL apply no preparation time constraint.
3. IF the user enters a negative number or a non-integer value in the "Max prep time (min)" input, THEN THE RecipeFilterPanel SHALL display an inline validation error and SHALL NOT apply the filter until the value is corrected or cleared.
4. WHEN the "Max prep time (min)" filter is active and a recipe has no `prepTime` value, THE RecipeList SHALL exclude that recipe from the result.

### Requirement 3: Maximum Cooking Time Filter

**User Story:** As a user, I want to filter recipes by maximum cooking time, so that I can find recipes whose cook step fits my available time.

#### Acceptance Criteria

1. WHEN the user enters a non-negative integer value V in the "Max cook time (min)" input, THE RecipeList SHALL display only recipes whose `cookTime` is defined and whose `cookTime` is less than or equal to V.
2. WHEN the "Max cook time (min)" input is empty, THE RecipeList SHALL apply no cooking time constraint.
3. IF the user enters a negative number or a non-integer value in the "Max cook time (min)" input, THEN THE RecipeFilterPanel SHALL display an inline validation error and SHALL NOT apply the filter until the value is corrected or cleared.
4. WHEN the "Max cook time (min)" filter is active and a recipe has no `cookTime` value, THE RecipeList SHALL exclude that recipe from the result.

### Requirement 4: Maximum Total Time Filter

**User Story:** As a user, I want to filter recipes by maximum total time, so that I can find recipes I can complete in the time I have available.

#### Acceptance Criteria

1. WHEN the user enters a non-negative integer value V in the "Max total time (min)" input, THE RecipeList SHALL display only recipes whose `totalTime` is defined and whose `totalTime` is less than or equal to V.
2. WHEN the "Max total time (min)" input is empty, THE RecipeList SHALL apply no total time constraint.
3. IF the user enters a negative number or a non-integer value in the "Max total time (min)" input, THEN THE RecipeFilterPanel SHALL display an inline validation error and SHALL NOT apply the filter until the value is corrected or cleared.
4. WHEN the "Max total time (min)" filter is active and a recipe has neither `prepTime` nor `cookTime`, THE RecipeList SHALL exclude that recipe from the result.
5. THE RecipeList SHALL compute `totalTime` for filtering using the same `computeTotalTime` helper that drives the per-row time badge.

### Requirement 5: All-Ingredients-Available Filter

**User Story:** As a user, I want to filter the recipe list to only recipes whose ingredients I currently have in full, so that I can quickly find recipes I can cook right now.

#### Acceptance Criteria

1. WHEN the "Only recipes I can make now" toggle is active, THE RecipeList SHALL display only recipes for which every ingredient has status `available` against the user's current inventory.
2. WHEN the "Only recipes I can make now" toggle is inactive, THE RecipeList SHALL apply no ingredient-availability constraint.
3. WHEN the "Only recipes I can make now" toggle is active and a recipe has at least one ingredient with status `partial` or `missing`, THE RecipeList SHALL exclude that recipe from the result.
4. WHEN the "Only recipes I can make now" toggle is active and the user's inventory is empty, THE RecipeList SHALL exclude every recipe that has at least one ingredient.
5. THE RecipeList SHALL compute ingredient availability across all of the user's storage locations, consistent with the calculation defined in `recipe-management` Requirement 4.

### Requirement 6: Combination with Existing Filters

**User Story:** As a user, I want the new filters to combine with the existing name search and tag cloud, so that I can refine my list using any combination of criteria.

#### Acceptance Criteria

1. WHEN multiple filters are active simultaneously, THE RecipeList SHALL display only recipes that satisfy every active filter (logical AND across all filters).
2. WHEN no filters are active and the search input is empty, THE RecipeList SHALL display every recipe in the user's collection.
3. THE RecipeList SHALL apply the new time and availability filters in addition to the existing name search and tag cloud, without altering the behavior of those existing filters.

### Requirement 7: Empty Result Message

**User Story:** As a user, I want a clear message when my filter selection produces no results, so that I understand the list is empty by design rather than because of an error.

#### Acceptance Criteria

1. WHEN the recipe list is non-empty but the active filter combination produces an empty result, THE RecipeList SHALL display the message "No recipes match the selected filters."
2. WHEN the user has no recipes at all, THE RecipeList SHALL continue to display the existing "No recipes yet." empty state and SHALL NOT display the filter empty-result message.

### Requirement 8: Reset Filters

**User Story:** As a user, I want a single action to clear all active filters, so that I can return to the unfiltered list without resetting each control individually.

#### Acceptance Criteria

1. WHEN the user activates the "Clear filters" action, THE RecipeFilterPanel SHALL clear the three time filter inputs and deactivate the "Only recipes I can make now" toggle.
2. WHILE every filter control is in its inactive state, THE RecipeFilterPanel SHALL disable the "Clear filters" action.

### Requirement 9: Filter Performance Constraint

**User Story:** As a user, I want filters to apply quickly so that the list updates without a perceptible delay as I adjust the controls.

#### Acceptance Criteria

1. WHILE the user's collection contains at most 500 recipes and at most 500 inventory items, WHEN the user changes any filter control, THE RecipeList SHALL update the displayed result within 200 milliseconds on a mid-range smartphone.

## Correctness Properties

### Property 1: Filter Result Is a Subset of the Input

*For any* list of recipes, any inventory state, and any combination of filter values, the result of `Recipe_Filter` SHALL be a subset of the input recipe list (every recipe in the result also appears in the input).

**Validates: Requirements 2.1, 3.1, 4.1, 5.1, 6.1**

### Property 2: All Filters Inactive Returns the Full List

*For any* list of recipes and any inventory state, applying `Recipe_Filter` with all four new filter controls in their inactive state and with no name search or tag filter active SHALL return the input list unchanged (same recipes, same order).

**Validates: Requirement 6.2**

### Property 3: Time Filter Inclusion Predicate

*For any* list of recipes, any non-negative integer max value V, and any inventory state, when only the corresponding time filter is active:

- A recipe SHALL appear in the result of the prep-time filter if and only if `recipe.prepTime !== undefined && recipe.prepTime <= V`.
- A recipe SHALL appear in the result of the cook-time filter if and only if `recipe.cookTime !== undefined && recipe.cookTime <= V`.
- A recipe SHALL appear in the result of the total-time filter if and only if `computeTotalTime(recipe.prepTime, recipe.cookTime) !== undefined && computeTotalTime(recipe.prepTime, recipe.cookTime) <= V`.

**Validates: Requirements 2.1, 2.4, 3.1, 3.4, 4.1, 4.4**

### Property 4: All-Available Filter Inclusion Predicate

*For any* list of recipes and any inventory state, when only the "Only recipes I can make now" toggle is active, a recipe SHALL appear in the result if and only if every ingredient on that recipe has status `available` against the inventory (equivalently, `missingCount === 0` when the recipe has at least one ingredient).

**Validates: Requirements 5.1, 5.3, 5.4**

### Property 5: Filter Conjunction (AND) Correctness

*For any* list of recipes, any inventory state, and any combination of filter values, a recipe SHALL appear in the result of `Recipe_Filter` if and only if it satisfies every active filter individually (the result equals the intersection of the per-filter results).

**Validates: Requirement 6.1**

### Property 6: Filter Idempotence

*For any* list of recipes, any inventory state, and any combination of filter values, applying `Recipe_Filter` twice SHALL produce the same result as applying it once (`Recipe_Filter(Recipe_Filter(recipes, f), f) === Recipe_Filter(recipes, f)`).

**Validates: Requirements 2.1, 3.1, 4.1, 5.1, 6.1**
