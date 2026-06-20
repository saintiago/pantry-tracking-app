# Implementation Plan: Meal Planner (Stage 5)

## Overview

Convert the Meal Planner design into incremental, test-backed coding steps. The plan builds the backend `MealPlan_Lambda` (`/meal-plans` CRUD) and its CDK wiring first, then the pure frontend date/sort helpers, the `MealPlan_API_Client`, the React calendar UI (`WeekCalendar`, `Day_Column`, `Recipe_Card`, `Add_Recipe_Dialog`, `MealPlanPage`), `App.tsx` wiring, and finally an end-to-end Playwright spec. Each step builds on the previous ones and ends with everything wired together, with no orphaned code.

Implementation language: **TypeScript** (React 18 frontend, AWS Lambda backend), matching the design and existing handlers (`recipe.ts`) and API clients (`inventory.ts`). Property-based tests use `fast-check` with the property numbers from `design.md`.

## Tasks

- [x] 1. Implement MealPlan_Lambda backend
  - [x] 1.1 Create validation and pure helpers in `meal-plan.ts`
    - Create `backend/src/handlers/meal-plan/meal-plan.ts`
    - Define `MEAL_TYPES`, `MealType`, and the `response()` / `getUserId()` helpers following `recipe.ts`
    - Implement and export `isValidMealType`, `isValidIsoDate` (strict `YYYY-MM-DD`), `validateDateRange`, `validateCreateBody`, `validateUpdateBody`, and `filterByDateRange`
    - _Requirements: 7.3, 7.5, 7.6, 7.8_

  - [x] 1.2 Implement the route dispatcher and CRUD handlers in `meal-plan.ts`
    - Implement `handler` dispatcher (GET/POST→no planId, PUT/DELETE→planId, 401 when no user, 405 otherwise)
    - Implement `listMealPlans` (query `PK=USER#<userId>` with `begins_with(SK,'MEAL#')`, then `filterByDateRange`), `createMealPlan` (`randomUUID` planId, `createdAt`/`updatedAt`, `syncVersion:1`), `updateMealPlan` (in-place `UpdateCommand`; delete-old-key + put-new-key when `date`/`mealType` change), `deleteMealPlan` (existence check → 404, then `DeleteCommand`)
    - Return 404 for a `planId` absent under the caller's partition; wrap in try/catch returning 500 `INTERNAL_ERROR` with `requestId`
    - _Requirements: 7.1, 7.2, 7.4, 7.7, 7.9, 7.10, 7.11_

  - [x] 1.3 Register MealPlan_Lambda and routes in CDK stack
    - Add the Lambda (`NodejsFunction`) and `/meal-plans` + `/meal-plans/{planId}` API Gateway routes (GET/POST/PUT/DELETE) in `infrastructure/src/pantry-stack.ts`
    - Grant the function read/write on the `PantryApp` table
    - _Requirements: 7.1, 7.4, 7.7, 7.9_

  - [x] 1.4 Write property tests for MealPlan_Lambda
    - File: `backend/src/handlers/meal-plan/__tests__/meal-plan.property.test.ts`, mocking `@aws-sdk/lib-dynamodb` with an in-memory store (the `mockSend` pattern from `recipe.property.test.ts`), `{ numRuns: 100 }`
    - **Property 7: Meal plan CRUD persistence (round trip)** — Validates: Requirements 7.1, 7.4, 7.7, 7.9
    - **Property 8: Date range query bounds are inclusive and exact** — Validates: Requirements 7.1, 7.2
    - **Property 9: Invalid meal type is rejected without persistence** — Validates: Requirements 7.5
    - **Property 10: Invalid create or update bodies are rejected without persistence** — Validates: Requirements 7.6, 7.8
    - **Property 11: Date-range query parameters are validated** — Validates: Requirements 7.3

  - [x] 1.5 Write unit tests for MealPlan_Lambda
    - File: `backend/src/handlers/meal-plan/__tests__/meal-plan.test.ts`
    - 401 with no auth (7.11); 404 for PUT/DELETE on a foreign/absent `planId` (7.10); 405 for unmatched routes; representative 200 success shapes per verb; PUT that changes `date`/`mealType` rewrites the SK correctly
    - _Requirements: 7.10, 7.11_

