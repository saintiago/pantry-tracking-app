# Implementation Plan: Item Detail View

## Overview

Add an `ItemDetailView` component to the Pantry Tracking App that opens when a user taps an inventory item card. The component supports read-only and inline edit modes, validates edits client-side, and persists changes via the existing `updateInventoryItem` API. Implementation modifies `InventoryItemCard` (add `onClick` prop), `InventoryList` (pass through `onItemClick`), and `InventoryPage` (manage `selectedItem` state), then creates the new `ItemDetailView` component with full read/edit/save functionality.

## Tasks

- [x] 1. Add onClick prop to InventoryItemCard and wire through InventoryList
  - [x] 1.1 Update InventoryItemCard to accept an `onClick` prop and call it on card tap when `removeMode` is false
    - Add `onClick?: () => void` to `InventoryItemCardProps`
    - When `removeMode` is false and `onClick` is provided, attach an `onClick` handler to the card container
    - When `removeMode` is true, the card tap should not trigger `onClick`
    - Ensure the card has `cursor: pointer` and appropriate `role`/`tabIndex` for accessibility when clickable
    - _Requirements: 1.1, 1.2_

  - [x] 1.2 Update InventoryList to accept an `onItemClick` prop and pass it to each InventoryItemCard
    - Add `onItemClick?: (item: InventoryItem) => void` to `InventoryListProps`
    - For each rendered `InventoryItemCard`, pass `onClick={() => onItemClick?.(item)}`
    - _Requirements: 1.1_

  - [ ]* 1.3 Write unit tests for InventoryItemCard onClick behavior
    - Test that clicking a card calls `onClick` when `removeMode` is false
    - Test that clicking a card does NOT call `onClick` when `removeMode` is true
    - Test that the card has appropriate accessibility attributes when clickable
    - _Requirements: 1.1, 1.2_

- [x] 2. Add selectedItem state to InventoryPage and render ItemDetailView
  - [x] 2.1 Add `selectedItem` state to InventoryPage and pass `onItemClick` to InventoryList
    - Add `const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)`
    - Pass `onItemClick={(item) => setSelectedItem(item)}` to `InventoryList`
    - _Requirements: 1.1_

  - [x] 2.2 Conditionally render `ItemDetailView` when `selectedItem` is non-null
    - Import and render `ItemDetailView` with props: `item={selectedItem}`, `locations={locations}`, `onClose={() => setSelectedItem(null)}`, `onItemUpdated` callback
    - The `onItemUpdated` callback should update the item in `inventoryItems` state and set `selectedItem` to the updated item
    - Handle `lowStockTransition` from the API response by showing the existing `InAppNotification`
    - _Requirements: 1.1, 1.3, 10.4, 10.7_

- [x] 3. Create ItemDetailView component — read-only mode
  - [x] 3.1 Create `frontend/src/components/ItemDetailView.tsx` with read-only rendering
    - Create the component accepting `ItemDetailViewProps` (item, locations, onClose, onItemUpdated)
    - Render as a fixed full-screen overlay panel (similar to AddItemModal overlay pattern)
    - Display a header with the item name and a Close button (min 44×44px tap target)
    - Display all required fields: name, category, location name (resolved from `locations` prop), quantity + unit, expiration date, createdAt (formatted), updatedAt (formatted)
    - Conditionally display optional fields only when truthy: brand, barcode, threshold, whereToBuy, onlineStoreLink, pictureUrl
    - Render `onlineStoreLink` as an `<a>` element with `target="_blank"` and `rel="noopener noreferrer"`
    - Render `pictureUrl` as an `<img>` at a larger display size
    - Display a low-stock badge when `item.isLowStock` is true
    - Display an Edit button (min 44×44px tap target) in read-only mode
    - Use inline styles (React.CSSProperties) consistent with existing components
    - Ensure responsive layout works from 320px to 1920px
    - _Requirements: 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 3.1, 3.2, 4.1, 4.2, 5.1, 5.2, 6.1, 6.2, 7.1_

  - [ ]* 3.2 Write property test: required fields always displayed (Property 3)
    - **Property 3: Required Fields Always Displayed**
    - Generate random `InventoryItem` objects with `fast-check`, render `ItemDetailView`, assert name, category, location name, quantity, unit, expiration date, createdAt, and updatedAt all appear in the rendered output
    - **Validates: Requirements 2.1, 2.7, 2.8**

  - [ ]* 3.3 Write property test: optional fields shown iff present (Property 4)
    - **Property 4: Optional Fields Shown If and Only If Present**
    - Generate items with random combinations of optional fields present/absent, verify each optional field's presence in the DOM matches its truthiness, verify onlineStoreLink renders as an anchor with `target="_blank"` when present
    - **Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.6, 2.9, 3.1, 3.2**

  - [ ]* 3.4 Write property test: low stock badge matches isLowStock flag (Property 5)
    - **Property 5: Low Stock Badge Matches isLowStock Flag**
    - Generate items with random `isLowStock` values, verify badge presence matches the flag
    - **Validates: Requirements 5.1, 5.2**

