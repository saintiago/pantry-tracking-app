# Design Document: Recipe Time Fields

## Overview

This feature adds optional `prepTime` and `cookTime` fields to the Recipe entity. Both fields are non-negative integers representing minutes. A pure `computeTotalTime` function derives `totalTime` as their sum, treating absent fields as 0. When both are absent, no total time is produced.

The change is additive and backward-compatible: existing recipes without time fields remain valid. The feature touches five layers:

1. **Data model** — extend the `Recipe` interface with optional `prepTime?: number` and `cookTime?: number`
2. **Backend** — validate and persist the new fields in `recipe.ts`
3. **API client** — extend TypeScript types and the `updateRecipe` call signature
4. **RecipeEditor** — two new optional numeric inputs with client-side validation
5. **RecipeDetail / RecipeList** — display total time (and individual times where both are present)

## Architecture

The feature follows the existing recipe module architecture with no new Lambda functions, API routes, or DynamoDB tables. All changes are incremental additions to existing files.

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend                                                   │
│                                                             │
│  RecipeList.tsx        ← shows totalTime badge per row      │
│  RecipeDetail.tsx      ← shows prepTime, cookTime, total    │
│  RecipeEditor.tsx      ← two new optional number inputs     │
│  api/recipes/recipes.ts ← extended types + updateRecipe sig │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP (existing routes)
┌────────────────────────▼────────────────────────────────────┐
│  Backend                                                    │
│                                                             │
│  recipe.ts                                                  │
│  ├── validateTimeFields()  ← new pure validation helper     │
│  ├── computeTotalTime()    ← new pure calculation function  │
│  ├── createRecipe()        ← persist prepTime/cookTime      │
│  └── updateRecipe()        ← update prepTime/cookTime       │
└─────────────────────────────────────────────────────────────┘
```

No new DynamoDB access patterns are needed. `prepTime` and `cookTime` are stored as top-level attributes on the existing `RECIPE#<recipeId>` item and are returned by all existing read paths (`GET /recipes` and `GET /recipes/{recipeId}`) automatically since DynamoDB returns all stored attributes.

## Components and Interfaces

### Updated Data Model Types

The `Recipe` interface in both `backend/src/handlers/recipe/recipe.ts` and `frontend/src/api/recipes/recipes.ts` gains two optional fields:

```typescript
interface Recipe {
  // ... existing fields unchanged ...
  prepTime?: number;   // non-negative integer, minutes
  cookTime?: number;   // non-negative integer, minutes
}
```

The `data-model.md` source of truth is updated accordingly.

### New Pure Functions (Backend)

**`validateTimeFields(parsed: Record<string, unknown>): string | null`**

Validates `prepTime` and `cookTime` when present in a parsed request body. Returns an error message string if invalid, or `null` if valid.

```typescript
export function validateTimeFields(parsed: Record<string, unknown>): string | null {
  for (const field of ['prepTime', 'cookTime'] as const) {
    if (parsed[field] !== undefined) {
      const v = parsed[field];
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
        return field; // returns the field name that failed
      }
    }
  }
  return null;
}
```

Returns the failing field name (not a message) so the caller can build a structured error response with `details[].field`.

**`computeTotalTime(prepTime?: number, cookTime?: number): number | undefined`**

Pure function. Returns `undefined` when both inputs are absent; otherwise returns `(prepTime ?? 0) + (cookTime ?? 0)`.

```typescript
export function computeTotalTime(
  prepTime?: number,
  cookTime?: number,
): number | undefined {
  if (prepTime === undefined && cookTime === undefined) return undefined;
  return (prepTime ?? 0) + (cookTime ?? 0);
}
```

This function is used by the frontend (imported from a shared utility or duplicated in the API client layer) and is also exported from the backend for direct property-based testing.

### Updated API Client (`frontend/src/api/recipes/recipes.ts`)

The `Recipe` interface gains the two optional fields. The `createRecipe` and `updateRecipe` call signatures are extended:

