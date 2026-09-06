# Data Model & API Contracts

This is the single source of truth for DynamoDB schemas, entity interfaces, API routes, and S3 structure. Feature specs should reference this file rather than redefining these models.

## DynamoDB Table Design

Single-table design pattern. Table name: `PantryApp`.

| Attribute   | Type   | Description                           |
| ----------- | ------ | ------------------------------------- |
| PK          | String | Partition Key (e.g., `USER#<userId>`) |
| SK          | String | Sort Key (e.g., `ITEM#<itemId>`)      |
| GSI1PK      | String | GSI1 Partition Key                    |
| GSI1SK      | String | GSI1 Sort Key                         |
| entityType  | String | Entity discriminator                  |
| createdAt   | String | ISO timestamp                         |
| updatedAt   | String | ISO timestamp                         |
| syncVersion | Number | Optimistic locking version            |

## Access Patterns

| Access Pattern               | PK                             | SK                           | Index |
| ---------------------------- | ------------------------------ | ---------------------------- | ----- |
| Get user's inventory items   | `USER#<userId>`                | `ITEM#` (begins_with)        | Main  |
| Get single inventory item    | `USER#<userId>`                | `ITEM#<itemId>`              | Main  |
| Get user's recipes           | `USER#<userId>`                | `RECIPE#` (begins_with)      | Main  |
| Get single recipe            | `USER#<userId>`                | `RECIPE#<recipeId>`          | Main  |
| Get meal plans by date       | `USER#<userId>`                | `MEAL#<date>#` (begins_with) | Main  |
| Get user's storage locations | `USER#<userId>`                | `LOCATION#` (begins_with)    | Main  |
| Get items by category        | `USER#<userId>#CAT#<category>` | `ITEM#`                      | GSI1  |
| Get low-stock items          | `USER#<userId>#LOWSTOCK`       | `ITEM#<itemId>`              | GSI1  |
| Get items by location        | `USER#<userId>#LOC#<location>` | `ITEM#<itemId>`              | GSI1  |

## Shared Types

### UnitType

Units are defined by a metadata table (`backend/src/types/units.ts` and `frontend/src/types/units.ts`),
keyed by a short unit key. Each entry carries `key`, `singular`, `abbreviation`, and `plural` labels.

```typescript
type UnitType = keyof typeof UNIT_METADATA;
// Keys: tsp, tbsp, cup, ml, l, g, kg, piece, slice, clove, pinch,
//       handful, stick, can, bottle, zest, unit

// VALID_UNITS is sorted alphabetically by the visible singular label (locale compare).
const VALID_UNITS: UnitType[] = (Object.keys(UNIT_METADATA) as UnitType[]).sort((a, b) =>
  UNIT_METADATA[a].singular.localeCompare(UNIT_METADATA[b].singular),
);

// Legacy values from earlier inventory data are normalized via LEGACY_UNIT_MAP:
//   Gram -> g, Kilo -> kg, Milliliter -> ml, Liter -> l, Unit -> piece
```

`resolveUnit()` maps any incoming value (modern key or legacy label) to a canonical unit key.

## Entity Schemas

### InventoryItem

```typescript
interface InventoryItem {
  PK: string; // USER#<userId>
  SK: string; // ITEM#<itemId>
  entityType: 'InventoryItem';
  itemId: string;
  groupId: string; // InventoryGroup groupId
  userId: string;
  barcode?: string;
  name: string;
  category: string;
  expirationDate: string; // ISO date, REQUIRED
  location: string; // StorageLocation locationId
  locationDetails?: string; // Optional shelf/section, editable and clearable
  quantity: number;
  unit: UnitType; // Canonical unit key; legacy labels normalized on input
  brand?: string;
  whereToBuy?: string;
  onlineStoreLink?: string;
  pictureUrl?: string; // S3 URL for item picture
  createdAt: string;
  updatedAt: string;
  syncVersion: number;
  GSI1PK?: string; // USER#<userId>#CAT#<category> or USER#<userId>#LOC#<location>
  GSI1SK?: string; // ITEM#<itemId>
}
```

