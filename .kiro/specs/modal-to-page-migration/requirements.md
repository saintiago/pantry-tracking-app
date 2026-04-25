# Requirements Document

## Introduction

Replace the existing `AddItemModal` overlay with a dedicated `AddItemPage` that occupies the full app viewport. The motivation is mobile UX: modals on small screens (320px+) are cramped, hard to scroll, and fight with the virtual keyboard. A full page gives the form room to breathe, integrates naturally with the existing state-based routing in `Layout`, and keeps the back-navigation pattern consistent with how the rest of the app works.

The new page must preserve every capability of the current modal — all form fields, barcode/name autocomplete, external barcode lookup, autofill highlighting, picture upload, and prefill from barcode scan — while removing the overlay/focus-trap mechanics that are only needed for modals.

## Glossary

- **Add_Item_Page**: The new full-page React component (`AddItemPage`) that replaces `AddItemModal`.
- **AddItemModal**: The existing modal component being superseded; it remains in the codebase until the migration is complete.
- **Layout**: The existing `Layout` component that owns the app shell (header, bottom nav, main content area) and drives state-based page routing.
- **InventoryPage**: The existing page component that currently opens `AddItemModal`; it will navigate to `Add_Item_Page` instead.
- **Prefill_Data**: Optional data passed to `Add_Item_Page` (name, brand, category, barcode) pre-populated from a barcode scan result.
- **Autofill**: The behaviour where selecting an autocomplete suggestion populates multiple related fields simultaneously.
- **Autofill_Highlight**: The light-blue visual indicator (`#e0f2fe` background, `#0284c7` border) applied to fields that were populated by Autofill and have not yet been manually edited.
- **Back_Navigation**: The action of leaving `Add_Item_Page` and returning to `InventoryPage` without submitting.
- **Inline_Styles**: React `CSSProperties` objects — the project's only styling mechanism (no CSS framework).
- **Action_Bar**: A fixed-position container rendered at the bottom of the viewport that holds the Submit (Add) and Cancel/Back buttons; it does not scroll with the form content.
- **ItemDetailPage**: The new full-page React component (`ItemDetailPage`) that replaces the `ItemDetailView` overlay for editing an existing inventory item.
- **Item_Detail_Page**: Synonym for `ItemDetailPage` used in EARS requirement statements.
- **ItemDetailView**: The existing fixed-position overlay component being superseded; it remains in the codebase until the migration is complete.
- **Selected_Item**: The `InventoryItem` passed to `Item_Detail_Page` as a prop, representing the item being edited.

---

## Requirements

### Requirement 1: Add Item Page Route

**User Story:** As a mobile user, I want adding an item to open a full-screen page instead of a modal, so that I have more space to fill in the form without fighting the virtual keyboard or a cramped overlay.

#### Acceptance Criteria

1. WHEN the user selects "Manual Entry" or completes a barcode scan on `InventoryPage`, THE `Layout` SHALL render `Add_Item_Page` as the active page in the main content area, replacing the current page content.
2. THE `Add_Item_Page` SHALL occupy the full available viewport height and width provided by the `Layout` main content area.
3. THE `Add_Item_Page` SHALL display a back button in its header that, when activated, navigates back to `InventoryPage` without submitting the form.
4. WHEN `Add_Item_Page` is active, THE `Layout` bottom navigation bar SHALL remain visible and functional.
5. THE `App` component SHALL register `add-item` as a valid page identifier alongside the existing `PageId` values (`inventory`, `recipes`, `meal-plan`, `shopping-list`).

---

### Requirement 2: Form Fields and Validation

**User Story:** As a user, I want the Add Item form on the new page to have the same fields and validation as the current modal, so that I don't lose any data-entry capability.

#### Acceptance Criteria

1. THE `Add_Item_Page` SHALL render the following required fields: Product Name, Category, Expiration Date, Storage Location (select), Quantity, Unit (select).
2. THE `Add_Item_Page` SHALL render the following optional fields: Barcode, Brand, Where to Buy, Online Store Link, Picture (file input).
3. WHEN the user submits the form with one or more required fields empty or invalid, THE `Add_Item_Page` SHALL display a field-level error message adjacent to each invalid field without navigating away.
4. WHEN the user submits the form with all required fields valid, THE `Add_Item_Page` SHALL call the `onSubmit` callback with an `AddItemData` object containing all entered values.
5. IF the `onSubmit` callback returns an `error` string, THEN THE `Add_Item_Page` SHALL display that error in a banner at the top of the form.
6. WHEN `onSubmit` succeeds, THE `Add_Item_Page` SHALL display a success message and then navigate back to `InventoryPage`.
7. THE `Add_Item_Page` SHALL accept a `locations` prop of type `StorageLocation[]` and populate the Storage Location select with those values.

