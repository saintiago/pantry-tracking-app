# Requirements Document: Inventory Core (Stage 2)

## Introduction

September 2026 maintenance: the shared inventory client loads all pages; storage-location
checks also follow all pages and use the persisted lot location rather than a conflicting
GSI key. Mutation envelopes and typed inventory fields reject malformed values. See
[current contracts](../../architecture/data-model.md) for maintained units, group thresholds
and the remaining concurrent-write limitations; older criteria below preserve history.

Atomic inventory follow-through: all lot/group mutations, threshold edits and recipe
placeholders now share the transactional inventory repository. Group totals convert
compatible units and retain zero-quantity lots. See the current data contract for the
per-account revision, eight-attempt conflict limit, HTTP retry limits and legacy-lot
adoption. Location uniqueness/deletion races remain outside that guarantee.

This feature covers manual inventory item management across multiple storage locations. It includes storage location CRUD, inventory item CRUD (add, update, remove), low-stock threshold notifications, item list filtering, and the main UI optimized for quick add/remove operations.

## Glossary

- **Pantry_App**: The main web application system for inventory tracking
- **Beautiful_User**: An authenticated person using the application via Cognito
- **Inventory_Item**: A food or household product stored in one of the storage locations with quantity, expiration date, and threshold information
- **Storage_Location**: A beautiful user-defined named location where items are stored. Each beautiful user starts with a default "Pantry" location and can add, rename, or remove additional locations
- **Threshold**: A beautiful user-defined minimum quantity that triggers low-stock notifications
- **Unit_Type**: A constrained set of measurement units for inventory items. Valid values: Gram, Kilo, Milliliter, Liter, Unit

## Requirements

### Requirement 3: Add Item via Manual Entry

**User Story:** As a beautiful user, I want to manually enter items, so that I can add products that cannot be scanned or are not in the product database.

#### Acceptance Criteria

1. THE Pantry_App SHALL provide a form for manual item entry with the following fields:
   - Bar Code (optional)
   - Product Name (required)
   - Category (required)
   - Expiration Date (required)
   - Location: selected from the beautiful user's defined Storage_Locations (required)
   - Quantity (required)
   - Units: selected from a dropdown containing the Unit_Type values (Gram, Kilo, Milliliter, Liter, Unit) (required)
   - Brand (optional)
   - Where to Buy (optional)
   - Link to Item in Online Store (optional)
   - Picture (optional)
2. WHEN the beautiful user submits a valid item form, THE Pantry_App SHALL add the item to the inventory
3. IF required fields are missing, THEN THE Pantry_App SHALL display validation errors indicating the missing fields
4. WHEN an item is successfully added, THE Pantry_App SHALL display a confirmation message
5. WHEN a picture is provided, THE Pantry_App SHALL store the image in S3 and display it next to the item name
6. THE Pantry_App SHALL present the Units field as a dropdown select control restricted to the Unit_Type values
7. IF a unit value outside the Unit_Type enum is submitted, THEN THE Pantry_App SHALL reject the submission with a validation error indicating the invalid unit

### Requirement 5: Remove Items

**User Story:** As a beautiful user, I want to remove items from my inventory, so that I can keep it accurate when items are consumed or discarded.

#### Acceptance Criteria

1. THE Pantry_App SHALL display a prominent "Remove" button on the main screen
2. WHEN the beautiful user taps the Remove button, THE Pantry_App SHALL present a quick item selection interface
3. WHEN the beautiful user selects an item for removal, THE Pantry_App SHALL prompt for confirmation
4. WHEN the beautiful user confirms removal, THE Pantry_App SHALL delete the item from the inventory
5. THE Pantry_App SHALL allow beautiful users to adjust item quantities without full removal

### Requirement 6: Update Item Quantities

**User Story:** As a beautiful user, I want to update the quantity of items, so that I can track consumption and maintain accurate inventory levels.

#### Acceptance Criteria

1. WHEN the beautiful user modifies an item quantity, THE Pantry_App SHALL update the stored quantity value
2. WHEN a quantity update is saved, THE Pantry_App SHALL display the updated quantity immediately
3. IF the new quantity is zero, THEN THE Pantry_App SHALL prompt the beautiful user to remove the item or keep it at zero

### Requirement 7: Low Stock Threshold Notifications

**User Story:** As a beautiful user, I want to be notified when items are running low, so that I can replenish them before they run out.