### InventoryGroup

Persisted product-level grouping for stock lots that share normalized name, category, and unit.

```typescript
interface InventoryGroup {
  PK: string; // USER#<userId>
  SK: string; // GROUP#<groupId>
  entityType: 'InventoryGroup';
  groupId: string; // deterministic for the default canonical group
  canonicalKey: string; // normalized name|category|canonical unit
  name: string;
  category: string;
  unit: UnitType;
  threshold?: number; // absent disables low-stock warnings
  thresholdUnit?: UnitType; // defaults to group unit; compatible mass/volume conversions supported
  totalQuantity: number; // sum of child inventory item quantities
  isLowStock: boolean; // threshold converted to group unit before comparing totalQuantity <= threshold
  createdAt: string;
  updatedAt: string;
  syncVersion: number;
}
```

### StorageLocation

```typescript
interface StorageLocation {
  PK: string; // USER#<userId>
  SK: string; // LOCATION#<locationId>
  entityType: 'StorageLocation';
  locationId: string;
  userId: string;
  name: string; // User-facing display name, unique per user (case-insensitive)
  createdAt: string;
  updatedAt: string;
  syncVersion: number;
}
```

### Recipe

```typescript
interface Recipe {
  PK: string; // USER#<userId>
  SK: string; // RECIPE#<recipeId>
  entityType: 'Recipe';
  recipeId: string;
  userId: string;
  name: string;
  tags: string[]; // Required, non-empty; always lowercase, trimmed, deduplicated
  ingredients: RecipeIngredient[];
  instructions: string | string[]; // Array of ordered steps (new clients); legacy recipes may be a single string
  chefNotes?: string; // Optional free-text notes shown below instructions
  sourceUrl?: string;
  prepTime?: number; // Optional prep time in minutes (non-negative integer)
  cookTime?: number; // Optional cook time in minutes (non-negative integer)
  portions: number; // Required; positive integer (≥ 1)
  createdAt: string;
  updatedAt: string;
  syncVersion: number;
}

interface RecipeIngredient {
  name: string;
  quantity: number | null; // null only allowed when unit is 'handful' (empty quantity)
  unit: string;
  section?: string; // Optional grouping heading; consecutive ingredients share a section
  inventoryItemId?: string;
}
```

### MealPlan

```typescript
interface MealPlan {
  PK: string; // USER#<userId>
  SK: string; // MEAL#<date>#<mealType>#<planId>
  entityType: 'MealPlan';
  planId: string;
  userId: string;
  date: string; // ISO date (YYYY-MM-DD)
  mealType: 'breakfast' | 'lunch' | 'dinner';
  recipeId: string;
  recipeName: string; // Denormalized for display
  servings?: number; // Positive integer per assignment; older rows use recipe portions
  createdAt: string;
  updatedAt: string;
  syncVersion: number;
}
```

### Receipt

```typescript
interface Receipt {
  PK: string; // USER#<userId>
  SK: string; // RECEIPT#<receiptId>
  entityType: 'Receipt';
  receiptId: string;
  userId: string;
  s3Key: string;
  status: 'uploaded' | 'processing' | 'completed' | 'failed';
  extractedItems?: ExtractedItem[];
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

interface ExtractedItem {
  name: string;
  quantity?: number;
  price?: number;
  confidence: number;
}
```

### SyncQueueItem (IndexedDB - Client Side)

```typescript
interface SyncQueueItem {
  id: string;
  operation: 'create' | 'update' | 'delete';
  entityType: 'inventoryItem' | 'recipe' | 'mealPlan' | 'storageLocation';
  entityId: string;
  data: any;
  timestamp: number;
  retryCount: number;
  status: 'pending' | 'syncing' | 'failed';
}
```

## API Routes

