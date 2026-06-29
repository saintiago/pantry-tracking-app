# Implementation Plan: Inventory Merge and Grouping

## Overview

This plan implements two complementary inventory enhancements in TypeScript, matching the existing monorepo conventions:

1. **Backend-authoritative merge on add** — Rework `addInventoryItem` in the Inventory Lambda to detect a `Merge_Match` via pure comparable-field equality helpers, select the canonical match, sum quantity, recompute low-stock, and write under an optimistic-locking retry, returning a `merged` indicator on the existing `MutationResponse`.
2. **Frontend-only grouping in the category view** — Add a pure `groupItemsByGroupingKey` function and an expandable `GroupedRow` sub-component to `InventoryList`, plus expiration-date autofill, a dynamic submit-button label, and a yellow merge-state highlight on the Add Item page.

The merge pure functions are extracted into a dedicated `merge.ts` module so they can be property-tested without DynamoDB. Each step builds on the previous and ends wired into the handler / component. Tasks marked `*` are optional test sub-tasks.

## Tasks

- [x] 1. Implement backend comparable-field equality, match selection, and quantity-merge pure functions
  - [x] 1.1 Implement comparable-field equality helpers
    - Create `backend/src/handlers/inventory/merge.ts`
    - Define the `ComparableFields` interface (`name`, `category`, `expirationDate`, `location`, `unit`, optional `barcode`, `brand`, `whereToBuy`, `onlineStoreLink`) and the `STRING_COMPARABLE_FIELDS` tuple
    - Implement `normalizeString` (trim + lowercase, `''` for absent/empty), `stringFieldEqual` (optional-field semantics), and `comparableFieldsEqual` comparing `expirationDate` and `location` by exact trimmed value, `unit` by `resolveUnit` canonical key, and string fields via `stringFieldEqual`
    - Add a helper to project an `InventoryItem`/`AddInventoryRequest` into `ComparableFields`
    - Export all functions and the interface for testing
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [x] 1.2 Write property test for comparable-field equality
    - Create `backend/src/handlers/inventory/__tests__/inventory.property.test.ts`
    - **Property 1: Comparable-field equality is comprehensive and reflexive**
    - **Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8**

  - [x] 1.3 Implement merge-match selection
    - Add `selectMergeMatch(matches: InventoryItem[]): InventoryItem | null` to `merge.ts`
    - Select earliest `createdAt`, tie-broken by lexicographically smallest `itemId`; return `null` for an empty set; choice independent of input order
    - _Requirements: 1.6_

  - [x] 1.4 Write property test for merge-match selection
    - Add to `backend/src/handlers/inventory/__tests__/inventory.property.test.ts`
    - **Property 2: Merge match selection is deterministic**
    - **Validates: Requirements 1.6**

  - [x] 1.5 Implement quantity merge and low-stock recompute
    - Add `applyMerge(existing, submittedQuantity)` to `merge.ts` returning `{ quantity, isLowStock, lowStockTransition }`
    - Sum quantity with exact JS arithmetic (no rounding/truncation); `isLowStock` true iff `threshold` defined and `quantity <= threshold`; `lowStockTransition` true iff `isLowStock` changed
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 1.6 Write property test for low-stock recomputation and transition reporting
    - Add to `backend/src/handlers/inventory/__tests__/inventory.property.test.ts`
    - **Property 5: Low-stock recomputation and transition reporting are correct**
    - **Validates: Requirements 3.2, 3.3, 3.4**

- [x] 2. Wire merge detection into the Inventory Lambda add path
  - [x] 2.1 Rework `addInventoryItem` to detect and apply merges
    - Add `merged: boolean` to the `MutationResponse` shape used by the inventory handler
    - After `validateAddRequest`, query the user's `ITEM#` rows, filter to `Merge_Match`es via `comparableFieldsEqual`, and `selectMergeMatch`
    - On no match: `PutCommand` create new item, return `{ item, merged: false }` with HTTP 201
    - On match: compute new `quantity`/`isLowStock`/`GSI1PK` via `applyMerge`, issue `UpdateCommand` guarded by `ConditionExpression: 'syncVersion = :expectedVersion'`, set `updatedAt` and increment `syncVersion` by 1, return `{ item, merged: true, lowStockTransition? }` (transition only when `isLowStock` changed) with HTTP 200
    - On `ConditionalCheckFailedException`: re-query, re-select, retry up to 3 total attempts; fall through to creation if the match disappeared; return `409 CONFLICT` with no mutation if all attempts fail
    - _Requirements: 1.1, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 3.1, 3.3, 3.4, 3.5_

  - [x] 2.2 Write property tests for add-operation count, quantity conservation, and sync version
    - Add to `backend/src/handlers/inventory/__tests__/inventory.property.test.ts` using an in-memory model of the user's inventory (no DynamoDB calls)
    - **Property 3: Add never loses items and changes count by at most one**
    - **Property 4: Quantity is conserved across add operations**
    - **Property 6: Merge increments sync version by exactly one**
    - **Validates: Requirements 1.4, 1.5, 3.1, 3.5**

  - [x] 2.3 Write unit/integration tests for the merge add path
    - Add to `backend/src/handlers/inventory/__tests__/inventory.test.ts`
    - Merge returns `merged: true` + updated item + HTTP 200 (Req 1.7); creation returns `merged: false` + created item + HTTP 201 (Req 1.8)
    - Optimistic locking: one/two `ConditionalCheckFailedException` then success applies merge; three failures return `409 CONFLICT` with no mutation (Req 1.9)
    - Only the selected match is modified when multiple matches exist; others unchanged (Req 1.6); `updatedAt` refreshed on merge (Req 3.5)
    - _Requirements: 1.6, 1.7, 1.8, 1.9, 3.5_

