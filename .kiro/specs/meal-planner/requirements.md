# Requirements Document

Feature: Meal Planner

## Introduction

This spec covers the Meal Planner feature of the Pantry Tracking App (Stage 5). The meal planner sits in the middle of the app pipeline: inventory enables recipes, recipes enable the meal planner, and the meal planner enables the shopping list. It lets a user schedule existing recipes onto specific days and meal slots (breakfast, lunch, dinner) using a week-focused calendar, and it persists those assignments through the `/meal-plans` API.

This document covers two parts:

1. The **MealPlan_Lambda** backend that implements `/meal-plans` CRUD.
2. The **frontend meal planner module** rendered on the existing `meal-plan` page — a 7-day calendar where the user adds recipe cards to each day and removes them.

Shared entities (`MealPlan`, `Recipe`), the DynamoDB single-table layout, and the `/meal-plans` API contract are defined in `.kiro/steering/data-model.md` and are referenced here rather than redefined. Shared infrastructure terms (Pantry_App, Beautiful_User) follow the conventions used across existing specs.

## Glossary

- **Pantry_App**: The overall Pantry Tracking App that owns this feature.
- **Beautiful_User**: An authenticated user of the Pantry_App.
- **MealPlan**: A user-owned record assigning one recipe to one date and one meal type. Schema defined in `data-model.md` (fields: `planId`, `date`, `mealType`, `recipeId`, `recipeName`).
- **Meal_Type**: One of the three values `breakfast`, `lunch`, or `dinner`, as defined by the `MealPlan.mealType` field in `data-model.md`.
- **Recipe**: A user-owned recipe from the existing Recipe Management feature. Schema defined in `data-model.md`.
- **MealPlan_Lambda**: The AWS Lambda handler at `backend/src/handlers/meal-plan/meal-plan.ts` that handles all `/meal-plans` API routes.
- **MealPlan_API_Client**: The frontend API client module at `frontend/src/api/meal-plans/meal-plans.ts` that calls the `/meal-plans` routes.
- **MealPlanPage**: The frontend page component at `frontend/src/pages/MealPlanPage/MealPlanPage.tsx`, registered as the `meal-plan` `PageId` in `App.tsx`.
- **WeekCalendar**: The frontend component that renders seven Day_Column elements for one calendar week.
- **Day_Column**: A single column of the WeekCalendar representing one calendar date, containing that date's Recipe_Card elements and one Add_Recipe_Button.
- **Recipe_Card**: A card inside a Day_Column representing one MealPlan assignment, showing the recipe name and its Meal_Type, with a Remove_Button.
- **Remove_Button**: The "x" control on a Recipe_Card that deletes that MealPlan assignment.
- **Add_Recipe_Button**: The "+" control rendered below the Recipe_Card elements in each Day_Column that opens the Add_Recipe_Dialog.
- **Add_Recipe_Dialog**: A simple dialog containing the list of available recipes and a Meal_Type selector, used to add a recipe to a specific date.
- **Week_Start**: The first day shown in the WeekCalendar. The WeekCalendar displays seven consecutive dates starting from Week_Start, where Week_Start defaults to the Monday of the week containing the current date.

## Requirements

### Requirement 1: Weekly Meal Calendar View

**User Story:** As a beautiful user, I want to see my scheduled recipes laid out as a 7-day week, so that I can review my meal plan at a glance.

#### Acceptance Criteria

1. WHEN the beautiful user opens the MealPlanPage, THE MealPlanPage SHALL display the WeekCalendar with seven Day_Column elements representing seven consecutive dates starting from Week_Start.
2. WHEN the MealPlanPage first loads, THE WeekCalendar SHALL set Week_Start to the Monday of the week containing the current date.
3. THE Day_Column SHALL display the day-of-week label and the numeric calendar date it represents.
4. WHEN one or more MealPlan assignments exist for a date shown in the WeekCalendar, THE Day_Column for that date SHALL display one Recipe_Card for each assignment, ordered by Meal_Type in the sequence breakfast, then lunch, then dinner, and ordered by creation time ascending within the same Meal_Type.
5. THE Recipe_Card SHALL display the assigned recipe name and the assignment's Meal_Type.
6. WHEN a Day_Column has no MealPlan assignments, THE Day_Column SHALL display only the Add_Recipe_Button without any Recipe_Card.
7. THE Day_Column SHALL render the Add_Recipe_Button below all Recipe_Card elements in that column.
8. WHILE MealPlan assignments for the displayed week are being retrieved, THE MealPlanPage SHALL display a loading indication within the WeekCalendar.
9. IF retrieval of MealPlan assignments for the displayed week fails, THEN THE MealPlanPage SHALL display an error indication, render all seven Day_Column elements, and display the Add_Recipe_Button in each Day_Column without any Recipe_Card.