- [x] 4. Checkpoint — Verify read-only mode
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement ItemDetailView edit mode — enter, edit, cancel
  - [x] 5.1 Add edit mode state and form rendering to ItemDetailView
    - Add `mode: 'view' | 'edit'` state, `editForm: EditFormState` state, and `errors: EditFormErrors` state
    - When Edit button is tapped, switch to edit mode and initialize `editForm` from the current item values (converting numeric fields to strings)
    - In edit mode: hide the Edit button, show Save and Cancel buttons (min 44×44px), render all 11 editable fields as form inputs
    - Render location as a `<select>` populated from `locations` prop, quantity/threshold as `number` inputs, expirationDate as `date` input, onlineStoreLink as `url` input, rest as `text` inputs
    - When Cancel is tapped, discard all changes, clear errors, and return to read-only mode
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ]* 5.2 Write property test: edit mode pre-populates form (Property 7)
    - **Property 7: Edit Mode Pre-Populates Form With Current Values**
    - Generate random items, enter edit mode, verify each input value matches the item's field
    - **Validates: Requirements 7.2**

  - [ ]* 5.3 Write property test: cancel discards changes (Property 8)
    - **Property 8: Cancel Discards Changes and Restores Original Values**
    - Generate random items and random edit values, make edits, cancel, verify original values are restored in read-only mode
    - **Validates: Requirements 7.4**

  - [ ]* 5.4 Write property test: all editable fields rendered in edit mode (Property 9)
    - **Property 9: All Editable Fields Rendered in Edit Mode**
    - Generate random items, enter edit mode, verify all 11 editable field inputs are present
    - **Validates: Requirements 8.1**

- [x] 6. Implement validation logic
  - [x] 6.1 Add validation to the edit form in ItemDetailView
    - Implement `validateEditForm` matching the design spec: required fields (name, category, expirationDate, locationId, quantity, unit) must be non-empty; quantity must be numeric and non-negative
    - Display inline error messages below each invalid field using `role="alert"`
    - Clear individual field errors on change (in the `handleChange` handler)
    - Prevent form submission (API call) when validation fails
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

  - [ ]* 6.2 Write property test: required field validation rejects empty fields (Property 10)
    - **Property 10: Required Field Validation Rejects Empty Fields**
    - Generate form states with random combinations of empty required fields, submit, verify errors appear for exactly the empty/invalid fields and API is not called
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6**

  - [ ]* 6.3 Write property test: correcting a field clears its error (Property 11)
    - **Property 11: Correcting a Field Clears Its Validation Error**
    - Generate a field with an error, change its value, verify the error is cleared
    - **Validates: Requirements 9.7**

- [x] 7. Implement save functionality
  - [x] 7.1 Add save handler to ItemDetailView
    - On Save tap: run validation, if valid call `updateInventoryItem(item.itemId, editedData)`
    - While saving: disable Save and Cancel buttons, show "Saving…" text on Save button
    - On success: show success message, call `onItemUpdated` with the response item, return to read-only mode
    - On API error: display error message from response in an error banner, remain in edit mode with edits preserved
    - On network error: display "Network error — please check your connection and try again", remain in edit mode
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [ ]* 7.2 Write unit tests for save functionality
    - Test successful save updates displayed data and exits edit mode
    - Test API error keeps edit mode and shows error banner
    - Test network error keeps edit mode and shows network error message
    - Test Save and Cancel buttons are disabled during save
    - _Requirements: 10.2, 10.3, 10.4, 10.5, 10.6_

- [x] 8. Checkpoint — Verify edit mode and save
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Integration wiring and final tests
  - [x] 9.1 Wire low-stock notification on save with transition in InventoryPage
    - When `onItemUpdated` is called and the API response includes `lowStockTransition: true`, trigger the existing `InAppNotification` with the notification message
    - _Requirements: 10.7_

  - [ ]* 9.2 Write property tests for card tap and remove mode suppression (Properties 1 & 2)
    - **Property 1: Tap Card Opens Detail View**
    - **Property 2: Remove Mode Suppresses Detail Navigation**
    - Render InventoryPage with mock data, verify tapping a card opens the detail view, verify tapping in remove mode does not open it
    - **Validates: Requirements 1.1, 1.2**

  - [ ]* 9.3 Write unit tests for close button and detail view dismissal (Property 6)
    - **Property 6: Close Button Dismisses Detail View**
    - Test that tapping the close button removes the detail view and returns to the inventory list
    - **Validates: Requirements 4.2**

  - [ ]* 9.4 Write property tests for save API call and success/failure (Properties 12, 13, 14)
    - **Property 12: Save Calls API With Correct Data**
    - **Property 13: Successful Save Updates Data and Exits Edit Mode**
    - **Property 14: Save Failure Shows Error and Keeps Edit Mode**
    - **Validates: Requirements 10.2, 10.4, 10.5, 10.6**

  - [ ]* 9.5 Write property test for low stock notification on transition (Property 15)
    - **Property 15: Low Stock Notification on Save With Transition**
    - Mock `updateInventoryItem` to return `lowStockTransition: true`, verify notification is displayed
    - **Validates: Requirements 10.7**

- [x] 11. Dismiss detail view after successful save
  - [x] 11.1 Update `ItemDetailView` save handler to call `onClose()` after `onItemUpdated()` on successful save instead of showing a success message and returning to read-only mode
    - After a successful API response, call `onItemUpdated(response.item)` then `onClose()` to dismiss the detail view
    - Remove the success message display since the panel closes immediately
    - _Requirements: 10.4_

  - [x] 11.2 Update `InventoryPage` `onItemUpdated` callback to only update `inventoryItems` state (no longer set `selectedItem` to the updated item, since the view will be dismissed via `onClose`)
    - _Requirements: 10.4_

  - [ ]* 11.3 Update existing tests to reflect the new save-dismiss behavior
    - Update tests that assert a success message is shown after save to instead assert `onClose` is called
    - _Requirements: 10.4_

- [x] 12. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The implementation uses TypeScript with React inline styles, consistent with the existing codebase
- Property-based test files use `.property.test.tsx` suffix per project convention
