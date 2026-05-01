# Design Document: Recipe Portions Counter

## Overview

This feature adds a `portions` field to the Recipe entity and a `Portions_Scaler` pure function that scales ingredient quantities proportionally. The behavior differs across three contexts:

- **Create mode** (`RecipeEditor` — new recipe): `portions` is a mandatory positive-integer input. Changing it does **not** recalculate ingredient quantities. Both the `portions` value and the ingredient quantities are stored as-is.
- **Edit mode** (`RecipeEditor` — existing recipe): `portions` is pre-populated from the stored value. `+`/`–` controls adjust `selectedPortions` and immediately recalculate all ingredient quantity form fields using `Portions_Scaler`. On save, the new `selectedPortions` and the recalculated quantities are persisted as the new base values.
- **View mode** (`RecipeDetail`): `portions` is displayed as the initial `selectedPortions`. `+`/`–` controls scale the displayed ingredient quantities in real time using `Portions_Scaler`. No API call is made; navigating away resets to the base value.

The change is additive and backward-compatible. The feature touches five layers:

1. **Data model** — extend `Recipe` with a mandatory `portions: number` field
2. **Backend** — validate and persist `portions` in `recipe.ts`
3. **API client** — extend TypeScript types and request signatures
4. **RecipeEditor** — mandatory `portions` input in create mode; `+`/`–` scaler controls in edit mode
5. **RecipeDetail** — `+`/`–` scaler controls with display-only scaling

## Architecture

No new Lambda functions, API routes, or DynamoDB tables are needed. All changes are incremental additions to existing files.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Frontend                                                           │
│                                                                     │
│  RecipeList.tsx        ← shows portions badge per row               │
│  RecipeDetail.tsx      ← +/– controls, display-only scaling         │
│  RecipeEditor.tsx      ← mandatory portions input (create)          │
│                           +/– controls + form field scaling (edit)  │
│  api/recipes/recipes.ts ← extended types + scaleIngredients()       │
└────────────────────────┬────────────────────────────────────────────┘
                         │ HTTP (existing routes)
┌────────────────────────▼────────────────────────────────────────────┐
│  Backend                                                            │
│                                                                     │
│  recipe.ts                                                          │
│  ├── validatePortions()   ← new pure validation helper              │
│  ├── createRecipe()       ← persist portions (required)             │
│  └── updateRecipe()       ← update portions (optional)              │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow: View Mode Scaling

```
RecipeDetail mounts
  → loads recipe (portions = P, ingredients = Q[])
  → selectedPortions = P (initial state)
  → user taps +
  → selectedPortions = P + 1
  → displayedQuantities = scaleIngredients(Q, P, P+1)
  → rendered in UI (no API call)
  → user navigates away → component unmounts → state reset
```

### Data Flow: Edit Mode Scaling

```
RecipeEditor mounts (edit mode)
  → loads recipe (portions = P, ingredients = Q[])
  → selectedPortions = P, formQuantities = Q[] (initial state)
  → user taps +
  → newPortions = selectedPortions + 1
  → formQuantities = scaleIngredients(formQuantities, selectedPortions, newPortions)
  → selectedPortions = newPortions
  → user saves
  → PUT /recipes/{id} { portions: selectedPortions, ingredients: formQuantities }
```

## Components and Interfaces

### Updated Data Model Types

The `Recipe` interface in both `backend/src/handlers/recipe/recipe.ts` and `frontend/src/api/recipes/recipes.ts` gains one mandatory field:

```typescript
interface Recipe {
  // ... existing fields unchanged ...
  portions: number;   // positive integer, number of servings the recipe yields as written
}
```

`portions` is mandatory (not optional) because every recipe must have a base reference for scaling. Existing recipes in DynamoDB that pre-date this feature will not have `portions` stored; the backend will treat a missing `portions` on read as `undefined` and the frontend will fall back to displaying `1` as a safe default (see Backward Compatibility section).

### New Pure Function: `scaleIngredients`

This is the `Portions_Scaler` referenced in the requirements. It is a pure function exported from `frontend/src/api/recipes/recipes.ts` and also from `backend/src/handlers/recipe/recipe.ts` for direct testing.

