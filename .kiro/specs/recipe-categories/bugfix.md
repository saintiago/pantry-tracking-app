# Bugfix Requirements Document

## Introduction

When a user edits a recipe and adds new tags then saves, those new tags do not appear in the TagCloud filter above the recipe list, nor in the autocomplete suggestions when editing other recipes. The root cause is that `RecipesPage` fetches all tags only once on mount via `fetchRecipeTags()` and stores them in `allTags` state. After a recipe is saved (create or update), `allTags` is never re-fetched, so it remains stale and does not include any newly added tags.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the user saves a recipe (create or update) that contains tags not previously present in any other recipe THEN the system does not re-fetch tags from `GET /recipes/tags`, leaving `allTags` state stale

1.2 WHEN `allTags` is stale after a save THEN the system displays the TagCloud without the newly added tags, so the user cannot filter by them

1.3 WHEN `allTags` is stale after a save THEN the system shows autocomplete suggestions in `TagInput` that do not include the newly added tags, so the user cannot reuse them when editing other recipes

### Expected Behavior (Correct)

2.1 WHEN the user saves a recipe (create or update) THEN the system SHALL re-fetch tags from `GET /recipes/tags` and update `allTags` state so that newly added tags are immediately available

2.2 WHEN `allTags` is refreshed after a save THEN the system SHALL display the TagCloud with all current tags, including any newly added ones

2.3 WHEN `allTags` is refreshed after a save THEN the system SHALL provide autocomplete suggestions in `TagInput` that include all current tags, including any newly added ones

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the page first mounts THEN the system SHALL CONTINUE TO fetch tags from `GET /recipes/tags` and populate `allTags` on load

3.2 WHEN `fetchRecipeTags` fails on mount THEN the system SHALL CONTINUE TO silently fail and render the page with an empty `allTags` (no crash)

3.3 WHEN the user navigates between list, detail, and editor views without saving THEN the system SHALL CONTINUE TO preserve the existing `allTags` state without unnecessary re-fetches

3.4 WHEN the user saves a recipe THEN the system SHALL CONTINUE TO navigate to the recipe detail view after a successful save

3.5 WHEN `fetchRecipeTags` fails after a save THEN the system SHALL CONTINUE TO silently fail and retain the previously loaded `allTags` without crashing
