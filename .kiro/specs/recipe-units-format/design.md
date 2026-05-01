# Design Document: Recipe Units Format

## Overview

This feature replaces the minimal five-value unit system (`Gram | Kilo | Milliliter | Liter | Unit`) with a comprehensive set of 16 cooking-friendly units, adds fractional quantity support (e.g. `1/2`, `1 1/4`), and introduces correct singular/plural display for all units.

The change touches five layers:

1. **Unit System module** — new unit definitions, `LEGACY_UNIT_MAP`, `resolveUnit`, `getUnitLabel`, `getUnitAbbreviation`
2. **Quantity utilities** — `parseFractionalQuantity` and `formatQuantity` pure functions
3. **Backend** — updated validation in `recipe.ts` and `inventory.ts` to accept new and legacy keys
4. **RecipeEditor** — text-based quantity input with fractional parsing, updated unit dropdown
5. **RecipeDetail / AddItemPage / ItemDetailPage** — updated unit dropdowns, resolved legacy units, formatted quantity display

Existing DynamoDB records that use the old unit keys (`Gram`, `Kilo`, `Milliliter`, `Liter`, `Unit`) are handled transparently via `resolveUnit` — no data migration is required.

## Architecture

No new Lambda functions, API routes, or DynamoDB tables are needed. All changes are incremental additions to existing files.

```
┌──────────────────────────────────────────────────────────────────────┐
│  Shared (frontend + backend)                                         │
│                                                                      │
│  frontend/src/types/units.ts   ← UNIT_METADATA, VALID_UNITS,        │
│  backend/src/types/units.ts      LEGACY_UNIT_MAP, resolveUnit,      │
│                                  getUnitLabel, getUnitAbbreviation   │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  Frontend                                                            │
│                                                                      │
│  frontend/src/utils/quantity.ts                                      │
│  ├── parseFractionalQuantity(s)  ← "1 1/2" → 1.5                    │
│  └── formatQuantity(n)           ← 1.5 → "1 1/2"                    │
│                                                                      │
│  RecipeEditor.tsx   ← text qty input, updated unit dropdown,        │
│                        resolveUnit on load                           │
│  RecipeDetail.tsx   ← formatQuantity + getUnitLabel display,        │
│                        resolveUnit on load                           │
│  AddItemPage.tsx    ← updated unit dropdown, resolveUnit on load     │
│  ItemDetailPage.tsx ← updated unit dropdown, resolveUnit on load     │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  Backend                                                             │
│                                                                      │
│  recipe.ts     ← accept VALID_UNITS + LEGACY_UNIT_MAP keys,         │
│                   autoCreateMissingIngredients uses resolveUnit      │
│  inventory.ts  ← accept VALID_UNITS + LEGACY_UNIT_MAP keys          │
└──────────────────────────────────────────────────────────────────────┘
```

### Data Flow: Quantity Entry in RecipeEditor

```
User types "1 1/2" in quantity text field
  → onChange stores raw string in form state
  → on submit: parseFractionalQuantity("1 1/2") → 1.5
  → stored in DynamoDB as quantity: 1.5

On load (edit mode):
  → ingredient.quantity = 1.5 (number from DynamoDB)
  → formatQuantity(1.5) → "1 1/2" displayed in text field
  → ingredient.unit = "Gram" (legacy)
  → resolveUnit("Gram") → "g" pre-selected in dropdown
```

### Data Flow: Ingredient Display in RecipeDetail

```
ingredient.quantity = 0.5, ingredient.unit = "cup"
  → formatQuantity(0.5) → "1/2"
  → getUnitLabel("cup", 0.5) → "cups"  (plural because 0.5 ≠ 1)
  → displayed as "1/2 cups flour"

ingredient.quantity = 1, ingredient.unit = "cup"
  → formatQuantity(1) → "1"
  → getUnitLabel("cup", 1) → "cup"  (singular because quantity === 1)
  → displayed as "1 cup flour"
```