```typescript
// createRecipe — data type already uses Omit<Recipe, ...>, so prepTime/cookTime
// are automatically included once added to the Recipe interface.

export async function updateRecipe(
  recipeId: string,
  data: Partial<Pick<Recipe, 'name' | 'ingredients' | 'instructions' | 'sourceUrl' | 'prepTime' | 'cookTime'>>,
): Promise<Recipe>
```

To support clearing a time field (Requirement 6.7), the update payload uses `null` as an explicit removal signal:

```typescript
// In the update payload, null means "remove this field"
// undefined means "don't touch this field"
type TimeFieldUpdate = number | null;

// Extended update type
type UpdateRecipeData = Partial<Pick<Recipe, 'name' | 'ingredients' | 'instructions' | 'sourceUrl'>> & {
  prepTime?: number | null;
  cookTime?: number | null;
};
```

### RecipeEditor Changes

Two new optional fields are added to the form state and rendered below the `sourceUrl` field, above the ingredients section:

```typescript
// New state
const [prepTime, setPrepTime] = useState<string>('');  // string for controlled input
const [cookTime, setCookTime] = useState<string>('');

// New error keys in FormErrors
interface FormErrors {
  // ... existing ...
  prepTime?: string;
  cookTime?: string;
}
```

Time fields are stored as strings in component state (standard pattern for number inputs) and converted to numbers on submit. An empty string maps to `undefined` (field omitted). A previously-set value that is cleared maps to `null` (explicit removal).

Pre-population in edit mode:

```typescript
setPrepTime(recipe.prepTime !== undefined ? String(recipe.prepTime) : '');
setCookTime(recipe.cookTime !== undefined ? String(recipe.cookTime) : '');
```

Client-side validation (called inside `validate()`):

```typescript
function validateTimeField(value: string, fieldName: string): string | undefined {
  if (value === '') return undefined; // optional, empty is fine
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    return `${fieldName} must be a non-negative whole number.`;
  }
  return undefined;
}
```

Submit payload construction:

```typescript
// In handleSubmit, after validation passes:
const timeFields: { prepTime?: number | null; cookTime?: number | null } = {};

if (isEdit) {
  // In edit mode: empty string on a previously-set field = explicit null (removal)
  // Empty string on a field that was never set = omit entirely
  timeFields.prepTime = prepTime === '' ? (originalPrepTime !== undefined ? null : undefined) : Number(prepTime);
  timeFields.cookTime = cookTime === '' ? (originalCookTime !== undefined ? null : undefined) : Number(cookTime);
} else {
  // Create mode: empty = omit
  if (prepTime !== '') timeFields.prepTime = Number(prepTime);
  if (cookTime !== '') timeFields.cookTime = Number(cookTime);
}
```

### RecipeDetail Changes

A new `TimeDisplay` sub-section is rendered between the page header and the `IngredientAvailability` section:

```typescript
// Rendered only when at least one time field is present
function TimeDisplay({ recipe }: { recipe: Recipe }) {
  const total = computeTotalTime(recipe.prepTime, recipe.cookTime);
  if (total === undefined) return null;

  return (
    <section style={styles.timeSection} aria-label="Recipe time">
      {recipe.prepTime !== undefined && recipe.cookTime !== undefined ? (
        <>
          <span>Prep: {recipe.prepTime} min</span>
          <span>Cook: {recipe.cookTime} min</span>
          <span style={styles.totalTime}>Total: {total} min</span>
        </>
      ) : (
        <span style={styles.totalTime}>Total: {total} min</span>
      )}
    </section>
  );
}
```

### RecipeList Changes

Each recipe row gains a time badge rendered alongside the existing missing-ingredient badge:

```typescript
const total = computeTotalTime(recipe.prepTime, recipe.cookTime);
// ...
{total !== undefined && (
  <span style={styles.timeBadge} aria-label={`${total} minutes total`}>
    {total} min
  </span>
)}
```

The time badge uses a neutral style (e.g., grey background) to distinguish it from the red missing-ingredient badge.

## Data Models

### Extended Recipe Entity (DynamoDB)

The DynamoDB item gains two optional top-level attributes:

| Attribute | Type | Constraints |
|-----------|------|-------------|
| `prepTime` | Number | Non-negative integer (≥ 0), optional |
| `cookTime` | Number | Non-negative integer (≥ 0), optional |