```typescript
/**
 * Scales a list of ingredient quantities from one portions base to another.
 * Returns a new array of scaled quantities (rounded to at most 2 decimal places).
 * Does NOT mutate the input ingredients.
 *
 * @param ingredients - The source ingredient list
 * @param fromPortions - The base portions value (positive integer)
 * @param toPortions - The target portions value (positive integer)
 * @returns Array of scaled quantities in the same order as the input
 */
export function scaleIngredients(
  ingredients: RecipeIngredient[],
  fromPortions: number,
  toPortions: number,
): number[] {
  const factor = toPortions / fromPortions;
  return ingredients.map((ing) =>
    Math.round(ing.quantity * factor * 100) / 100,
  );
}
```

Key design decisions:
- Returns `number[]` (scaled quantities only), not mutated `RecipeIngredient[]`, to keep the function minimal and avoid coupling to the ingredient shape.
- Rounding is `Math.round(x * 100) / 100` — rounds to 2 decimal places.
- The caller is responsible for applying the returned quantities back to the ingredient list (either for display or for form field updates).

### New Pure Function: `validatePortions` (Backend)

```typescript
/**
 * Validates the portions field in a parsed request body.
 * Returns an error message string if invalid, or null if valid or absent.
 * For POST /recipes, the caller must separately check that portions is present.
 */
export function validatePortions(parsed: Record<string, unknown>): string | null {
  if (parsed.portions === undefined) return null; // absence handled by caller
  const v = parsed.portions;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    return 'portions must be a positive integer';
  }
  return null;
}
```

### Updated API Client (`frontend/src/api/recipes/recipes.ts`)

The `Recipe` interface gains the `portions` field. The `createRecipe` and `updateRecipe` signatures are updated:

```typescript
// createRecipe — portions is required in the create payload
export async function createRecipe(
  data: Omit<Recipe, 'recipeId' | 'userId' | 'createdAt' | 'updatedAt' | 'syncVersion'>,
): Promise<Recipe>
// portions is already included via the Recipe type (mandatory field)

// updateRecipe — portions is optional in the update payload (omitting it leaves it unchanged)
export async function updateRecipe(
  recipeId: string,
  data: Partial<Pick<Recipe, 'name' | 'ingredients' | 'instructions' | 'sourceUrl' | 'portions'>> & {
    prepTime?: number | null;
    cookTime?: number | null;
  },
): Promise<Recipe>
```

### RecipeEditor Changes

#### Create Mode

A new mandatory `portions` field is added to the form, rendered below the time fields and above the ingredients section:

```typescript
// New state
const [portions, setPortions] = useState('');

// New error key
interface FormErrors {
  // ... existing ...
  portions?: string;
}

// Validation
function validatePortionsField(value: string): string | undefined {
  if (value === '') return 'Portions is required.';
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    return 'Portions must be a positive whole number (at least 1).';
  }
  return undefined;
}
```

In create mode, changing `portions` does **not** trigger any recalculation of ingredient quantities. The `portions` input is a plain `<input type="number" min="1" step="1">`.

Submit payload in create mode:
```typescript
const payload = {
  ...baseData,
  portions: Number(portions),
  // prepTime/cookTime as before
};
```

#### Edit Mode

In edit mode, the `portions` field is replaced by a scaler control:

```
[ – ]  [ 4 portions ]  [ + ]
```

State additions for edit mode:
```typescript
const [selectedPortions, setSelectedPortions] = useState(1);
// formQuantities are stored inside the existing `ingredients` state array
// (the ingredient rows already hold the current quantity values)
```

Pre-population in edit mode:
```typescript
setSelectedPortions(recipe.portions);
// ingredient quantities are pre-populated as before (existing logic)
```

Increment handler:
```typescript
const handlePortionsIncrement = useCallback(() => {
  setIngredients((prev) => {
    const scaled = scaleIngredients(prev, selectedPortions, selectedPortions + 1);
    return prev.map((row, i) => ({ ...row, quantity: scaled[i] }));
  });
  setSelectedPortions((p) => p + 1);
}, [selectedPortions]);
```

Decrement handler (disabled when `selectedPortions === 1`):
```typescript
const handlePortionsDecrement = useCallback(() => {
  if (selectedPortions <= 1) return;
  setIngredients((prev) => {
    const scaled = scaleIngredients(prev, selectedPortions, selectedPortions - 1);
    return prev.map((row, i) => ({ ...row, quantity: scaled[i] }));
  });
  setSelectedPortions((p) => p - 1);
}, [selectedPortions]);
```

Submit payload in edit mode:
```typescript
const payload = {
  ...baseData,
  portions: selectedPortions,
  ingredients: ingredients.map(({ name: n, quantity, unit }) => ({ name: n, quantity, unit })),
  // prepTime/cookTime as before
};
```

### RecipeDetail Changes

