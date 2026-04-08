# Implementation Plan: Barcode Autofill Feature

## Overview

This implementation adds autocomplete and autofill functionality to the AddItemModal component. The feature provides intelligent field suggestions based on existing inventory data and automatically populates form fields when users select from autocomplete dropdowns. Implementation follows a backend-first approach to enable frontend integration testing.

## Tasks

- [ ] 1. Implement backend inventory search endpoint
  - [x] 1.1 Create GET /inventory/search handler in backend/src/handlers/inventory.ts
    - Add searchInventory function with field-specific logic
    - Implement barcode search (substring match, return full items)
    - Implement name search (case-insensitive substring, return full items)
    - Implement category search (distinct values, case-insensitive filter)
    - Implement brand search (distinct values, case-insensitive filter)
    - Implement whereToBuy search (distinct values, case-insensitive filter)
    - Implement onlineStoreLink search (distinct values, case-insensitive filter)
    - Return max 10 results per search
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.2.1, 2.2.2, 2.3.1, 2.3.2, 2.4.1, 2.4.2, 2.5.1, 2.5.2_
  
  - [x] 1.2 Write unit tests for inventory search handler
    - Test each field type returns correct result format
    - Test case-insensitive matching for text fields
    - Test max 10 results limit
    - Test empty query handling
    - Test invalid field parameter
    - _Requirements: 1.2, 2.2, 2.5, 2.2.4, 2.3.4, 2.4.4, 2.5.4_
  
  - [ ]* 1.3 Write property test for case-insensitive substring matching
    - **Property 6: Case-insensitive substring matching**
    - **Validates: Requirements 2.5, 2.2.4, 2.3.4, 2.4.4, 2.5.4**

- [x] 2. Add GET /inventory/search route to infrastructure
  - [x] 2.1 Update infrastructure/src/pantry-stack.ts
    - Add GET /inventory/search route to API Gateway
    - Wire route to inventory Lambda handler
    - _Requirements: 1.1_

- [x] 3. Checkpoint - Verify backend implementation
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Implement frontend API client functions
  - [x] 4.1 Add searchInventory function to frontend/src/api/inventory.ts
    - Implement GET /inventory/search API call
    - Add TypeScript interfaces (InventorySearchRequest, InventorySearchResponse)
    - Handle authentication token
    - Handle error responses
    - _Requirements: 1.1, 2.1_
  
  - [x] 4.2 Write unit tests for API client functions
    - Test searchInventory with different field types
    - Test authentication token inclusion
    - _Requirements: 1.1_

- [ ] 5. Implement autocomplete dropdown component
  - [x] 5.1 Create reusable AutocompleteDropdown component in frontend/src/components/
    - Implement dropdown rendering with items/values
    - Add keyboard navigation (Arrow keys, Tab/Shift+Tab, Enter/Space, Escape)
    - Add ARIA attributes (role, aria-expanded, aria-activedescendant, aria-controls)
    - Add focus management and visual focus indicators
    - Add click-outside-to-close behavior
    - Limit display to max 10 items
    - _Requirements: 1.3, 2.1.1, 2.1.4, 2.1.5, 2.1.6, 2.1.7, 2.1.8, 2.1.9, 2.1.10, 2.1.11, 2.1.12, 8.5, 8.6, 8.7, 8.8_
  
  - [x] 5.2 Write unit tests for AutocompleteDropdown component
    - Test keyboard navigation (all keys)
    - Test click selection
    - Test click-outside closes dropdown
    - Test max 10 items display
    - Test ARIA attributes
    - _Requirements: 2.1.4, 2.1.5, 2.1.6, 2.1.7, 2.1.8, 2.1.9, 2.1.10, 2.1.11, 2.1.12_
  
  - [ ]* 5.3 Write property test for maximum dropdown items
    - **Property 4: Maximum dropdown items**
    - **Validates: Requirements 1.3, 2.3**

