# Requirements Document

## Introduction

This feature replaces the current minimal unit system (`Gram | Kilo | Milliliter | Liter | Unit`) with a comprehensive set of cooking-friendly units. It also introduces fractional quantity support (e.g. 1/2, 1/4, 1/3) and correct singular/plural display for all units. The change affects the shared `UnitType` definition, the recipe ingredient editor, the recipe detail view, and the inventory item add/edit forms. Existing stored data uses the old unit keys and must remain readable.

## Glossary

- **Unit_System**: The shared module (`frontend/src/types/units.ts` and `backend/src/types/units.ts`) that defines the canonical list of valid unit identifiers and their display metadata.
- **Unit_Key**: The internal string identifier stored in DynamoDB (e.g. `"tsp"`, `"cup"`). Unit keys are lowercase, stable, and never change once defined.
- **Unit_Label**: The human-readable singular display name for a unit (e.g. `"teaspoon"`, `"cup"`).
- **Unit_Abbreviation**: The short form shown in compact contexts (e.g. `"tsp"`, `"c"`).
- **Plural_Form**: The display label used when quantity ≠ 1 (e.g. `"teaspoons"`, `"cups"`).
- **Fractional_Quantity**: A quantity expressed as a common cooking fraction (1/2, 1/3, 1/4, 2/3, 3/4) or a whole number, stored internally as a decimal number.
- **Quantity_Formatter**: A pure function that converts a numeric quantity into a human-readable string, applying fractional notation where applicable.
- **Recipe_Editor**: The `RecipeEditor.tsx` component used to create and edit recipes.
- **Recipe_Detail**: The `RecipeDetail.tsx` component used to display a recipe.
- **Add_Item_Page**: The `AddItemPage.tsx` component used to add inventory items.
- **Item_Detail_Page**: The `ItemDetailPage.tsx` component used to view and edit inventory items.
- **Legacy_Unit**: A unit key from the old system (`Gram`, `Kilo`, `Milliliter`, `Liter`, `Unit`) that may exist in stored DynamoDB records.

---

## Requirements

### Requirement 1: Expanded Cooking Unit Set

**User Story:** As a home cook, I want to choose from a full set of cooking-friendly units when adding recipe ingredients, so that I can express quantities the way recipes are actually written.

#### Acceptance Criteria

1. THE Unit_System SHALL define the following unit keys with their singular labels, abbreviations, and plural forms:

   | Unit Key    | Singular Label | Abbreviation | Plural Form  |
   |-------------|----------------|--------------|--------------|
   | `tsp`       | teaspoon       | tsp          | teaspoons    |
   | `tbsp`      | tablespoon     | tbsp         | tablespoons  |
   | `cup`       | cup            | c            | cups         |
   | `ml`        | milliliter     | ml           | milliliters  |
   | `l`         | liter          | l            | liters       |
   | `g`         | gram           | g            | grams        |
   | `kg`        | kilogram       | kg           | kilograms    |
   | `piece`     | piece          | pc           | pieces       |
   | `slice`     | slice          | sl           | slices       |
   | `clove`     | clove          | cl           | cloves       |
   | `pinch`     | pinch          | pn           | pinches      |
   | `handful`   | handful        | hf           | handfuls     |
   | `stick`     | stick          | st           | sticks       |
   | `can`       | can            | cn           | cans         |
   | `bottle`    | bottle         | bt           | bottles      |
   | `zest`      | zest           | zst          | zests        |

2. THE Unit_System SHALL export a `VALID_UNITS` array containing all unit keys listed in criterion 1.
3. THE Unit_System SHALL export a `getUnitLabel(key, quantity)` function that returns the singular label when quantity equals 1 and the plural form otherwise.
4. THE Unit_System SHALL export a `getUnitAbbreviation(key)` function that returns the abbreviation for a given unit key.
5. THE Unit_System SHALL be defined once and imported by both the frontend (`frontend/src/types/units.ts`) and backend (`backend/src/types/units.ts`).

---

### Requirement 2: Legacy Unit Compatibility

**User Story:** As a user with existing inventory items and recipes, I want my previously saved data to continue displaying correctly after the unit system is updated, so that I don't lose historical records.

#### Acceptance Criteria

1. THE Unit_System SHALL define a `LEGACY_UNIT_MAP` that maps each old unit key to its nearest new unit key:

   | Legacy Key    | Maps To |
   |---------------|---------|
   | `Gram`        | `g`     |
   | `Kilo`        | `kg`    |
   | `Milliliter`  | `ml`    |
   | `Liter`       | `l`     |
   | `Unit`        | `piece` |

2. THE Unit_System SHALL export a `resolveUnit(key)` function that returns the key unchanged if it is a valid new unit key, returns the mapped new key if it is a legacy key, and returns `"piece"` as a fallback for any unrecognised key.
3. WHEN the Recipe_Detail renders an ingredient whose unit is a Legacy_Unit, THE Recipe_Detail SHALL display the resolved new unit label rather than the raw legacy key.
4. WHEN the Recipe_Editor loads an existing recipe whose ingredients contain Legacy_Unit keys, THE Recipe_Editor SHALL pre-select the resolved new unit in the unit dropdown for each such ingredient.
5. WHEN the Add_Item_Page or Item_Detail_Page loads an existing inventory item whose unit is a Legacy_Unit, THE Add_Item_Page SHALL pre-select the resolved new unit in the unit dropdown.

---

### Requirement 3: Fractional Quantity Support

**User Story:** As a home cook, I want to enter ingredient quantities as fractions like 1/2 or 1/4, so that I can express common cooking measurements naturally.

