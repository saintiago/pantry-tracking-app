# Design Document: Recipe Management

## Overview

This feature implements the Recipe Lambda (CRUD + availability calculation) and the frontend recipe module (RecipesPage, RecipeList, RecipeDetail, RecipeEditor, IngredientAvailability).

Shared infrastructure — DynamoDB table schema, auth flow, API Gateway setup, S3, sync, IndexedDB schema — is defined in the main spec at `.kiro/specs/pantry-tracking-app/design.md` and `data-model.md`. This document covers only recipe-specific implementation detail.

## Data Model

Entity schemas are the source of truth in `data-model.md`. Reproduced here for reference:

```typescript
interface Recipe {
  PK: string;           // USER#<userId>
  SK: string;           // RECIPE#<recipeId>
  entityType: 'Recipe';
  recipeId: string;
  userId: string;
  name: string;
  ingredients: RecipeIngredient[];
  instructions: string;
  sourceUrl?: string;
  createdAt: string;
  updatedAt: string;
  syncVersion: number;
}

interface RecipeIngredient {
  name: string;
  quantity: number;
  unit: string;
  inventoryItemId?: string;
}
```

## Architecture

### Backend: Recipe Lambda

File: `backend/src/handlers/recipe/recipe.ts`

The handler follows the same pattern as the Inventory Lambda: extract `userId` from the Cognito authorizer, dispatch by `httpMethod` + `pathParameters`, return `{ statusCode, headers, body }`.

```
Recipe Lambda
├── handler(event) — route dispatcher
├── listRecipes(userId)
├── createRecipe(userId, body)
├── getRecipeWithAvailability(userId, recipeId)
│   └── computeAvailability(ingredients, inventoryItems) — pure function
├── updateRecipe(userId, recipeId, body)
└── deleteRecipe(userId, recipeId)
```

`computeAvailability` is extracted as a pure function to enable direct property-based testing without DynamoDB.

### Frontend: RecipesPage Module

```
frontend/src/pages/RecipesPage/
├── RecipesPage.tsx          — page shell, view-state router
├── RecipeList.tsx           — recipe collection with search
├── RecipeDetail.tsx         — full recipe view + IngredientAvailability
├── RecipeEditor.tsx         — create/edit form
└── IngredientAvailability.tsx — per-ingredient status display

frontend/src/api/recipes/
├── recipes.ts               — API client (fetch wrappers)
└── __tests__/
    └── recipes.test.ts
```

### View State Flow

```
RecipesPage
  view: 'list' | 'detail' | 'editor-new' | 'editor-edit'

  list       → detail       (select recipe)
  list       → editor-new   (New Recipe button)
  detail     → editor-edit  (Edit button)
  detail     → list         (Back button)
  editor-*   → detail       (save success)
  editor-*   → list/detail  (cancel)
```

## Components and Interfaces

### Recipe API Client

`frontend/src/api/recipes/recipes.ts`

```typescript
import { API_URL } from '../../config';
import { getCurrentSession } from '../../auth/cognitoClient/cognitoClient';

export interface RecipeIngredient {
  name: string;
  quantity: number;
  unit: string;
  inventoryItemId?: string;
}

export interface Recipe {
  recipeId: string;
  userId: string;
  name: string;
  ingredients: RecipeIngredient[];
  instructions: string;
  sourceUrl?: string;
  createdAt: string;
  updatedAt: string;
  syncVersion: number;
}

export interface IngredientStatus {
  name: string;
  required: number;
  unit: string;
  available: number;
  status: 'available' | 'partial' | 'missing';
}

export interface RecipeWithAvailability {
  recipe: Recipe;
  ingredientAvailability: IngredientStatus[];
  missingCount: number;
}

export async function fetchRecipes(): Promise<Recipe[]>
export async function createRecipe(data: Omit<Recipe, 'recipeId' | 'userId' | 'createdAt' | 'updatedAt' | 'syncVersion'>): Promise<Recipe>
export async function fetchRecipeWithAvailability(recipeId: string): Promise<RecipeWithAvailability>
export async function updateRecipe(recipeId: string, data: Partial<Pick<Recipe, 'name' | 'ingredients' | 'instructions' | 'sourceUrl'>>): Promise<Recipe>
export async function deleteRecipe(recipeId: string): Promise<void>
```

### RecipesPage