A new `PortionsScaler` sub-section is rendered between the time section and the `IngredientAvailability` section:

```typescript
// New state
const [selectedPortions, setSelectedPortions] = useState<number>(data?.recipe.portions ?? 1);

// Reset when recipe data changes (navigating to a different recipe)
useEffect(() => {
  if (data) setSelectedPortions(data.recipe.portions);
}, [data?.recipe.recipeId]);
```

The scaler control renders as:

```tsx
<section style={styles.portionsSection} aria-label="Portions">
  <span style={styles.portionsLabel}>Portions</span>
  <div style={styles.portionsControls}>
    <button
      type="button"
      onClick={handleDecrement}
      disabled={selectedPortions <= 1}
      aria-label="Decrease portions"
      style={styles.portionsButton}
    >
      –
    </button>
    <span style={styles.portionsValue} aria-live="polite">
      {selectedPortions}
    </span>
    <button
      type="button"
      onClick={handleIncrement}
      aria-label="Increase portions"
      style={styles.portionsButton}
    >
      +
    </button>
  </div>
</section>
```

The `IngredientAvailability` component currently renders ingredient names and statuses. To display scaled quantities, `RecipeDetail` will compute scaled quantities and pass them alongside the availability data. Since `IngredientAvailability` currently only shows availability status (not quantities), the ingredient quantities with scaling will be rendered in a separate `IngredientsDisplay` section above `IngredientAvailability`:

```tsx
// Computed display quantities (no state — derived from selectedPortions)
const displayedIngredients = recipe.ingredients.map((ing, i) => ({
  ...ing,
  quantity: scaleIngredients(recipe.ingredients, recipe.portions, selectedPortions)[i],
}));
```

This is a pure derivation — no `useState` needed for the scaled quantities themselves. The scaling is computed inline on each render from `selectedPortions`.

### RecipeList Changes

Each recipe row gains a portions badge alongside the existing time and missing-ingredient badges:

```tsx
{recipe.portions !== undefined && (
  <span style={styles.portionsBadge} aria-label={`${recipe.portions} portions`}>
    {recipe.portions} portions
  </span>
)}
```

## Data Models

### Persistence: How `portions` Is Stored

DynamoDB is schemaless — there is no schema to change. The `PantryApp` table stores `RECIPE#` items as free-form attribute maps. `portions` is persisted the same way `prepTime` and `cookTime` were added in the recipe-time-fields feature: the backend simply writes it as a top-level attribute on the item during `PutCommand` (create) or `UpdateCommand` (update), and DynamoDB returns it automatically on all reads.

**No infrastructure changes are required.** No CDK changes, no table modifications, no migrations.

Existing recipes in DynamoDB that pre-date this feature will not have a `portions` attribute. When read, `portions` will be `undefined`. The frontend falls back to `1` for display purposes (see Backward Compatibility).

### Backend: `createRecipe` Persistence

```typescript
// In createRecipe(), after existing validations:
const portionsError = validatePortions(parsed);
if (portionsError) {
  return response(400, {
    error: 'VALIDATION_ERROR',
    message: portionsError,
    details: [{ field: 'portions', message: portionsError }],
  });
}
if (parsed.portions === undefined) {
  return response(400, {
    error: 'VALIDATION_ERROR',
    message: 'portions is required',
    details: [{ field: 'portions', message: 'portions is required' }],
  });
}

// In the recipe object construction:
recipe.portions = parsed.portions as number;
```

### Backend: `updateRecipe` Persistence

`portions` is added to the `updatableFields` map:

```typescript
const updatableFields: Record<string, string> = {
  name: 'name',
  ingredients: 'ingredients',
  instructions: 'instructions',
  sourceUrl: 'sourceUrl',
  prepTime: 'prepTime',
  cookTime: 'cookTime',
  portions: 'portions',   // new
};
```

`portions` is never `null` in update (unlike `prepTime`/`cookTime` which support explicit removal). Omitting `portions` from the update body leaves it unchanged via the existing `updatableFields` loop logic.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Portions Field Persistence Round-Trip

*For any* valid recipe with a positive integer `portions` value, creating the recipe via `POST /recipes` and then retrieving it via `GET /recipes/{recipeId}` SHALL return a `portions` value identical to the one submitted.

**Validates: Requirements 2.1, 2.7**

### Property 2: Invalid Portions Rejection (Backend)

*For any* `POST /recipes` or `PUT /recipes/{recipeId}` request where `portions` is zero, negative, a non-integer number, or a non-numeric value, the `Recipe_Lambda` SHALL return a 400 validation error identifying the `portions` field and SHALL NOT persist the recipe or the update.