- [ ] 6. Implement autofill state management in AddItemModal
  - [x] 6.1 Add autofill state to frontend/src/components/AddItemModal.tsx
    - Add prefilledFields Set to track autofilled fields
    - Add userEditedFields Set to track edited fields
    - Add autocompleteDropdowns state for 6 fields (barcode, name, category, brand, whereToBuy, onlineStoreLink)
    - Add lookupLoading and lookupError state
    - Add lastLookupBarcode for duplicate prevention
    - _Requirements: 3.1, 4.1, 4.4, 1.9_
  
  - [x] 6.2 Implement field change handlers with debouncing
    - Add debounced handlers for all 6 autocomplete fields
    - Implement character threshold checks (barcode: 3, name: 3, category: 1, brand: 1, whereToBuy: 1, onlineStoreLink: 3)
    - Trigger searchInventory API calls when thresholds met
    - Update dropdown state with search results
    - Add 300ms debounce delay
    - _Requirements: 1.1, 1.5, 1.11, 2.1, 2.6, 2.7, 2.2.1, 2.2.5, 2.3.1, 2.3.5, 2.4.1, 2.4.5, 2.5.1, 2.5.5_
  
  - [x] 6.3 Implement external barcode lookup logic
    - Trigger external lookup when barcode is 8+ digits and local search returns empty
    - Call lookupBarcode API function
    - Prevent duplicate lookups for same barcode
    - Populate all fields automatically when external data received
    - _Requirements: 1.7, 1.8, 1.9_
  
  - [x] 6.4 Write unit tests for autofill state management
    - Test debouncing behavior
    - Test character threshold triggers
    - Test duplicate lookup prevention
    - Test state updates on search results
    - _Requirements: 1.1, 1.5, 1.9, 1.11, 2.6_
  
  - [ ]* 6.5 Write property test for character threshold triggers search
    - **Property 1: Character threshold triggers search**
    - **Validates: Requirements 1.1, 1.5, 2.1, 2.7, 2.2.1, 2.3.1, 2.4.1, 2.5.1**

- [ ] 7. Implement autofill population logic
  - [x] 7.1 Add full autofill function for barcode and name fields
    - Populate all available fields (name, category, brand, unit, whereToBuy, onlineStoreLink)
    - Skip expirationDate, locationId, quantity, threshold fields
    - Validate unit against VALID_UNITS before populating
    - Mark populated fields in prefilledFields Set
    - Do not overwrite fields with existing user data
    - _Requirements: 1.6, 2.9, 2.1.2, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_
  
  - [x] 7.2 Add single autofill function for category, brand, whereToBuy, onlineStoreLink fields
    - Populate only the specific field that triggered selection
    - Mark populated field in prefilledFields Set
    - Do not overwrite if field has existing user data
    - _Requirements: 2.1.3, 2.2.6, 2.3.6, 2.4.6, 2.5.6, 5.8_
  
  - [x] 7.3 Write unit tests for autofill population
    - Test full autofill populates all available fields
    - Test single autofill populates only target field
    - Test user data preservation
    - Test unit validation
    - Test selective field population
    - _Requirements: 1.6, 2.9, 2.1.2, 2.1.3, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_
  
  - [ ]* 7.4 Write property test for full autofill population
    - **Property 7: Full autofill population**
    - **Validates: Requirements 1.6, 2.9, 2.1.2**
  
  - [ ]* 7.5 Write property test for single autofill population
    - **Property 8: Single autofill population**
    - **Validates: Requirements 2.1.3, 2.2.6, 2.3.6, 2.4.6, 2.5.6**
  
  - [ ]* 7.6 Write property test for user data preservation
    - **Property 16: User data preservation**
    - **Validates: Requirements 5.8**
  
  - [ ]* 7.7 Write property test for selective field population
    - **Property 15: Selective field population**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7**

