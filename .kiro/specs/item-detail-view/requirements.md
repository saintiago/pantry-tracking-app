# Requirements Document

## Introduction

The Pantry Tracking App currently displays inventory items as summary cards in the InventoryList component, showing name, category, location, quantity/unit, and expiration date. Several fields from the InventoryItem interface are not visible in the list view: barcode, brand, whereToBuy, onlineStoreLink, pictureUrl, threshold, createdAt, and updatedAt. This feature adds an Item Detail View that users can open by tapping an item card, which opens directly as an editable form pre-populated with the item's current values. Users can modify fields and save changes directly from the detail panel.

## Glossary

- **Detail_View**: A full-screen panel that displays all fields of a single InventoryItem as an editable form, opened by tapping an item card in the inventory list. Opens directly in edit mode (no separate read-only view).
- **Edit_Form**: The collection of editable input fields displayed within the Detail_View, pre-populated with the current item values.
- **Inventory_API**: The backend REST API endpoint (PUT /inventory/{itemId}) that persists item updates.
- **Item_Card**: The existing InventoryItemCard component that renders a summary of an inventory item in the list.
- **Inventory_Page**: The page-level component that manages inventory state and renders the InventoryList.
- **System**: The Pantry Tracking App frontend application.

## Requirements

### Requirement 1: Open Item Detail View

**User Story:** As a user, I want to tap on an item card in the inventory list, so that I can see the full details of that item.

#### Acceptance Criteria

1. WHEN the user taps an Item_Card, THE System SHALL display the Detail_View for the selected InventoryItem.
2. WHILE the inventory list is in remove mode, THE System SHALL suppress navigation to the Detail_View on item tap (remove action takes priority).
3. WHEN the Detail_View is displayed, THE System SHALL render the view as a full-screen panel above the inventory list content.

### Requirement 2: Display All Item Fields

**User Story:** As a user, I want to see every piece of information about an item in the detail view, so that I can review details not visible in the list.

#### Acceptance Criteria

1. THE Detail_View SHALL display the item name, category, storage location name, quantity, unit, and expiration date.
2. THE Detail_View SHALL always display the brand field, showing "—" when the item has no brand value.
3. THE Detail_View SHALL always display the barcode field, showing "—" when the item has no barcode value.
4. THE Detail_View SHALL always display the low-stock threshold field, showing "—" when the item has no threshold value.
5. THE Detail_View SHALL always display the "where to buy" field, showing "—" when the item has no whereToBuy value.
6. THE Detail_View SHALL display the item picture at a larger size when the item has a pictureUrl value.
7. THE Detail_View SHALL display the createdAt timestamp formatted as a human-readable date.
8. THE Detail_View SHALL display the updatedAt timestamp formatted as a human-readable date.
9. THE Detail_View SHALL always display the online store link field, showing "—" when the item has no onlineStoreLink value.

### Requirement 3: Online Store Link

**User Story:** As a user, I want to tap a link to the online store for an item, so that I can quickly reorder it.

#### Acceptance Criteria

1. WHEN the item has an onlineStoreLink value, THE Detail_View SHALL render the link as a tappable anchor element that opens in a new browser tab.
2. WHEN the item does not have an onlineStoreLink value, THE Detail_View SHALL display "—" for the online store link field.

### Requirement 4: Close Detail View

**User Story:** As a user, I want to close the detail view and return to the inventory list, so that I can continue browsing items.

#### Acceptance Criteria

1. THE Detail_View SHALL display a visible close button with a minimum tap target of 44×44 CSS pixels.
2. WHEN the user taps the close button, THE System SHALL dismiss the Detail_View and return to the inventory list.

### Requirement 5: Low Stock Indicator in Detail View

**User Story:** As a user, I want to see a low-stock warning in the detail view, so that I know at a glance if I need to restock.

#### Acceptance Criteria

