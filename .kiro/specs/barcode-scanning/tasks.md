# Implementation Plan: Barcode Scanning

## Overview

Add barcode scanning to the Pantry Tracking App. The backend gets a new `POST /inventory/barcode-lookup` route on the existing Inventory Lambda that proxies to Open Food Facts with in-memory caching and a 5-second timeout. The frontend gets a QuaggaJS-based BarcodeScanner component, a `lookupBarcode()` API client function, prefill support on AddItemModal, and a wired-up scan flow on InventoryPage. The CDK stack needs the new API Gateway route added.

## Tasks

- [ ] 1. Add barcode lookup endpoint to Inventory Lambda
  - [ ] 1.1 Implement the `barcodeLookup` handler function in `backend/src/handlers/inventory.ts`
    - Add in-memory `Map<string, { product: ProductInfo; timestamp: number }>` cache with 5-minute TTL
    - Parse and validate request body: return 400 for missing body, invalid JSON, or empty/whitespace barcode
    - Check cache before calling external API
    - Call Open Food Facts API (`https://world.openfoodfacts.org/api/v2/product/{barcode}`) using `fetch` with a 5-second `AbortController` timeout
    - Extract `product_name`, `brands`, `categories_tags[0]` from the response
    - Return `{ found: true, product: { name, brand, category } }` on success
    - Return `{ found: false }` on 404, timeout, network error, or any external API failure (log errors)
    - Cache successful lookups
    - Wire the new handler into the existing `handler()` router for `POST` requests matching the `barcode-lookup` path
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 5.1, 5.2, 5.3, 5.5_

  - [ ]* 1.2 Write unit tests for barcode lookup handler
    - Add tests to `backend/src/handlers/inventory.test.ts`
    - Test 400 for missing body, empty barcode, invalid JSON
    - Test found result when Open Food Facts returns product data (mock fetch)
    - Test not-found when Open Food Facts returns 404 (mock fetch)
    - Test not-found when Open Food Facts times out (mock AbortController)
    - Test not-found when Open Food Facts is unreachable (mock fetch throw)
    - Test cached result returned on second call for same barcode
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 5.1, 5.2, 5.3, 5.5_

  - [ ]* 1.3 Write property test for barcode lookup response correctness
    - Add to `backend/src/handlers/inventory.property.test.ts`
    - **Property 1: Barcode Lookup Response Correctness**
    - Generate random Open Food Facts API responses (with and without product data). Verify the handler always returns the correct `found` flag and extracts fields correctly when present.
    - **Validates: Requirements 3.2, 5.2**

  - [ ]* 1.4 Write property test for barcode input validation
    - Add to `backend/src/handlers/inventory.property.test.ts`
    - **Property 3: Barcode Input Validation**
    - Generate random strings (including empty, whitespace-only, and valid barcodes). Verify the handler returns 400 for empty/whitespace inputs and processes non-empty inputs.
    - **Validates: Requirements 5.1, 5.3**

  - [ ]* 1.5 Write property test for barcode cache idempotence
    - Add to `backend/src/handlers/inventory.property.test.ts`
    - **Property 4: Barcode Cache Idempotence**
    - Generate random barcodes and mock successful API responses. Call the lookup twice for the same barcode and verify the second call returns the same result. Verify the external API was called only once.
    - **Validates: Requirements 5.5**

- [ ] 2. Add barcode-lookup route to API Gateway in CDK stack
  - [ ] 2.1 Add `barcode-lookup` sub-resource under `/inventory` in `infrastructure/src/pantry-stack.ts`
    - Create `inventoryResource.addResource('barcode-lookup')` and add `POST` method with the inventory Lambda integration and Cognito authorizer
    - _Requirements: 5.1, 5.4_

- [ ] 3. Checkpoint - Backend complete
  - Ensure all backend tests pass, ask the user if questions arise.

- [ ] 4. Add `lookupBarcode()` to frontend API client
  - [ ] 4.1 Add `BarcodeLookupResponse` interface and `lookupBarcode()` function to `frontend/src/api/inventory.ts`
    - Define `BarcodeLookupResponse` with `found: boolean` and optional `product: { name: string; brand?: string; category?: string }`
    - Implement `lookupBarcode(barcode: string)` that POSTs to `/inventory/barcode-lookup` with auth headers
    - _Requirements: 5.1, 5.2_

  - [ ]* 4.2 Write unit tests for `lookupBarcode()`
    - Add tests to `frontend/src/api/inventory.test.ts`
    - Test that `lookupBarcode` sends POST to correct URL with barcode in body
    - Test that `lookupBarcode` throws on non-2xx response
    - _Requirements: 5.1, 5.2_