## Components and Interfaces

### Unit System Module

Both `frontend/src/types/units.ts` and `backend/src/types/units.ts` are updated to export identical content. The two files remain separate (no shared package) but contain the same definitions — consistent with the existing pattern in this codebase.

```typescript
export interface UnitMetadata {
  key: string;
  singular: string;
  abbreviation: string;
  plural: string;
}

export const UNIT_METADATA: Record<string, UnitMetadata> = {
  tsp:     { key: 'tsp',     singular: 'teaspoon',   abbreviation: 'tsp',  plural: 'teaspoons'   },
  tbsp:    { key: 'tbsp',    singular: 'tablespoon',  abbreviation: 'tbsp', plural: 'tablespoons' },
  cup:     { key: 'cup',     singular: 'cup',         abbreviation: 'c',    plural: 'cups'        },
  ml:      { key: 'ml',      singular: 'milliliter',  abbreviation: 'ml',   plural: 'milliliters' },
  l:       { key: 'l',       singular: 'liter',       abbreviation: 'l',    plural: 'liters'      },
  g:       { key: 'g',       singular: 'gram',        abbreviation: 'g',    plural: 'grams'       },
  kg:      { key: 'kg',      singular: 'kilogram',    abbreviation: 'kg',   plural: 'kilograms'   },
  piece:   { key: 'piece',   singular: 'piece',       abbreviation: 'pc',   plural: 'pieces'      },
  slice:   { key: 'slice',   singular: 'slice',       abbreviation: 'sl',   plural: 'slices'      },
  clove:   { key: 'clove',   singular: 'clove',       abbreviation: 'cl',   plural: 'cloves'      },
  pinch:   { key: 'pinch',   singular: 'pinch',       abbreviation: 'pn',   plural: 'pinches'     },
  handful: { key: 'handful', singular: 'handful',     abbreviation: 'hf',   plural: 'handfuls'    },
  stick:   { key: 'stick',   singular: 'stick',       abbreviation: 'st',   plural: 'sticks'      },
  can:     { key: 'can',     singular: 'can',         abbreviation: 'cn',   plural: 'cans'        },
  bottle:  { key: 'bottle',  singular: 'bottle',      abbreviation: 'bt',   plural: 'bottles'     },
  zest:    { key: 'zest',    singular: 'zest',        abbreviation: 'zst',  plural: 'zests'       },
};

export type UnitType = keyof typeof UNIT_METADATA;

export const VALID_UNITS: UnitType[] = Object.keys(UNIT_METADATA) as UnitType[];

export const LEGACY_UNIT_MAP: Record<string, UnitType> = {
  Gram:       'g',
  Kilo:       'kg',
  Milliliter: 'ml',
  Liter:      'l',
  Unit:       'piece',
};

/**
 * Resolves a unit key to a valid new unit key.
 * - If key is already a valid new unit key, returns it unchanged.
 * - If key is a legacy key, returns the mapped new key.
 * - Otherwise returns "piece" as a safe fallback.
 */
export function resolveUnit(key: string): UnitType {
  if (key in UNIT_METADATA) return key as UnitType;
  if (key in LEGACY_UNIT_MAP) return LEGACY_UNIT_MAP[key];
  return 'piece';
}

/**
 * Returns the singular label when quantity === 1, plural form otherwise.
 * Fractional quantities less than 1 (e.g. 0.5) are treated as plural.
 */
export function getUnitLabel(key: string, quantity: number): string {
  const meta = UNIT_METADATA[resolveUnit(key)];
  return quantity === 1 ? meta.singular : meta.plural;
}

/**
 * Returns the abbreviation for a given unit key.
 */
export function getUnitAbbreviation(key: string): string {
  return UNIT_METADATA[resolveUnit(key)].abbreviation;
}
```

**Design decision**: `resolveUnit` is called inside `getUnitLabel` and `getUnitAbbreviation` so callers never need to pre-resolve legacy keys before calling these helpers. This keeps the call sites clean.