No schema migration is needed. Existing items without these attributes continue to work; DynamoDB simply does not return them, and the TypeScript types treat them as `undefined`.

### Backend: `createRecipe` Persistence

```typescript
// In createRecipe(), after building the base recipe object:
if (parsed.prepTime !== undefined) recipe.prepTime = parsed.prepTime as number;
if (parsed.cookTime !== undefined) recipe.cookTime = parsed.cookTime as number;
```

### Backend: `updateRecipe` Persistence

The `updatableFields` map in `updateRecipe()` is extended:

```typescript
const updatableFields: Record<string, string> = {
  name: 'name',
  ingredients: 'ingredients',
  instructions: 'instructions',
  sourceUrl: 'sourceUrl',
  prepTime: 'prepTime',
  cookTime: 'cookTime',
};
```

For explicit removal (`null` value), the update expression uses `REMOVE` rather than `SET`:

```typescript
// In updateRecipe(), after building updateParts:
const removeParts: string[] = [];

for (const field of ['prepTime', 'cookTime'] as const) {
  if (parsed[field] === null) {
    // Explicit removal
    const alias = `#f_${field}`;
    expressionAttrNames[alias] = field;
    removeParts.push(alias);
  } else if (parsed[field] !== undefined) {
    // Normal update (handled by existing updatableFields loop)
  }
}

const updateExpression = [
  updateParts.length > 0 ? `SET ${updateParts.join(', ')}` : '',
  removeParts.length > 0 ? `REMOVE ${removeParts.join(', ')}` : '',
].filter(Boolean).join(' ');
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Total Time Calculation

*For any* combination of optional non-negative integer `prepTime` and `cookTime` values, `computeTotalTime` SHALL return `(prepTime ?? 0) + (cookTime ?? 0)` when at least one value is present, and `undefined` when both are absent.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

### Property 2: Valid Time Fields Accepted by Lambda

*For any* valid recipe body where `prepTime` and/or `cookTime` are non-negative integers, `POST /recipes` SHALL return 201 and the response body SHALL contain the same `prepTime` and `cookTime` values that were submitted.

**Validates: Requirements 1.2, 1.3, 2.1**

### Property 3: Invalid Time Fields Rejected by Lambda

*For any* request where `prepTime` or `cookTime` is a negative number, a non-integer number, or a non-numeric value, `POST /recipes` and `PUT /recipes/{recipeId}` SHALL return 400 with a validation error that identifies the offending field in the `details` array.

**Validates: Requirements 1.4, 1.5**

### Property 4: Time Fields Preserved Through Update

*For any* recipe with stored `prepTime` and/or `cookTime`, a `PUT /recipes/{recipeId}` request that does not include `prepTime` or `cookTime` in the body SHALL leave those field values unchanged in the returned recipe.

**Validates: Requirements 2.3**

### Property 5: RecipeDetail Displays Correct Time Information

*For any* recipe with at least one of `prepTime` or `cookTime`, the rendered `RecipeDetail` component SHALL display the computed `totalTime`. When both fields are present, it SHALL also display `prepTime` and `cookTime` individually with clear labels.

**Validates: Requirements 4.1, 4.2, 4.4**

### Property 6: RecipeList Displays Total Time

*For any* list of recipes, each recipe row in `RecipeList` SHALL display the computed `totalTime` if and only if `computeTotalTime` returns a defined value for that recipe.

**Validates: Requirements 5.1, 5.2**

### Property 7: RecipeEditor Pre-populates Time Fields in Edit Mode

*For any* recipe with stored `prepTime` and/or `cookTime`, opening `RecipeEditor` in edit mode SHALL pre-populate the corresponding input fields with those stored values.

**Validates: Requirements 6.6**

### Property 8: RecipeEditor Rejects Invalid Time Inputs

*For any* negative number or non-integer value entered in a time field, the `RecipeEditor` SHALL display a validation error for that field and SHALL NOT submit the form.

**Validates: Requirements 6.3, 6.4**

## Error Handling

### Backend Validation Errors