**Validates: Requirements 2.2, 2.3, 2.5**

### Property 3: Portions Omission Preserves Existing Value (Backend)

*For any* recipe with a stored `portions` value P, a `PUT /recipes/{recipeId}` request that omits `portions` from the body SHALL leave the `portions` value unchanged in the returned recipe.

**Validates: Requirement 2.6**

### Property 4: Scaling Identity at Base Portions

*For any* list of `RecipeIngredient` objects and any positive integer `portions`, calling `scaleIngredients` with `toPortions = fromPortions` SHALL return quantities equal to the original input quantities (within floating-point rounding tolerance of 0.01).

**Validates: Requirement 7.2**

### Property 5: Scaling Proportionality

*For any* positive integer `fromPortions`, positive integer `toPortions`, and list of `RecipeIngredient` objects with non-negative quantities, `scaleIngredients` SHALL return scaled quantities such that `scaledQuantity / baseQuantity ≈ toPortions / fromPortions` for every ingredient with a non-zero base quantity (within floating-point rounding tolerance of 0.01).

**Validates: Requirements 5.1, 7.1**

### Property 6: Scaling Non-Negativity

*For any* valid inputs (positive integer `fromPortions`, positive integer `toPortions`, non-negative ingredient quantities), `scaleIngredients` SHALL return only non-negative scaled quantities.

**Validates: Requirement 7.3**

### Property 7: Scaling Immutability

*For any* list of `RecipeIngredient` objects, calling `scaleIngredients` SHALL NOT mutate the input objects — the original `quantity` values SHALL remain unchanged after the call.

**Validates: Requirement 7.4**

### Property 8: Scaling Rounding

*For any* valid inputs to `scaleIngredients`, every returned scaled quantity SHALL have at most 2 decimal places (i.e., `Math.round(q * 100) / 100 === q` for each result `q`).

**Validates: Requirements 3.7, 5.3**

### Property 9: Create-Mode Portions Does Not Affect Ingredient Quantities

*For any* set of ingredient quantities entered in create mode, changing the `portions` field to any positive integer value SHALL leave all ingredient quantity fields unchanged.

**Validates: Requirement 1.4**

### Property 10: Edit-Mode Rebase Composability

*For any* recipe with stored `portions` P and ingredient quantities Q, applying two sequential rebase operations — first from P to P₁, then from P₁ to P₂ — SHALL produce the same ingredient quantities as a single rebase from P to P₂ (within floating-point rounding tolerance of 0.01).

**Validates: Requirement 3.6**

## Error Handling

### Backend Validation Errors

| Condition | Response |
|-----------|----------|
| `portions` absent in `POST /recipes` | 400 `VALIDATION_ERROR`, `details: [{ field: 'portions', message: 'portions is required' }]` |
| `portions` is 0 | 400 `VALIDATION_ERROR`, `details: [{ field: 'portions', message: 'portions must be a positive integer' }]` |
| `portions` is negative | 400 `VALIDATION_ERROR`, `details: [{ field: 'portions', message: 'portions must be a positive integer' }]` |
| `portions` is a float (e.g. 1.5) | 400 `VALIDATION_ERROR`, `details: [{ field: 'portions', message: 'portions must be a positive integer' }]` |
| `portions` is a non-numeric string | 400 `VALIDATION_ERROR`, `details: [{ field: 'portions', message: 'portions must be a positive integer' }]` |
| `portions` invalid in `PUT /recipes/{recipeId}` | Same 400 pattern |

Validation runs before any DynamoDB write, so no partial state is persisted on error.

### Frontend Validation Errors

The `portions` field error is displayed inline below the input, matching the existing `fieldError` style. The form submit button remains enabled but submission is blocked until errors are resolved. The error is cleared when the user modifies the field.

### Backward Compatibility

Existing recipes in DynamoDB that pre-date this feature will not have a `portions` attribute. When the frontend reads such a recipe:
- `RecipeDetail` initialises `selectedPortions` to `recipe.portions ?? 1`. The scaler controls are still shown (with `selectedPortions = 1`).
- `RecipeList` renders the portions badge only when `recipe.portions !== undefined`.
- `RecipeEditor` in edit mode pre-populates `selectedPortions` from `recipe.portions ?? 1`.

When the user saves an edit on a legacy recipe, the new `portions` value is persisted, migrating the recipe forward.