```typescript
// frontend/src/pages/RecipesPage/RecipesPage.tsx
type RecipeView =
  | { mode: 'list' }
  | { mode: 'detail'; recipeId: string }
  | { mode: 'editor-new' }
  | { mode: 'editor-edit'; recipeId: string };

const RecipesPage: React.FC = () => {
  const [view, setView] = useState<RecipeView>({ mode: 'list' });
  // Renders RecipeList | RecipeDetail | RecipeEditor based on view.mode
};
```

### RecipeList

```typescript
interface RecipeListProps {
  onSelect: (recipeId: string) => void;
  onNew: () => void;
}
```

- Fetches all recipes on mount via `fetchRecipes()`
- Renders a search input that filters by recipe name (client-side, case-insensitive)
- Each recipe row shows name and a missing-ingredient badge when `missingCount > 0`
- "New Recipe" button calls `onNew`

### RecipeDetail

```typescript
interface RecipeDetailProps {
  recipeId: string;
  onEdit: () => void;
  onBack: () => void;
  onDeleted: () => void;
}
```

- Fetches `RecipeWithAvailability` on mount via `fetchRecipeWithAvailability(recipeId)`
- Renders recipe name, instructions, source URL link (when present, `target="_blank" rel="noopener noreferrer"`)
- Renders `<IngredientAvailability>` with the availability data
- Edit button calls `onEdit`; Delete button prompts confirmation (with meal-plan warning if applicable), then calls `deleteRecipe` and `onDeleted`

### RecipeEditor

```typescript
interface RecipeEditorProps {
  recipeId?: string;   // undefined = create mode
  onSaved: (recipeId: string) => void;
  onCancel: () => void;
}
```

- In edit mode, fetches the recipe on mount and pre-populates the form
- Fields: name (required), instructions (required), sourceUrl (optional), ingredients list
- Ingredient rows: name, quantity (number), unit (dropdown constrained to `VALID_UNITS`: Gram, Kilo, Milliliter, Liter, Unit) — with add/remove row controls
- Client-side validation: at least one ingredient; each ingredient must have quantity > 0 and non-empty unit
- On submit: calls `createRecipe` or `updateRecipe`, then `onSaved(recipeId)`
- **Ingredient name autocomplete**: when the user types 3+ characters in an ingredient name field, fans out parallel searches across `name`, `barcode`, `brand`, `category`, and `whereToBuy` fields via `searchInventory()`, deduplicates results by `itemId`, and shows up to 10 matching inventory items in an `AutocompleteDropdown`. Selecting an item fills the ingredient name and autofills the unit. The dropdown subtitle shows category, brand, and barcode to help the user identify the match.

### IngredientAvailability

```typescript
interface IngredientAvailabilityProps {
  availability: IngredientStatus[];
  missingCount: number;
}
```

- Renders a summary line: "X ingredient(s) missing or partial"
- Renders each ingredient with a status chip: green (available), amber (partial), red (missing)
- For `partial` items: shows "have X / need Y unit"

## Backend Implementation

### Recipe Lambda — Key Logic

#### Ingredient Validation

```typescript
function validateIngredients(ingredients: unknown[]): string | null {
  if (!ingredients || ingredients.length === 0) return 'At least one ingredient is required';
  for (const ing of ingredients) {
    if (!ing.quantity || ing.quantity <= 0) return 'Each ingredient must have a positive quantity';
    if (!ing.unit || ing.unit.trim() === '') return 'Each ingredient must have a unit';
  }
  return null;
}
```

#### Availability Calculator (pure function)

```typescript
export function computeAvailability(
  ingredients: RecipeIngredient[],
  inventoryItems: InventoryItem[],
): { ingredientAvailability: IngredientStatus[]; missingCount: number } {
  const availability = ingredients.map((ing) => {
    const totalAvailable = inventoryItems
      .filter((item) => item.name.toLowerCase() === ing.name.toLowerCase())
      .reduce((sum, item) => sum + item.quantity, 0);

    const status: 'available' | 'partial' | 'missing' =
      totalAvailable >= ing.quantity
        ? 'available'
        : totalAvailable > 0
          ? 'partial'
          : 'missing';

    return { name: ing.name, required: ing.quantity, unit: ing.unit, available: totalAvailable, status };
  });

  const missingCount = availability.filter((a) => a.status !== 'available').length;
  return { ingredientAvailability: availability, missingCount };
}
```

`getRecipeWithAvailability` queries all inventory items for the user (`PK = USER#<userId>`, `SK begins_with ITEM#`), then calls `computeAvailability`. This aggregates across all storage locations automatically since inventory items are stored per-user, not per-location.

#### DynamoDB Access Patterns

