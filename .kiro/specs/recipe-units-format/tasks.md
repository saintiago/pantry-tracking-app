# Implementation Plan: Recipe Units Format

## Overview

Replace the 5-value unit system with 16 cooking-friendly units, add fractional quantity support, and introduce correct singular/plural display. Changes span both `frontend/src/types/units.ts` and `backend/src/types/units.ts` (unit system), a new `frontend/src/utils/quantity.ts` module, backend validation in `recipe.ts` and `inventory.ts`, and four UI components (`RecipeEditor`, `RecipeDetail`, `AddItemPage`, `ItemDetailPage`).

## Tasks

- [x] 1. Update the shared unit system module (frontend and backend)
  - Replace the 5-value `UnitType` union and `VALID_UNITS` array in `frontend/src/types/units.ts` with `UNIT_METADATA`, the derived `UnitType`, the new `VALID_UNITS`, `LEGACY_UNIT_MAP`, `resolveUnit`, `getUnitLabel`, and `getUnitAbbreviation` as specified in the design
  - Apply the identical changes to `backend/src/types/units.ts`
  - `resolveUnit` must return a `VALID_UNITS` member for any input: valid new key → identity, legacy key → mapped key, unknown → `"piece"`
  - `getUnitLabel` must return singular when `quantity === 1`, plural otherwise (including fractional < 1)
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 6.6_

  - [ ]* 1.1 Write unit tests for the unit system module (frontend)
    - Create `frontend/src/types/__tests__/units.test.ts`
    - Cover: `VALID_UNITS` has 16 entries; `LEGACY_UNIT_MAP` has 5 entries with correct mappings; `resolveUnit` for each legacy key; `resolveUnit("unknown-key")` → `"piece"`; `getUnitLabel("cup", 1)` → `"cup"`, `getUnitLabel("cup", 2)` → `"cups"`, `getUnitLabel("cup", 0.5)` → `"cups"`; `getUnitAbbreviation("tsp")` → `"tsp"`, `getUnitAbbreviation("cup")` → `"c"`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2_

  - [ ]* 1.2 Write property tests for the unit system module (frontend)
    - Create `frontend/src/types/__tests__/units.property.test.ts`
    - **Property 1: Unit metadata completeness** — for any key in `VALID_UNITS`, `UNIT_METADATA[key]` has non-empty `singular`, `abbreviation`, and `plural` — **Validates: Requirements 1.1, 1.3, 1.4**
    - **Property 2: resolveUnit always returns a valid key** — for any `fc.string()` input, `resolveUnit(s)` is a member of `VALID_UNITS` — **Validates: Requirements 2.2**
    - **Property 3: resolveUnit is identity for valid keys** — for any key sampled from `VALID_UNITS`, `resolveUnit(key) === key` — **Validates: Requirements 2.2**
    - **Property 4: getUnitLabel singular/plural rule** — for any key in `VALID_UNITS` and any `fc.float()` quantity, `getUnitLabel(key, quantity)` returns singular iff `quantity === 1` — **Validates: Requirements 1.3, 4.1, 4.3**

  - [ ]* 1.3 Write unit tests for the unit system module (backend)
    - Create `backend/src/types/__tests__/units.test.ts`
    - Mirror the frontend unit tests (same assertions, same file structure)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 6.6_