| Method | Path                          | Lambda          | Auth | Description                                             |
| ------ | ----------------------------- | --------------- | ---- | ------------------------------------------------------- |
| POST   | /auth/verify                  | Auth            | No   | Verify Cognito token                                    |
| GET    | /inventory                    | Inventory       | Yes  | List all inventory items                                |
| POST   | /inventory                    | Inventory       | Yes  | Add inventory item                                      |
| PUT    | /inventory/{itemId}           | Inventory       | Yes  | Update inventory item                                   |
| DELETE | /inventory/{itemId}           | Inventory       | Yes  | Remove inventory item                                   |
| GET    | /inventory/low-stock          | Inventory       | Yes  | Get groups at or below threshold                        |
| PUT    | /inventory/groups/{groupId}   | Inventory       | Yes  | Set or clear a group low-stock threshold                |
| GET    | /inventory/search             | Inventory       | Yes  | Search inventory for autocomplete (query: field, query) |
| POST   | /inventory/barcode-lookup     | Inventory       | Yes  | Lookup product by barcode (external API)                |
| GET    | /recipes                      | Recipe          | Yes  | List all recipes                                        |
| POST   | /recipes                      | Recipe          | Yes  | Create recipe                                           |
| GET    | /recipes/tags                 | Recipe          | Yes  | Get all distinct tags across user's recipes             |
| GET    | /recipes/{recipeId}           | Recipe          | Yes  | Get recipe with availability                            |
| PUT    | /recipes/{recipeId}           | Recipe          | Yes  | Update recipe                                           |
| DELETE | /recipes/{recipeId}           | Recipe          | Yes  | Delete recipe                                           |
| GET    | /meal-plans                   | MealPlan        | Yes  | Get meal plans (query: startDate, endDate)              |
| POST   | /meal-plans                   | MealPlan        | Yes  | Create meal assignment                                  |
| PUT    | /meal-plans                   | MealPlan        | Yes  | Set servings on all assignments from startDate onward |
| PUT    | /meal-plans/{planId}          | MealPlan        | Yes  | Update assignment                                       |
| DELETE | /meal-plans/{planId}          | MealPlan        | Yes  | Remove assignment                                       |
| POST   | /shopping-list/generate       | ShoppingList    | Yes  | Generate shopping list for date range                   |
| PUT    | /shopping-list                | ShoppingList    | Yes  | Update shopping list (manual edits)                     |
| POST   | /receipts/upload              | Receipt         | Yes  | Get presigned URL for upload                            |
| POST   | /receipts/{receiptId}/process | Receipt         | Yes  | Trigger OCR processing                                  |
| GET    | /receipts/{receiptId}/status  | Receipt         | Yes  | Check processing status                                 |
| GET    | /locations                    | StorageLocation | Yes  | List user's storage locations                           |
| POST   | /locations                    | StorageLocation | Yes  | Create storage location                                 |
| PUT    | /locations/{locationId}       | StorageLocation | Yes  | Rename storage location                                 |
| DELETE | /locations/{locationId}       | StorageLocation | Yes  | Remove storage location                                 |
| POST   | /sync                         | Sync            | Yes  | Batch sync operations                                   |

## API Request/Response Interfaces

### Inventory

