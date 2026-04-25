# Implementation Plan: Modal to Page Migration

## Overview

Migrate `AddItemModal` → `AddItemPage` and `ItemDetailView` → `ItemDetailPage`. Both new pages live in `frontend/src/pages/` and integrate with the existing state-based router via two new transient `PageId` values (`add-item`, `item-detail`). The migration is additive — old components stay until their replacements are fully wired in, then removed.

## Tasks

- [x] 1. Extend routing infrastructure (`PageId`, `Layout`, `App`)
  - Add `'add-item'` and `'item-detail'` to the `PageId` union in `frontend/src/components/Layout.tsx`
  - Confirm `Layout` does NOT add either to `NAV_ITEMS` (bottom nav stays at 4 items)
  - Add shared state to `App` (`AuthenticatedApp`) for `addItemPageProps` and `itemDetailPageProps`, plus `activePage` already exists
  - Wire `onNavigate` prop down from `App` → `Layout` → `InventoryPage` so `InventoryPage` can trigger navigation
  - _Requirements: 1.5, 6.1, 6.2, 8.1, 8.2, 8.3_

- [x] 2. Implement `AddItemPage`
  - [x] 2.1 Create `frontend/src/pages/AddItemPage.tsx`
    - Port all form state, autofill logic, autocomplete logic, and barcode lookup from `AddItemModal` — remove modal-specific mechanics (`isOpen`, focus trap, overlay div, `role="dialog"`)
    - Add page header with back button (calls `onBack`)
    - Render Submit + Cancel inside a fixed `Action_Bar` at bottom (72px height); apply matching `paddingBottom` to scrollable form area
    - Focus Product Name field on mount (`useEffect`)
    - Accept props: `onBack`, `onSubmit`, `locations`, `prefillData?`
    - On successful submit: show success message then call `onBack()`
    - _Requirements: 1.2, 1.3, 2.1–2.7, 3.1–3.5, 4.1–4.9, 5.1–5.8_

  - [ ]* 2.2 Write unit tests — `frontend/src/pages/AddItemPage.test.tsx`
    - Renders all required and optional field labels
    - Populates Storage Location select from `locations` prop
    - Initializes fields from `prefillData` on mount; focuses Product Name
    - Shows field-level errors on invalid submit; does not call `onSubmit`
    - Calls `onSubmit` with correct data on valid submit
    - Shows error banner when `onSubmit` returns an error
    - Shows success message and calls `onBack` on successful submit
    - Calls `onBack` when back button is clicked
    - Renders Submit and Cancel inside the Action Bar
    - Displays "Looking up…" during barcode lookup; inline error on lookup failure
    - _Requirements: 2.1–2.7, 3.1–3.5, 5.7_

  - [ ]* 2.3 Write property tests — `frontend/src/pages/AddItemPage.property.test.tsx`
    - **Property 1: Validation rejects incomplete required fields** — Validates: Requirements 2.3
    - **Property 2: Valid submission passes all entered values to onSubmit** — Validates: Requirements 2.4
    - **Property 3: onSubmit error string appears in banner** — Validates: Requirements 2.5
    - **Property 4: Locations prop populates Storage Location select** — Validates: Requirements 2.7
    - **Property 5: prefillData initializes fields with autofill highlight** — Validates: Requirements 3.2, 3.3
    - **Property 6: Editing a prefilled field removes its autofill highlight** — Validates: Requirements 3.4, 3.5
    - **Property 7: Autocomplete search threshold** — Validates: Requirements 4.1, 4.2
    - **Property 8: Full autofill populates all available fields** — Validates: Requirements 4.3
    - **Property 9: Single autofill sets only the selected field** — Validates: Requirements 4.4
    - **Property 10: External barcode lookup triggered for 8+ char barcodes with no local results** — Validates: Requirements 4.5
    - **Property 11: All interactive elements meet 44px touch target** — Validates: Requirements 5.2
    - **Property 12: Required fields have correct ARIA attributes** — Validates: Requirements 5.5
    - _Requirements: 2.3–2.5, 2.7, 3.2–3.5, 4.1–4.5, 5.2, 5.5_