| Condition | Response |
|-----------|----------|
| `prepTime` is negative | 400 `VALIDATION_ERROR`, `details: [{ field: 'prepTime', message: 'prepTime must be a non-negative integer' }]` |
| `prepTime` is a float | 400 `VALIDATION_ERROR`, `details: [{ field: 'prepTime', message: 'prepTime must be a non-negative integer' }]` |
| `prepTime` is a non-numeric string | 400 `VALIDATION_ERROR`, `details: [{ field: 'prepTime', message: 'prepTime must be a non-negative integer' }]` |
| Same conditions for `cookTime` | 400 `VALIDATION_ERROR`, `details: [{ field: 'cookTime', ... }]` |
| Both fields invalid | 400 with the first failing field identified (fail-fast) |

Validation runs before any DynamoDB write, so no partial state is persisted on error.

### Frontend Validation Errors

Time field errors are displayed inline below the respective input, matching the existing `fieldError` style. The form submit button remains enabled but submission is blocked until errors are resolved. Error messages are cleared when the user modifies the field.

### Backward Compatibility

- Existing recipes without `prepTime` or `cookTime` are unaffected. All display components check for `undefined` before rendering time information.
- The `computeTotalTime` function returns `undefined` for recipes with neither field, and all display components treat `undefined` as "no time to show."
- The `updateRecipe` API client signature change is backward-compatible: the new `prepTime` and `cookTime` keys are optional in the update payload.

## Testing Strategy

### Unit Tests

**Backend (`backend/src/handlers/recipe/__tests__/recipe.test.ts`)**

New example-based tests added to the existing test file:

- `POST /recipes` with `prepTime` and `cookTime` returns 201 with those values in the response
- `POST /recipes` without time fields returns 201 with no time fields in the response
- `POST /recipes` with `prepTime: -1` returns 400 identifying `prepTime`
- `POST /recipes` with `cookTime: 1.5` returns 400 identifying `cookTime`
- `PUT /recipes/{recipeId}` with `prepTime: null` removes the field (REMOVE expression used)
- `GET /recipes` returns time fields when stored (mock DynamoDB returns items with time fields)

**Frontend API client (`frontend/src/api/recipes/__tests__/recipes.test.ts`)**

- `createRecipe` with time fields sends them in the request body
- `updateRecipe` with `prepTime: null` sends `null` in the request body
- `updateRecipe` without time fields does not include them in the request body

**Frontend components (`frontend/src/pages/RecipesPage/__tests__/`)**

- `RecipeDetail` renders total time when only `prepTime` is set
- `RecipeDetail` renders total time when only `cookTime` is set
- `RecipeDetail` renders `prepTime`, `cookTime`, and total when both are set
- `RecipeDetail` renders no time section when neither field is set
- `RecipeList` renders time badge for recipes with time fields
- `RecipeList` renders no time badge for recipes without time fields
- `RecipeEditor` renders labeled `prepTime` and `cookTime` inputs
- `RecipeEditor` pre-populates time fields in edit mode
- `RecipeEditor` submits without time fields when both inputs are empty
- `RecipeEditor` sends `null` for a cleared time field in edit mode

### Property-Based Tests

PBT is appropriate here because:
- `computeTotalTime` is a pure function with a large input space (all combinations of optional non-negative integers)
- Time field validation logic in the Lambda covers a large space of invalid inputs
- UI rendering properties hold universally across all recipe shapes

**PBT library**: fast-check (already used in this project), minimum 100 iterations per property.

**Backend property tests (`backend/src/handlers/recipe/__tests__/recipe.property.test.ts`)**

New properties added to the existing property test file (or a new file if it does not yet exist):