The `POST /recipes` endpoint requires `portions` for all new recipes. The `PUT /recipes/{recipeId}` endpoint treats `portions` as optional (omitting it leaves the existing value unchanged), which allows partial updates that don't touch portions.

## Testing Strategy

### Unit Tests

**Backend (`backend/src/handlers/recipe/__tests__/recipe.test.ts`)**

New example-based tests added to the existing test file:

- `POST /recipes` with valid `portions` returns 201 with `portions` in the response
- `POST /recipes` without `portions` returns 400 identifying `portions` field
- `POST /recipes` with `portions: 0` returns 400 identifying `portions` field
- `POST /recipes` with `portions: -1` returns 400 identifying `portions` field
- `POST /recipes` with `portions: 1.5` returns 400 identifying `portions` field
- `PUT /recipes/{recipeId}` with valid `portions` updates the field
- `PUT /recipes/{recipeId}` without `portions` leaves existing value unchanged
- `GET /recipes/{recipeId}` returns `portions` when stored
- `GET /recipes` returns `portions` in each recipe object

**Frontend API client (`frontend/src/api/recipes/__tests__/recipes.test.ts`)**

- `createRecipe` with `portions` sends it in the request body
- `updateRecipe` with `portions` sends it in the request body
- `updateRecipe` without `portions` does not include it in the request body

**Frontend components (`frontend/src/pages/RecipesPage/__tests__/`)**

- `RecipeDetail` renders `+`/`–` buttons and the `selectedPortions` value
- `RecipeDetail` initialises `selectedPortions` to `recipe.portions`
- `RecipeDetail` disables `–` button when `selectedPortions === 1`
- `RecipeDetail` does not call `fetch` when `+`/`–` is tapped
- `RecipeEditor` (create mode) renders a labeled `portions` input
- `RecipeEditor` (create mode) shows validation error when `portions` is empty on submit
- `RecipeEditor` (edit mode) renders `+`/`–` controls instead of a plain input
- `RecipeEditor` (edit mode) pre-populates `selectedPortions` from `recipe.portions`
- `RecipeEditor` (edit mode) disables `–` button when `selectedPortions === 1`

### Property-Based Tests

PBT is appropriate here because:
- `scaleIngredients` is a pure function with a large input space (all combinations of positive integers and non-negative quantities)
- Portions validation logic covers a large space of invalid inputs
- Scaling properties (identity, proportionality, non-negativity, immutability, rounding) are universal across all valid inputs

**PBT library**: fast-check (already used in this project), minimum 100 iterations per property.

**Backend property tests (`backend/src/handlers/recipe/__tests__/recipe.property.test.ts`)**

```typescript
// Feature: recipe-portions-counter, Property 1: Portions Field Persistence Round-Trip
fc.assert(fc.property(
  fc.integer({ min: 1, max: 1000 }),
  async (portions) => {
    // mock DynamoDB PutCommand + GetCommand
    // call createRecipe handler with valid recipe + portions
    // assert response.recipe.portions === portions
  }
), { numRuns: 100 });

// Feature: recipe-portions-counter, Property 2: Invalid Portions Rejection (Backend)
fc.assert(fc.property(
  fc.oneof(
    fc.constant(0),
    fc.integer({ max: -1 }),
    fc.float({ noNaN: true }).filter(n => !Number.isInteger(n) && n > 0),
    fc.string().filter(s => isNaN(Number(s))),
  ),
  async (invalidPortions) => {
    // call createRecipe handler with invalid portions
    // assert 400 with details identifying portions field
    // assert PutCommand not called
  }
), { numRuns: 100 });

// Feature: recipe-portions-counter, Property 3: Portions Omission Preserves Existing Value
fc.assert(fc.property(
  fc.integer({ min: 1, max: 1000 }),
  async (existingPortions) => {
    // mock UpdateCommand to return Attributes with existingPortions
    // call updateRecipe without portions in body
    // assert returned recipe.portions === existingPortions
  }
), { numRuns: 100 });
```

**Frontend property tests (`frontend/src/pages/RecipesPage/__tests__/RecipeDetail.property.test.tsx`)**

