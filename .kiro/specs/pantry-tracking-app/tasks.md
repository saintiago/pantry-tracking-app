# Implementation Plan: Pantry Tracking App

## Overview

This implementation plan is organized into incremental stages, each delivering a working, deployable application. This approach enables continuous validation and allows early user feedback. The design uses TypeScript throughout (frontend and backend), Jest for unit tests, and fast-check for property-based tests.

## Stage 0: Prerequisites & Environment Setup

**Goal:** Prepare development environment and AWS account for deployment.

**Deliverable:** All tools installed, AWS credentials configured, CDK bootstrapped.

- [x] 0. Set up development environment and AWS account
  - [x] 0.1 Install required development tools
    - Install Node.js v18+ (https://nodejs.org/)
    - Install AWS CLI v2 (https://aws.amazon.com/cli/)
    - Install AWS CDK CLI: `npm install -g aws-cdk`
    - Verify installations: `node --version`, `aws --version`, `cdk --version`

  - [x] 0.2 Configure AWS account and credentials
    - Create AWS account if needed (https://aws.amazon.com/)
    - Create IAM user with programmatic access (or use IAM Identity Center)
    - Attach AdministratorAccess policy (or create custom policy for CDK, CloudFormation, DynamoDB, S3, Lambda, API Gateway, Cognito, CloudFront)
    - Run `aws configure` and enter Access Key ID, Secret Access Key, region (e.g., us-east-1)
    - Verify: `aws sts get-caller-identity`

  - [x] 0.3 Bootstrap AWS CDK in your account
    - Run: `cdk bootstrap aws://ACCOUNT_ID/REGION`
    - This creates S3 bucket and IAM roles needed for CDK deployments
    - Only needed once per account/region combination

  - [x] 0.4 Initialize Git repository
    - Run `git init` and create `.gitignore` (node_modules, .env, cdk.out, dist, etc.)
    - Create initial commit with spec files
    - Optionally set up remote repository (GitHub, CodeCommit, etc.)

  - [ ]* 0.5 (Optional) Set up cost monitoring
    - Enable AWS Cost Explorer
    - Set up billing alerts for unexpected charges
    - Review free tier limits for services used

- [x] **Stage 0 Checkpoint** - Verify `aws sts get-caller-identity` and `cdk --version` work

---

## Stage 1: Foundation & Authentication

**Goal:** Deployable shell with working authentication and stubbed module navigation.

**Deliverable:** Beautiful_User can sign up, log in, and see a dashboard with placeholder sections for all modules.

- [x] 1. Set up project structure and AWS CDK infrastructure
  - [x] 1.1 Initialize project with monorepo structure (infrastructure/, backend/, frontend/)
    - Create package.json with workspaces configuration
    - Set up TypeScript configuration for each workspace
    - Configure ESLint and Prettier
    - _Requirements: 16.1, 16.2_

  - [x] 1.2 Set up AWS CDK infrastructure stack with core resources
    - Create CDK app with DynamoDB single-table design (PantryApp table with GSI1)
    - Configure S3 bucket for receipts, inventory item pictures, and exports
    - Set up Cognito User Pool with email authentication
    - Create API Gateway REST API with Cognito authorizer
    - Configure CloudFront distribution (using default CloudFront URL initially)
    - _Requirements: 1.1, 17.1, 17.3_

  - [ ]* 1.3 Write unit tests for CDK infrastructure constructs
    - Test DynamoDB table configuration and GSI
    - Test S3 bucket policies and CORS
    - Test API Gateway routes and authorizer
    - _Requirements: 17.1_

- [x] 2. Implement authentication Lambda and Cognito integration
  - [x] 2.1 Create Auth Lambda for token verification
    - Implement POST /auth/verify endpoint
    - Return userId, email, and validation status
    - _Requirements: 1.1, 1.2_

  - [ ]* 2.2 Write property tests for authentication
    - **Property 23: Authentication Scope Isolation** - Validates: Requirements 1.2
    - **Property 24: Unauthenticated Access Denial** - Validates: Requirements 1.4
    - **Property 25: Authentication Failure Error Display** - Validates: Requirements 1.3

- [x] 3. Set up React PWA frontend shell
  - [x] 3.1 Initialize React PWA with service worker placeholder
    - Create React app with TypeScript
    - Configure PWA manifest for installability
    - Set up basic service worker (caching static assets only)
    - _Requirements: 16.2_

  - [x] 3.2 Implement responsive layout with stubbed navigation
    - Create responsive shell with mobile-first design (320px to 1920px)
    - Implement touch-friendly navigation with 44x44px minimum tap targets
    - Create placeholder pages for: Inventory, Recipes, Meal Plan, Shopping List
    - Add online/offline status indicator (placeholder)
    - _Requirements: 16.1, 9.1, 9.4_

  - [x] 3.3 Implement authentication UI
    - Create AuthProvider React context for auth state
    - Create LoginForm with email/password
    - Create SignupForm for registration
    - Implement TokenManager for JWT refresh and storage
    - Display authentication error messages
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 3.4 Implement dynamic password strength checker
    - Create PasswordStrength component with five rules: min 8 chars, uppercase, lowercase, number, special character
    - Display visual strength bar with five color-coded segments (red → green gradient)
    - Show strength label: Weak, Fair, Good, Strong, Very strong
    - Display checklist with pass/fail indicators (✓/○) for each rule
    - Use aria-live="polite" for screen reader accessibility
    - Integrate into SignupForm below the password input
    - _Requirements: 1.5, 1.6, 1.7, 1.8, 1.9_

- [x] 4. **Stage 1 Checkpoint** - Deploy and verify authentication flow works end-to-end

---

## Stage 2: Inventory Core

**Goal:** First real feature — manual inventory item management across multiple storage locations.

**Deliverable:** Beautiful_User can add, edit, remove inventory items manually with location tracking, filtering, and low-stock indicators.

- [ ] 5. Implement Inventory Lambda with CRUD operations
  - [ ] 5.1 Create Inventory Lambda with list and add operations
    - Implement GET /inventory endpoint with pagination
    - Implement POST /inventory endpoint for adding items with all fields: name, category, expirationDate (required), location (pantry/fridge/freezer/limbo_pantry), quantity, unit, barcode, brand, whereToBuy, onlineStoreLink, pictureUrl
    - Include validation for required fields (name, category, expirationDate, location, quantity, unit)
    - Store item pictures in S3 and save reference in DynamoDB
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 17.1, 17.3_

  - [ ] 5.2 Implement inventory item update and delete operations
    - Implement PUT /inventory/{itemId} for updating all fields including location
    - Implement DELETE /inventory/{itemId} with confirmation logic
    - Handle zero quantity prompt logic
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3_

  - [ ] 5.3 Implement low-stock threshold logic and in-app notifications
    - Add isLowStock flag calculation on item create/update (isLowStock = quantity <= threshold)
    - Implement GET /inventory/low-stock endpoint
    - Update GSI1 for low-stock and location-based queries
    - Generate in-app notification when item transitions to low-stock status
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ]* 5.4 Write property tests for inventory operations
    - **Property 1: Item Addition Persistence** - Validates: Requirements 2.6, 3.2, 4.6
    - **Property 2: Item Deletion Removes from Inventory** - Validates: Requirements 5.4
    - **Property 3: Quantity Update Round-Trip** - Validates: Requirements 6.1
    - **Property 4: Low Stock Threshold Invariant** - Validates: Requirements 7.2
    - **Property 5: Low Stock List Accuracy** - Validates: Requirements 7.3
    - **Property 6: Low Stock In-App Notification Trigger** - Validates: Requirements 7.5
    - **Property 8: Validation Error for Missing Required Fields** - Validates: Requirements 3.3
    - **Property 9: Image Storage with Reference** - Validates: Requirements 3.5, 4.1, 17.3
    - **Property 26: Threshold Setting Persistence** - Validates: Requirements 7.1

- [ ] 6. Implement frontend inventory module
  - [ ] 6.1 Create MainScreen with prominent Add/Remove buttons
    - Implement MainScreen with two large, touch-friendly Add/Remove buttons dominating the UI
    - Add button provides quick access to all item entry methods (manual, barcode, receipt)
    - Remove button provides quick access to item removal with minimal taps
    - Minimum tap target size of 44x44px
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [ ] 6.2 Create InventoryList with filtering components
    - Implement InventoryList with InventoryItemCard components (showing item picture, location badge)
    - Create QuickFilterInput for real-time text filtering by product name
    - Create CategorySelector dropdown/chip for filtering by category
    - Create LocationFilter for filtering by storage location (Pantry, Fridge, Freezer, Limbo Pantry)
    - Support combining all three filters simultaneously
    - Add LowStockBadge visual indicator and InAppNotification component
    - Display low-stock items in a dedicated view
    - _Requirements: 7.3, 7.4, 7.5, 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ]* 6.3 Write property test for combined filtering
    - **Property 7: Combined Filter Correctness** - Validates: Requirements 8.2, 8.3, 8.4, 8.5

  - [ ] 6.4 Implement AddItemModal for manual entry
    - Create form with all fields: barcode (optional), name, category, expirationDate, location, quantity, unit, brand, whereToBuy, onlineStoreLink, picture
    - Implement picture upload to S3 via presigned URL
    - Implement client-side validation with inline errors for required fields
    - Display confirmation message on success
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ] 6.5 Wire inventory frontend to backend API
    - Create API client with Bearer token authentication
    - Connect InventoryModule to Inventory Lambda endpoints
    - Handle validation errors with field-specific messages
    - _Requirements: 17.2_