```typescript
// Feature: recipe-time-fields, Property 1: Total Time Calculation
fc.assert(fc.property(
  fc.option(fc.nat(), { nil: undefined }),
  fc.option(fc.nat(), { nil: undefined }),
  (prepTime, cookTime) => {
    const result = computeTotalTime(prepTime, cookTime);
    if (prepTime === undefined && cookTime === undefined) {
      return result === undefined;
    }
    return result === (prepTime ?? 0) + (cookTime ?? 0);
  }
), { numRuns: 100 });

// Feature: recipe-time-fields, Property 2: Valid Time Fields Accepted by Lambda
fc.assert(fc.property(
  fc.record({
    prepTime: fc.option(fc.nat(), { nil: undefined }),
    cookTime: fc.option(fc.nat(), { nil: undefined }),
  }),
  async ({ prepTime, cookTime }) => {
    // mock DynamoDB, call createRecipe handler
    // verify 201 and response contains same prepTime/cookTime
  }
), { numRuns: 100 });

// Feature: recipe-time-fields, Property 3: Invalid Time Fields Rejected by Lambda
fc.assert(fc.property(
  fc.oneof(
    fc.record({ prepTime: fc.integer({ max: -1 }) }),           // negative
    fc.record({ prepTime: fc.float({ noNaN: true }).filter(n => !Number.isInteger(n)) }), // float
    fc.record({ cookTime: fc.integer({ max: -1 }) }),
    fc.record({ cookTime: fc.float({ noNaN: true }).filter(n => !Number.isInteger(n)) }),
  ),
  async (invalidFields) => {
    // call createRecipe handler with invalid time fields
    // verify 400 with details identifying the field
  }
), { numRuns: 100 });

// Feature: recipe-time-fields, Property 4: Time Fields Preserved Through Update
fc.assert(fc.property(
  fc.nat(),  // prepTime
  fc.nat(),  // cookTime
  async (prepTime, cookTime) => {
    // mock UpdateCommand to return Attributes with prepTime/cookTime unchanged
    // call updateRecipe with body that omits time fields
    // verify returned recipe still has original prepTime/cookTime
  }
), { numRuns: 100 });
```

**Frontend property tests**

New property test files following the `.property.test.tsx` convention:

`frontend/src/pages/RecipesPage/__tests__/RecipeDetail.property.test.tsx`

```typescript
// Feature: recipe-time-fields, Property 5: RecipeDetail Displays Correct Time Information
fc.assert(fc.property(
  fc.record({
    prepTime: fc.option(fc.nat(), { nil: undefined }),
    cookTime: fc.option(fc.nat(), { nil: undefined }),
  }).filter(({ prepTime, cookTime }) => prepTime !== undefined || cookTime !== undefined),
  ({ prepTime, cookTime }) => {
    const recipe = makeRecipe({ prepTime, cookTime });
    const { getByText } = render(<RecipeDetail ... />);
    const total = (prepTime ?? 0) + (cookTime ?? 0);
    expect(screen.getByText(new RegExp(`${total}`))).toBeInTheDocument();
    if (prepTime !== undefined && cookTime !== undefined) {
      expect(screen.getByText(new RegExp(`${prepTime}`))).toBeInTheDocument();
      expect(screen.getByText(new RegExp(`${cookTime}`))).toBeInTheDocument();
    }
  }
), { numRuns: 100 });
```

`frontend/src/pages/RecipesPage/__tests__/RecipeList.property.test.tsx`

```typescript
// Feature: recipe-time-fields, Property 6: RecipeList Displays Total Time
fc.assert(fc.property(
  fc.array(fc.record({
    prepTime: fc.option(fc.nat(), { nil: undefined }),
    cookTime: fc.option(fc.nat(), { nil: undefined }),
  }), { minLength: 1 }),
  (timeConfigs) => {
    const recipes = timeConfigs.map((t, i) => makeRecipe({ ...t, recipeId: `r-${i}` }));
    render(<RecipeList recipes={recipes} ... />);
    recipes.forEach((recipe) => {
      const total = computeTotalTime(recipe.prepTime, recipe.cookTime);
      if (total !== undefined) {
        expect(screen.getByLabelText(new RegExp(`${total} minutes`))).toBeInTheDocument();
      }
    });
  }
), { numRuns: 100 });
```

`frontend/src/pages/RecipesPage/__tests__/RecipeEditor.property.test.tsx`

```typescript
// Feature: recipe-time-fields, Property 7: RecipeEditor Pre-populates Time Fields in Edit Mode
// Feature: recipe-time-fields, Property 8: RecipeEditor Rejects Invalid Time Inputs
```