- [x] 2. Implement frontend pure date/sort helpers
  - [x] 2.1 Create `weekUtils.ts`
    - Create `frontend/src/pages/MealPlanPage/weekUtils.ts`
    - Implement and export `getWeekStart`, `addDays`, `getWeekDates`, `getDayLabel`, `getDayNumber`, the `Assignment` interface, `sortAssignments` (breakfast→lunch→dinner, then `createdAt` ascending), and `groupByDate`
    - All operate on ISO `YYYY-MM-DD` strings using lexicographic comparison
    - _Requirements: 1.1, 1.2, 1.4, 2.1, 2.3, 3.2, 3.3_

  - [x] 2.2 Write property tests for `weekUtils.ts`
    - File: `frontend/src/pages/MealPlanPage/__tests__/weekUtils.property.test.ts`, `{ numRuns: 100 }`
    - **Property 1: Week_Start is the Monday of the reference week** — Validates: Requirements 1.2
    - **Property 2: A week spans seven consecutive dates from Week_Start** — Validates: Requirements 1.1, 2.1
    - **Property 3: Week navigation is an exact ±7-day shift and round-trips** — Validates: Requirements 3.2, 3.3
    - **Property 4: Assignment ordering is by meal type then creation time** — Validates: Requirements 1.4
    - **Property 5: Each assignment is placed under its own date** — Validates: Requirements 2.3

- [x] 3. Implement MealPlan_API_Client
  - [x] 3.1 Create `meal-plans.ts` API client
    - Create `frontend/src/api/meal-plans/meal-plans.ts` following `inventory.ts` (auth headers from Cognito session, `API_URL` from config, `throw new Error(body.message ?? …)` on non-ok)
    - Implement `fetchMealPlans(startDate, endDate)` (GET with ISO query params), `createMealPlan(input)` (POST), `deleteMealPlan(planId)` (DELETE), and `fetchRecipesForPlanning()` (GET `/recipes`)
    - Add a 10-second `AbortController` timeout to every call; export `MealPlan`, `CreateMealPlanInput`, and `PlannableRecipe` types
    - _Requirements: 2.1, 2.5, 4.5, 4.10, 5.2, 5.5, 6.1_

  - [x] 3.2 Write unit tests for `meal-plans.ts`
    - File: `frontend/src/api/meal-plans/__tests__/meal-plans.test.ts`
    - Test correct URLs/methods/query encoding, bearer header attached, 10-second `AbortController` timeout wiring, and error-message extraction from response bodies (mocked fetch)
    - _Requirements: 2.1, 2.5, 4.5, 5.2, 6.1_