### Quantity Utilities Module

A new file `frontend/src/utils/quantity.ts` contains the two pure functions. These are frontend-only because quantity formatting is a display concern; the backend stores raw decimal numbers.

```typescript
/**
 * Common cooking fractions with their decimal values and display strings.
 * Ordered so that the closest match is found first when multiple fractions
 * are within tolerance.
 */
const FRACTIONS: Array<{ decimal: number; display: string }> = [
  { decimal: 1 / 2,  display: '1/2'  },
  { decimal: 1 / 3,  display: '1/3'  },
  { decimal: 2 / 3,  display: '2/3'  },
  { decimal: 1 / 4,  display: '1/4'  },
  { decimal: 3 / 4,  display: '3/4'  },
];

const FRACTION_TOLERANCE = 0.01;

/**
 * Formats a numeric quantity as a human-readable cooking string.
 *
 * Rules:
 * - 0 → "0"
 * - Negative values are treated as their absolute value (defensive).
 * - Whole numbers → "2", "3", etc.
 * - Decimal part matches a common fraction within 0.01 tolerance:
 *     - Whole part is 0 → "1/2", "1/4", etc. (no leading zero)
 *     - Whole part > 0 → "1 1/2", "2 1/4", etc.
 * - Decimal part does not match → rounded to at most 2 decimal places.
 */
export function formatQuantity(n: number): string {
  const abs = Math.abs(n);
  if (abs === 0) return '0';

  const whole = Math.floor(abs);
  const decimal = abs - whole;

  if (decimal < FRACTION_TOLERANCE) {
    // Whole number (or close enough)
    return String(whole === 0 ? 0 : whole);
  }

  for (const { decimal: fracDecimal, display } of FRACTIONS) {
    if (Math.abs(decimal - fracDecimal) < FRACTION_TOLERANCE) {
      return whole === 0 ? display : `${whole} ${display}`;
    }
  }

  // No matching fraction — round to 2 decimal places
  return String(Math.round(abs * 100) / 100);
}

/**
 * Parses a fractional quantity string to a decimal number.
 *
 * Accepts:
 * - Whole numbers: "2", "3"
 * - Simple fractions: "1/2", "3/4"
 * - Mixed numbers: "1 1/2", "2 1/4"
 * - Decimal numbers: "1.5", "0.25"
 *
 * Returns null if the string cannot be parsed as a positive number.
 */
export function parseFractionalQuantity(s: string): number | null {
  const trimmed = s.trim();
  if (trimmed === '') return null;

  // Try decimal / whole number first
  const asNumber = Number(trimmed);
  if (!isNaN(asNumber) && asNumber > 0) return asNumber;

  // Try simple fraction: "1/2"
  const simpleFraction = /^(\d+)\/(\d+)$/.exec(trimmed);
  if (simpleFraction) {
    const num = parseInt(simpleFraction[1], 10);
    const den = parseInt(simpleFraction[2], 10);
    if (den === 0) return null;
    const result = num / den;
    return result > 0 ? result : null;
  }

  // Try mixed number: "1 1/2"
  const mixedNumber = /^(\d+)\s+(\d+)\/(\d+)$/.exec(trimmed);
  if (mixedNumber) {
    const whole = parseInt(mixedNumber[1], 10);
    const num = parseInt(mixedNumber[2], 10);
    const den = parseInt(mixedNumber[3], 10);
    if (den === 0) return null;
    const result = whole + num / den;
    return result > 0 ? result : null;
  }

  return null;
}
```

**Design decision**: `parseFractionalQuantity` returns `null` (not `NaN` or throwing) for invalid input so callers can distinguish "empty" from "invalid" without try/catch. The validation layer in `RecipeEditor` converts `null` to a user-facing error message.

### RecipeEditor Changes