- [ ] 7. **Stage 2 Checkpoint** - Deploy and verify inventory CRUD, filtering, and low-stock notifications work end-to-end

---

## Stage 3: Smart Item Entry

**Goal:** Enhanced item input via barcode scanning and receipt OCR.

**Deliverable:** Beautiful_User can scan barcodes and photograph receipts to add items quickly.

- [ ] 8. Implement barcode lookup with external API integration
  - [ ] 8.1 Add barcode lookup endpoint to Inventory Lambda
    - Implement POST /inventory/barcode-lookup endpoint
    - Integrate with Open Food Facts API
    - Return product info or not-found response prompting manual entry
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 9. Implement Receipt Lambda with S3 and Textract integration
  - [ ] 9.1 Create Receipt Lambda with upload and processing
    - Implement POST /receipts/upload for presigned URL generation
    - Implement POST /receipts/{receiptId}/process for Textract OCR
    - Implement GET /receipts/{receiptId}/status for polling
    - Parse extracted text into item names and quantities
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 9.2 Write property test for receipt photo storage
    - **Property 9: Image Storage with Reference** - Validates: Requirements 4.1, 17.3

- [ ] 10. Implement frontend smart entry components
  - [ ] 10.1 Implement BarcodeScanner component with QuaggaJS
    - Integrate QuaggaJS for camera-based barcode scanning
    - Handle camera permission requests and errors
    - Decode barcode and trigger product lookup
    - Display product details for confirmation before adding
    - Fallback to manual entry on scan failure (timeout after 30s)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [ ] 10.2 Implement ReceiptUploader component
    - Create photo capture/upload interface
    - Upload to S3 via presigned URL
    - Poll for OCR processing status
    - Display extracted items for review and editing
    - Handle extraction failures with manual entry fallback
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [ ] 11. **Stage 3 Checkpoint** - Deploy and verify barcode/receipt scanning works

