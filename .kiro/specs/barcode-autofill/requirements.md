# Requirements Document

## Introduction

The autocomplete and autofill feature enhances the AddItemModal component by providing intelligent field suggestions based on existing inventory data. All form fields offer autocomplete dropdowns showing matching values from previously entered items. When users select from barcode or name field autocomplete, the system automatically populates all other fields with the complete item data. For other fields, selecting from autocomplete only fills that specific field. The feature provides visual feedback to distinguish between prefilled data and user-edited data, and supports multiple input methods including barcode scanners, paste operations, and manual typing.

## Glossary

- **AddItemModal**: The React component that displays the form for adding new inventory items
- **Barcode_Lookup_API**: The backend API endpoint POST /inventory/barcode-lookup that performs two-tier lookup: first searches existing user inventory items by barcode, then queries Open Food Facts API if no local match is found
- **Open_Food_Facts_API**: External public API (world.openfoodfacts.org) that provides product information by barcode
- **Local_Lookup**: Search for existing inventory items in the user's inventory that match the barcode
- **External_Lookup**: Query to Open Food Facts API for product data when local lookup returns no results
- **Autocomplete_Dropdown**: A dropdown list that appears below a form field showing matching values or items from existing inventory
- **Full_Autofill_Field**: A field (barcode or name) where selecting from autocomplete populates all other form fields
- **Single_Autofill_Field**: A field (category, brand, whereToBuy, onlineStoreLink) where selecting from autocomplete only populates that specific field
- **Prefilled_Field**: A form field that has been automatically populated by the autofill system
- **User_Edited_Field**: A form field that was prefilled but has been subsequently modified by the user
- **Autofill_System**: The client-side logic that triggers lookups and populates form fields
- **Form_Field**: Any input or select element in the AddItemModal (name, category, expirationDate, locationId, quantity, unit, barcode, brand, whereToBuy, onlineStoreLink)

## Requirements

### Requirement 1: Barcode Field Autocomplete and Full Autofill

**User Story:** As a user, I want to see matching barcodes as I type and automatically fill all fields when I select one, so that I don't have to manually type all the product details.

#### Acceptance Criteria

1. WHEN the barcode field value changes AND the barcode contains 3 or more characters, THE Autofill_System SHALL trigger a Local_Lookup to search for existing inventory items with matching barcodes
2. WHEN matching items are found, THE AddItemModal SHALL display an Autocomplete_Dropdown below the barcode field showing all matching items
3. THE Autocomplete_Dropdown SHALL display a maximum of 10 matching items
4. THE Autocomplete_Dropdown SHALL show barcode, item name, and brand (if available) for each matching item
5. WHEN the barcode field contains fewer than 3 characters, THE AddItemModal SHALL hide the Autocomplete_Dropdown
6. WHEN the user selects an item from the barcode Autocomplete_Dropdown, THE Autofill_System SHALL populate all available Form_Fields with data from the selected item
7. WHEN no local matches are found AND the barcode appears complete (8+ digits), THE Autofill_System SHALL trigger an External_Lookup to the Open_Food_Facts_API
8. WHEN the External_Lookup returns product data, THE Autofill_System SHALL populate all available Form_Fields with the returned data
9. WHEN a lookup is in progress, THE Autofill_System SHALL prevent duplicate concurrent lookups for the same barcode
10. THE Autofill_System SHALL handle barcode input from paste operations, manual typing, and barcode scanner devices
11. THE Autofill_System SHALL debounce barcode field changes to avoid excessive searches (300ms delay)

### Requirement 2: Name Field Autocomplete and Full Autofill

**User Story:** As a user, I want to see a list of matching items when I type a product name and automatically fill all fields when I select one, so that I can quickly reuse previously entered items.

#### Acceptance Criteria

1. WHEN the name field value changes AND the name contains 3 or more characters, THE Autofill_System SHALL trigger a search for items with matching names
2. WHEN matching items are found, THE AddItemModal SHALL display an Autocomplete_Dropdown below the name field showing all matching items
3. THE Autocomplete_Dropdown SHALL display a maximum of 10 matching items
4. THE Autocomplete_Dropdown SHALL show item name, category, and brand (if available) for each matching item
5. THE Autofill_System SHALL use case-insensitive substring matching for name searches
6. THE Autofill_System SHALL debounce name field changes to avoid excessive searches (300ms delay)
7. WHEN the name field contains fewer than 3 characters, THE AddItemModal SHALL hide the Autocomplete_Dropdown
8. WHEN no matching items are found, THE AddItemModal SHALL not display the Autocomplete_Dropdown
9. WHEN the user selects an item from the name Autocomplete_Dropdown, THE Autofill_System SHALL populate all available Form_Fields with data from the selected item

### Requirement 2.1: Autocomplete Dropdown Interaction

**User Story:** As a user, I want to navigate and select items from any autocomplete list using keyboard or mouse, so that I can efficiently choose the value I want.

#### Acceptance Criteria