**Quantity field**: Changed from `<input type="number">` to `<input type="text">` per ingredient row. The raw string is stored in form state as `quantityStr: string`. On submit, `parseFractionalQuantity` converts it to a number; `null` result triggers a validation error.

**Pre-population in edit mode**: When loading an existing recipe, each ingredient's numeric `quantity` is converted to a display string via `formatQuantity`, and the `unit` is resolved via `resolveUnit` before being set as the selected value.

**Unit dropdown**: Updated to use `VALID_UNITS` with `getUnitLabel(key, 1)` (singular) as option text and the unit key as option value. Placeholder option `"Select unit"` with value `""` remains as the first option.

```typescript
// Updated ingredient row state
interface IngredientRow {
  _id: number;
  name: string;
  quantityStr: string;  // raw text input (was: quantity: number)
  unit: string;
  inventoryItemId?: string;
}

// Pre-population in edit mode
setIngredients(
  recipe.ingredients.map((ing) => ({
    ...ing,
    _id: ++nextId,
    quantityStr: formatQuantity(ing.quantity),
    unit: resolveUnit(ing.unit),
  }))
);

// Validation
if (!parseFractionalQuantity(row.quantityStr) || parseFractionalQuantity(row.quantityStr)! <= 0) {
  rowErr.quantity = 'Enter a valid quantity (e.g. 1, 1/2, 1 1/4).';
}

// Submit payload
ingredients: ingredients.map(({ name: n, quantityStr, unit }) => ({
  name: n,
  quantity: parseFractionalQuantity(quantityStr)!,
  unit,
}))
```

### RecipeDetail Changes

**Ingredient display**: Each ingredient's quantity is formatted with `formatQuantity` and its unit label is resolved with `getUnitLabel(unit, scaledQuantity)`.

```tsx
// Before (current):
<span>{ing.quantity} {ing.unit}</span>

// After:
<span>
  {formatQuantity(ing.quantity)} {getUnitLabel(ing.unit, ing.quantity)}
</span>
```

**Legacy unit resolution on load**: The `displayedIngredients` derivation applies `resolveUnit` to each ingredient's unit before passing to `getUnitLabel`, so legacy keys stored in DynamoDB display correctly without any data migration.

### AddItemPage and ItemDetailPage Changes

**Unit dropdown**: Both pages replace the current `VALID_UNITS.map((u) => <option key={u} value={u}>{u}</option>)` pattern with:

```tsx
{VALID_UNITS.map((u) => (
  <option key={u} value={u}>
    {getUnitLabel(u, 1)}
  </option>
))}
```

**Legacy unit resolution**: When an existing item is loaded with a legacy unit key, `resolveUnit` is applied before setting the initial form state:

```typescript
// ItemDetailPage initForm:
unit: resolveUnit(item.unit),

// AddItemPage performFullAutofill:
if (item.unit && (VALID_UNITS.includes(item.unit as UnitType) || item.unit in LEGACY_UNIT_MAP)) {
  updates.unit = resolveUnit(item.unit);
}
```

### Backend Validation Changes

Both `recipe.ts` and `inventory.ts` currently validate `unit` strictly against `VALID_UNITS`. This is updated to also accept legacy keys:

```typescript
// New combined set of accepted unit values
const ACCEPTED_UNITS = new Set([
  ...VALID_UNITS,
  ...Object.keys(LEGACY_UNIT_MAP),
]);

// Updated validation check (inventory.ts validateAddRequest):
if (
  parsed.unit !== undefined &&
  parsed.unit !== null &&
  parsed.unit !== '' &&
  !ACCEPTED_UNITS.has(parsed.unit as string)
) {
  errors.push({ field: 'unit', message: `unit must be one of: ${VALID_UNITS.join(', ')}` });
}
```

The `autoCreateMissingIngredients` function in `recipe.ts` is updated to use `resolveUnit` instead of the hardcoded `'Unit'` fallback:

```typescript
// Before:
const unit = VALID_UNITS.includes(ing.unit as typeof VALID_UNITS[number])
  ? ing.unit
  : 'Unit';

// After:
const unit = resolveUnit(ing.unit);
```

## Data Models

### Updated UnitType

The `UnitType` in both `frontend/src/types/units.ts` and `backend/src/types/units.ts` changes from a union of 5 string literals to a derived type from `UNIT_METADATA`:

```typescript
// Before:
export type UnitType = 'Gram' | 'Kilo' | 'Milliliter' | 'Liter' | 'Unit';

// After:
export type UnitType = keyof typeof UNIT_METADATA;
// = 'tsp' | 'tbsp' | 'cup' | 'ml' | 'l' | 'g' | 'kg' | 'piece' | 'slice' |
//   'clove' | 'pinch' | 'handful' | 'stick' | 'can' | 'bottle' | 'zest'
```

### DynamoDB Storage

No schema changes. Unit keys are stored as plain strings in DynamoDB. Existing records with legacy keys (`Gram`, `Kilo`, etc.) remain valid — `resolveUnit` handles them at read time. New records will store the new lowercase keys (`g`, `kg`, etc.).

Ingredient quantities continue to be stored as `number` (decimal). The fractional display is a pure presentation concern handled entirely in the frontend.

### New File: `frontend/src/utils/quantity.ts`

This is the only new file introduced by this feature. All other changes are modifications to existing files.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Unit metadata completeness

*For any* unit key in `VALID_UNITS`, the `UNIT_METADATA` record SHALL contain a non-empty singular label, a non-empty abbreviation, and a non-empty plural form.

**Validates: Requirements 1.1, 1.3, 1.4**

### Property 2: resolveUnit always returns a valid key

*For any* string input (including valid new keys, legacy keys, and arbitrary unknown strings), `resolveUnit` SHALL return a value that is a member of `VALID_UNITS`.

**Validates: Requirements 2.2**

### Property 3: resolveUnit is identity for valid keys

*For any* unit key that is already a member of `VALID_UNITS`, `resolveUnit` SHALL return that key unchanged.

**Validates: Requirements 2.2**

### Property 4: getUnitLabel singular/plural rule

*For any* unit key in `VALID_UNITS` and any numeric quantity, `getUnitLabel(key, quantity)` SHALL return the singular label when `quantity === 1` and the plural form otherwise (including fractional quantities less than 1).

**Validates: Requirements 1.3, 4.1, 4.3**

### Property 5: Quantity formatter round-trip

*For any* valid fractional quantity string `s` accepted by `parseFractionalQuantity` (whole numbers, simple fractions, mixed numbers), parsing `s` to a decimal and then formatting the result with `formatQuantity` SHALL produce a string that parses back to a decimal value within 0.01 of the original.

**Validates: Requirements 3.7, 7.2**

### Property 6: formatQuantity handles negative inputs defensively

*For any* negative number `n`, `formatQuantity(n)` SHALL return the same string as `formatQuantity(Math.abs(n))`.

**Validates: Requirements 7.4**

### Property 7: formatQuantity is pure (idempotent output)

*For any* non-negative number `n`, calling `formatQuantity(n)` twice SHALL return the same string both times.

**Validates: Requirements 7.1**

### Property 8: parseFractionalQuantity rejects invalid inputs

*For any* string that is not a valid whole number, simple fraction, mixed number, or positive decimal, `parseFractionalQuantity` SHALL return `null`.

**Validates: Requirements 3.3**

### Property 9: Backend accepts all valid and legacy unit keys

*For any* unit key that is either a member of `VALID_UNITS` or a key in `LEGACY_UNIT_MAP`, a `POST /recipes` request with that unit key in an ingredient SHALL return a 201 response (not a 400 validation error).

**Validates: Requirements 6.1, 6.2**

### Property 10: autoCreateMissingIngredients uses resolved unit keys