### Requirement 2: Load Meal Plans for the Visible Week

**User Story:** As a beautiful user, I want the calendar to show my saved meal plans, so that the schedule I created earlier is preserved.

#### Acceptance Criteria

1. WHEN the WeekCalendar renders a week, THE MealPlan_API_Client SHALL request meal plans from `GET /meal-plans` using `startDate` equal to Week_Start and `endDate` equal to Week_Start plus 6 calendar days, each formatted as an ISO date (YYYY-MM-DD).
2. WHILE meal plans for the visible week are being loaded, THE MealPlanPage SHALL display a loading indicator and SHALL NOT display any previous week's meal plans.
3. WHEN the `GET /meal-plans` response is received, THE WeekCalendar SHALL place each returned MealPlan whose `date` falls within the visible week into the Day_Column whose date matches the MealPlan `date` and into that Day_Column's slot for the MealPlan's `mealType` (breakfast, lunch, or dinner).
4. WHEN the `GET /meal-plans` response contains no meal plans, THE WeekCalendar SHALL render all seven Day_Column elements in an empty state.
5. IF the `GET /meal-plans` request fails or no response is received within 10 seconds, THEN THE MealPlanPage SHALL retain the prior state without displaying partial data and SHALL display an error message and a control to retry the request.
6. WHEN the beautiful user activates the retry control, THE MealPlan_API_Client SHALL re-request `GET /meal-plans` using the same `startDate` and `endDate`.

### Requirement 3: Week Navigation

**User Story:** As a beautiful user, I want to move between weeks, so that I can plan meals for future or past dates.

#### Acceptance Criteria

1. WHILE the WeekCalendar is displayed, THE WeekCalendar SHALL provide a control to advance to the next seven-day period and a control to return to the previous seven-day period.
2. WHEN the beautiful user activates the next-week control, THE WeekCalendar SHALL set Week_Start to the date seven days after the current Week_Start and display seven consecutive Day_Column elements starting from the new Week_Start.
3. WHEN the beautiful user activates the previous-week control, THE WeekCalendar SHALL set Week_Start to the date seven days before the current Week_Start and display seven consecutive Day_Column elements starting from the new Week_Start.
4. WHEN Week_Start changes, THE MealPlan_API_Client SHALL load the meal plans for the newly displayed seven-day period using `startDate` equal to the new Week_Start and `endDate` equal to the seventh displayed date.
5. WHILE a meal-plan load is in progress, THE WeekCalendar SHALL disable the next-week control and the previous-week control.

### Requirement 4: Add a Recipe to a Day

**User Story:** As a beautiful user, I want to add a recipe to a specific day and meal, so that I can build my meal schedule.

#### Acceptance Criteria