- [ ] 5. Implement BarcodeScanner component
  - [ ] 5.1 Create `frontend/src/components/BarcodeScanner.tsx`
    - Render a modal overlay with live camera preview via QuaggaJS (rear camera, EAN-13 + UPC-A readers)
    - Display a scanning region indicator overlay on the video feed
    - Show a 30-second countdown timer while scanning
    - On successful decode: stop QuaggaJS, call `lookupBarcode()`, invoke `onBarcodeDetected` callback with the result
    - On timeout (30s): stop QuaggaJS, show retry/manual entry prompt
    - On retry: restart scanning with fresh 30-second timeout
    - On manual entry choice: call `onClose` so parent can open AddItemModal for manual entry
    - On camera permission denied (`NotAllowedError`): show instructions for enabling camera permissions
    - On camera unavailable (`NotFoundError`/`NotReadableError`): show message and manual barcode text input fallback
    - Clean up QuaggaJS on unmount
    - Props: `isOpen`, `onClose`, `onBarcodeDetected: (result: BarcodeLookupResult) => void`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4_

  - [ ]* 5.2 Write unit tests for BarcodeScanner component
    - Create `frontend/src/components/BarcodeScanner.test.tsx`
    - Test scanner renders camera preview when permission is granted (mock QuaggaJS)
    - Test scanner shows permission instructions when camera access is denied
    - Test scanner shows manual entry fallback when camera is unavailable
    - Test scanner shows timeout prompt after 30 seconds (mock timers)
    - Test retry button restarts scanning with fresh timeout
    - Test manual entry button closes scanner
    - Test scanner calls `onBarcodeDetected` with lookup result when barcode is detected
    - Test scanner cleans up QuaggaJS on unmount
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4_

  - [ ]* 5.3 Write property test for form pre-fill from lookup result
    - Create `frontend/src/components/BarcodeScanner.property.test.tsx`
    - **Property 2: Form Pre-fill from Lookup Result**
    - Generate random `BarcodeLookupResult` objects (both found and not-found). Verify the pre-fill data passed to AddItemModal matches: all fields populated when found, only barcode when not found.
    - **Validates: Requirements 4.1, 4.2, 4.5**

- [ ] 6. Add prefillData support to AddItemModal
  - [ ] 6.1 Extend `AddItemModalProps` with optional `prefillData` prop in `frontend/src/components/AddItemModal.tsx`
    - Add `prefillData?: { name?: string; brand?: string; category?: string; barcode?: string }` to the props interface
    - When `prefillData` is provided, initialize form fields with those values instead of empty strings
    - Ensure pre-filled fields remain editable
    - _Requirements: 4.1, 4.2, 4.3, 4.5_

  - [ ]* 6.2 Write unit tests for AddItemModal prefill behavior
    - Add tests to `frontend/src/components/AddItemModal.test.tsx`
    - Test AddItemModal pre-fills fields when `prefillData` prop is provided
    - Test pre-filled fields are editable by the user
    - Test AddItemModal with `prefillData` where only barcode is set leaves other fields empty
    - _Requirements: 4.1, 4.2, 4.3, 4.5_

- [ ] 7. Wire barcode scanning flow into InventoryPage
  - [ ] 7.1 Update `frontend/src/pages/InventoryPage.tsx` to integrate BarcodeScanner
    - Add `scannerOpen` and `prefillData` state
    - Wire the "Barcode Scan" menu item to open the BarcodeScanner component
    - Implement `handleBarcodeDetected` callback: close scanner, set prefillData from lookup result, open AddItemModal
    - Pass `prefillData` to AddItemModal and clear it on modal close
    - Render `<BarcodeScanner>` component controlled by `scannerOpen` state
    - _Requirements: 4.1, 4.2, 4.4, 4.5_

  - [ ]* 7.2 Write unit tests for InventoryPage barcode scanning flow
    - Add tests to `frontend/src/pages/InventoryPage.test.tsx`
    - Test that clicking "Barcode Scan" menu item opens the BarcodeScanner
    - Test that `handleBarcodeDetected` closes scanner and opens AddItemModal with prefillData
    - _Requirements: 4.1, 4.2, 4.4, 4.5_

- [ ] 8. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties from the design document
- The backend returns `{ found: false }` for all external API failures (not 5xx) since barcode lookup is best-effort enrichment
- QuaggaJS must be installed as a frontend dependency (`npm install @ericblade/quagga2`)