*For any* ingredient unit value (including legacy keys and unknown strings), the placeholder inventory item created by `autoCreateMissingIngredients` SHALL have a `unit` field that is a member of `VALID_UNITS`.

**Validates: Requirements 6.5**

## Error Handling

### Frontend: Invalid Fractional Quantity

When `parseFractionalQuantity` returns `null` for a quantity field in `RecipeEditor`, the validation layer displays an inline error below the field:

```
"Enter a valid quantity (e.g. 1, 1/2, 1 1/4)."
```

The error is cleared when the user modifies the field. The form submit button remains enabled but submission is blocked until all errors are resolved.

### Frontend: Unknown Unit Key

If an ingredient or inventory item loaded from DynamoDB has a unit key that is neither in `VALID_UNITS` nor in `LEGACY_UNIT_MAP`, `resolveUnit` returns `"piece"` as a safe fallback. No error is shown to the user — the item is displayed with `"piece"` as the unit, which is the most neutral fallback for an unknown unit.

### Backend: Invalid Unit Value

The backend validation error message continues to list only `VALID_UNITS` (not legacy keys) in the error detail, since legacy keys are accepted silently for backward compatibility and should not be advertised as the canonical set:

```json
{
  "error": "VALIDATION_ERROR",
  "message": "Invalid unit value",
  "details": [{ "field": "unit", "message": "unit must be one of: tsp, tbsp, cup, ..." }]
}
```

### formatQuantity Edge Cases

| Input | Output | Reason |
|-------|--------|--------|
| `0` | `"0"` | Zero quantity |
| `-1.5` | `"1 1/2"` | Negative treated as absolute value |
| `0.5` | `"1/2"` | Whole part zero — omit leading zero |
| `0.333...` | `"1/3"` | Within 0.01 tolerance of 1/3 |
| `1.99` | `"1.99"` | No matching fraction — 2 decimal places |
| `2.0` | `"2"` | Whole number |
| `1.5` | `"1 1/2"` | Mixed number |

## Testing Strategy

### Unit Tests

**Unit system (`frontend/src/types/__tests__/units.test.ts` and `backend/src/types/__tests__/units.test.ts`)**

- `VALID_UNITS` contains exactly 16 entries
- `LEGACY_UNIT_MAP` contains exactly 5 entries with correct mappings
- `resolveUnit("Gram")` returns `"g"`, `resolveUnit("Unit")` returns `"piece"`, etc.
- `resolveUnit("unknown-key")` returns `"piece"`
- `getUnitLabel("cup", 1)` returns `"cup"`, `getUnitLabel("cup", 2)` returns `"cups"`
- `getUnitLabel("cup", 0.5)` returns `"cups"` (fractional < 1 is plural)
- `getUnitAbbreviation("tsp")` returns `"tsp"`, `getUnitAbbreviation("cup")` returns `"c"`

**Quantity utilities (`frontend/src/utils/__tests__/quantity.test.ts`)**

- `formatQuantity(0)` returns `"0"`
- `formatQuantity(1)` returns `"1"`, `formatQuantity(2)` returns `"2"`
- `formatQuantity(0.5)` returns `"1/2"`, `formatQuantity(0.25)` returns `"1/4"`
- `formatQuantity(1.5)` returns `"1 1/2"`, `formatQuantity(2.75)` returns `"2 3/4"`
- `formatQuantity(0.333)` returns `"1/3"` (within tolerance)
- `formatQuantity(-1.5)` returns `"1 1/2"` (negative → absolute value)
- `formatQuantity(1.99)` returns `"1.99"` (no matching fraction)
- `parseFractionalQuantity("1")` returns `1`
- `parseFractionalQuantity("1/2")` returns `0.5`
- `parseFractionalQuantity("1 1/2")` returns `1.5`
- `parseFractionalQuantity("2 3/4")` returns `2.75`
- `parseFractionalQuantity("")` returns `null`
- `parseFractionalQuantity("abc")` returns `null`
- `parseFractionalQuantity("0")` returns `null` (not positive)
- `parseFractionalQuantity("-1")` returns `null` (not positive)