---

### Requirement 3: Prefill from Barcode Scan

**User Story:** As a user who scanned a barcode, I want the Add Item page to open with the scanned product's details pre-populated, so that I don't have to retype information the scanner already found.

#### Acceptance Criteria

1. THE `Add_Item_Page` SHALL accept an optional `prefillData` prop containing `name`, `brand`, `category`, and `barcode` string fields.
2. WHEN `prefillData` is provided, THE `Add_Item_Page` SHALL initialise the corresponding form fields with those values on mount.
3. WHEN a field is initialised from `prefillData`, THE `Add_Item_Page` SHALL apply `Autofill_Highlight` styling to that field.
4. WHEN the user edits a prefilled field, THE `Add_Item_Page` SHALL remove `Autofill_Highlight` from that field.
5. WHEN the user clears a prefilled field, THE `Add_Item_Page` SHALL remove `Autofill_Highlight` from that field.

---

### Requirement 4: Autocomplete and Autofill

**User Story:** As a user, I want autocomplete suggestions and autofill to work the same way as in the current modal, so that I can quickly fill in the form from existing inventory data.

#### Acceptance Criteria

1. WHEN the user types 3 or more characters in the Barcode or Product Name field, THE `Add_Item_Page` SHALL query the inventory search API and display matching suggestions in an `AutocompleteDropdown`.
2. WHEN the user types 1 or more characters in the Category, Brand, Where to Buy, or Online Store Link fields, THE `Add_Item_Page` SHALL query the inventory search API and display matching value suggestions in an `AutocompleteDropdown`.
3. WHEN the user selects a suggestion from the Barcode or Product Name dropdown, THE `Add_Item_Page` SHALL apply `Autofill` to populate all related fields (name, category, brand, unit, location, quantity, whereToBuy, onlineStoreLink, barcode) from the selected `InventoryItem`, leaving already-filled fields unchanged.
4. WHEN the user selects a suggestion from the Category, Brand, Where to Buy, or Online Store Link dropdown, THE `Add_Item_Page` SHALL set only that single field to the selected value.
5. WHEN the Barcode field contains 8 or more characters and no local autocomplete results exist, THE `Add_Item_Page` SHALL call the external barcode lookup API and apply `Autofill` from the returned product data.
6. WHILE an external barcode lookup is in progress, THE `Add_Item_Page` SHALL display a "Looking up…" indicator adjacent to the Barcode field.
7. IF the external barcode lookup fails, THEN THE `Add_Item_Page` SHALL display an inline error message adjacent to the Barcode field.
8. THE `Add_Item_Page` SHALL debounce autocomplete API calls by 300 milliseconds.
9. THE `Add_Item_Page` SHALL cancel in-flight autocomplete requests for a field when a new keystroke triggers a replacement request for that same field.

---

### Requirement 5: Mobile-First Layout and Accessibility

**User Story:** As a mobile user, I want the Add Item page to be easy to use on a small screen, so that I can fill in the form comfortably without pinching or horizontal scrolling.

#### Acceptance Criteria

1. THE `Add_Item_Page` SHALL use a single-column vertical layout for all form fields at all viewport widths from 320px to 1920px.
2. THE `Add_Item_Page` SHALL apply a minimum touch target height of 44px to all interactive elements (inputs, selects, buttons).
3. THE `Add_Item_Page` SHALL use only `Inline_Styles` (React `CSSProperties`) for all styling.
4. THE `Add_Item_Page` SHALL label every form field with a `<label>` element whose `htmlFor` matches the field's `id`.
5. THE `Add_Item_Page` SHALL mark required fields with `aria-required="true"` and set `aria-invalid="true"` on fields that have a validation error.
6. THE `Add_Item_Page` SHALL set focus to the Product Name field on mount.
7. THE `Add_Item_Page` SHALL render the Submit (Add) and Cancel/Back action buttons exclusively inside a dedicated `Action_Bar` fixed to the bottom of the viewport, so that the `Action_Bar` remains visible and stationary while the form content scrolls independently above it.
8. THE `Add_Item_Page` SHALL apply bottom padding to the scrollable form content area equal to the height of the `Action_Bar`, so that no form content is obscured by the `Action_Bar` when scrolled to the bottom.

---

### Requirement 6: Navigation Integration

**User Story:** As a developer, I want the Add Item page to integrate cleanly with the existing state-based routing, so that no router library is needed and the rest of the app is minimally changed.

#### Acceptance Criteria

