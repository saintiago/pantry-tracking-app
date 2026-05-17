# Requirements Document

## Introduction

This feature adds a category (tag) system to recipes. Every recipe must have at least one category tag. Tags are entered via a text field with autocomplete suggestions drawn from all existing recipe tags. Pressing Enter, comma, semicolon, or period commits the current input as a tag chip. Tags are displayed visually on recipe cards in the list view and on the recipe detail view. Users can filter the recipe list by one or more tags using a tag cloud that shows all tags currently in use.

## Glossary

- **Recipe_Tag**: A short, user-defined text label attached to a recipe (e.g. "vegetarian", "quick", "dessert"). Tags are always lowercased before storing and matching.
- **Tag_Input**: The interactive text field inside the RecipeEditor that accepts free-text input and commits tags on delimiter keystrokes (Enter, comma, semicolon, period).
- **Tag_Chip**: The visual representation of a committed tag — a pill-shaped element with a distinct background colour, rounded corners, and a remove button.
- **Tag_Cloud**: The filter control displayed above the recipe list showing all distinct tags currently assigned to at least one recipe. Each tag in the cloud is a toggleable button.
- **Tag_Autocomplete**: The dropdown that appears below the Tag_Input when the user has typed one or more characters, showing existing tags that match the current input.
- **RecipeEditor**: The frontend component at `frontend/src/pages/RecipesPage/RecipeEditor.tsx` used to create and edit recipes.
- **RecipeList**: The frontend component at `frontend/src/pages/RecipesPage/RecipeList.tsx` that displays the user's recipe collection.
- **RecipeDetail**: The frontend component at `frontend/src/pages/RecipesPage/RecipeDetail.tsx` that shows a full recipe.
- **Recipe_Lambda**: The AWS Lambda handler at `backend/src/handlers/recipe/recipe.ts` that handles all `/recipes` API routes.
- **Pantry_App**: The pantry tracking application as a whole.

## Requirements

### Requirement 1: Recipe Must Have at Least One Category Tag

**User Story:** As a user, I want every recipe to require at least one category tag, so that all recipes are always categorised and filterable.

#### Acceptance Criteria

1. WHEN the user submits the RecipeEditor form, THE RecipeEditor SHALL validate that at least one tag is present and display an inline error message if the tags list is empty.
2. IF `POST /recipes` is called with an empty or absent `tags` array, THEN THE Recipe_Lambda SHALL return a 400 response with a validation error.
3. IF `PUT /recipes/{recipeId}` is called with an empty `tags` array, THEN THE Recipe_Lambda SHALL return a 400 response with a validation error.
4. THE Recipe_Lambda SHALL accept a `tags` field on `POST /recipes` and `PUT /recipes/{recipeId}` as an array of non-empty strings.

### Requirement 2: Multiple Tags per Recipe

**User Story:** As a user, I want to add multiple category tags to a recipe, so that I can classify it under more than one category.

#### Acceptance Criteria

1. THE RecipeEditor SHALL allow the user to add any number of tags to a recipe.
2. WHEN the user types in the Tag_Input and presses Enter, comma, semicolon, or period, THE Tag_Input SHALL commit the current non-empty trimmed, lowercased input as a new Tag_Chip and clear the input field.
3. WHEN a tag is committed, THE Tag_Input SHALL retain keyboard focus so the user can continue entering tags without re-clicking.
4. WHEN the user commits a tag whose trimmed, lowercased value matches an existing tag on the same recipe, THE Tag_Input SHALL discard the duplicate and not add a second chip.
5. THE RecipeEditor SHALL display each committed tag as a Tag_Chip positioned above the Tag_Input field.

### Requirement 3: Tag Chip Visual Style and Removal

**User Story:** As a user, I want committed tags to look visually distinct and be removable, so that I can clearly see and manage the tags on a recipe.

#### Acceptance Criteria

1. THE Tag_Chip SHALL be rendered with a coloured background, rounded corners (border-radius ≥ 12px), and font weight ≥ 600 to distinguish it from plain text.
2. THE Tag_Chip SHALL include a remove button (×) that, when activated, removes that tag from the recipe's tag list.
3. WHEN the remove button on a Tag_Chip is activated via click or keyboard (Enter or Space), THE RecipeEditor SHALL remove that tag from the tag list.
4. THE Tag_Chip remove button SHALL have an accessible label of "Remove tag {tagName}".