#### Acceptance Criteria

1. THE Recipe_Editor SHALL accept quantity input as a text field that allows entry of whole numbers (e.g. `2`), simple fractions (e.g. `1/2`), and mixed numbers (e.g. `1 1/2`).
2. WHEN a user enters a valid fractional string in the quantity field, THE Recipe_Editor SHALL parse it to its decimal equivalent before storing (e.g. `"1/2"` → `0.5`, `"1 1/4"` → `1.25`).
3. IF a user enters a quantity string that cannot be parsed as a positive number or valid fraction, THEN THE Recipe_Editor SHALL display a validation error message on that ingredient row.
4. THE Quantity_Formatter SHALL convert a numeric quantity to a display string using the nearest common cooking fraction when the decimal part matches 1/2 (0.5), 1/3 (≈0.333), 2/3 (≈0.667), 1/4 (0.25), or 3/4 (0.75), with a tolerance of 0.01.
5. WHEN the whole-number part is zero, THE Quantity_Formatter SHALL omit the zero and display only the fraction (e.g. `0.5` → `"1/2"`, not `"0 1/2"`).
6. WHEN the decimal part does not match any common fraction within tolerance, THE Quantity_Formatter SHALL display the number rounded to at most 2 decimal places.
7. FOR ALL valid fractional quantity strings `s` that the Recipe_Editor accepts, parsing `s` then formatting the result with the Quantity_Formatter SHALL produce a string that parses back to the same decimal value (round-trip property).

---

### Requirement 4: Plural/Singular Unit Display

**User Story:** As a user reading a recipe, I want ingredient quantities to display with grammatically correct unit labels, so that the recipe reads naturally (e.g. "1 cup" vs "2 cups").

#### Acceptance Criteria

1. WHEN the Recipe_Detail renders an ingredient, THE Recipe_Detail SHALL display the unit label in singular form when the formatted quantity equals exactly 1, and in plural form otherwise.
2. WHEN the Recipe_Detail renders a scaled ingredient (portions scaler active), THE Recipe_Detail SHALL apply the plural/singular rule to the scaled quantity.
3. THE Quantity_Formatter SHALL treat fractional quantities less than 1 (e.g. 0.5) as plural for unit label selection purposes.
4. THE Add_Item_Page SHALL display the unit label in the unit dropdown using the singular form of each unit.
5. THE Recipe_Editor SHALL display the unit label in the unit dropdown using the singular form of each unit.

---

### Requirement 5: Unit Selector UI

**User Story:** As a user adding or editing a recipe ingredient or inventory item, I want to select a unit from a clear, well-organised dropdown, so that I can quickly find the right unit.

#### Acceptance Criteria

1. THE Recipe_Editor SHALL render a `<select>` dropdown for each ingredient row that lists all units from `VALID_UNITS` using their singular label as the visible option text and their unit key as the option value.
2. THE Add_Item_Page SHALL render a `<select>` dropdown for the unit field that lists all units from `VALID_UNITS` using their singular label as the visible option text and their unit key as the option value.
3. THE Recipe_Editor unit dropdown SHALL include a blank placeholder option (`"Select unit"`) as the first option with an empty string value.
4. THE Add_Item_Page unit dropdown SHALL include a blank placeholder option (`"Select a unit"`) as the first option with an empty string value.
5. WHEN a unit is selected in the Recipe_Editor ingredient row, THE Recipe_Editor SHALL store the unit key (not the label) in the ingredient's `unit` field.
6. WHEN a unit is selected in the Add_Item_Page, THE Add_Item_Page SHALL store the unit key (not the label) in the item's `unit` field.

---

### Requirement 6: Backend Unit Validation

**User Story:** As a developer, I want the backend to accept the new unit keys and reject unknown values, so that the data stored in DynamoDB remains consistent.

#### Acceptance Criteria

1. THE Recipe Lambda SHALL accept any unit key from `VALID_UNITS` in ingredient `unit` fields when creating or updating a recipe.
2. THE Recipe Lambda SHALL accept Legacy_Unit keys in ingredient `unit` fields for backward compatibility (existing clients may still send old keys during a transition period).
3. THE Inventory Lambda SHALL accept any unit key from `VALID_UNITS` in the `unit` field when creating or updating an inventory item.
4. THE Inventory Lambda SHALL accept Legacy_Unit keys in the `unit` field for backward compatibility.
5. WHEN the `autoCreateMissingIngredients` function creates a placeholder inventory item, THE Recipe Lambda SHALL use the resolved new unit key (via `resolveUnit`) rather than falling back to `"Unit"`.
6. THE Unit_System backend module SHALL export the same `VALID_UNITS`, `LEGACY_UNIT_MAP`, `resolveUnit`, `getUnitLabel`, and `getUnitAbbreviation` exports as the frontend module.

---

### Requirement 7: Quantity Formatter Round-Trip Correctness

**User Story:** As a developer, I want the quantity parsing and formatting logic to be provably correct, so that quantities are never silently corrupted when displayed and re-entered.

#### Acceptance Criteria

1. THE Quantity_Formatter SHALL be a pure function with no side effects.
2. FOR ALL decimal values produced by parsing valid fractional input strings, applying the Quantity_Formatter and then re-parsing the result SHALL yield a value within 0.01 of the original (round-trip property).
3. THE Quantity_Formatter SHALL return `"0"` for a quantity of zero.
4. IF a negative quantity is passed to the Quantity_Formatter, THEN THE Quantity_Formatter SHALL return the absolute value formatted as if the input were positive (defensive behaviour — negative quantities are invalid but must not throw).