1. THE `Layout` component SHALL accept `add-item` as a valid `PageId` and render `Add_Item_Page` when it is the active page.
2. WHEN `add-item` is the active page, THE `Layout` SHALL NOT render a bottom navigation tab for `add-item` (it is a transient page, not a top-level destination).
3. THE `InventoryPage` SHALL navigate to `add-item` (by calling `onNavigate('add-item')`) instead of opening `AddItemModal` when the user selects "Manual Entry".
4. THE `InventoryPage` SHALL navigate to `add-item` (by calling `onNavigate('add-item')`) instead of opening `AddItemModal` after a successful barcode scan.
5. THE `InventoryPage` SHALL pass `prefillData`, `locations`, and `onSubmit` to `Add_Item_Page` via shared state or props threaded through the routing mechanism.
6. WHEN `Add_Item_Page` calls Back_Navigation or completes a successful submission, THE `InventoryPage` SHALL become the active page again.

---

### Requirement 7: Item Detail Page — Form and Save Behaviour

**User Story:** As a mobile user, I want editing an inventory item to open a full-screen page instead of an overlay, so that I have the same comfortable editing experience as adding a new item.

#### Acceptance Criteria

1. THE `Item_Detail_Page` SHALL render the following required fields pre-populated from `Selected_Item`: Product Name, Category, Storage Location (select), Quantity, Unit (select), Expiration Date.
2. THE `Item_Detail_Page` SHALL render the following optional fields pre-populated from `Selected_Item`: Brand, Barcode, Where to Buy, Online Store Link, Low-Stock Threshold.
3. THE `Item_Detail_Page` SHALL display the item name in a page header alongside a low-stock badge WHEN `Selected_Item.isLowStock` is true.
4. WHEN `Selected_Item.pictureUrl` is present, THE `Item_Detail_Page` SHALL display the item picture below the header.
5. WHEN the user activates Save with one or more required fields empty or invalid, THE `Item_Detail_Page` SHALL display a field-level error message adjacent to each invalid field without navigating away.
6. WHEN the user activates Save with all required fields valid, THE `Item_Detail_Page` SHALL call `updateInventoryItem` with the item's `itemId` and the updated field values, then invoke the `onItemUpdated` callback with the returned `InventoryItem`, `lowStockTransition`, and `notification` values.
7. WHEN `updateInventoryItem` succeeds, THE `Item_Detail_Page` SHALL navigate back to `InventoryPage`.
8. IF `updateInventoryItem` throws an error, THEN THE `Item_Detail_Page` SHALL display the error message in a banner at the top of the form without navigating away.
9. WHILE a save operation is in progress, THE `Item_Detail_Page` SHALL disable the Save and Cancel buttons and display "Saving…" as the Save button label.
10. THE `Item_Detail_Page` SHALL label every form field with a `<label>` element whose `htmlFor` matches the field's `id`, mark required fields with `aria-required="true"`, and set `aria-invalid="true"` on fields that have a validation error.
11. THE `Item_Detail_Page` SHALL render the Save and Cancel action buttons exclusively inside a dedicated `Action_Bar` fixed to the bottom of the viewport, so that the `Action_Bar` remains visible and stationary while the form content scrolls independently above it.
12. THE `Item_Detail_Page` SHALL apply bottom padding to the scrollable form content area equal to the height of the `Action_Bar`, so that no form content is obscured by the `Action_Bar` when scrolled to the bottom.

---

### Requirement 8: Item Detail Page — Navigation Integration

**User Story:** As a developer, I want the Item Detail page to integrate with the existing state-based routing the same way as Add Item Page, so that no router library is needed and the overlay mechanics of ItemDetailView are fully removed.

#### Acceptance Criteria

1. THE `App` component SHALL register `item-detail` as a valid `PageId` alongside the existing page identifiers.
2. THE `Layout` component SHALL accept `item-detail` as a valid `PageId` and render `Item_Detail_Page` when it is the active page.
3. WHEN `item-detail` is the active page, THE `Layout` SHALL NOT render a bottom navigation tab for `item-detail` (it is a transient page, not a top-level destination).
4. THE `InventoryPage` SHALL navigate to `item-detail` (by calling `onNavigate('item-detail')`) instead of opening `ItemDetailView` when the user selects an inventory item.
5. THE `App` component SHALL thread `Selected_Item`, `locations`, and `onItemUpdated` to `Item_Detail_Page` via props.
6. WHEN the user activates Cancel on `Item_Detail_Page`, THE `Item_Detail_Page` SHALL navigate back to `InventoryPage` without saving.
7. WHEN `Item_Detail_Page` completes a successful save or the user cancels, THE `InventoryPage` SHALL become the active page again.
