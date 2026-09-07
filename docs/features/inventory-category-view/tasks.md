# Implementation Plan: Inventory Category View

## Overview

Transform the InventoryList component's default view from a flat item list into a category summary view with drill-down navigation. This is a frontend-only change — no backend modifications needed. The implementation adds view state management, a pure grouping function, and two new sub-components (CategoryCard, BackButton) to the existing InventoryList component.

## Tasks

- [x] 1. Implement `groupItemsByCategory` pure function and `CategorySummary` type
  - [x] 1.1 Add `CategorySummary` interface and `groupItemsByCategory` function to `frontend/src/components/InventoryList.tsx`
    - Define `CategorySummary` interface with `category`, `itemCount`, `totalQuantity`, `lowStockCount` fields
    - Implement `groupItemsByCategory(items: InventoryItem[]): CategorySummary[]` as an exported pure function
    - Group items by `category` field, compute `itemCount` (distinct items), `totalQuantity` (sum of `quantity`), `lowStockCount` (count where `isLowStock === true`)
    - Sort output alphabetically by category name
    - Export both the interface and function for testing
    - _Requirements: 1.1, 1.2, 1.4, 5.1, 7.1, 7.2, 7.3_

  - [ ]* 1.2 Write property test: Category Grouping is a Correct Partition
    - Create `frontend/src/components/InventoryList.category.property.test.tsx`
    - **Property 1: Category Grouping is a Correct Partition**
    - Generate random `InventoryItem[]` arrays using fast-check
    - Verify: group count === number of distinct categories in input
    - Verify: each group's `itemCount` === count of items with that category
    - Verify: each group's `totalQuantity` === sum of `quantity` for that category
    - Verify: sum of all `itemCount` values === total input items (partition property)
    - **Validates: Requirements 1.1, 1.2, 7.1, 7.2, 7.3**

  - [ ]* 1.3 Write property test: Category Grouping is Sorted Alphabetically
    - **Property 2: Category Grouping is Sorted Alphabetically**
    - Generate random `InventoryItem[]` arrays
    - Verify: output categories are in ascending alphabetical order
    - **Validates: Requirements 1.4**

  - [ ]* 1.4 Write property test: Low-Stock Count Correctness
    - **Property 3: Low-Stock Count Correctness**
    - Generate random `InventoryItem[]` arrays with varying `isLowStock` values
    - Verify: each group's `lowStockCount` === count of items with `isLowStock === true` in that category
    - **Validates: Requirements 5.1, 5.2**

- [x] 2. Implement `CategoryCard` and `BackButton` sub-components
  - [x] 2.1 Add `CategoryCard` sub-component to `frontend/src/components/InventoryList.tsx`
    - Define `CategoryCardProps` interface with `summary: CategorySummary` and `onClick: () => void`
    - Render card with category name, item count, total quantity
    - Show low-stock indicator with count when `lowStockCount > 0`
    - Set `role="button"`, `tabIndex={0}`, `onClick` and `onKeyDown` (Enter/Space) handlers
    - Set `aria-label` to `"{category}, {itemCount} items, {totalQuantity} total"`
    - Apply inline styles with minimum 44x44px touch target
    - _Requirements: 1.2, 4.1, 4.2, 4.3, 5.1, 5.2_

  - [x] 2.2 Add `BackButton` sub-component to `frontend/src/components/InventoryList.tsx`
    - Define `BackButtonProps` interface with `onClick: () => void`
    - Render button with text "← Back to categories"
    - Set `aria-label="Back to categories"`
    - Handle `onClick` and `onKeyDown` (Enter/Space)
    - Apply inline styles with minimum 44x44px touch target
    - _Requirements: 3.1, 3.2, 3.3, 3.5_

  - [ ]* 2.3 Write property test: Category Card Aria-Label Completeness
    - **Property 5: Category Card Aria-Label Completeness**
    - Generate random `CategorySummary` objects
    - Render `CategoryCard` and verify `aria-label` contains category name, item count, and total quantity
    - **Validates: Requirements 4.3**