- [x] 2. Create the quantity utilities module
  - Create `frontend/src/utils/quantity.ts` with `formatQuantity(n: number): string` and `parseFractionalQuantity(s: string): number | null` exactly as specified in the design
  - `formatQuantity`: `0` → `"0"`; negative → absolute value; whole numbers → integer string; decimal matching a common fraction within 0.01 → fraction string (no leading zero when whole part is 0); no match → rounded to 2 decimal places
  - `parseFractionalQuantity`: accepts whole numbers, simple fractions (`"1/2"`), mixed numbers (`"1 1/2"`), and positive decimals; returns `null` for empty, non-positive, or unparseable input
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 7.1, 7.2, 7.3, 7.4_

  - [ ]* 2.1 Write unit tests for quantity utilities
    - Create `frontend/src/utils/__tests__/quantity.test.ts`
    - Cover all cases from the design's Testing Strategy section: `formatQuantity(0)`, `formatQuantity(1)`, `formatQuantity(0.5)`, `formatQuantity(0.25)`, `formatQuantity(1.5)`, `formatQuantity(2.75)`, `formatQuantity(0.333)`, `formatQuantity(-1.5)`, `formatQuantity(1.99)`, `formatQuantity(2.0)`; `parseFractionalQuantity("1")`, `"1/2"`, `"1 1/2"`, `"2 3/4"`, `""`, `"abc"`, `"0"`, `"-1"`
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 7.1, 7.3, 7.4_

  - [ ]* 2.2 Write property tests for quantity utilities
    - Create `frontend/src/utils/__tests__/quantity.property.test.ts`
    - **Property 5: Quantity formatter round-trip** — for any valid fractional string `s` accepted by `parseFractionalQuantity`, `parseFractionalQuantity(formatQuantity(parseFractionalQuantity(s)!))` is within 0.01 of the original parsed value — **Validates: Requirements 3.7, 7.2**
    - **Property 6: formatQuantity handles negative inputs defensively** — for any `fc.float({ min: 0.001, max: 1000 })` value `n`, `formatQuantity(-n) === formatQuantity(n)` — **Validates: Requirements 7.4**
    - **Property 7: formatQuantity is pure** — for any non-negative `fc.float()` value `n`, calling `formatQuantity(n)` twice returns the same string — **Validates: Requirements 7.1**
    - **Property 8: parseFractionalQuantity rejects invalid inputs** — for any `fc.string()` that does not match the whole-number, simple-fraction, mixed-number, or positive-decimal patterns, `parseFractionalQuantity(s)` returns `null` — **Validates: Requirements 3.3**

- [x] 3. Checkpoint — Ensure all unit system and quantity utility tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Update backend validation to accept new and legacy unit keys
  - In `backend/src/handlers/recipe/recipe.ts`: build `ACCEPTED_UNITS` from `[...VALID_UNITS, ...Object.keys(LEGACY_UNIT_MAP)]` and update `validateIngredients` (or any unit check) to accept this combined set; update `autoCreateMissingIngredients` to use `resolveUnit(ing.unit)` instead of the hardcoded `'Unit'` fallback
  - In `backend/src/handlers/inventory/inventory.ts`: update `validateAddRequest` and the `updateInventoryItem` unit check to accept `ACCEPTED_UNITS` (both `VALID_UNITS` keys and `LEGACY_UNIT_MAP` keys); error message continues to list only `VALID_UNITS`
  - Import `LEGACY_UNIT_MAP` and `resolveUnit` from `../../types/units` in both handler files
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]* 4.1 Write unit tests for backend unit validation
    - Add to `backend/src/handlers/recipe/__tests__/recipe.test.ts` and `backend/src/handlers/inventory/__tests__/inventory.test.ts`
    - Recipe: `POST /recipes` with `unit: "tsp"` → 201; `unit: "Gram"` (legacy) → 201; `unit: "invalid-unit"` → 400
    - Inventory: `POST /inventory` with `unit: "g"` → 201; `unit: "Unit"` (legacy) → 201; `unit: "invalid-unit"` → 400
    - `autoCreateMissingIngredients` with a legacy unit → created item has a `VALID_UNITS` member as its `unit`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]* 4.2 Write property tests for backend unit validation
    - Add to `backend/src/handlers/recipe/__tests__/recipe.property.test.ts`
    - **Property 9: Backend accepts all valid and legacy unit keys** — for any unit key sampled from `[...VALID_UNITS, ...Object.keys(LEGACY_UNIT_MAP)]`, a `POST /recipes` request with that key in an ingredient returns 201 — **Validates: Requirements 6.1, 6.2**
    - **Property 10: autoCreateMissingIngredients uses resolved unit keys** — for any ingredient unit value (including legacy keys and arbitrary strings), the placeholder inventory item created by `autoCreateMissingIngredients` has a `unit` field that is a member of `VALID_UNITS` — **Validates: Requirements 6.5**