1. WHEN the user clicks on an item in any Autocomplete_Dropdown, THE Autofill_System SHALL populate the appropriate field(s) based on the field type
2. WHEN the user clicks on an item in a Full_Autofill_Field dropdown (barcode or name), THE Autofill_System SHALL populate all available Form_Fields with data from the selected item
3. WHEN the user clicks on a value in a Single_Autofill_Field dropdown, THE Autofill_System SHALL populate only that specific field with the selected value
4. WHEN the user presses the Down Arrow key while a field with an active dropdown is focused, THE AddItemModal SHALL move focus to the first item in the Autocomplete_Dropdown
5. WHEN the user presses the Up Arrow key while navigating the Autocomplete_Dropdown, THE AddItemModal SHALL move focus to the previous item
6. WHEN the user presses the Down Arrow key while navigating the Autocomplete_Dropdown, THE AddItemModal SHALL move focus to the next item
7. WHEN the user presses Tab while navigating the Autocomplete_Dropdown, THE AddItemModal SHALL move focus to the next item (wrapping to first item at the end)
8. WHEN the user presses Shift+Tab while navigating the Autocomplete_Dropdown, THE AddItemModal SHALL move focus to the previous item (wrapping to last item at the beginning)
9. WHEN the user presses Enter or Space while an item in the Autocomplete_Dropdown is focused, THE Autofill_System SHALL populate the appropriate field(s) based on the field type
10. WHEN the user presses Escape while the Autocomplete_Dropdown is visible, THE AddItemModal SHALL hide the dropdown and return focus to the input field
11. WHEN the user clicks outside the input field and Autocomplete_Dropdown, THE AddItemModal SHALL hide the dropdown
12. WHEN an item is selected from the Autocomplete_Dropdown, THE AddItemModal SHALL hide the dropdown

### Requirement 2.2: Category Field Autocomplete

**User Story:** As a user, I want to see matching categories as I type, so that I can maintain consistent category naming across my inventory.

#### Acceptance Criteria

1. WHEN the category field value changes AND the category contains 1 or more characters, THE Autofill_System SHALL search for distinct category values from existing inventory items
2. WHEN matching categories are found, THE AddItemModal SHALL display an Autocomplete_Dropdown below the category field showing all matching values
3. THE Autocomplete_Dropdown SHALL display a maximum of 10 matching categories
4. THE Autofill_System SHALL use case-insensitive substring matching for category searches
5. THE Autofill_System SHALL debounce category field changes (300ms delay)
6. WHEN the user selects a category from the dropdown, THE Autofill_System SHALL populate only the category field

### Requirement 2.3: Brand Field Autocomplete

**User Story:** As a user, I want to see matching brands as I type, so that I can maintain consistent brand naming across my inventory.

#### Acceptance Criteria

1. WHEN the brand field value changes AND the brand contains 1 or more characters, THE Autofill_System SHALL search for distinct brand values from existing inventory items
2. WHEN matching brands are found, THE AddItemModal SHALL display an Autocomplete_Dropdown below the brand field showing all matching values
3. THE Autocomplete_Dropdown SHALL display a maximum of 10 matching brands
4. THE Autofill_System SHALL use case-insensitive substring matching for brand searches
5. THE Autofill_System SHALL debounce brand field changes (300ms delay)
6. WHEN the user selects a brand from the dropdown, THE Autofill_System SHALL populate only the brand field

### Requirement 2.4: Where To Buy Field Autocomplete

**User Story:** As a user, I want to see matching store names as I type, so that I can maintain consistent store naming across my inventory.

#### Acceptance Criteria

1. WHEN the whereToBuy field value changes AND the value contains 1 or more characters, THE Autofill_System SHALL search for distinct whereToBuy values from existing inventory items
2. WHEN matching values are found, THE AddItemModal SHALL display an Autocomplete_Dropdown below the whereToBuy field showing all matching values
3. THE Autocomplete_Dropdown SHALL display a maximum of 10 matching values
4. THE Autofill_System SHALL use case-insensitive substring matching for whereToBuy searches
5. THE Autofill_System SHALL debounce whereToBuy field changes (300ms delay)
6. WHEN the user selects a value from the dropdown, THE Autofill_System SHALL populate only the whereToBuy field

### Requirement 2.5: Online Store Link Field Autocomplete

**User Story:** As a user, I want to see matching online store links as I type, so that I can reuse previously entered URLs.

#### Acceptance Criteria

1. WHEN the onlineStoreLink field value changes AND the value contains 3 or more characters, THE Autofill_System SHALL search for distinct onlineStoreLink values from existing inventory items
2. WHEN matching values are found, THE AddItemModal SHALL display an Autocomplete_Dropdown below the onlineStoreLink field showing all matching values
3. THE Autocomplete_Dropdown SHALL display a maximum of 10 matching values
4. THE Autofill_System SHALL use case-insensitive substring matching for onlineStoreLink searches
5. THE Autofill_System SHALL debounce onlineStoreLink field changes (300ms delay)
6. WHEN the user selects a value from the dropdown, THE Autofill_System SHALL populate only the onlineStoreLink field

