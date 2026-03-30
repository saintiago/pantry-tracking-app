# Requirements Document

## Introduction

The Receipt OCR feature enables users to photograph supermarket receipts and automatically extract item data using AWS Textract. This eliminates manual entry for bulk grocery additions by uploading receipt images to S3, processing them through OCR, and presenting extracted items for user review before adding them to inventory. This spec is extracted from the parent pantry-tracking-app Requirement 4 and covers the full receipt lifecycle: image upload, OCR processing, text parsing, user review, and inventory addition.

Data models and API contracts are defined in `.kiro/steering/data-model.md` (Receipt entity, ExtractedItem interface, receipt API routes).

## Glossary

- **Pantry_App**: The main web application system for inventory tracking
- **Beautiful_User**: An authenticated person using the application via Cognito
- **Receipt_Processor**: Backend Lambda service that generates presigned S3 upload URLs, triggers AWS Textract OCR, and parses extracted text into structured item data
- **Receipt_Entity**: A DynamoDB record tracking a receipt through its lifecycle (uploaded, processing, completed, failed), including S3 key and extracted items
- **ExtractedItem**: A structured object parsed from receipt text containing name, optional quantity, optional price, and a confidence score
- **ReceiptUploader**: Frontend component providing photo capture/upload, processing status polling, and extracted item review/editing

## Requirements

### Requirement 1: Upload Receipt Image

**User Story:** As a beautiful user, I want to capture or upload a photo of my supermarket receipt, so that the app can process it for item extraction.

#### Acceptance Criteria

1. WHEN the beautiful user initiates receipt upload, THE Pantry_App SHALL request a presigned S3 upload URL from the Receipt_Processor via POST /receipts/upload
2. WHEN a presigned URL is returned, THE Pantry_App SHALL upload the receipt image to S3 at the path `receipts/{userId}/{receiptId}.{jpg|png}`
3. WHEN the upload completes, THE Receipt_Processor SHALL create a Receipt_Entity in DynamoDB with status "uploaded" and the corresponding S3 key
4. THE ReceiptUploader SHALL accept images from the device camera or from the device file picker
5. IF the image upload to S3 fails, THEN THE Pantry_App SHALL display an error message and allow the beautiful user to retry

### Requirement 2: Process Receipt via OCR

**User Story:** As a beautiful user, I want the app to automatically extract text from my receipt photo, so that I do not have to type each item manually.

#### Acceptance Criteria

1. WHEN the beautiful user triggers processing, THE Pantry_App SHALL call POST /receipts/{receiptId}/process to start OCR
2. WHEN processing is triggered, THE Receipt_Processor SHALL update the Receipt_Entity status to "processing" and invoke AWS Textract on the S3 image
3. WHEN AWS Textract returns extracted text, THE Receipt_Processor SHALL parse item names and quantities from the text
4. WHEN parsing completes, THE Receipt_Processor SHALL store the ExtractedItem array on the Receipt_Entity and update status to "completed"
5. IF AWS Textract fails or returns no usable text, THEN THE Receipt_Processor SHALL update the Receipt_Entity status to "failed" and store a descriptive error message

### Requirement 3: Poll Processing Status

**User Story:** As a beautiful user, I want to see the progress of my receipt processing, so that I know when extracted items are ready for review.

#### Acceptance Criteria

1. WHILE the Receipt_Entity status is "processing", THE Pantry_App SHALL poll GET /receipts/{receiptId}/status at regular intervals
2. WHEN the status transitions to "completed", THE Pantry_App SHALL stop polling and display the extracted items
3. WHEN the status transitions to "failed", THE Pantry_App SHALL stop polling and display the error message from the Receipt_Entity

### Requirement 4: Review and Edit Extracted Items

**User Story:** As a beautiful user, I want to review and correct the items extracted from my receipt, so that only accurate data is added to my inventory.

#### Acceptance Criteria

1. WHEN extraction completes, THE Pantry_App SHALL display each ExtractedItem with its parsed name, quantity, and confidence score
2. THE Pantry_App SHALL allow the beautiful user to edit the name and quantity of each extracted item before confirmation
3. THE Pantry_App SHALL allow the beautiful user to remove individual extracted items from the list before confirmation
4. THE Pantry_App SHALL allow the beautiful user to add additional items manually to the extracted list before confirmation

### Requirement 5: Confirm and Add Extracted Items to Inventory

**User Story:** As a beautiful user, I want to confirm the reviewed items and add them to my inventory in one action, so that bulk entry from a receipt is fast.

#### Acceptance Criteria

1. WHEN the beautiful user confirms the extracted items, THE Pantry_App SHALL add each confirmed item to the inventory via the existing inventory API
2. WHEN all items are successfully added, THE Pantry_App SHALL display a confirmation message with the count of items added
3. IF any item fails to be added, THEN THE Pantry_App SHALL indicate which items failed and allow the beautiful user to retry those items

### Requirement 6: Extraction Failure Fallback

**User Story:** As a beautiful user, I want a clear fallback when receipt processing fails, so that I can still add my items without being stuck.

#### Acceptance Criteria

1. IF text extraction fails, THEN THE Pantry_App SHALL notify the beautiful user with a descriptive message explaining the failure
2. IF text extraction fails, THEN THE Pantry_App SHALL offer the beautiful user the option to retry processing or switch to manual item entry
