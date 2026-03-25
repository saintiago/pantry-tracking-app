# Implementation Plan: Inventory Core (Stage 2)

## Overview

Manual inventory item management across multiple storage locations. Covers storage location CRUD, inventory item CRUD, low-stock thresholds, filtering, and the main UI with Add/Remove buttons.

- [ ] 1. Implement Storage Location Lambda with CRUD operations
  - [x] 1.1 Create Storage Location Lambda with all endpoints
    - Implement GET /locations to list user's storage locations (ordered by createdAt)
    - Implement POST /locations to create a new storage location with unique name validation (case-insensitive)
    - Implement PUT /locations/{locationId} to rename a storage location (unique name validation)
    - Implement DELETE /locations/{locationId} with guards: reject if location contains inventory items, reject if it is the user's last remaining location
    - On first access (GET returns empty), create default "Pantry" location automatically
    - DynamoDB entity: PK=USER#userId, SK=LOCATION#locationId

  - [ ] 1.2 Write property tests for storage location management
    - **Property 30: Storage Location Add with Uniqueness**
    - **Property 31: Storage Location Removal Guard**
    - **Property 32: Storage Location Rename Round-Trip**
    - **Property 33: Storage Location Creation Order**

- [x] 2. Implement StorageLocationManager frontend component
  - [x] 2.1 Create StorageLocationManager UI
    - Display list of user's storage locations
    - Provide form/input to add a new location by name
    - Support inline renaming of existing locations
    - Support removing a location with confirmation
    - Display validation errors: duplicate name, non-empty location removal, last-location removal

  - [x] 2.2 Wire StorageLocationManager to backend API
    - Create API client calls for GET/POST/PUT/DELETE /locations
    - Handle error responses (400 for duplicates, non-empty removal, last-location removal)

- [ ] 3. Implement Inventory Lambda with CRUD operations
  - [x] 3.1 Create Inventory Lambda with list and add operations
    - Implement GET /inventory endpoint with pagination
    - Implement POST /inventory endpoint for adding items with all fields
    - Include validation for required fields (name, category, expirationDate, locationId, quantity, unit)
    - Store item pictures in S3 and save reference in DynamoDB

  - [x] 3.2 Implement inventory item update and delete operations
    - Implement PUT /inventory/{itemId} for updating all fields including locationId
    - Implement DELETE /inventory/{itemId} with confirmation logic
    - Handle zero quantity prompt logic

  - [x] 3.3 Implement low-stock threshold logic and in-app notifications
    - Add isLowStock flag calculation on item create/update (isLowStock = quantity <= threshold)
    - Implement GET /inventory/low-stock endpoint
    - Update GSI1 for low-stock and location-based queries
    - Generate in-app notification when item transitions to low-stock status

  - [ ] 3.4 Write property tests for inventory operations
    - **Property 1: Item Addition Persistence**
    - **Property 2: Item Deletion Removes from Inventory**
    - **Property 3: Quantity Update Round-Trip**
    - **Property 4: Low Stock Threshold Invariant**
    - **Property 5: Low Stock List Accuracy**
    - **Property 6: Low Stock In-App Notification Trigger**
    - **Property 8: Validation Error for Missing Required Fields**
    - **Property 9: Image Storage with Reference**
    - **Property 26: Threshold Setting Persistence**

- [ ] 4. Implement frontend inventory module
  - [x] 4.1 Create MainScreen with prominent Add/Remove buttons
    - Implement MainScreen with two large, touch-friendly Add/Remove buttons dominating the UI
    - Add button provides quick access to all item entry methods (manual, barcode, receipt)
    - Remove button provides quick access to item removal with minimal taps
    - Minimum tap target size of 44x44px

  - [x] 4.2 Create InventoryList with filtering components
    - Implement InventoryList with InventoryItemCard components (showing item picture, location badge)
    - Create QuickFilterInput for real-time text filtering by product name
    - Create CategorySelector dropdown/chip for filtering by category
    - Create LocationFilter for filtering by the user's defined storage locations
    - Support combining all three filters simultaneously
    - Add LowStockBadge visual indicator and InAppNotification component

  - [ ] 4.3 Write property test for combined filtering
    - **Property 7: Combined Filter Correctness**

  - [x] 4.4 Implement AddItemModal for manual entry
    - Create form with all fields: barcode (optional), name, category, expirationDate, locationId, quantity, unit, brand, whereToBuy, onlineStoreLink, picture
    - Implement picture upload to S3 via presigned URL
    - Implement client-side validation with inline errors for required fields
    - Display confirmation message on success

  - [x] 4.5 Wire inventory frontend to backend API
    - Create API client with Bearer token authentication
    - Connect InventoryModule to Inventory Lambda endpoints
    - Handle validation errors with field-specific messages

- [x] 5. Deploy and verify storage locations, inventory CRUD, filtering, and low-stock notifications work end-to-end