1. WHEN the beautiful user activates the Add_Recipe_Button in a Day_Column, THE MealPlanPage SHALL open the Add_Recipe_Dialog for that Day_Column's date.
2. WHEN the Add_Recipe_Dialog opens and one or more recipes are available, THE Add_Recipe_Dialog SHALL display the list of the beautiful user's available recipes.
3. THE Add_Recipe_Dialog SHALL display a Meal_Type selector offering the values `breakfast`, `lunch`, and `dinner`.
4. WHEN the Add_Recipe_Dialog opens, THE Add_Recipe_Dialog SHALL preselect `breakfast` as the default Meal_Type.
5. WHEN the beautiful user selects a recipe and a Meal_Type and confirms, THE MealPlan_API_Client SHALL call `POST /meal-plans` with the Day_Column's date, the selected Meal_Type, the selected recipe's `recipeId`, and the selected recipe's name as `recipeName`.
6. IF the beautiful user confirms with no recipe selected, THEN THE Add_Recipe_Dialog SHALL display a validation message and SHALL NOT call `POST /meal-plans`.
7. WHEN the `POST /meal-plans` request succeeds, THE WeekCalendar SHALL add a Recipe_Card for the new assignment to the corresponding Day_Column and close the Add_Recipe_Dialog.
8. WHEN the beautiful user dismisses the Add_Recipe_Dialog without confirming, THE MealPlanPage SHALL close the Add_Recipe_Dialog without creating a MealPlan.
9. IF the `POST /meal-plans` request fails, THEN THE Add_Recipe_Dialog SHALL display an error message indicating the assignment could not be saved, retain the selected recipe and Meal_Type, and keep the dialog open.
10. IF the `POST /meal-plans` request does not return a success or failure response within 10 seconds, THEN THE Add_Recipe_Dialog SHALL treat the request as failed, display an error message indicating the assignment could not be saved, retain the selected recipe and Meal_Type, and keep the dialog open.
11. WHEN the authenticated beautiful user has no recipes, THE Add_Recipe_Dialog SHALL display an empty-state message and SHALL NOT enable confirmation.

### Requirement 5: Remove a Recipe from a Day

**User Story:** As a beautiful user, I want to remove a recipe from a day, so that I can correct or change my plan.

#### Acceptance Criteria

1. THE Recipe_Card SHALL display a Remove_Button labeled to indicate that activating it removes the assignment.
2. WHEN the beautiful user activates the Remove_Button on a Recipe_Card, THE MealPlan_API_Client SHALL call `DELETE /meal-plans/{planId}` using that assignment's `planId`.
3. WHILE a delete is in progress for a Recipe_Card, THE WeekCalendar SHALL disable that Recipe_Card's Remove_Button.
4. WHEN the `DELETE /meal-plans/{planId}` request succeeds, THE WeekCalendar SHALL remove the corresponding Recipe_Card from its Day_Column.
5. IF the `DELETE /meal-plans/{planId}` request fails or no response is received within 10 seconds, THEN THE MealPlanPage SHALL display an error message indicating the removal failed.
6. IF the `DELETE /meal-plans/{planId}` request fails or no response is received within 10 seconds, THEN THE WeekCalendar SHALL keep the corresponding Recipe_Card visible.
7. IF the `DELETE /meal-plans/{planId}` request fails or no response is received within 10 seconds, THEN THE WeekCalendar SHALL re-enable that Recipe_Card's Remove_Button.

### Requirement 6: Available Recipes Source

**User Story:** As a beautiful user, I want the add-recipe dialog to show my own recipes, so that I can schedule recipes I have created.

#### Acceptance Criteria

1. WHEN the Add_Recipe_Dialog needs the available recipes, THE MealPlan_API_Client SHALL retrieve the beautiful user's recipes from `GET /recipes` with a request timeout of 10 seconds.
2. WHILE the recipe list is being retrieved, THE Add_Recipe_Dialog SHALL display a loading indication and SHALL NOT display the empty-state message or the error indication.
3. WHEN the recipe retrieval succeeds, THE Add_Recipe_Dialog SHALL list every recipe returned for the authenticated beautiful user, ordered alphabetically by recipe name using a case-insensitive comparison.
4. WHEN the recipe retrieval succeeds and returns zero recipes, THE Add_Recipe_Dialog SHALL display a message indicating that no recipes are available to add.
5. IF the recipe retrieval request fails or no response is received within 10 seconds, THEN THE Add_Recipe_Dialog SHALL display an error indication in place of the recipe list, provide a control to retry the retrieval, and SHALL NOT display a partial or stale recipe list.

### Requirement 7: Meal Plan CRUD via API

**User Story:** As a developer, I want the MealPlan_Lambda to implement all `/meal-plans` operations, so that the frontend can manage meal plans through a consistent API.