### Requirement 4: Tag Autocomplete

**User Story:** As a user, I want autocomplete suggestions when entering a tag, so that I can reuse existing tags consistently without retyping them.

#### Acceptance Criteria

1. WHEN the user types one or more characters in the Tag_Input, THE Tag_Autocomplete SHALL display existing tags from the user's recipes that contain the typed text (case-insensitive substring match).
2. WHEN the user selects a suggestion from the Tag_Autocomplete, THE Tag_Input SHALL commit that tag as a Tag_Chip and clear the input field.
3. WHEN the Tag_Autocomplete is visible and the user presses Escape, THE Tag_Autocomplete SHALL close without committing any tag.
4. THE Tag_Autocomplete SHALL show at most 10 suggestions at a time.
5. WHEN the Tag_Input receives focus, THE Tag_Autocomplete SHALL display all available tags (excluding those already on the recipe), up to 10 suggestions.
6. THE Tag_Autocomplete SHALL exclude tags already present on the current recipe from its suggestions.

### Requirement 5: Tags Displayed on Recipe Cards and Detail View

**User Story:** As a user, I want to see a recipe's tags on the recipe list and detail view, so that I can identify a recipe's categories at a glance.

#### Acceptance Criteria

1. WHEN the RecipeList renders a recipe row, THE RecipeList SHALL display all tags for that recipe as Tag_Chips below the recipe name.
2. WHEN the RecipeDetail renders a recipe, THE RecipeDetail SHALL display all tags for that recipe as Tag_Chips in a dedicated section below the recipe title.
3. THE Tag_Chip in list and detail views SHALL be read-only (no remove button).

### Requirement 6: Filter Recipes by Tag

**User Story:** As a user, I want to filter the recipe list by one or more tags, so that I can quickly find recipes in a specific category.

#### Acceptance Criteria

1. THE RecipeList SHALL display a Tag_Cloud above the recipe list showing all distinct tags currently assigned to at least one recipe, sorted alphabetically.
2. WHEN the user activates a tag in the Tag_Cloud, THE RecipeList SHALL add that tag to the active filter set and display only recipes that have all active filter tags (AND logic).
3. WHEN the user activates an already-active tag in the Tag_Cloud, THE RecipeList SHALL remove that tag from the active filter set.
4. WHEN no tags are active in the Tag_Cloud, THE RecipeList SHALL display all recipes (subject to any existing text search filter).
5. WHEN the active filter set is non-empty, THE RecipeList SHALL visually distinguish active filter tags from inactive ones in the Tag_Cloud.
6. WHEN the recipe list is empty after applying tag filters, THE RecipeList SHALL display the message "No recipes match the selected tags."
7. THE Tag_Cloud SHALL be hidden when no recipes exist or no tags are in use.

### Requirement 7: Tag Data Persistence

**User Story:** As a developer, I want tags to be stored on the Recipe entity and returned by the API, so that the frontend can display and filter them reliably.

#### Acceptance Criteria

1. THE Recipe_Lambda SHALL store the `tags` field as an array of strings on the Recipe DynamoDB item.
2. WHEN `GET /recipes` is called, THE Recipe_Lambda SHALL include the `tags` array in each recipe object in the response.
3. WHEN `GET /recipes/{recipeId}` is called, THE Recipe_Lambda SHALL include the `tags` array in the recipe object in the response.
4. THE Recipe_Lambda SHALL trim whitespace from each tag value before storing.
5. THE Recipe_Lambda SHALL deduplicate tags case-insensitively before storing, lowercasing each tag value.

### Requirement 8: Tag Correctness Properties

**User Story:** As a developer, I want the tag deduplication and filtering logic to be correct for all inputs, so that users never see duplicate tags or incorrect filter results.

#### Acceptance Criteria

1. FOR ALL arrays of recipe tags, THE deduplication function SHALL produce an output where no two tags are equal when compared case-insensitively (idempotence: deduplicating twice produces the same result as deduplicating once).
2. FOR ALL recipes and active filter tag sets, THE filter function SHALL include a recipe in the result if and only if the recipe's tags contain every tag in the active filter set (case-insensitive).
3. FOR ALL recipes and active filter tag sets, THE filter function SHALL produce a result that is a subset of the full recipe list.
4. WHEN the active filter set is empty, THE filter function SHALL return the full recipe list unchanged.
