# Implementation Plan: Receipt OCR

## Overview

Implement receipt photo upload and OCR extraction for the Pantry Tracking App. Users capture/upload receipt images, which are stored in S3 and processed via AWS Textract to extract item names and quantities. Extracted items are reviewed/edited by the user and then added to inventory. The implementation spans CDK infrastructure (Receipt Lambda, API Gateway routes, Textract permissions), a backend Receipt Lambda handler with text parsing, a frontend API client, and a ReceiptUploader component wired into the InventoryPage.

## Tasks

- [ ] 1. Add CDK infrastructure for Receipt Lambda and API Gateway routes
  - [ ] 1.1 Add Receipt Lambda and API Gateway routes to PantryStack
    - Add a new `NodejsFunction` for `backend/src/handlers/receipt.ts` with TABLE_NAME and STORAGE_BUCKET env vars, 30s timeout, 512MB memory
    - Grant DynamoDB read/write and S3 read/write to the Receipt Lambda
    - Add Textract `DetectDocumentText` IAM policy to the Receipt Lambda
    - Add API Gateway resources: `POST /receipts/upload`, `POST /receipts/{receiptId}/process`, `GET /receipts/{receiptId}/status` with Cognito auth
    - _Requirements: 1.1, 2.1, 2.2_

- [ ] 2. Implement Receipt Lambda handler with text parser
  - [ ] 2.1 Create Receipt Lambda handler (`backend/src/handlers/receipt.ts`)
    - Implement `handler` function that routes based on HTTP method and resource path (same pattern as `inventory.ts`)
    - Implement `POST /receipts/upload`: generate receiptId (uuid), build s3Key `receipts/{userId}/{receiptId}.jpg`, generate presigned PUT URL (5 min expiry), create Receipt entity in DynamoDB with status `"uploaded"`, return `{ uploadUrl, receiptId }`
    - Implement `POST /receipts/{receiptId}/process`: fetch Receipt from DynamoDB, verify ownership, update status to `"processing"`, call Textract `DetectDocumentText` with S3 object, parse LINE blocks via `parseReceiptLines`, update Receipt with items and status `"completed"` (or `"failed"` on error), return `{ status, items }`
    - Implement `GET /receipts/{receiptId}/status`: fetch Receipt from DynamoDB, verify ownership, return `{ status, items?, errorMessage? }`
    - Handle errors: 401 for unauthenticated, 404 for not found / wrong owner, 400 for invalid state, Textract errors → failed status with descriptive errorMessage
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1_

  - [ ] 2.2 Implement `parseReceiptLines` function in `backend/src/handlers/receipt.ts`
    - Filter Textract blocks to LINE type only
    - Match item patterns: "Item Name $X.XX", "Qty x Item Name $X.XX", "2x Item Name $X.XX"
    - Filter out non-item lines using keyword blocklist (subtotal, total, tax, change, cash, card, visa, mastercard, etc.)
    - Default quantity to 1 when not detected
    - Assign confidence from Textract block confidence
    - Return `ExtractedItem[]`
    - _Requirements: 2.3_

  - [ ]* 2.3 Write unit tests for Receipt Lambda (`backend/src/handlers/receipt.test.ts`)
    - Test upload endpoint returns presigned URL and receiptId, creates Receipt in DynamoDB
    - Test upload endpoint returns 401 for unauthenticated requests
    - Test process endpoint updates status to "processing" and calls Textract
    - Test process endpoint returns 404 for non-existent receipt
    - Test process endpoint returns 400 for receipt not in "uploaded" status
    - Test process endpoint handles Textract errors → failed status
    - Test status endpoint returns current receipt status and items
    - Test status endpoint returns 404 for non-existent receipt
    - Test status endpoint enforces user ownership
    - Test parser extracts item name and price from "Item Name $X.XX" format
    - Test parser extracts quantity from "2x Item Name $X.XX" format
    - Test parser filters out subtotal, total, tax, and payment lines
    - Test parser defaults quantity to 1 when not detected
    - Test parser handles empty LINE blocks → empty result
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 2.4 Write property test: Upload Creates Receipt with Correct S3 Key (`backend/src/handlers/receipt.property.test.ts`)
    - **Property 1: Upload Creates Receipt with Correct S3 Key**
    - Generate random userIds, verify upload handler creates Receipt with status "uploaded" and s3Key matching `receipts/{userId}/{receiptId}.jpg`
    - **Validates: Requirements 1.1, 1.2, 1.3**

  - [ ]* 2.5 Write property test: Receipt Text Parser Extracts Items from LINE Blocks (`backend/src/handlers/receipt.property.test.ts`)
    - **Property 3: Receipt Text Parser Extracts Items from LINE Blocks**
    - Generate random sets of Textract LINE blocks (mix of item lines and blocklist lines), verify parser returns ExtractedItems only for item-pattern lines with non-empty name and confidence in [0, 100], excludes all blocklist lines
    - **Validates: Requirements 2.3**

  - [ ]* 2.6 Write property test: Processing Failure Sets Error State (`backend/src/handlers/receipt.property.test.ts`)
    - **Property 4: Processing Failure Sets Error State**
    - Generate random Textract error types (InvalidS3ObjectException, UnsupportedDocumentException, empty blocks), verify handler sets Receipt status to "failed" with non-empty errorMessage
    - **Validates: Requirements 2.5**

