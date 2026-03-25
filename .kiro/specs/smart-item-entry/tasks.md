# Implementation Plan: Smart Item Entry (Stage 3)

## Overview

Enhanced item input via barcode scanning and receipt OCR. Covers barcode lookup with Open Food Facts, receipt processing with Textract, and frontend scanner/uploader components.

- [ ] 1. Implement barcode lookup with external API integration
  - [ ] 1.1 Add barcode lookup endpoint to Inventory Lambda
    - Implement POST /inventory/barcode-lookup endpoint
    - Integrate with Open Food Facts API
    - Return product info or not-found response prompting manual entry

- [ ] 2. Implement Receipt Lambda with S3 and Textract integration
  - [ ] 2.1 Create Receipt Lambda with upload and processing
    - Implement POST /receipts/upload for presigned URL generation
    - Implement POST /receipts/{receiptId}/process for Textract OCR
    - Implement GET /receipts/{receiptId}/status for polling
    - Parse extracted text into item names and quantities

  - [ ]* 2.2 Write property test for receipt photo storage
    - **Property 9: Image Storage with Reference**

- [ ] 3. Implement frontend smart entry components
  - [ ] 3.1 Implement BarcodeScanner component with QuaggaJS
    - Integrate QuaggaJS for camera-based barcode scanning
    - Handle camera permission requests and errors
    - Decode barcode and trigger product lookup
    - Display product details for confirmation before adding
    - Fallback to manual entry on scan failure (timeout after 30s)

  - [ ] 3.2 Implement ReceiptUploader component
    - Create photo capture/upload interface
    - Upload to S3 via presigned URL
    - Poll for OCR processing status
    - Display extracted items for review and editing
    - Handle extraction failures with manual entry fallback

- [ ] 4. Deploy and verify barcode/receipt scanning works