---

## Stage 4: Recipes & AI Recipe Parsing

**Goal:** Recipe management with ingredient availability checking and AI-powered recipe text parsing.

**Deliverable:** Beautiful_User can create recipes, see ingredient availability across all storage locations, and paste recipe text for AI parsing.

- [ ] 12. Implement Recipe Lambda
  - [ ] 12.1 Create Recipe Lambda with CRUD operations
    - Implement GET /recipes endpoint
    - Implement POST /recipes with ingredient validation (at least one ingredient with quantity and unit)
    - Implement GET /recipes/{recipeId} with ingredient availability calculation across all storage locations
    - Implement PUT /recipes/{recipeId} for updates
    - Implement DELETE /recipes/{recipeId} with meal plan warning
    - Support optional sourceUrl field for recipe links
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

  - [ ] 12.2 Implement ingredient availability calculation
    - Compare recipe ingredients against inventory across all storage locations (Pantry, Fridge, Freezer, Limbo Pantry)
    - Calculate availability status: available (total >= required), partial (0 < total < required), missing (total = 0)
    - Return missing ingredient count
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [ ]* 12.3 Write property tests for recipe operations
    - **Property 10: Recipe CRUD Persistence** - Validates: Requirements 10.1, 10.3, 10.4, 10.5
    - **Property 11: Recipe Requires Ingredients** - Validates: Requirements 10.2
    - **Property 12: Ingredient Availability Calculation** - Validates: Requirements 11.1, 11.2, 11.3, 12.3, 12.4
    - **Property 13: Missing Ingredient Count Accuracy** - Validates: Requirements 11.4