- [ ] 3. Checkpoint - Ensure backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Implement frontend receipt API client
  - [ ] 4.1 Create receipt API client (`frontend/src/api/receipts.ts`)
    - Implement `requestUploadUrl()`: POST to `/receipts/upload`, return `{ uploadUrl, receiptId }`
    - Implement `uploadReceiptImage(uploadUrl, file)`: PUT file to presigned URL with correct Content-Type
    - Implement `processReceipt(receiptId)`: POST to `/receipts/{receiptId}/process`, return `ProcessReceiptResponse`
    - Implement `getReceiptStatus(receiptId)`: GET `/receipts/{receiptId}/status`, return status with optional items/errorMessage
    - All functions throw on non-2xx responses
    - Follow existing pattern from `frontend/src/api/inventory.ts` (getAuthHeaders, error handling)
    - _Requirements: 1.1, 2.1, 3.1_

  - [ ]* 4.2 Write unit tests for receipt API client (`frontend/src/api/receipts.test.ts`)
    - Test `requestUploadUrl` sends POST to correct URL with auth headers
    - Test `uploadReceiptImage` sends PUT with correct content-type and body
    - Test `processReceipt` sends POST to correct URL with receiptId
    - Test `getReceiptStatus` sends GET to correct URL with receiptId
    - Test all functions throw on non-2xx responses
    - _Requirements: 1.1, 2.1, 3.1_

- [ ] 5. Implement ReceiptUploader component
  - [ ] 5.1 Create ReceiptUploader component (`frontend/src/components/ReceiptUploader.tsx`)
    - Implement step-based modal with three steps: Capture, Processing, Review
    - **Capture step**: file input accepting `image/*` with `capture="environment"`, image preview after selection, file size validation (max 10MB), file type validation (JPG/PNG)
    - **Processing step**: call `requestUploadUrl()`, upload image to S3 via presigned URL, call `processReceipt()`, poll `getReceiptStatus()` at 2s intervals (max 30 polls), show spinner/progress indicator
    - **Review step**: display extracted items in editable list with name (editable), quantity (editable), confidence badge, remove button per item. Bulk location/category/expiration selectors. Add manual item button.
    - **Confirm**: iterate non-excluded items, call `addInventoryItem()` for each, show success count, mark failed items with error indicator and retry option
    - **Error handling**: retry button and "Enter Manually" fallback on processing failure, auto-retry on expired presigned URL
    - Props: `isOpen`, `onClose`, `onItemsConfirmed(count)`, `locations`
    - _Requirements: 1.4, 1.5, 2.1, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 6.1, 6.2_

  - [ ]* 5.2 Write unit tests for ReceiptUploader (`frontend/src/components/ReceiptUploader.test.tsx`)
    - Test renders file input accepting images
    - Test shows image preview after file selection
    - Test shows processing spinner during upload/OCR
    - Test displays extracted items in review step
    - Test allows editing item name and quantity
    - Test allows removing items from review list
    - Test allows adding manual items to review list
    - Test shows error and retry on upload failure
    - Test shows error and retry/manual fallback on processing failure
    - Test stops polling on "completed" status
    - Test stops polling on "failed" status
    - Test shows success count after confirm
    - Test marks failed items and offers retry
    - _Requirements: 1.4, 1.5, 4.1, 4.2, 4.3, 4.4, 5.2, 5.3, 6.1, 6.2_

  - [ ]* 5.3 Write property test: Extracted Items Display All Required Fields (`frontend/src/components/ReceiptUploader.property.test.tsx`)
    - **Property 5: Extracted Items Display All Required Fields**
    - Generate random arrays of ExtractedItems, verify rendered review list contains each item's name, quantity, and confidence
    - **Validates: Requirements 4.1**

  - [ ]* 5.4 Write property test: Review List Add and Remove (`frontend/src/components/ReceiptUploader.property.test.tsx`)
    - **Property 6: Review List Add and Remove**
    - Generate random review item lists and add/remove operations, verify removing decreases length by 1 and item is gone, adding increases length by 1 and item is present
    - **Validates: Requirements 4.3, 4.4**

  - [ ]* 5.5 Write property test: Confirm Adds Exactly Non-Excluded Items (`frontend/src/components/ReceiptUploader.property.test.tsx`)
    - **Property 7: Confirm Adds Exactly Non-Excluded Items**
    - Generate random review item lists with random excluded flags, verify confirming results in exactly `count(non-excluded)` inventory API calls and displayed success count matches
    - **Validates: Requirements 5.1, 5.2**

- [ ] 6. Wire ReceiptUploader into InventoryPage
  - [ ] 6.1 Integrate ReceiptUploader in InventoryPage (`frontend/src/pages/InventoryPage.tsx`)
    - Add `receiptUploaderOpen` state
    - Wire "🧾 Receipt Photo" menu item to open ReceiptUploader (`handleAddMenuSelect` receipt case)
    - Add `handleReceiptItemsConfirmed` callback that closes modal, refreshes inventory, and shows notification with count
    - Render `<ReceiptUploader>` component with `isOpen`, `onClose`, `onItemsConfirmed`, `locations` props
    - _Requirements: 1.1, 5.1, 5.2_

- [ ] 7. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- The design uses TypeScript throughout (backend and frontend)
- The Receipt Lambda follows the same handler pattern as `backend/src/handlers/inventory.ts`
- The frontend API client follows the same pattern as `frontend/src/api/inventory.ts`
- Property tests use fast-check and validate universal correctness properties from the design document