- [x] 4. Checkpoint - backend and frontend foundations
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement the meal planner UI
  - [x] 5.1 Implement `Recipe_Card` component
    - Create `frontend/src/pages/MealPlanPage/RecipeCard.tsx`
    - Render recipe name and Meal_Type, plus a labeled `Remove_Button` that is disabled while its delete is in flight and invokes a remove callback with the assignment's `planId`
    - _Requirements: 1.5, 5.1, 5.2, 5.3_

  - [x] 5.2 Implement `Day_Column` component
    - Create `frontend/src/pages/MealPlanPage/DayColumn.tsx`
    - Render the day-of-week label and numeric date, the ordered `Recipe_Card`s, and the `Add_Recipe_Button` rendered below all cards; empty columns show only the Add_Recipe_Button
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 1.7_

  - [x] 5.3 Implement `Add_Recipe_Dialog` component
    - Create `frontend/src/pages/MealPlanPage/AddRecipeDialog.tsx` (modal — sanctioned exception per design)
    - Lazily fetch recipes via `fetchRecipesForPlanning()`; show loading/empty/error+retry states; list recipes alphabetically (case-insensitive); Meal_Type selector defaulting to `breakfast`; validation when confirming with no recipe; on confirm call `createMealPlan`; keep dialog open with retained selection on failure/timeout
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6, 4.8, 4.9, 4.10, 4.11, 6.2, 6.3, 6.4, 6.5_

  - [x] 5.4 Write property test for recipe ordering
    - File: `frontend/src/pages/MealPlanPage/__tests__/AddRecipeDialog.property.test.tsx`, `{ numRuns: 100 }`
    - **Property 6: Available recipes are ordered alphabetically, case-insensitively, with no loss** — Validates: Requirements 6.3

  - [x] 5.5 Implement `WeekCalendar` component
    - Create `frontend/src/pages/MealPlanPage/WeekCalendar.tsx`
    - Render seven `Day_Column`s from `weekDates` + grouped assignments; render previous/next-week controls disabled while loading; show loading indication and an error indication that still renders all seven columns with Add_Recipe_Buttons and no cards
    - _Requirements: 1.1, 1.8, 1.9, 3.1, 3.5_

  - [x] 5.6 Implement `MealPlanPage` and wire components together
    - Create `frontend/src/pages/MealPlanPage/MealPlanPage.tsx`
    - Own `weekStart`, `mealPlans`, `loading`, `error`, dialog state; compute `Week_Start` via `getWeekStart`; fetch on mount and on week change (`startDate`=Week_Start, `endDate`=`addDays(weekStart,6)`); group via `groupByDate`/`sortAssignments`; handle next/previous navigation, retry on load failure, add (insert card from response, close dialog), and remove (refresh from server, keep card + re-enable + error on failure/timeout)
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.2, 3.3, 3.4, 4.1, 4.7, 5.4, 5.5, 5.6, 5.7_

  - [x] 5.7 Write unit tests for page and components
    - Files: `frontend/src/pages/MealPlanPage/__tests__/MealPlanPage.test.tsx`, `WeekCalendar.test.tsx`, `AddRecipeDialog.test.tsx`
    - Seven columns with labels/numbers (1.3) and empty-column Add button only (1.6, 1.7); loading during fetch and no prior-week data shown (1.8, 2.2); error state renders columns + add buttons + error (1.9); week-load failure error + retry refetches same range (2.5, 2.6); nav controls present/disabled while loading (3.1, 3.5) and refetch new range (3.4); add flow (4.1–4.11); recipe fetch states (6.2, 6.4, 6.5); remove flow (5.1–5.7)
    - _Requirements: 1.3, 1.6, 1.7, 1.8, 1.9, 2.2, 2.5, 2.6, 3.1, 3.4, 3.5, 4.1, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 5.1, 5.3, 5.4, 5.5, 5.6, 5.7, 6.2, 6.4, 6.5_

- [x] 6. Wire MealPlanPage into App.tsx
  - [x] 6.1 Confirm and wire the `meal-plan` page route
    - Confirm `MealPlanPage` is imported and registered under the `meal-plan` `PageId` in `frontend/src/App.tsx` and reachable from the bottom nav; full-page only (modal limited to the Add_Recipe_Dialog)
    - _Requirements: 1.1_

- [x] 7. End-to-end coverage
  - [x] 7.1 Write Playwright e2e spec
    - File: `e2e/meal-planner.spec.ts` (mocked auth via `e2e/mocks/cognitoClient.ts`)
    - View the current week, add a recipe to a day and see the card appear in correct order, navigate weeks, and remove a recipe
    - _Requirements: 1.1, 3.2, 3.3, 4.5, 4.7, 5.2, 5.4_

- [x] 8. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP; core implementation tasks are never optional.
- Each task references specific requirements (granular clauses) for traceability.
- Property tests validate the universal correctness properties from `design.md`; unit tests cover UI states, interactions, and API wiring.
- Backend property tests mock DynamoDB with an in-memory store so CRUD round-trips run without real AWS calls.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1"] },
    { "id": 1, "tasks": ["1.2", "2.2", "3.2", "5.1", "5.3"] },
    { "id": 2, "tasks": ["1.3", "1.4", "1.5", "5.2", "5.4"] },
    { "id": 3, "tasks": ["5.5"] },
    { "id": 4, "tasks": ["5.6"] },
    { "id": 5, "tasks": ["5.7", "6.1"] },
    { "id": 6, "tasks": ["7.1"] }
  ]
}
```