**Backend unit validation (`backend/src/handlers/recipe/__tests__/recipe.test.ts`)**

- `POST /recipes` with `unit: "tsp"` returns 201
- `POST /recipes` with `unit: "Gram"` (legacy) returns 201
- `POST /recipes` with `unit: "invalid-unit"` returns 400
- `POST /inventory` with `unit: "g"` returns 201
- `POST /inventory` with `unit: "Unit"` (legacy) returns 201
- `POST /inventory` with `unit: "invalid-unit"` returns 400

**Frontend components**

- `RecipeEditor` renders `<input type="text">` for quantity (not `type="number"`)
- `RecipeEditor` unit dropdown has 17 options (16 units + placeholder)
- `RecipeEditor` unit dropdown first option has value `""` and text `"Select unit"`
- `RecipeEditor` unit dropdown options use singular labels as text
- `RecipeEditor` pre-populates legacy unit as resolved key in edit mode
- `RecipeEditor` pre-populates quantity as formatted string in edit mode
- `RecipeEditor` shows validation error for invalid quantity string on submit
- `RecipeDetail` displays formatted quantity and resolved unit label
- `AddItemPage` unit dropdown has 17 options (16 units + placeholder)
- `AddItemPage` unit dropdown options use singular labels as text
- `ItemDetailPage` pre-selects resolved unit for legacy unit items

### Property-Based Tests

PBT is appropriate here because:
- `resolveUnit`, `getUnitLabel`, `formatQuantity`, and `parseFractionalQuantity` are pure functions with large input spaces
- The round-trip property (parse → format → parse) is a universal correctness guarantee
- Backend unit validation covers a large space of valid and invalid inputs

**PBT library**: fast-check (already used in this project), minimum 100 iterations per property.

**Frontend property tests (`frontend/src/utils/__tests__/quantity.property.test.ts`)**

```typescript
// Feature: recipe-units-format, Property 5: Quantity formatter round-trip
// For any valid fractional string, parse → format → parse yields same decimal (within 0.01)

// Feature: recipe-units-format, Property 6: formatQuantity handles negative inputs defensively
// For any negative number n, formatQuantity(n) === formatQuantity(Math.abs(n))

// Feature: recipe-units-format, Property 7: formatQuantity is pure
// For any non-negative number n, formatQuantity(n) called twice returns same string

// Feature: recipe-units-format, Property 8: parseFractionalQuantity rejects invalid inputs
// For any string not matching valid patterns, parseFractionalQuantity returns null
```

**Frontend property tests (`frontend/src/types/__tests__/units.property.test.ts`)**

```typescript
// Feature: recipe-units-format, Property 1: Unit metadata completeness
// For any key in VALID_UNITS, UNIT_METADATA[key] has non-empty singular, abbreviation, plural

// Feature: recipe-units-format, Property 2: resolveUnit always returns a valid key
// For any string input, resolveUnit returns a value in VALID_UNITS

// Feature: recipe-units-format, Property 3: resolveUnit is identity for valid keys
// For any key in VALID_UNITS, resolveUnit(key) === key

// Feature: recipe-units-format, Property 4: getUnitLabel singular/plural rule
// For any key in VALID_UNITS and any quantity, getUnitLabel returns singular iff quantity === 1
```

**Backend property tests (`backend/src/handlers/recipe/__tests__/recipe.property.test.ts`)**

```typescript
// Feature: recipe-units-format, Property 9: Backend accepts all valid and legacy unit keys
// For any unit key in VALID_UNITS or LEGACY_UNIT_MAP, POST /recipes returns 201

// Feature: recipe-units-format, Property 10: autoCreateMissingIngredients uses resolved unit keys
// For any ingredient unit value, placeholder item unit is in VALID_UNITS
```