- [ ] 13. Implement Recipe Parser Lambda (AI-powered)
  - [ ] 13.1 Create Recipe Parser Lambda with AWS Bedrock integration
    - Implement POST /recipes/parse endpoint
    - Send recipe text to AWS Bedrock for ingredient extraction (names, quantities, units, confidence scores)
    - Query inventory to compare extracted ingredients against current stock across all locations
    - Return parsed ingredients with availability status (available, partial, missing)
    - Handle Bedrock errors (throttling, timeout, validation) with appropriate error responses
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.6_

  - [ ]* 13.2 Write property tests for AI recipe parsing
    - **Property 14: AI Recipe Parser Ingredient Extraction** - Validates: Requirements 12.2
    - **Property 15: Add Missing Ingredients to Shopping List** - Validates: Requirements 12.5

- [ ] 14. Implement frontend recipe module
  - [ ] 14.1 Create RecipeList and RecipeDetail components
    - Implement RecipeList with search functionality
    - Create RecipeDetail with full recipe view
    - Display source URL link when available
    - _Requirements: 10.1, 10.7_

  - [ ] 14.2 Implement RecipeEditor component
    - Create form for recipe name, ingredients, instructions, and optional source URL
    - Validate at least one ingredient with quantity and unit
    - Support add/edit/delete operations
    - Show warning before deleting recipe with meal plan assignments
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [ ] 14.3 Implement IngredientAvailability component
    - Display each ingredient with availability status (available, partial, missing) across all storage locations
    - Show quantity needed vs quantity in inventory for partial items
    - Display total missing ingredient count
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [ ] 14.4 Implement RecipeTextParser UI component
    - Create text input area for pasting recipe text
    - Submit to POST /recipes/parse endpoint
    - Display ParsedIngredientsList with AI-extracted ingredients and availability status
    - Allow adding missing ingredients directly to shopping list
    - Handle parsing failures with manual entry fallback
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

- [ ] 15. **Stage 4 Checkpoint** - Deploy and verify recipe management and AI recipe parsing work

---

## Stage 5: Meal Planning

**Goal:** Meal calendar for planning meals.

**Deliverable:** Beautiful_User can assign recipes to breakfast, lunch, and dinner on specific dates.