- [x] 5. Update RecipeEditor — fractional quantity input and new unit dropdown
  - Change the `IngredientRow` interface: replace `quantity: number` with `quantityStr: string`
  - Update `makeRow()` to initialise `quantityStr: ''`
  - Change the quantity `<input>` from `type="number"` to `type="text"` for each ingredient row
  - Update `updateIngredientField` to handle the `quantityStr` field as a raw string (no `parseFloat`)
  - Update the `validate` function: use `parseFractionalQuantity(row.quantityStr)` — `null` or `<= 0` result → `'Enter a valid quantity (e.g. 1, 1/2, 1 1/4).'`
  - Update `handleSubmit` payload: `quantity: parseFractionalQuantity(row.quantityStr)!`
  - In edit-mode `useEffect`: set `quantityStr: formatQuantity(ing.quantity)` and `unit: resolveUnit(ing.unit)` for each ingredient
  - Update the unit `<select>` to use `VALID_UNITS.map(u => <option key={u} value={u}>{getUnitLabel(u, 1)}</option>)` with a `"Select unit"` placeholder
  - Update `handleIngredientSelect` (autocomplete): apply `resolveUnit` to the autofilled unit
  - Import `parseFractionalQuantity`, `formatQuantity` from `../../utils/quantity` and `resolveUnit`, `getUnitLabel` from `../../types/units`
  - _Requirements: 3.1, 3.2, 3.3, 2.4, 4.5, 5.1, 5.3, 5.5_

  - [ ]* 5.1 Write unit tests for RecipeEditor quantity and unit changes
    - Add to `frontend/src/pages/RecipesPage/__tests__/RecipeEditor.test.tsx` (create if absent)
    - Quantity field renders as `<input type="text">` (not `type="number"`)
    - Unit dropdown has 17 options (16 units + placeholder)
    - Unit dropdown first option has value `""` and text `"Select unit"`
    - Unit dropdown options use singular labels as text
    - Submitting with an invalid quantity string (e.g. `"abc"`) shows the validation error message
    - In edit mode, a legacy unit (`"Gram"`) is pre-selected as its resolved key (`"g"`)
    - In edit mode, a numeric quantity (`1.5`) is pre-populated as `"1 1/2"` in the text field
    - _Requirements: 3.1, 3.3, 2.4, 4.5, 5.1, 5.3_

- [x] 6. Update RecipeDetail — formatted quantity and resolved unit label display
  - Import `formatQuantity` from `../../utils/quantity` and `getUnitLabel`, `resolveUnit` from `../../types/units`
  - In the `displayedIngredients` derivation, apply `resolveUnit` to each ingredient's `unit` before passing to `getUnitLabel`
  - Replace `{ing.quantity} {ing.unit}` with `{formatQuantity(ing.quantity)} {getUnitLabel(ing.unit, ing.quantity)}` in the ingredient list render
  - The `scaledQuantities` array already provides the scaled numeric value — pass it as the `quantity` argument to `getUnitLabel` so plural/singular reflects the scaled amount
  - _Requirements: 2.3, 4.1, 4.2, 4.3_

  - [ ]* 6.1 Write unit tests for RecipeDetail display changes
    - Add to `frontend/src/pages/RecipesPage/__tests__/RecipeDetail.test.tsx` (create if absent)
    - Ingredient with `quantity: 0.5, unit: "cup"` renders as `"1/2 cups"`
    - Ingredient with `quantity: 1, unit: "cup"` renders as `"1 cup"` (singular)
    - Ingredient with `quantity: 2, unit: "g"` renders as `"2 grams"`
    - Ingredient with legacy unit `"Gram"` and `quantity: 100` renders as `"100 grams"` (resolved)
    - _Requirements: 2.3, 4.1, 4.3_

- [x] 7. Update AddItemPage — new unit dropdown with singular labels and legacy unit resolution
  - Import `getUnitLabel`, `resolveUnit`, `LEGACY_UNIT_MAP` from `../../types/units`
  - Replace the unit `<select>` options with `VALID_UNITS.map(u => <option key={u} value={u}>{getUnitLabel(u, 1)}</option>)` (placeholder `"Select a unit"` remains)
  - Update `INITIAL_FORM.unit` from `'Unit'` to `'piece'` (the new default)
  - In `performFullAutofill`: update the unit autofill condition to use `resolveUnit` — `updates.unit = resolveUnit(item.unit)` when the item has a unit (replacing the `VALID_UNITS.includes` guard)
  - _Requirements: 2.5, 4.4, 5.2, 5.4, 5.6_

  - [ ]* 7.1 Write unit tests for AddItemPage unit dropdown changes
    - Add to `frontend/src/pages/AddItemPage/__tests__/AddItemPage.test.tsx` (create if absent)
    - Unit dropdown has 17 options (16 units + placeholder)
    - Unit dropdown options use singular labels as text (e.g. `"teaspoon"`, `"cup"`)
    - Autofill with an item that has a legacy unit (`"Unit"`) pre-selects `"piece"` in the dropdown
    - _Requirements: 2.5, 4.4, 5.2, 5.4_

