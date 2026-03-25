# Implementation Plan: Shopping List (Stage 6)

## Overview

Automated shopping list generation from meal plans. Covers Shopping List Lambda with ingredient aggregation and inventory subtraction, plus frontend components.

- [ ] 1. Implement Shopping List Lambda
  - [ ] 1.1 Create Shopping List Lambda with list generation
    - Implement POST /shopping-list/generate with date range selection (week, month, custom)
    - Aggregate ingredients from all recipes in meal plans for the date range
    - Subtract available inventory quantities from required quantities across all storage locations
    - Exclude fully available items from list (when inventory >= required)
    - Implement PUT /shopping-list for manual edits (add/remove items)

  - [ ]* 1.2 Write property tests for shopping list
    - **Property 17: Shopping List Ingredient Aggregation**
    - **Property 18: Shopping List Inventory Subtraction**

- [ ] 2. Implement frontend shopping list module
  - [ ] 2.1 Create ShoppingListGenerator and ShoppingList components
    - Implement date range selector (week, month, custom)
    - Display calculated shopping list with item names and required quantities
    - Support manual add/remove of items from the generated list

- [ ] 3. Deploy and verify shopping list generation works