- [ ] 16. Implement Meal Plan Lambda
  - [ ] 16.1 Create Meal Plan Lambda with CRUD operations
    - Implement GET /meal-plans with date range query (startDate, endDate)
    - Implement POST /meal-plans for creating assignments (date, mealType, recipeId, recipeName)
    - Implement PUT /meal-plans/{planId} for updates
    - Implement DELETE /meal-plans/{planId} for removal
    - Support breakfast, lunch, dinner meal types
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

  - [ ]* 16.2 Write property test for meal planning
    - **Property 16: Meal Plan CRUD Persistence** - Validates: Requirements 13.2, 13.3, 13.4

- [ ] 17. Implement frontend meal planning module
  - [ ] 17.1 Create MealCalendar component
    - Implement weekly/monthly calendar view
    - Display assigned recipes on the calendar
    - _Requirements: 13.1, 13.5_

  - [ ] 17.2 Implement MealSlot and assignment components
    - Create MealSlot for breakfast/lunch/dinner
    - Support recipe assignment, removal, and changes
    - _Requirements: 13.2, 13.3, 13.4_

- [ ] 18. **Stage 5 Checkpoint** - Deploy and verify meal planning works

---

## Stage 6: Shopping List

**Goal:** Automated shopping list generation from meal plans.

**Deliverable:** Beautiful_User can generate shopping lists based on planned meals, with inventory subtraction.

- [ ] 19. Implement Shopping List Lambda
  - [ ] 19.1 Create Shopping List Lambda with list generation
    - Implement POST /shopping-list/generate with date range selection (week, month, custom)
    - Aggregate ingredients from all recipes in meal plans for the date range
    - Subtract available inventory quantities from required quantities across all storage locations
    - Exclude fully available items from list (when inventory >= required)
    - Implement PUT /shopping-list for manual edits (add/remove items)
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6_

  - [ ]* 19.2 Write property tests for shopping list
    - **Property 17: Shopping List Ingredient Aggregation** - Validates: Requirements 14.2
    - **Property 18: Shopping List Inventory Subtraction** - Validates: Requirements 14.3, 14.5

- [ ] 20. Implement frontend shopping list module
  - [ ] 20.1 Create ShoppingListGenerator and ShoppingList components
    - Implement date range selector (week, month, custom)
    - Display calculated shopping list with item names and required quantities
    - Support manual add/remove of items from the generated list
    - _Requirements: 14.1, 14.4, 14.6_

- [ ] 21. **Stage 6 Checkpoint** - Deploy and verify shopping list generation works

---

## Stage 7: Offline-First

**Goal:** Full offline functionality with automatic sync.

**Deliverable:** Beautiful_User can use the app without internet and changes sync when back online.

- [ ] 22. Implement Sync Lambda
  - [ ] 22.1 Create Sync Lambda with batch operations
    - Implement POST /sync for batch sync operations
    - Handle create, update, delete operations for all entity types (inventoryItem, recipe, mealPlan)
    - Implement last-write-wins conflict resolution using timestamps
    - Return applied operations, conflicts, and server timestamp
    - _Requirements: 15.4, 15.5_

  - [ ]* 22.2 Write property test for conflict resolution
    - **Property 22: Conflict Resolution Last-Write-Wins** - Validates: Requirements 15.5

- [ ] 23. Implement frontend offline sync module
  - [ ] 23.1 Set up IndexedDB schema
    - Configure IndexedDB stores (inventoryItems, recipes, mealPlans, syncQueue, metadata)
    - Set up indexes for efficient querying (byCategory, byLocation, byLowStock, byExpirationDate, bySyncVersion, byDate, byName, byStatus, byTimestamp)
    - _Requirements: 15.1_

  - [ ] 23.2 Create SyncManager and SyncQueue components
    - Implement SyncManager for coordinating offline/online sync
    - Create SyncQueue for managing pending operations
    - Implement ConflictResolver with last-write-wins strategy
    - Update OnlineIndicator to show sync status and pending count
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6_

  - [ ] 23.3 Update all modules to use IndexedDB for offline support
    - Modify API client to save to IndexedDB first, then sync
    - Add retry logic with exponential backoff for network errors (1s, 2s, 4s, 8s, max 30s)
    - Queue operations when offline
    - _Requirements: 15.2, 15.3_

  - [ ]* 23.4 Write property tests for offline operations
    - **Property 19: Offline CRUD Operations** - Validates: Requirements 15.2
    - **Property 20: Sync Queue Persistence** - Validates: Requirements 15.3
    - **Property 21: Sync on Reconnection** - Validates: Requirements 15.4