```typescript
// Feature: recipe-portions-counter, Property 4: Scaling Identity at Base Portions
fc.assert(fc.property(
  fc.array(fc.record({ name: fc.string(), quantity: fc.float({ min: 0.01, max: 1000, noNaN: true }), unit: fc.constant('Gram') }), { minLength: 1 }),
  fc.integer({ min: 1, max: 100 }),
  (ingredients, portions) => {
    const scaled = scaleIngredients(ingredients, portions, portions);
    return ingredients.every((ing, i) => Math.abs(scaled[i] - ing.quantity) < 0.01);
  }
), { numRuns: 100 });

// Feature: recipe-portions-counter, Property 5: Scaling Proportionality
fc.assert(fc.property(
  fc.array(fc.record({ name: fc.string(), quantity: fc.float({ min: 0.01, max: 1000, noNaN: true }), unit: fc.constant('Gram') }), { minLength: 1 }),
  fc.integer({ min: 1, max: 100 }),
  fc.integer({ min: 1, max: 100 }),
  (ingredients, fromPortions, toPortions) => {
    const scaled = scaleIngredients(ingredients, fromPortions, toPortions);
    return ingredients.every((ing, i) =>
      ing.quantity === 0 || Math.abs(scaled[i] / ing.quantity - toPortions / fromPortions) < 0.01
    );
  }
), { numRuns: 100 });

// Feature: recipe-portions-counter, Property 6: Scaling Non-Negativity
fc.assert(fc.property(
  fc.array(fc.record({ name: fc.string(), quantity: fc.float({ min: 0, max: 1000, noNaN: true }), unit: fc.constant('Gram') }), { minLength: 1 }),
  fc.integer({ min: 1, max: 100 }),
  fc.integer({ min: 1, max: 100 }),
  (ingredients, fromPortions, toPortions) => {
    const scaled = scaleIngredients(ingredients, fromPortions, toPortions);
    return scaled.every(q => q >= 0);
  }
), { numRuns: 100 });

// Feature: recipe-portions-counter, Property 7: Scaling Immutability
fc.assert(fc.property(
  fc.array(fc.record({ name: fc.string(), quantity: fc.float({ min: 0.01, max: 1000, noNaN: true }), unit: fc.constant('Gram') }), { minLength: 1 }),
  fc.integer({ min: 1, max: 100 }),
  fc.integer({ min: 1, max: 100 }),
  (ingredients, fromPortions, toPortions) => {
    const originalQuantities = ingredients.map(i => i.quantity);
    scaleIngredients(ingredients, fromPortions, toPortions);
    return ingredients.every((ing, i) => ing.quantity === originalQuantities[i]);
  }
), { numRuns: 100 });

// Feature: recipe-portions-counter, Property 8: Scaling Rounding
fc.assert(fc.property(
  fc.array(fc.record({ name: fc.string(), quantity: fc.float({ min: 0.01, max: 1000, noNaN: true }), unit: fc.constant('Gram') }), { minLength: 1 }),
  fc.integer({ min: 1, max: 100 }),
  fc.integer({ min: 1, max: 100 }),
  (ingredients, fromPortions, toPortions) => {
    const scaled = scaleIngredients(ingredients, fromPortions, toPortions);
    return scaled.every(q => Math.round(q * 100) / 100 === q);
  }
), { numRuns: 100 });

// Feature: recipe-portions-counter, Property 10: Edit-Mode Rebase Composability
fc.assert(fc.property(
  fc.array(fc.record({ name: fc.string(), quantity: fc.float({ min: 0.01, max: 1000, noNaN: true }), unit: fc.constant('Gram') }), { minLength: 1 }),
  fc.integer({ min: 1, max: 50 }),
  fc.integer({ min: 1, max: 50 }),
  fc.integer({ min: 1, max: 50 }),
  (ingredients, p, p1, p2) => {
    // Two-step: P → P1 → P2
    const step1Quantities = scaleIngredients(ingredients, p, p1);
    const step1Ingredients = ingredients.map((ing, i) => ({ ...ing, quantity: step1Quantities[i] }));
    const step2Quantities = scaleIngredients(step1Ingredients, p1, p2);

    // Single-step: P → P2
    const directQuantities = scaleIngredients(ingredients, p, p2);

    return step2Quantities.every((q, i) => Math.abs(q - directQuantities[i]) < 0.01);
  }
), { numRuns: 100 });
```

**Frontend property tests (`frontend/src/pages/RecipesPage/__tests__/RecipeEditor.property.test.tsx`)**

```typescript
// Feature: recipe-portions-counter, Property 9: Create-Mode Portions Does Not Affect Ingredient Quantities
// Generate arbitrary ingredient quantities and portions values, change portions in create mode,
// assert all ingredient quantity fields are unchanged.

// Feature: recipe-portions-counter, Property 2 (frontend): Invalid Portions Rejection (Frontend)
// Generate arbitrary non-positive-integer values, submit create form,
// assert validation error shown and no fetch call made.
```