- [x] 3. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement Add Item page expiration autofill and reactive merge state
  - [x] 4.1 Implement expiration-date autofill in `performFullAutofill`
    - In `frontend/src/pages/AddItemPage/AddItemPage.tsx`, copy the suggestion's `expirationDate` into the expiration field and mark it a `Prefilled_Field` only when the suggestion's `expirationDate` is non-empty AND the field is empty
    - When copied into an empty field, move focus to the expiration field and open its date picker (`showPicker` wrapped in try/catch)
    - Leave an existing user-entered value untouched (no prefill, no focus, no picker); leave the field unchanged when the suggestion has no `expirationDate`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 4.2 Implement the `isMergeState` predicate and autofill snapshot
    - Record an `AutofillSnapshot` (field → originally populated value) on full autofill
    - Implement `isMergeState(snapshot, form)` returning true iff a snapshot exists and every snapshot field other than `quantity` still equals its populated value
    - _Requirements: 5.1, 5.2, 5.5, 6.5, 6.6_

  - [x] 4.3 Wire the dynamic submit-button label
    - When `isMergeState` is true, label indicates adding to an existing item; otherwise the label includes the word "new"; no suggestion selected → label includes "new"
    - While submitting, disable the button and show progress text; reflect the server's returned `merged` indicator after the response
    - Label updates synchronously on field change (within the 200 ms budget)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6_

  - [x] 4.4 Wire the reactive yellow highlight color
    - When `isMergeState` is true, render prefilled fields with the yellow highlight (`#fef9c3` background, `#854d0e` text, contrast ≥ 4.5:1); when false, fall back to the existing prefilled highlight
    - Editing a prefilled field clears its individual highlight; highlight derives from the same `isMergeState` predicate as the submit label and excludes `quantity`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 4.5 Write property tests for merge-state predicate and expiration autofill
    - Create `frontend/src/pages/AddItemPage/__tests__/AddItemPage.property.test.tsx`
    - **Property 7: Merge-state predicate drives label and highlight, excluding quantity**
    - **Property 8: Expiration autofill copies only into an empty field**
    - **Validates: Requirements 4.1, 4.2, 4.4, 5.1, 5.2, 5.5, 6.1, 6.2, 6.5, 6.6**

  - [x] 4.6 Write unit tests for Add Item merge-state behavior
    - Add to `frontend/src/pages/AddItemPage/__tests__/AddItemPage.test.tsx`
    - Autofill focuses the expiration field and calls `showPicker` (stubbed) when empty (Req 4.3); does not when a user value exists (Req 4.4); leaves field unchanged when suggestion has no expiration (Req 4.5)
    - Label/highlight update synchronously on field change (Req 5.3, 6.3); editing a prefilled field clears its highlight (Req 6.4); no-selection label includes "new" (Req 5.4); submitting disables the button and shows progress (Req 5.6); assert yellow palette `#fef9c3`/`#854d0e` (Req 6.1)
    - _Requirements: 4.3, 4.4, 4.5, 5.3, 5.4, 5.6, 6.1, 6.3, 6.4_

  - [x] 4.7 Extend Add Item e2e spec to cover the merge flow (REQUIRED quality gate)
    - Extend `e2e/add-item-page.spec.ts` (do not create a new spec file) following the existing `setupMockAPI` route-interception and `VITE_MOCK_AUTH` mock-auth conventions
    - Mock `GET /inventory/search` to return an existing item whose comparable fields match the form, and mock `POST /inventory` to return the merged item with `{ merged: true }` (and a separate creation path returning `{ merged: false }`)
    - Select the matching autocomplete suggestion using the dropdown `onMouseDown` pattern (wait for the `[role="option"]` to be visible before clicking) and assert the submit button shows the "add to existing item" label and prefilled fields show the yellow merge-state highlight (`#fef9c3`/`#854d0e`)
    - Edit a non-quantity prefilled field and assert the submit label flips to include "new" and the highlight reverts to the standard prefilled style; assert editing only the quantity field does not change the label/highlight
    - Assert expiration-date autofill populates an empty expiration field from the suggestion, and leaves a user-entered expiration value untouched
    - Submit a merge and assert the server `merged: true` response surfaces the appropriate success feedback; use scoped selectors (e.g. action bar / page heading) to avoid strict-mode violations
    - _Requirements: 4.1, 4.4, 5.1, 5.2, 5.5, 6.1, 6.2, 6.5, 1.7_