Follows the patterns defined in `data-model.md`:

| Operation | PK | SK |
|-----------|----|----|
| List recipes | `USER#<userId>` | `RECIPE#` (begins_with) |
| Get/Put/Delete recipe | `USER#<userId>` | `RECIPE#<recipeId>` |
| Get all inventory for availability | `USER#<userId>` | `ITEM#` (begins_with) |

#### Auto-create Placeholder Inventory Items

After saving a recipe (both `POST /recipes` and `PUT /recipes/{recipeId}` when ingredients are provided), the Recipe Lambda queries all existing inventory items for the user and creates placeholder items for any ingredient whose name does not match an existing item (case-insensitive):

```typescript
async function autoCreateMissingIngredients(userId, ingredients): Promise<void>
```

Placeholder item fields:
- `quantity`: 0
- `category`: `"Unknown"`
- `isLowStock`: `true` (quantity 0 means out of stock)
- `unit`: ingredient's unit if it is a valid `UnitType`, otherwise `"Unit"`
- `location`: `"unknown"` (sentinel — bypasses the required location field)
- `expirationDate`: `"2099-12-31"` (far-future — bypasses the required expiration field)
- `GSI1PK`: `USER#<userId>#CAT#Unknown` (category key so items appear in the "Unknown" category view in inventory)

The `GET /inventory/search` endpoint now returns `resultType: 'items'` for all fields including `category`, `brand`, `whereToBuy`, and `onlineStoreLink` (previously returned `resultType: 'values'`). The response includes both `items` (matching inventory items) and `values` (distinct field values, for backward compatibility). This enables the RecipeEditor to fan out searches across all fields and show full item results regardless of which field matched.

## Correctness Properties and Property-Based Tests

Properties 10–13 from the main spec are tested here. Test file: `backend/src/handlers/recipe/__tests__/recipe.property.test.ts`

### Property 10: Recipe CRUD Persistence

```typescript
// Feature: recipe-management, Property 10: Recipe CRUD Persistence
// Arbitraries: fc.record({ name: fc.string(), ingredients: fc.array(validIngredient, {minLength:1}), instructions: fc.string(), sourceUrl: fc.option(fc.webUrl()) })
// Test: mock DynamoDB PutCommand + GetCommand; create then retrieve; assert all fields match
// Also: update a field, retrieve, assert updated value persisted
// Also: delete, retrieve, assert 404
```

### Property 11: Recipe Requires Ingredients

```typescript
// Feature: recipe-management, Property 11: Recipe Requires Ingredients
// Arbitraries: invalid ingredient arrays — empty array, or array with ingredient missing quantity, or missing unit
// Test: call createRecipe handler with invalid ingredients; assert 400 response with validation error
// Verify: no PutCommand was called (recipe not persisted)
```

### Property 12: Ingredient Availability Calculation

```typescript
// Feature: recipe-management, Property 12: Ingredient Availability Calculation
// Target: pure computeAvailability function (no DynamoDB needed)
// Arbitraries: fc.array(recipeIngredient), fc.array(inventoryItem)
// For each result:
//   - status === 'available' iff totalAvailable >= required
//   - status === 'partial' iff 0 < totalAvailable < required
//   - status === 'missing' iff totalAvailable === 0
// Verify totalAvailable is computed as sum across all matching inventory items
```

### Property 13: Missing Ingredient Count Accuracy

```typescript
// Feature: recipe-management, Property 13: Missing Ingredient Count Accuracy
// Target: pure computeAvailability function
// Arbitraries: fc.array(recipeIngredient), fc.array(inventoryItem)
// Assert: missingCount === ingredientAvailability.filter(a => a.status !== 'available').length
```

### Test Configuration

- Test file: `backend/src/handlers/recipe/__tests__/recipe.property.test.ts`
- Unit tests: `backend/src/handlers/recipe/__tests__/recipe.test.ts`
- PBT library: fast-check, minimum 100 iterations per property
- Properties 12 and 13 test `computeAvailability` directly (pure function, no mocks needed)
- Properties 10 and 11 mock DynamoDB via `jest.mock('@aws-sdk/lib-dynamodb')`

## Error Handling

| Condition | Response |
|-----------|----------|
| Missing/invalid auth token | 401 |
| Recipe not found or belongs to another user | 404 |
| Empty ingredients or invalid ingredient fields | 400 with `details` array |
| Invalid JSON body | 400 |
| DynamoDB error | 500 |

Frontend errors follow the existing pattern: display an inline error message, do not navigate away.