- [x] 3. Add view state management and wire category navigation into `InventoryList`
  - [x] 3.1 Add `viewMode` and `selectedCategory` state to `InventoryList` component
    - Add `useState<'category-summary' | 'item-list'>('category-summary')` for `viewMode`
    - Add `useState<string | null>(null)` for `selectedCategory`
    - _Requirements: 1.1, 2.1_

  - [x] 3.2 Render `CategoryCard` grid in category-summary view
    - When `viewMode === 'category-summary'`, call `groupItemsByCategory(filteredItems)` and render a `CategoryCard` for each result
    - On `CategoryCard` click, set `selectedCategory` and transition `viewMode` to `'item-list'`
    - Hide the `CategorySelector` dropdown when in category-summary view
    - _Requirements: 1.1, 1.2, 1.5, 1.6, 2.1, 2.2_

  - [x] 3.3 Render filtered item list with `BackButton` in item-list view
    - When `viewMode === 'item-list'`, further filter `filteredItems` by `selectedCategory`
    - Render `BackButton` above the item list
    - On `BackButton` click, clear `selectedCategory` and transition `viewMode` to `'category-summary'`
    - Preserve all existing filters (text, location, low-stock) across view transitions
    - _Requirements: 2.3, 2.4, 3.1, 3.2, 3.3, 3.4_

  - [x] 3.4 Handle remove mode in category view
    - When `removeMode` is active and user clicks a `CategoryCard`, drill into that category's item list showing items with remove buttons
    - _Requirements: 6.1, 6.2_

  - [x] 3.5 Handle edge cases: empty state and stale selectedCategory
    - Show "No items match the current filters." when filtered items are empty in either view
    - Auto-reset to `category-summary` view if `selectedCategory` no longer exists in the item set (e.g., after item removal)
    - Keep back button visible in item-list view even when category becomes empty due to filter changes
    - _Requirements: 1.3, 1.6_

- [x] 4. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Write unit and property tests for category view interactions
  - [x]* 5.1 Write unit tests for category view in `frontend/src/components/InventoryList.test.tsx`
    - Test: empty items array shows "No items match the current filters." in category-summary view
    - Test: keyboard activation (Enter/Space) on CategoryCard triggers drill-down
    - Test: keyboard activation (Enter/Space) on BackButton returns to category summary
    - Test: BackButton has `aria-label="Back to categories"`
    - Test: CategoryCard has `role="button"` and `tabIndex={0}`
    - Test: CategoryCard has minimum 44x44px touch target (via inline styles)
    - Test: BackButton has minimum 44x44px touch target
    - Test: remove mode + click category card drills into item list with remove buttons
    - Test: filters (text, location, low-stock) are preserved when navigating back from item-list to category-summary
    - Test: back button is visible in item-list view and hidden in category-summary view
    - Test: category filter dropdown is hidden in category-summary view
    - Test: low-stock indicator shown on category card when category has low-stock items
    - Test: low-stock indicator hidden when category has no low-stock items
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 5.1, 5.2, 6.1, 6.2_

  - [x]* 5.2 Write property test: Drill-Down Shows Only Selected Category Items
    - **Property 4: Drill-Down Shows Only Selected Category Items**
    - Generate random `InventoryItem[]` arrays, render `InventoryList`, click a random category card
    - Verify: all displayed item cards belong to the selected category
    - Verify: no items from other categories are displayed
    - **Validates: Requirements 2.1, 2.3**

- [x] 6. Write e2e tests for category view in `e2e/inventory-category-view.spec.ts`
  - Create `e2e/inventory-category-view.spec.ts` following the same pattern as `e2e/barcode-autofill.spec.ts`
  - Set up mock API with inventory items spanning at least 2 categories (e.g. "Dairy" with 2 items, "Snacks" with 1 item), each with distinct quantities
  - Mock `/auth/verify`, `/locations`, and `/inventory` routes
  - Test: inventory page shows category cards instead of individual items on load
  - Test: category card displays correct item count and total quantity for each category
  - Test: clicking a category card navigates to item list showing only items from that category
  - Test: back button is visible in item list view and clicking it returns to category summary
  - Test: category cards are no longer visible after drilling into a category
  - Test: text filter applied in category view carries over and filters items in item list view
  - _Requirements: 1.1, 1.2, 2.1, 2.3, 3.1, 3.2, 3.4_

- [x] 7. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- All implementation is in `frontend/src/components/InventoryList.tsx` — no new files needed for production code
- Property tests go in `frontend/src/components/InventoryList.category.property.test.tsx`
- Unit test additions go in `frontend/src/components/InventoryList.test.tsx`
- The `groupItemsByCategory` function is exported as a named export for direct testing
- Inline styles follow the existing pattern in InventoryList.tsx (React.CSSProperties objects)