```typescript
// POST /inventory
interface AddInventoryRequest {
  name: string;
  category: string;
  expirationDate: string; // ISO date, required
  locationId: string;
  locationDetails?: string;
  quantity: number;
  unit: UnitType; // Must be a valid UnitType value
  barcode?: string;
  brand?: string;
  whereToBuy?: string;
  onlineStoreLink?: string;
  pictureUrl?: string;
}

// PUT /inventory/{itemId}
interface UpdateInventoryRequest {
  name?: string;
  category?: string;
  expirationDate?: string;
  locationId?: string;
  locationDetails?: string; // empty string clears the shelf/section
  quantity?: number;
  unit?: UnitType; // Validated against UnitType when provided
  barcode?: string;
  brand?: string;
  whereToBuy?: string;
  onlineStoreLink?: string;
  pictureUrl?: string;
  reassignGroup?: boolean; // true applies automatic grouping after identity changes
}

// GET /inventory response
interface ListInventoryResponse {
  items: InventoryItem[];
  groups: InventoryGroup[];
  lastEvaluatedKey?: string;
}

// Mutation response (POST/PUT)
interface MutationResponse {
  item: InventoryItem;
  lowStockTransition?: boolean;
  notification?: { type: string; message: string; itemId: string };
}

// GET /inventory/search
interface InventorySearchRequest {
  field: 'barcode' | 'name' | 'category' | 'brand' | 'whereToBuy' | 'onlineStoreLink';
  query: string;
}
interface InventorySearchResponse {
  field: string;
  query: string;
  resultType: 'items' | 'values';
  items?: InventoryItem[]; // For barcode and name fields (returns full items)
  values?: string[]; // For category, brand, whereToBuy, onlineStoreLink (returns distinct values)
  count: number; // Number of results (max 10)
}

// POST /inventory/barcode-lookup
interface BarcodeLookupRequest {
  barcode: string;
}
interface BarcodeLookupResponse {
  found: boolean;
  product?: ProductInfo;
}
```

#### POST /inventory

`POST /inventory` creates a new inventory item row for every submission. Each add always results in a new item — there is no merge/dedup behavior on the backend.

`POST /inventory` assigns every new lot to a persisted default group using normalized name + category + canonical unit. `GET /inventory` returns `{ items, groups }`. Thresholds and low-stock state belong to groups, not individual inventory items.

#### Group threshold units

`PUT /inventory/groups/{groupId}` accepts `{ threshold: number | null,
thresholdUnit?: UnitType }`. A missing unit means the group's stock unit. The value
must be finite and nonnegative. Kilograms/grams and liters/milliliters convert within
their dimension; all other units must match the stock unit. Null removes both the
threshold and its unit. Aggregation after lot mutations uses the same conversion.

Autocomplete searches read all inventory pages and return the latest created lot per
barcode (or canonical product identity without barcode), capped at ten suggestions.
Adding another lot copies saved expiration, photo, and location details; group threshold
settings remain on the automatically matched group. User-entered form values are preserved.

### Storage Locations

```typescript
// GET /locations response
interface ListLocationsResponse {
  locations: StorageLocation[];
}

// POST /locations
interface CreateLocationRequest {
  name: string;
} // unique per user
interface CreateLocationResponse {
  location: StorageLocation;
}

// PUT /locations/{locationId}
interface RenameLocationRequest {
  name: string;
} // unique per user

// DELETE /locations/{locationId}
// Returns 400 if location contains inventory items
// Returns 400 if it is the user's last remaining location
```

### Recipes

```typescript
// POST /recipes
interface CreateRecipeRequest {
  name: string;
  tags: string[]; // required, at least one; normalized to lowercase
  ingredients: RecipeIngredient[]; // at least one required; null quantity only for 'handful'
  instructions: string | string[]; // non-empty string OR non-empty array of non-empty steps
  chefNotes?: string | null; // optional free-text notes; null removes notes on update
  sourceUrl?: string;
  prepTime?: number; // optional, non-negative integer (minutes)
  cookTime?: number; // optional, non-negative integer (minutes)
  portions: number; // required, positive integer
}

// PUT /recipes/{recipeId}
interface UpdateRecipeRequest {
  name?: string;
  tags?: string[]; // if provided, must be non-empty; normalized to lowercase
  ingredients?: RecipeIngredient[];
  instructions?: string | string[]; // if provided: non-empty string or non-empty array of non-empty steps
  chefNotes?: string; // optional free-text notes
  sourceUrl?: string;
  prepTime?: number | null; // null = explicit removal
  cookTime?: number | null; // null = explicit removal
  portions?: number;
}

// GET /recipes/{recipeId} response
interface RecipeWithAvailability {
  recipe: Recipe;
  ingredientAvailability: IngredientStatus[];
  missingCount: number;
}

// GET /recipes/tags response
interface ListRecipeTagsResponse {
  tags: string[]; // sorted, deduplicated, lowercased union of all tags across user's recipes
}
```