1. WHEN the item has isLowStock set to true, THE Detail_View SHALL display a visible low-stock badge.
2. WHEN the item has isLowStock set to false, THE Detail_View SHALL not display a low-stock badge.

### Requirement 6: Responsive Layout

**User Story:** As a user, I want the detail view to look good on both mobile and desktop screens, so that I can use the app on any device.

#### Acceptance Criteria

1. THE Detail_View SHALL be usable on screen widths from 320px to 1920px.
2. WHILE the screen width is 320px or greater, THE Detail_View SHALL maintain a minimum tap target size of 44×44 CSS pixels for all interactive elements.

### Requirement 7: Direct Edit Mode

**User Story:** As a user, I want the detail view to open directly in edit mode when I tap an item, so that I can immediately modify fields without an extra tap.

#### Acceptance Criteria

1. WHEN the Detail_View is displayed, THE System SHALL render all item fields as editable form inputs pre-populated with the current item values.
2. THE Detail_View SHALL display a Cancel button with a minimum tap target of 44×44 CSS pixels.
3. WHEN the user taps the Cancel button, THE System SHALL dismiss the Detail_View and return to the inventory list (same behavior as the close button).

### Requirement 8: Edit Item Fields

**User Story:** As a user, I want to modify item properties from the detail view, so that I can correct or update information without re-creating the item.

#### Acceptance Criteria

1. THE Edit_Form SHALL allow editing of the following fields: name, category, location, quantity, unit, expiration date, brand, barcode, whereToBuy, onlineStoreLink, and threshold.
2. THE Edit_Form SHALL render the location field as a select input populated with available storage locations.
3. THE Edit_Form SHALL render the quantity and threshold fields as numeric inputs.
4. THE Edit_Form SHALL render the expiration date field as a date input.
5. THE Edit_Form SHALL render the onlineStoreLink field as a URL input.

### Requirement 9: Validate Edited Fields

**User Story:** As a user, I want the app to validate my edits before saving, so that I do not accidentally save incomplete or invalid data.

#### Acceptance Criteria

1. WHEN the user submits the Edit_Form with an empty name field, THE System SHALL display a validation error message for the name field and prevent submission.
2. WHEN the user submits the Edit_Form with an empty category field, THE System SHALL display a validation error message for the category field and prevent submission.
3. WHEN the user submits the Edit_Form with an empty expiration date field, THE System SHALL display a validation error message for the expiration date field and prevent submission.
4. WHEN the user submits the Edit_Form with no location selected, THE System SHALL display a validation error message for the location field and prevent submission.
5. WHEN the user submits the Edit_Form with a non-numeric or negative quantity value, THE System SHALL display a validation error message for the quantity field and prevent submission.
6. WHEN the user submits the Edit_Form with an empty unit field, THE System SHALL display a validation error message for the unit field and prevent submission.
7. WHEN the user corrects a field that previously had a validation error, THE System SHALL clear the validation error message for that field.

### Requirement 10: Save Changes and Feedback

**User Story:** As a user, I want to save my edits and receive clear feedback on whether the save succeeded or failed, so that I know the current state of my data.

#### Acceptance Criteria

1. THE Detail_View SHALL display a Save button with a minimum tap target of 44×44 CSS pixels.
2. WHEN the user taps the Save button and all fields pass validation, THE System SHALL send the updated fields to the Inventory_API using the PUT /inventory/{itemId} endpoint.
3. WHILE the save request is in progress, THE System SHALL disable the Save and Cancel buttons and display a loading indicator on the Save button.
4. WHEN the Inventory_API returns a successful response, THE System SHALL update the local item data with the response and dismiss the Detail_View, returning the user to the inventory list.
5. IF the Inventory_API returns an error response, THEN THE System SHALL display an error message describing the failure so the user can retry.
6. IF a network error occurs during the save request, THEN THE System SHALL display an error message indicating the network failure.
7. WHEN the save completes successfully and the Inventory_API response includes a lowStockTransition flag, THE System SHALL display a low-stock notification for the updated item.