- [x] 3. Implement `ItemDetailPage`
  - [x] 3.1 Create `frontend/src/pages/ItemDetailPage.tsx`
    - Port all form state and save logic from `ItemDetailView` — remove overlay/panel mechanics (`position: fixed`, overlay div, `data-testid="item-detail-overlay"`)
    - Re-export or inline `EditFormState`, `EditFormErrors`, `validateEditForm`, `initEditForm` from `ItemDetailView`
    - Add page header showing item name; show `LowStockBadge` when `item.isLowStock`; show item picture when `item.pictureUrl` present
    - Render Save + Cancel inside a fixed `Action_Bar` at bottom (72px); apply matching `paddingBottom` to scrollable form area
    - Accept props: `item`, `locations`, `onBack`, `onItemUpdated`
    - On successful save: call `onItemUpdated(...)` then `onBack()`
    - On Cancel: call `onBack()` immediately
    - _Requirements: 7.1–7.12, 8.6_

  - [ ]* 3.2 Write unit tests — `frontend/src/pages/ItemDetailPage.test.tsx`
    - Renders all required and optional field labels; initializes all fields from `item` prop
    - Populates Storage Location select from `locations` prop
    - Shows low-stock badge when `item.isLowStock`; hides when false
    - Renders item picture when `item.pictureUrl` present; omits when absent
    - Shows field-level errors on invalid Save; does not call `updateInventoryItem`
    - Calls `updateInventoryItem` with correct `itemId` and payload on valid Save
    - Shows error banner when `updateInventoryItem` throws; does not navigate away
    - Calls `onBack` after successful save; calls `onBack` on Cancel without saving
    - Disables Save and Cancel while saving; shows "Saving…" label
    - Renders Save and Cancel inside the Action Bar
    - _Requirements: 7.1–7.12, 8.6_

  - [ ]* 3.3 Write property tests — `frontend/src/pages/ItemDetailPage.property.test.tsx`
    - **Property 13: ItemDetailPage form initializes from Selected_Item** — Validates: Requirements 7.1, 7.2
    - **Property 14: ItemDetailPage header reflects item state** — Validates: Requirements 7.3, 7.4
    - **Property 15: ItemDetailPage validation rejects incomplete required fields** — Validates: Requirements 7.5, 7.10
    - **Property 16: ItemDetailPage valid save calls updateInventoryItem with correct values** — Validates: Requirements 7.6
    - **Property 17: ItemDetailPage save error appears in banner** — Validates: Requirements 7.8
    - **Property 18: ItemDetailPage Cancel navigates back without saving** — Validates: Requirements 8.6
    - _Requirements: 7.1–7.6, 7.8, 7.10, 8.6_

- [x] 4. Checkpoint — Ensure all unit and property tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Wire `AddItemPage` into `App` and `InventoryPage`
  - [x] 5.1 Update `App.tsx` (`AuthenticatedApp`)
    - Add `addItemPageProps` state (`prefillData`, `locations`, `onSubmit`)
    - When `activePage === 'add-item'`, render `<AddItemPage>` instead of the current page component lookup
    - `onBack` sets `activePage` back to `'inventory'`
    - _Requirements: 1.1, 1.5, 6.1, 6.3–6.6_

  - [x] 5.2 Update `InventoryPage.tsx`
    - Accept `onNavigate: (page: PageId) => void` prop
    - Replace `handleAddMenuSelect('manual')` → call `onNavigate('add-item')` and set `addItemPageProps` in App
    - Replace `handleBarcodeDetected` → call `onNavigate('add-item')` with `prefillData` set
    - Remove `<AddItemModal>` render and all `addModalOpen` / `prefillData` state that drove it
    - _Requirements: 6.3, 6.4, 6.5_

- [x] 6. Wire `ItemDetailPage` into `App` and `InventoryPage`
  - [x] 6.1 Update `App.tsx` (`AuthenticatedApp`)
    - Add `itemDetailPageProps` state (`selectedItem`, `locations`, `onItemUpdated`)
    - When `activePage === 'item-detail'`, render `<ItemDetailPage>` with those props
    - `onBack` sets `activePage` back to `'inventory'`
    - _Requirements: 8.1, 8.2, 8.4, 8.5, 8.7_

  - [x] 6.2 Update `InventoryPage.tsx`
    - Replace item tap handler (`setSelectedItem`) → call `onNavigate('item-detail')` and set `itemDetailPageProps` in App
    - Remove `<ItemDetailView>` render and `selectedItem` state that drove it
    - _Requirements: 8.4, 8.7_

- [x] 7. Update `e2e/barcode-autofill.spec.ts` for page-based navigation
  - Replace `openAddItemModal` helper — instead of waiting for `role="dialog"`, navigate to the Add Item page and scope selectors to the page
  - Remove the `modal(page)` locator helper; scope field selectors directly on `page` (or a page-level container)
  - Verify all existing barcode-autofill tests still pass with the new page-based flow
  - _Requirements: 1.1, 6.3_

- [x] 8. Write E2E tests for `AddItemPage` — `e2e/add-item-page.spec.ts`
  - Navigate from InventoryPage to AddItemPage via Manual Entry; verify page renders with Product Name focused
  - Navigate from InventoryPage to AddItemPage after barcode scan; verify prefill fields are populated and highlighted
  - Complete form submission; verify success message then return to InventoryPage
  - Back button returns to InventoryPage without submitting
  - Bottom nav remains visible and functional while on AddItemPage
  - _Requirements: 1.1–1.4, 2.3–2.6, 3.1–3.3, 6.3–6.6_

- [x] 9. Write E2E tests for `ItemDetailPage` — `e2e/item-detail-page.spec.ts`
  - Tap an inventory item; verify ItemDetailPage renders with all fields pre-populated
  - Edit fields and save; verify updated values appear in inventory list
  - Save error is shown in banner without navigating away
  - Cancel returns to InventoryPage without saving changes
  - Bottom nav remains visible and functional while on ItemDetailPage
  - _Requirements: 7.1–7.8, 8.4, 8.6, 8.7_

- [x] 10. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass (unit, property, e2e), ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- The migration is additive: `AddItemModal` and `ItemDetailView` source files are not deleted until their replacements are fully wired (end of tasks 5 and 6 respectively)
- Property tests use `fast-check` with a minimum of 100 iterations per property
- E2E tests follow the auth + API mock pattern established in `e2e/barcode-autofill.spec.ts`
- Scope page selectors to a page-level container (not `role="dialog"`) in the new e2e specs