#### Acceptance Criteria

1. WHEN `GET /meal-plans` is called with a valid auth token and `startDate` and `endDate` query parameters, THE MealPlan_Lambda SHALL return all MealPlan records belonging to the authenticated beautiful user whose `date` falls within the inclusive range from `startDate` to `endDate`.
2. WHEN `GET /meal-plans` is called with a valid auth token and a valid `startDate` and `endDate` range that matches no MealPlan records, THE MealPlan_Lambda SHALL return an empty collection.
3. IF `GET /meal-plans` is called with a missing `startDate` or `endDate`, a `startDate` or `endDate` that is not an ISO date in `YYYY-MM-DD` format, or an `endDate` that is before `startDate`, THEN THE MealPlan_Lambda SHALL return a 400 response with a validation error and SHALL NOT return any MealPlan records.
4. WHEN `POST /meal-plans` is called with a valid body containing `date`, `mealType`, `recipeId`, and `recipeName`, THE MealPlan_Lambda SHALL persist the MealPlan and return it with a unique generated `planId` and with `createdAt` and `updatedAt` set to ISO timestamps.
5. IF `POST /meal-plans` is called with a `mealType` that is not `breakfast`, `lunch`, or `dinner`, THEN THE MealPlan_Lambda SHALL return a 400 response with a validation error and SHALL NOT persist a MealPlan.
6. IF `POST /meal-plans` is called with a missing `date`, a `date` that is not an ISO date in `YYYY-MM-DD` format, a missing `recipeId`, or a missing `recipeName`, THEN THE MealPlan_Lambda SHALL return a 400 response with a validation error and SHALL NOT persist a MealPlan.
7. WHEN `PUT /meal-plans/{planId}` is called for an assignment owned by the authenticated beautiful user with valid values for any of the fields `date`, `mealType`, `recipeId`, and `recipeName`, THE MealPlan_Lambda SHALL persist the provided field changes, set `updatedAt` to a new ISO timestamp, and return the updated MealPlan.
8. IF `PUT /meal-plans/{planId}` is called with an invalid `mealType`, a `date` that is not an ISO date in `YYYY-MM-DD` format, or an empty value for `recipeId` or `recipeName`, THEN THE MealPlan_Lambda SHALL return a 400 response with a validation error and SHALL NOT persist any changes.
9. WHEN `DELETE /meal-plans/{planId}` is called for an assignment owned by the authenticated beautiful user, THE MealPlan_Lambda SHALL remove the MealPlan and return a 200 response.
10. IF `GET`, `PUT`, or `DELETE` is called for a `planId` that does not belong to the authenticated beautiful user, THEN THE MealPlan_Lambda SHALL return a 404 response.
11. IF any `/meal-plans` request is made without a valid auth token, THEN THE MealPlan_Lambda SHALL return a 401 response.

## Correctness Properties

### Property 16: Meal Plan CRUD Persistence

*For any* valid MealPlan data, creating an assignment via `POST /meal-plans` and then retrieving it via `GET /meal-plans` with a date range that includes the assignment's `date` SHALL return a MealPlan with matching `date`, `mealType`, `recipeId`, and `recipeName`. Updating via `PUT /meal-plans/{planId}` SHALL persist the changed fields. Deleting via `DELETE /meal-plans/{planId}` SHALL cause a subsequent `GET /meal-plans` over the same range to omit that assignment.

**Validates: Requirements 7.1, 7.2, 7.4, 7.7, 7.9**

### Property 17: Date Range Query Bounds

*For any* set of MealPlan records and any `startDate`/`endDate` pair, `GET /meal-plans` SHALL return exactly the records whose `date` is greater than or equal to `startDate` and less than or equal to `endDate`, and SHALL exclude all records whose `date` falls outside that inclusive range.

**Validates: Requirements 7.1, 7.2**

### Property 18: Meal Type Validation

*For any* `POST /meal-plans` request whose `mealType` is not one of `breakfast`, `lunch`, or `dinner`, THE MealPlan_Lambda SHALL return a 400 validation error and SHALL NOT persist a MealPlan.

**Validates: Requirement 7.5**