### Requirement 3: Prefilled Field Visual Styling

**User Story:** As a user, I want to see which fields were automatically filled, so that I can verify the information and know what needs my attention.

#### Acceptance Criteria

1. WHEN a Form_Field is populated by the Autofill_System, THE AddItemModal SHALL apply a distinct visual style to indicate the field is prefilled
2. THE AddItemModal SHALL use a different background color for Prefilled_Fields compared to empty or user-entered fields
3. THE AddItemModal SHALL ensure prefilled styling meets WCAG 2.1 Level AA contrast requirements
4. THE AddItemModal SHALL apply prefilled styling to all field types (text inputs, selects, number inputs)

### Requirement 4: User Edit Detection and Style Transition

**User Story:** As a user, I want the system to recognize when I modify a prefilled field, so that I can see which fields I've reviewed and changed.

#### Acceptance Criteria

1. WHEN a user modifies a Prefilled_Field, THE AddItemModal SHALL change the field styling from prefilled to user-edited
2. THE AddItemModal SHALL detect modifications through typing, pasting, selecting dropdown options, and deleting content
3. WHEN a user clears a Prefilled_Field to empty, THE AddItemModal SHALL remove the prefilled styling
4. THE AddItemModal SHALL track edit state independently for each Form_Field
5. WHEN the modal is closed and reopened, THE AddItemModal SHALL reset all fields to their initial empty state

### Requirement 5: Autofill Data Population

**User Story:** As a user, I want all relevant fields to be filled automatically, so that I can quickly add items with minimal typing.

#### Acceptance Criteria

1. WHEN product data is received from lookup, THE Autofill_System SHALL populate the name field if available
2. WHEN product data is received from lookup, THE Autofill_System SHALL populate the category field if available
3. WHEN product data is received from lookup, THE Autofill_System SHALL populate the brand field if available
4. WHEN product data is received from lookup, THE Autofill_System SHALL populate the unit field if available and the value is a valid UnitType
5. WHEN product data is received from lookup, THE Autofill_System SHALL populate the whereToBuy field if available
6. WHEN product data is received from lookup, THE Autofill_System SHALL populate the onlineStoreLink field if available
7. THE Autofill_System SHALL not populate the expirationDate, locationId, quantity, or threshold fields
8. WHEN a field already contains user-entered data, THE Autofill_System SHALL not overwrite that field

### Requirement 6: Error Handling and Loading States

**User Story:** As a user, I want to know when the system is searching for product information and when errors occur, so that I understand what's happening.

#### Acceptance Criteria

1. WHEN a lookup is in progress, THE AddItemModal SHALL display a loading indicator near the triggering field
2. WHEN a lookup fails due to network error, THE AddItemModal SHALL display an error message to the user
3. WHEN a lookup completes with no results, THE AddItemModal SHALL not display an error message
4. THE AddItemModal SHALL allow users to continue editing fields while a lookup is in progress
5. WHEN the modal is closed, THE Autofill_System SHALL cancel any in-progress lookup requests

### Requirement 7: Form Submission with Autofilled Data

**User Story:** As a user, I want to submit the form with autofilled data, so that I can quickly add items without manually entering every field.

#### Acceptance Criteria

1. WHEN the form is submitted, THE AddItemModal SHALL include all Prefilled_Fields in the submission data
2. WHEN the form is submitted, THE AddItemModal SHALL include all User_Edited_Fields in the submission data
3. THE AddItemModal SHALL validate all fields according to existing validation rules regardless of whether they are prefilled or user-entered
4. WHEN required fields are not populated after autofill, THE AddItemModal SHALL display validation errors on submission

### Requirement 8: Accessibility and Keyboard Navigation

**User Story:** As a user relying on assistive technology, I want to be informed when fields are autofilled and navigate all autocomplete dropdowns effectively, so that I can use the feature with assistive technology.

#### Acceptance Criteria

1. WHEN fields are autofilled, THE AddItemModal SHALL announce the autofill action to screen readers
2. THE AddItemModal SHALL maintain proper focus management during autofill operations
3. THE AddItemModal SHALL ensure all autofill-related UI elements are keyboard accessible
4. WHEN a loading indicator is displayed, THE AddItemModal SHALL provide appropriate ARIA attributes for screen readers
5. ALL Autocomplete_Dropdowns SHALL implement ARIA combobox pattern with proper role, aria-expanded, aria-activedescendant, and aria-controls attributes
6. WHEN any Autocomplete_Dropdown appears, THE AddItemModal SHALL announce the number of matching items or values to screen readers
7. WHEN navigating any Autocomplete_Dropdown with keyboard, THE AddItemModal SHALL announce the currently focused item to screen readers
8. ALL fields with autocomplete SHALL have aria-autocomplete="list" attribute when their dropdown is active