- [ ] 8. Implement visual styling for prefilled and edited fields
  - [x] 8.1 Add prefilled field styling to AddItemModal
    - Define AUTOFILL_STYLES constants (prefilled, userEdited, loading, dropdown styles)
    - Apply prefilled styling (light blue background #e0f2fe, blue border #0284c7) to fields in prefilledFields Set
    - Ensure WCAG 2.1 Level AA contrast compliance
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  
  - [x] 8.2 Implement user edit detection and style transition
    - Detect field modifications (typing, pasting, selecting, deleting)
    - Move field from prefilledFields to userEditedFields on modification
    - Transition styling from prefilled to normal (white background, gray border)
    - Track edit state independently per field
    - Clear prefilled styling when field is emptied
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  
  - [x] 8.3 Write unit tests for visual styling
    - Test prefilled styling applied correctly
    - Test user edit transitions styling
    - Test independent field tracking
    - Test empty field clears styling
    - _Requirements: 3.1, 3.4, 4.1, 4.2, 4.3, 4.4_
  
  - [ ] 8.4 Write property test for independent field edit tracking
    - **Property 14: Independent field edit tracking**
    - **Validates: Requirements 4.4**

- [ ] 9. Integrate autocomplete dropdowns into AddItemModal
  - [x] 9.1 Add AutocompleteDropdown components to all 6 fields
    - Integrate dropdown for barcode field (shows items with barcode + name + brand)
    - Integrate dropdown for name field (shows items with name + category + brand)
    - Integrate dropdown for category field (shows distinct values)
    - Integrate dropdown for brand field (shows distinct values)
    - Integrate dropdown for whereToBuy field (shows distinct values)
    - Integrate dropdown for onlineStoreLink field (shows distinct values)
    - Wire dropdown selection to autofill functions
    - _Requirements: 1.2, 1.4, 2.2, 2.4, 2.2.2, 2.3.2, 2.4.2, 2.5.2_
  
  - [x] 9.2 Add loading indicators and error messages
    - Display loading indicator near barcode field during lookup
    - Display error messages for network failures
    - Clear errors on field modification
    - _Requirements: 6.1, 6.2_
  
  - [x] 9.3 Write unit tests for dropdown integration
    - Test dropdown appears with correct content for each field
    - Test dropdown selection triggers correct autofill behavior
    - Test loading indicators display
    - Test error messages display
    - _Requirements: 1.2, 1.4, 2.2, 2.4, 6.1, 6.2_
  
  - [ ]* 9.4 Write property test for dropdown displays matching results
    - **Property 2: Dropdown displays matching results**
    - **Validates: Requirements 1.2, 2.2, 2.2.2, 2.3.2, 2.4.2, 2.5.2**
  
  - [ ]* 9.5 Write property test for dropdown hides for empty results
    - **Property 3: Dropdown hides for empty results**
    - **Validates: Requirements 2.8**
  
  - [ ]* 9.6 Write property test for dropdown content completeness
    - **Property 5: Dropdown content completeness**
    - **Validates: Requirements 1.4, 2.4**

- [ ] 10. Implement cleanup and cancellation logic
  - [x] 10.1 Add request cancellation with AbortController
    - Cancel in-progress requests on modal close
    - Cancel in-progress requests on component unmount
    - Clear all debounce timers on cleanup
    - _Requirements: 6.5_
  
  - [x] 10.2 Add form reset on modal open
    - Reset all autofill state when modal opens
    - Clear prefilledFields and userEditedFields Sets
    - Reset dropdown states
    - Clear loading and error states
    - _Requirements: 4.5_
  
  - [x] 10.3 Write unit tests for cleanup logic
    - Test requests cancelled on modal close
    - Test timers cleared on unmount
    - Test state reset on modal open
    - _Requirements: 6.5, 4.5_

- [ ] 11. Implement accessibility features
  - [x] 11.1 Add ARIA announcements for autofill actions
    - Announce when fields are autofilled
    - Announce dropdown appearance with item count
    - Announce focused item during keyboard navigation
    - Add aria-autocomplete="list" to fields with active dropdowns
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.6, 8.7, 8.8_
  
  - [x] 11.2 Implement focus management
    - Maintain proper focus during autofill operations
    - Ensure keyboard accessibility for all autofill features
    - _Requirements: 8.2, 8.3_
  
  - [x] 11.3 Write unit tests for accessibility
    - Test ARIA attributes present
    - Test screen reader announcements
    - Test focus management
    - Test keyboard accessibility
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_

- [ ] 12. Implement form submission with autofilled data
  - [x] 12.1 Update form submission logic
    - Include all prefilled fields in submission data
    - Include all user-edited fields in submission data
    - Apply validation rules consistently regardless of field source
    - Display validation errors for unfilled required fields
    - _Requirements: 7.1, 7.2, 7.3, 7.4_
  
  - [x] 12.2 Write unit tests for form submission
    - Test prefilled data included in submission
    - Test user-edited data included in submission
    - Test validation applied consistently
    - Test validation errors for missing required fields
    - _Requirements: 7.1, 7.2, 7.3, 7.4_
  
  - [ ]* 12.3 Write property test for form submission completeness
    - **Property 17: Form submission completeness**
    - **Validates: Requirements 7.1, 7.2**
  
  - [ ]* 12.4 Write property test for validation consistency
    - **Property 18: Validation consistency**
    - **Validates: Requirements 7.3**

- [x] 13. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Backend implementation comes first to enable frontend integration testing
- TypeScript is used throughout (React 18 + TypeScript frontend, AWS Lambda TypeScript backend)