- [x] 8. Update ItemDetailPage — new unit dropdown with singular labels and legacy unit resolution
  - Import `getUnitLabel`, `resolveUnit` from `../../types/units`
  - Replace the unit `<select>` options with `VALID_UNITS.map(u => <option key={u} value={u}>{getUnitLabel(u, 1)}</option>)` (placeholder `"Select a unit"` remains)
  - Update `initForm` to apply `resolveUnit(item.unit)` when setting the initial `unit` field value
  - _Requirements: 2.5, 4.4, 5.2, 5.4_

  - [ ]* 8.1 Write unit tests for ItemDetailPage unit dropdown changes
    - Add to `frontend/src/pages/ItemDetailPage/__tests__/ItemDetailPage.test.tsx` (create if absent)
    - Unit dropdown has 17 options (16 units + placeholder)
    - Unit dropdown options use singular labels as text
    - An item loaded with legacy unit `"Gram"` pre-selects `"g"` in the dropdown
    - _Requirements: 2.5, 4.4, 5.2, 5.4_

- [x] 9. Write e2e tests for recipe units format
  - Create `e2e/recipe-units-format.spec.ts` following the existing `e2e/recipe-management.spec.ts` pattern
  - Use `page.route()` to mock all API calls; use `VITE_MOCK_AUTH=true` via the existing mock auth plugin
  - Mock data should include recipes with fractional quantities (e.g. `quantity: 0.5, unit: "cup"`) and legacy units (e.g. `unit: "Gram"`)
  - **Test: unit dropdown in RecipeEditor shows new cooking units** — open New Recipe, verify the unit dropdown for ingredient 1 contains options `"teaspoon"`, `"cup"`, `"gram"`, `"kilogram"`, `"piece"` (singular labels); verify the old `"Gram"` / `"Unit"` options are absent
  - **Test: fractional quantity input accepted and displayed** — create a recipe with ingredient quantity `"1/2"` and unit `"cup"`; after save, navigate to the recipe detail and verify the ingredient displays as `"1/2 cups"` (plural because 0.5 ≠ 1)
  - **Test: mixed number quantity input accepted and displayed** — create a recipe with quantity `"1 1/2"` and unit `"cup"`; verify detail view shows `"1 1/2 cups"`
  - **Test: singular unit label when quantity is 1** — create a recipe with quantity `"1"` and unit `"cup"`; verify detail view shows `"1 cup"` (singular)
  - **Test: invalid fractional quantity shows validation error** — in RecipeEditor, enter `"abc"` in the quantity field and submit; verify the error message `"Enter a valid quantity (e.g. 1, 1/2, 1 1/4)."` is visible and the form does not navigate away
  - **Test: legacy unit in existing recipe resolves correctly in detail view** — mock a recipe with `unit: "Gram"` and `quantity: 100`; open the detail view and verify it displays `"100 grams"` (not the raw `"Gram"` key)
  - **Test: legacy unit in existing recipe pre-selects resolved unit in editor** — mock a recipe with `unit: "Gram"`; open the edit form and verify the unit dropdown for that ingredient has `"gram"` selected (not `"Gram"` or blank)
  - **Test: unit dropdown in AddItemPage shows new cooking units** — navigate to Add Item page; verify the unit dropdown contains `"teaspoon"`, `"cup"`, `"gram"` and does not contain the old `"Gram"` / `"Unit"` options
  - _Requirements: 3.1, 3.2, 3.3, 2.3, 2.4, 4.1, 4.3, 5.1, 5.2_

- [x] 10. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- `frontend/src/types/units.ts` and `backend/src/types/units.ts` are kept as separate files with identical content — consistent with the existing codebase pattern (no shared package)
- New files introduced: `frontend/src/utils/quantity.ts` (quantity utilities) and `e2e/recipe-units-format.spec.ts` (e2e tests); all other changes are modifications to existing files
- Property tests use fast-check (already installed in both frontend and backend)
- Property test files use the `.property.test.ts` / `.property.test.tsx` suffix; unit test files use `.test.ts` / `.test.tsx`
- Test files go in `__tests__/` sibling directories next to the source they test