#### Acceptance Criteria

1. THE Pantry_App SHALL allow beautiful users to set a threshold quantity for each inventory item
2. WHEN an item quantity falls at or below its threshold, THE Pantry_App SHALL mark the item as low stock
3. THE Pantry_App SHALL display a list of all low-stock items in a dedicated view
4. WHEN viewing the inventory, THE Pantry_App SHALL visually indicate items that are at or below their threshold
5. THE Pantry_App SHALL notify the beautiful user about low-stock items via in-app notifications

### Requirement 8: Item List Filtering

**User Story:** As a beautiful user, I want to quickly find items in my inventory, so that I can check stock levels efficiently.

#### Acceptance Criteria

1. THE Pantry_App SHALL display a quick filter text input field at the top of the items list
2. WHEN the beautiful user types in the filter field, THE Pantry_App SHALL filter items in real-time by matching against product name
3. THE Pantry_App SHALL provide a category selector to filter items by category
4. THE Pantry_App SHALL allow filtering by storage location using the beautiful user's defined Storage_Locations
5. THE Pantry_App SHALL allow combining text filter with category and location filters

### Requirement 9: Ease-of-Use Optimized UI

**User Story:** As a beautiful user, I want the app to be optimized for quickly adding and removing items, so that managing my inventory is effortless.

#### Acceptance Criteria

1. THE Pantry_App SHALL display two prominent buttons ("Add" and "Remove") that dominate the main UI
2. THE Add button SHALL provide quick access to all item entry methods (manual, barcode scan, receipt photo)
3. THE Remove button SHALL provide quick access to item removal with minimal taps
4. THE Pantry_App SHALL minimize the number of taps required to complete add/remove operations
5. THE Pantry_App SHALL use touch-friendly controls with minimum tap target size of 44x44 pixels

### Requirement 18: Storage Location Management

**User Story:** As a beautiful user, I want to manage my storage locations, so that I can organize my inventory to match my household setup.

#### Acceptance Criteria

1. WHEN a new beautiful user account is created, THE Pantry_App SHALL create a default Storage_Location named "Pantry"
2. THE Pantry_App SHALL allow beautiful users to add new Storage_Locations by providing a unique name
3. THE Pantry_App SHALL allow beautiful users to rename existing Storage_Locations
4. THE Pantry_App SHALL allow beautiful users to remove Storage_Locations that contain no Inventory_Items
5. IF a beautiful user attempts to remove a Storage_Location that contains Inventory_Items, THEN THE Pantry_App SHALL display an error indicating the location contains items and cannot be removed
6. THE Pantry_App SHALL prevent the beautiful user from removing the last remaining Storage_Location
7. IF a beautiful user attempts to add a Storage_Location with a name that already exists, THEN THE Pantry_App SHALL display a validation error indicating the name is already in use
8. THE Pantry_App SHALL display the list of Storage_Locations in the order they were created

## Issue #10 settings move (September 2026)

Storage-location setup is accessed from the Settings navigation section. Existing
locations, IDs, inventory references, validation and deletion confirmation are retained.
Returning to Inventory refreshes location labels. Inventory Add is pastel green and
Remove pastel red. A failed refresh after a confirmed location write offers a read-only
retry rather than repeating that write.

## Issues #11–#12 follow-up (September 2026)

These criteria supersede the required-date-only entry behavior above. Add/edit
accept a date or an explicit Not applicable choice, persist it and copy it on reuse.
Users choose a product emoji in add/edit forms; it replaces the box placeholder.
Category cards share Shopping's department colors and show one location or Mixed
locations. Product groups show the same location summary; each expanded lot and
its detail view show the actual location alongside quantity/unit. Low-stock tags
and quick removal X controls are pastel red. The X is available without switching
Remove mode and confirms deletion of only that lot. Cancel leaves stock unchanged;
failures remain visible and retryable. Existing group IDs/thresholds are preserved.

## Issue #18 follow-up (September 2026)

Box, pack and roll are supported count units and appear in the editable unit list.
Inventory uses the same deterministic emoji suggestions as Shopping when a product or
category has no saved icon. Remove mode is a bulk-selection flow with a confirmation
that lists selected products; the per-lot quick X remains available outside bulk mode.
Low Stock and Expiring Soon filters sit together and can compose. Receipt photo entry
is removed from the Add menu because receipt OCR remains unshipped.