- [x] 5. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement the grouping pure function
  - [x] 6.1 Implement `groupItemsByGroupingKey` and `GroupedRow` type
    - In `frontend/src/components/InventoryList/InventoryList.tsx`, add the exported `GroupedRow` interface and `normalizeGroupName` (trim, collapse internal whitespace, lowercase)
    - Implement `groupItemsByGroupingKey(items)`: bucket by `${normalizeGroupName(name)}|${normalized category}|${resolveUnit(unit)}`; within each group sort children by `expirationDate` asc, then `createdAt` asc, then `itemId` asc; compute `totalQuantity` (sum), `childCount` (length), `hasLowStock` (any child low-stock); order groups by normalized name asc, tie-broken by canonical unit key
    - Export the function and interface for testing
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 8.2, 9.5_

  - [x] 6.2 Write property tests for grouping partition, normalization, ordering, and summary
    - Create `frontend/src/components/InventoryList/__tests__/InventoryList.grouping.property.test.tsx`
    - **Property 9: Grouping partitions the displayed items exactly**
    - **Property 10: Grouping keys normalize names and units**
    - **Property 11: Grouped rows are ordered by name then unit**
    - **Property 12: Child items are ordered by expiration**
    - **Property 13: Grouped row summary is correct**
    - **Property 14: Group low-stock indicator correctness**
    - **Validates: Requirements 7.1, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 8.2, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7**

- [x] 7. Implement the GroupedRow component and wire grouping into InventoryList
  - [x] 7.1 Implement the `GroupedRow` sub-component
    - In `frontend/src/components/InventoryList/InventoryList.tsx`, add `GroupedRow` rendering a parent row with `role="button"`, `tabIndex={0}`, `aria-expanded`, `aria-controls`, and a min 44×44 touch target
    - Enter/Space toggle identically to pointer activation, with `preventDefault()` on Space
    - Summary: total quantity via `formatQuantity` (max 2 decimals, trailing zeros/point stripped) + unit label via `getUnitLabel` (singular iff total === 1), child count, and a low-stock badge when `hasLowStock`
    - Render child items only when expanded inside the `aria-controls` region, reusing the existing item card for activation → detail view and low-stock treatment, wrapped with ≥ 16px indentation, connector lines, distinct background, and child controls ≥ 44×44
    - _Requirements: 8.1, 8.2, 8.3, 8.6, 8.7, 9.1, 9.2, 9.3, 9.4, 9.6, 9.7, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [x] 7.2 Integrate grouping and expand/collapse state into `InventoryList`
    - Add `expandedGroups` state (`Set<string>` keyed by `groupingKey`); in `item-list` view pass `categoryFilteredItems` through a memoized `groupItemsByGroupingKey` and render a `GroupedRow` per group
    - New groups render collapsed (Req 8.4); expansion state preserved across recompute when a key remains present, stale keys ignored (Req 8.5); single-item groups render as a one-child group that still toggles (Req 8.1)
    - Recompute groups whenever displayed items change (text/location/low-stock filters) so every displayed item stays represented
    - _Requirements: 7.1, 8.1, 8.4, 8.5_

  - [x] 7.3 Write property test for expand/collapse behavior
    - Add to `frontend/src/components/InventoryList/__tests__/InventoryList.grouping.property.test.tsx`
    - **Property 15: Expand/collapse toggles children and preserves state**
    - **Validates: Requirements 8.1, 8.3, 8.5**

  - [x] 7.4 Write unit tests for grouped-row rendering and interaction
    - Create `frontend/src/components/InventoryList/__tests__/InventoryList.grouping.test.tsx`
    - New groups render collapsed (Req 8.4); Enter/Space toggle and Space prevents default scroll (Req 8.6); `aria-expanded`/`aria-controls` reflect state and child association (Req 8.7)
    - Child indentation ≥ 16px, connector lines present, distinct child background, child controls ≥ 44×44 (Req 10.1–10.4); activating a child opens detail view via `onItemClick` (Req 10.5); low-stock children show low-stock treatment (Req 10.6)
    - _Requirements: 8.4, 8.6, 8.7, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [x] 7.5 Extend category-view e2e spec to cover grouping in the item-list view (REQUIRED quality gate)
    - Extend `e2e/inventory-category-view.spec.ts` (do not create a new spec file) following the existing `setupMockAPI` route-interception and `VITE_MOCK_AUTH` mock-auth conventions
    - Mock `GET /inventory` so at least one category contains multiple mergeable children (same name/category/unit) plus at least one low-stock child, so a real Grouped_Row with multiple children is produced
    - Drill into the category and assert the grouped row renders total quantity, child count, and a low-stock badge when any child is low-stock
    - Assert the group is collapsed by default (child items hidden on first render)
    - Click the grouped row to expand and reveal child items; collapse again; assert keyboard activation via Enter and Space (focus the row, press the key) toggles identically and reveals/hides children, using scoped selectors
    - Activate a child item and assert the item detail view opens
    - _Requirements: 7.1, 8.1, 8.4, 8.6, 9.1, 9.2, 9.3, 10.5_

