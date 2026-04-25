# Requirements Document

## Introduction

The Inventory page currently displays a flat list of all inventory items with text, category, and location filters. This feature replaces the default view with a category summary view that shows each category as a card with the total item count. Clicking a category drills down into the existing filtered item list for that category. A back button allows the user to return to the category summary view.

## Glossary

- **Category_Summary_View**: The default view of the InventoryList component that displays one card per unique category, each showing the category name and total number of items in that category.
- **Item_List_View**: The existing item-level view that displays individual InventoryItemCard components filtered to a single category.
- **Category_Card**: A clickable card in the Category_Summary_View representing a single category, displaying the category name, the number of distinct items, and the total quantity across all items in that category.
- **Back_Button**: A navigation control rendered above the Item_List_View that returns the user to the Category_Summary_View.
- **InventoryList**: The React component (`frontend/src/components/InventoryList.tsx`) responsible for rendering inventory data.
- **InventoryItem**: A single inventory record with fields including `itemId`, `name`, `category`, `quantity`, `unit`, `location`, `expirationDate`, and `isLowStock`.

## Requirements

### Requirement 1: Category Summary as Default View

**User Story:** As a user, I want to see my inventory organized by category with item counts, so that I can quickly understand what I have at a glance.

#### Acceptance Criteria

1. WHEN the InventoryList component mounts with items, THE Category_Summary_View SHALL display one Category_Card for each unique category present in the items list.
2. THE Category_Card SHALL display the category name, the number of distinct items belonging to that category, and the total quantity (sum of `quantity` field) across all items in that category.
3. WHEN no inventory items exist, THE Category_Summary_View SHALL display the message "No items match the current filters."
4. THE Category_Summary_View SHALL sort categories alphabetically by name.
5. WHEN items are filtered by text, location, or low-stock toggle, THE Category_Summary_View SHALL recompute category cards and counts based on the filtered item set only.
6. WHEN filtering results in zero items for a category, THE Category_Summary_View SHALL omit that category from the display.

### Requirement 2: Category Drill-Down Navigation

**User Story:** As a user, I want to click on a category to see the individual items in that category, so that I can inspect or manage specific items.

#### Acceptance Criteria

1. WHEN the user clicks a Category_Card, THE InventoryList SHALL transition from the Category_Summary_View to the Item_List_View filtered to the selected category.
2. WHEN the user activates a Category_Card via keyboard (Enter or Space key), THE InventoryList SHALL transition to the Item_List_View for that category.
3. WHILE the Item_List_View is active, THE InventoryList SHALL display only items belonging to the selected category.
4. WHILE the Item_List_View is active, THE InventoryList SHALL continue to apply any active text filter, location filter, and low-stock toggle to the displayed items.

### Requirement 3: Back Navigation

**User Story:** As a user, I want a back button to return from the item list to the category overview, so that I can browse other categories.

#### Acceptance Criteria

1. WHILE the Item_List_View is active, THE InventoryList SHALL display a Back_Button above the item list.
2. WHEN the user clicks the Back_Button, THE InventoryList SHALL transition from the Item_List_View back to the Category_Summary_View.
3. WHEN the user activates the Back_Button via keyboard (Enter or Space key), THE InventoryList SHALL transition back to the Category_Summary_View.
4. WHEN the user navigates back to the Category_Summary_View, THE InventoryList SHALL preserve the current text filter, location filter, and low-stock toggle state.
5. THE Back_Button SHALL include an accessible label of "Back to categories".

### Requirement 4: Category Card Accessibility and Touch Targets

**User Story:** As a user on a mobile device or using assistive technology, I want category cards to be accessible and easy to tap, so that I can navigate the inventory comfortably.

#### Acceptance Criteria

1. THE Category_Card SHALL have a minimum touch target size of 44x44 CSS pixels.
2. THE Category_Card SHALL have a role of "button" and a tabIndex of 0 for keyboard accessibility.
3. THE Category_Card SHALL include an accessible label that conveys the category name, item count, and total quantity (e.g., "Dairy, 5 items, 12 total").

### Requirement 5: Low-Stock Indicator on Category Cards

**User Story:** As a user, I want to see if a category contains low-stock items without drilling in, so that I can prioritize restocking.

#### Acceptance Criteria

1. WHEN a category contains one or more items where `isLowStock` is true, THE Category_Card SHALL display a low-stock indicator showing the count of low-stock items in that category.
2. WHEN a category contains zero low-stock items, THE Category_Card SHALL omit the low-stock indicator.

### Requirement 6: Remove Mode in Category View

**User Story:** As a user, I want remove mode to work correctly regardless of which view I am in, so that item removal is consistent.

#### Acceptance Criteria

1. WHILE remove mode is active and the Category_Summary_View is displayed, THE InventoryList SHALL automatically drill into a category when the user clicks a Category_Card, showing items with remove buttons.
2. WHILE remove mode is active and the Item_List_View is displayed, THE InventoryList SHALL display remove buttons on each item card as the existing behavior.

### Requirement 7: Category Grouping Correctness

**User Story:** As a developer, I want the category grouping logic to be correct for all input combinations, so that item counts are always accurate.

#### Acceptance Criteria

1. FOR ALL lists of InventoryItems, THE sum of item counts across all Category_Cards SHALL equal the total number of items in the filtered list (partition property).
2. FOR ALL lists of InventoryItems, each item SHALL appear in exactly one category group matching the item's `category` field.
3. FOR ALL lists of InventoryItems, THE number of Category_Cards SHALL equal the number of distinct category values in the filtered item set.
