# Implementation Plan: Recipe Management (Stage 4)

## Overview

Recipe management with ingredient availability checking. Covers Recipe Lambda CRUD, ingredient availability calculation, and frontend recipe components.

- [ ] 1. Implement Recipe Lambda
  - [ ] 1.1 Create Recipe Lambda with CRUD operations
    - Implement GET /recipes endpoint
    - Implement POST /recipes with ingredient validation (at least one ingredient with quantity and unit)
    - Implement GET /recipes/{recipeId} with ingredient availability calculation across all storage locations
    - Implement PUT /recipes/{recipeId} for updates
    - Implement DELETE /recipes/{recipeId} with meal plan warning
    - Support optional sourceUrl field for recipe links

  - [ ] 1.2 Implement ingredient availability calculation
    - Compare recipe ingredients against inventory across all user-defined storage locations
    - Calculate availability status: available (total >= required), partial (0 < total < required), missing (total = 0)
    - Return missing ingredient count

  - [ ]* 1.3 Write property tests for recipe operations
    - **Property 10: Recipe CRUD Persistence**
    - **Property 11: Recipe Requires Ingredients**
    - **Property 12: Ingredient Availability Calculation**
    - **Property 13: Missing Ingredient Count Accuracy**

- [ ] 2. Implement frontend recipe module
  - [ ] 2.1 Create RecipeList and RecipeDetail components
    - Implement RecipeList with search functionality
    - Create RecipeDetail with full recipe view
    - Display source URL link when available

  - [ ] 2.2 Implement RecipeEditor component
    - Create form for recipe name, ingredients, instructions, and optional source URL
    - Validate at least one ingredient with quantity and unit
    - Support add/edit/delete operations
    - Show warning before deleting recipe with meal plan assignments

  - [ ] 2.3 Implement IngredientAvailability component
    - Display each ingredient with availability status (available, partial, missing) across all storage locations
    - Show quantity needed vs quantity in inventory for partial items
    - Display total missing ingredient count

- [ ] 3. Deploy and verify recipe management works