- [ ] 24. **Stage 7 Checkpoint** - Deploy and verify offline functionality works

---

## Stage 8: Optional Features

**Goal:** Enhanced features for power users.

**Deliverable:** Additional capabilities based on user needs (Amazon integration, push notifications, web recipe import).

- [ ]* 25. (Optional) Implement Amazon web store integration
  - [ ]* 25.1 Add Amazon cart link generation for low-stock items
    - Display order option on low-stock items view
    - Generate Amazon shopping cart link with selected items
    - Add marketplace configuration setting
    - _Optional Requirements: 1.1, 1.2, 1.3_

  - [ ]* 25.2 Write property test for Amazon cart link generation
    - **Optional Property 27: Amazon Cart Link Generation** - Validates: Optional Requirements 1.2

- [ ]* 26. (Optional) Implement push notification system
  - [ ]* 26.1 Add SNS/SES notification infrastructure
    - Create SNS topic for push notifications
    - Configure SES for email notifications
    - Add notification preference settings (email, push, frequency: immediate/daily/weekly)
    - Trigger push notifications on low-stock threshold events
    - _Optional Requirements: 2.1, 2.2, 2.3_

  - [ ]* 26.2 Write property test for push notification trigger
    - **Optional Property 28: Push Notification Trigger** - Validates: Optional Requirements 2.2

- [ ]* 27. (Optional) Implement web recipe import
  - [ ]* 27.1 Add recipe URL import functionality
    - Create recipe URL input and parser
    - Extract recipe name, ingredients, and instructions from supported sites
    - Display extracted recipe for review before saving
    - Handle extraction failures with manual entry fallback
    - _Optional Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ]* 27.2 Write property test for recipe URL extraction
    - **Optional Property 29: Recipe URL Extraction** - Validates: Optional Requirements 3.2

- [ ]* 28. **Stage 8 Checkpoint** - Deploy and verify optional features

---

## Stage 9: Custom Domain (Optional)

**Goal:** Configure custom domain with SSL certificate.

**Deliverable:** App accessible via custom domain (e.g., pantry.yourdomain.com).

- [ ]* 29. (Optional) Configure custom domain with Route53
  - [ ]* 29.1 Register domain and set up Route53 hosted zone
    - Register domain via Route53 console (manual step)
    - Create hosted zone in CDK (or import existing)
    - Request SSL certificate via ACM with DNS validation
    - _Note: Domain registration requires manual payment/agreement_

  - [ ]* 29.2 Update CloudFront distribution with custom domain
    - Add custom domain as alternate domain name (CNAME)
    - Attach ACM certificate to CloudFront
    - Create Route53 A/AAAA alias records pointing to CloudFront
    - Update Cognito callback URLs for custom domain

- [ ]* 30. **Stage 9 Checkpoint** - Verify app works on custom domain with HTTPS

---

## Notes

- Tasks marked with `*` are optional and can be skipped for faster delivery
- Each stage ends with a checkpoint to deploy and verify the working application
- Stages are designed to be independently valuable — you can stop after any stage and have a usable app
- Property tests validate the 29 correctness properties from the design document (26 core + 3 optional)
- The design uses TypeScript throughout (frontend and backend)
- Testing framework: Jest for unit tests, fast-check for property-based tests
- Entity naming: InventoryItem (not PantryItem), Beautiful_User (not User), Shopping List (not Grocery List)
- No household member management — meal plans are per-user only
- No nutritional tracking
- All inventory items require an expiration date and storage location