- [x] 8. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Review and update steering documentation as needed
  - Review the workspace steering docs in `.kiro/steering/` and update only those that are now genuinely inaccurate or missing coverage as a result of this feature — do not churn docs that are still correct
  - `data-model.md`: update the `MutationResponse` interface to add the `merged: boolean` indicator returned by POST /inventory, and document the merge-on-add semantics for the POST /inventory route so this file remains the single source of truth for API contracts. Capture: comparable-field matching (the `Comparable_Fields` set, excluding quantity and picture; trim + case-insensitive for string fields; exact ISO string for `expirationDate`; exact identifier for `location`; canonical `resolveUnit` key for `unit`; optional-field absent/empty equality), quantity summing into the matched item, low-stock recompute and `syncVersion` increment, optimistic-locking retry (up to 3 attempts, 409 CONFLICT on exhaustion), and the HTTP status convention (200 on merge vs 201 on create)
    - _Requirements: 1.4, 1.7, 1.8, 1.9, 2.3, 3.1, 3.2, 3.5_
  - `structure.md`: verify the conventions cover the new backend pure-function module `backend/src/handlers/inventory/merge.ts` (handler-adjacent pure functions extracted for property testing) and the added e2e/test files; update the structure tree or Conventions section only if these patterns aren't already represented
    - _Requirements: 1.1, 1.2_
  - `tech.md` and `e2e-testing.md`: review for any change introduced by this feature and update only if something is now inaccurate (likely no change — verify rather than assume)
  - Leave any steering doc unchanged if it is already accurate and complete

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- The Playwright e2e tasks (4.7, 7.5) are REQUIRED quality gates, not optional — this project has no separate SQA function, so end-to-end tests are the team's quality gate and must pass before the feature is complete. They are deliberately left unmarked (no `*`), unlike the Jest unit/property sub-tasks
- E2e tasks extend the existing specs (`e2e/add-item-page.spec.ts`, `e2e/inventory-category-view.spec.ts`) and follow the `VITE_MOCK_AUTH` mock-auth strategy, `page.route()` interception against `https://mock-api.test`, the dropdown `onMouseDown` selection pattern (wait for option visible before click), and scoped selectors per `.kiro/steering/e2e-testing.md`
- Backend merge pure functions live in a new `backend/src/handlers/inventory/merge.ts` so they can be property-tested without DynamoDB; the handler wiring stays in `inventory.ts`
- Grouping pure function and `GroupedRow` live in `frontend/src/components/InventoryList/InventoryList.tsx`; `groupItemsByGroupingKey` and `GroupedRow` are exported for direct testing
- Property tests use the `.property.test.ts(x)` suffix at ≥ 100 fast-check iterations; each is tagged `// Feature: inventory-merge-and-grouping, Property {N}: ...`
- Unit handling reuses `resolveUnit`, `getUnitLabel`, `formatQuantity`, and `UNIT_METADATA` from the existing `units` modules; no DynamoDB schema or GSI changes
- Task 9 is a REQUIRED final documentation pass: steering docs (`.kiro/steering/`) must be reviewed and updated only where this feature made them inaccurate or left a gap — notably `data-model.md` (the `merged` indicator and merge-on-add semantics) and `structure.md` (the new `merge.ts` module). It runs last because it documents the as-built behavior of all prior implementation and test tasks
- Per the workspace quality standard, all new and pre-existing test, lint, and type-check failures touched by this work must be resolved before completion

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "4.1", "6.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "4.2", "6.2", "7.1"] },
    { "id": 2, "tasks": ["1.4", "1.5", "4.3", "7.2"] },
    { "id": 3, "tasks": ["1.6", "2.1", "4.4", "7.3", "7.4"] },
    { "id": 4, "tasks": ["2.2", "2.3", "4.5", "4.6"] },
    { "id": 5, "tasks": ["4.7", "7.5"] },
    { "id": 6, "tasks": ["9"] }
  ]
}
```