### Meal Plans

```typescript
// POST /meal-plans
interface CreateMealPlanRequest {
  date: string; // ISO date
  mealType: 'breakfast' | 'lunch' | 'dinner';
  recipeId: string;
  recipeName: string; // Denormalized for display
}
```

#### Bulk servings

`PUT /meal-plans` accepts `{ startDate: "YYYY-MM-DD", servings: positiveInteger }`
and returns `{ updatedCount }`. The client supplies its local calendar date. The
handler reads every database page in the authenticated user's partition and updates
all assignments on/after that date, including outside the visible calendar. It never
updates recipe records or earlier meals. Absolute servings assignments are safe to
retry after a partial network failure; concurrent deletions are not recreated.

### Shopping List

September 2026 first release: the Shopping List page derives its two lists from
existing authenticated inventory, recipes and meal-plans reads. Inventory reads
follow every item page; the inventory handler returns every group page. Shopping
basket checkmarks and extra quantities are stored per user and planning period in
localStorage (`pantry-shopping-v1:<userId>:<start>:<end>`), not DynamoDB. Purchase entry
uses the existing POST /inventory contract. The generation/update endpoints below
are reserved future contracts and are not implemented in this release. See
`.kiro/specs/shopping-list/requirements.md` and `design.md`.

```typescript
// POST /shopping-list/generate
interface GenerateShoppingListRequest {
  startDate: string;
  endDate: string;
}
interface ShoppingListResponse {
  items: ShoppingItem[];
  dateRange: { start: string; end: string };
}

// PUT /shopping-list
interface UpdateShoppingListRequest {
  items: ShoppingItem[];
}
```

### Receipts

```typescript
// POST /receipts/upload response
interface UploadUrlResponse {
  uploadUrl: string;
  receiptId: string;
}

// POST /receipts/{receiptId}/process response
interface ProcessReceiptResponse {
  status: 'processing' | 'completed' | 'failed';
  items?: ExtractedItem[];
  error?: string;
}
```

### Sync

```typescript
// POST /sync
interface SyncRequest {
  operations: SyncOperation[];
  lastSyncTimestamp: number;
}
interface SyncOperation {
  type: 'create' | 'update' | 'delete';
  entity: 'inventoryItem' | 'recipe' | 'mealPlan' | 'storageLocation';
  data: any;
  clientTimestamp: number;
}
interface SyncResponse {
  applied: SyncResult[];
  conflicts: ConflictResult[];
  serverTimestamp: number;
}
```

### Error Response

```typescript
interface ErrorResponse {
  statusCode: number;
  body: {
    error: string;
    message: string;
    details?: any;
    requestId: string;
  };
}
```

## S3 Bucket Structure

```
pantry-app-storage-{env}/
├── receipts/{userId}/{receiptId}.{jpg|png}
├── inventory-items/{userId}/{itemId}.{jpg|png}
└── exports/{userId}/{exportId}.json
```

## IndexedDB Schema (Client-Side)

Database: `PantryAppDB`, Version: 2

| Store            | Key        | Indexes                                                             |
| ---------------- | ---------- | ------------------------------------------------------------------- |
| inventoryItems   | itemId     | byCategory, byLocation, byLowStock, byExpirationDate, bySyncVersion |
| recipes          | recipeId   | byName, bySyncVersion                                               |
| mealPlans        | planId     | byDate, bySyncVersion                                               |
| syncQueue        | id         | byStatus, byTimestamp                                               |
| storageLocations | locationId | byName, bySyncVersion                                               |
| metadata         | string key | —                                                                   |
