# Data Model & API Contracts

This is the single source of truth for DynamoDB schemas, entity interfaces, API routes, and S3 structure. Feature specs should reference this file rather than redefining these models.

## DynamoDB Table Design

Single-table design pattern. Table name: `PantryApp`.

| Attribute | Type | Description |
|-----------|------|-------------|
| PK | String | Partition Key (e.g., `USER#<userId>`) |
| SK | String | Sort Key (e.g., `ITEM#<itemId>`) |
| GSI1PK | String | GSI1 Partition Key |
| GSI1SK | String | GSI1 Sort Key |
| entityType | String | Entity discriminator |
| createdAt | String | ISO timestamp |
| updatedAt | String | ISO timestamp |
| syncVersion | Number | Optimistic locking version |

## Access Patterns

| Access Pattern | PK | SK | Index |
|----------------|----|----|-------|
| Get user's inventory items | `USER#<userId>` | `ITEM#` (begins_with) | Main |
| Get single inventory item | `USER#<userId>` | `ITEM#<itemId>` | Main |
| Get user's recipes | `USER#<userId>` | `RECIPE#` (begins_with) | Main |
| Get single recipe | `USER#<userId>` | `RECIPE#<recipeId>` | Main |
| Get meal plans by date | `USER#<userId>` | `MEAL#<date>#` (begins_with) | Main |
| Get user's storage locations | `USER#<userId>` | `LOCATION#` (begins_with) | Main |
| Get items by category | `USER#<userId>#CAT#<category>` | `ITEM#` | GSI1 |
| Get low-stock items | `USER#<userId>#LOWSTOCK` | `ITEM#<itemId>` | GSI1 |
| Get items by location | `USER#<userId>#LOC#<location>` | `ITEM#<itemId>` | GSI1 |

## Shared Types

### UnitType

```typescript
type UnitType = 'Gram' | 'Kilo' | 'Milliliter' | 'Liter' | 'Unit';

const VALID_UNITS: UnitType[] = ['Gram', 'Kilo', 'Milliliter', 'Liter', 'Unit'];
```

## Entity Schemas

### InventoryItem

```typescript
interface InventoryItem {
  PK: string;           // USER#<userId>
  SK: string;           // ITEM#<itemId>
  entityType: 'InventoryItem';
  itemId: string;
  userId: string;
  barcode?: string;
  name: string;
  category: string;
  expirationDate: string;  // ISO date, REQUIRED
  location: string;       // StorageLocation locationId
  quantity: number;
  unit: UnitType;          // Constrained to: Gram, Kilo, Milliliter, Liter, Unit
  brand?: string;
  whereToBuy?: string;
  onlineStoreLink?: string;
  pictureUrl?: string;     // S3 URL for item picture
  threshold?: number;
  isLowStock: boolean;     // true iff quantity <= threshold
  createdAt: string;
  updatedAt: string;
  syncVersion: number;
  GSI1PK?: string;      // USER#<userId>#CAT#<category> or USER#<userId>#LOC#<location>
  GSI1SK?: string;      // ITEM#<itemId>
}
```

### StorageLocation

```typescript
interface StorageLocation {
  PK: string;           // USER#<userId>
  SK: string;           // LOCATION#<locationId>
  entityType: 'StorageLocation';
  locationId: string;
  userId: string;
  name: string;         // User-facing display name, unique per user (case-insensitive)
  createdAt: string;
  updatedAt: string;
  syncVersion: number;
}
```

### Recipe

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

### MealPlan

```typescript
interface MealPlan {
  PK: string;           // USER#<userId>
  SK: string;           // MEAL#<date>#<mealType>#<planId>
  entityType: 'MealPlan';
  planId: string;
  userId: string;
  date: string;         // ISO date (YYYY-MM-DD)
  mealType: 'breakfast' | 'lunch' | 'dinner';
  recipeId: string;
  recipeName: string;   // Denormalized for display
  createdAt: string;
  updatedAt: string;
  syncVersion: number;
}
```

### Receipt

```typescript
interface Receipt {
  PK: string;           // USER#<userId>
  SK: string;           // RECEIPT#<receiptId>
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

| Method | Path | Lambda | Auth | Description |
|--------|------|--------|------|-------------|
| POST | /auth/verify | Auth | No | Verify Cognito token |
| GET | /inventory | Inventory | Yes | List all inventory items |
| POST | /inventory | Inventory | Yes | Add inventory item |
| PUT | /inventory/{itemId} | Inventory | Yes | Update inventory item |
| DELETE | /inventory/{itemId} | Inventory | Yes | Remove inventory item |
| GET | /inventory/low-stock | Inventory | Yes | Get items at or below threshold |
| GET | /inventory/search | Inventory | Yes | Search inventory for autocomplete (query: field, query) |
| POST | /inventory/barcode-lookup | Inventory | Yes | Lookup product by barcode (external API) |
| GET | /recipes | Recipe | Yes | List all recipes |
| POST | /recipes | Recipe | Yes | Create recipe |
| GET | /recipes/{recipeId} | Recipe | Yes | Get recipe with availability |
| PUT | /recipes/{recipeId} | Recipe | Yes | Update recipe |
| DELETE | /recipes/{recipeId} | Recipe | Yes | Delete recipe |
| GET | /meal-plans | MealPlan | Yes | Get meal plans (query: startDate, endDate) |
| POST | /meal-plans | MealPlan | Yes | Create meal assignment |
| PUT | /meal-plans/{planId} | MealPlan | Yes | Update assignment |
| DELETE | /meal-plans/{planId} | MealPlan | Yes | Remove assignment |
| POST | /shopping-list/generate | ShoppingList | Yes | Generate shopping list for date range |
| PUT | /shopping-list | ShoppingList | Yes | Update shopping list (manual edits) |
| POST | /receipts/upload | Receipt | Yes | Get presigned URL for upload |
| POST | /receipts/{receiptId}/process | Receipt | Yes | Trigger OCR processing |
| GET | /receipts/{receiptId}/status | Receipt | Yes | Check processing status |
| GET | /locations | StorageLocation | Yes | List user's storage locations |
| POST | /locations | StorageLocation | Yes | Create storage location |
| PUT | /locations/{locationId} | StorageLocation | Yes | Rename storage location |
| DELETE | /locations/{locationId} | StorageLocation | Yes | Remove storage location |
| POST | /sync | Sync | Yes | Batch sync operations |

## API Request/Response Interfaces

### Inventory

```typescript
// POST /inventory
interface AddInventoryRequest {
  name: string;
  category: string;
  expirationDate: string;  // ISO date, required
  locationId: string;
  quantity: number;
  unit: UnitType;          // Must be a valid UnitType value
  barcode?: string;
  brand?: string;
  whereToBuy?: string;
  onlineStoreLink?: string;
  pictureUrl?: string;
  threshold?: number;
}

// PUT /inventory/{itemId}
interface UpdateInventoryRequest {
  name?: string;
  category?: string;
  expirationDate?: string;
  locationId?: string;
  quantity?: number;
  unit?: UnitType;         // Validated against UnitType when provided
  barcode?: string;
  brand?: string;
  whereToBuy?: string;
  onlineStoreLink?: string;
  pictureUrl?: string;
  threshold?: number;
}

// GET /inventory response
interface ListInventoryResponse {
  items: InventoryItem[];
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
  items?: InventoryItem[];  // For barcode and name fields (returns full items)
  values?: string[];         // For category, brand, whereToBuy, onlineStoreLink (returns distinct values)
  count: number;             // Number of results (max 10)
}

// POST /inventory/barcode-lookup
interface BarcodeLookupRequest { barcode: string; }
interface BarcodeLookupResponse { found: boolean; product?: ProductInfo; }
```

### Storage Locations

```typescript
// GET /locations response
interface ListLocationsResponse { locations: StorageLocation[]; }

// POST /locations
interface CreateLocationRequest { name: string; }  // unique per user
interface CreateLocationResponse { location: StorageLocation; }

// PUT /locations/{locationId}
interface RenameLocationRequest { name: string; }  // unique per user

// DELETE /locations/{locationId}
// Returns 400 if location contains inventory items
// Returns 400 if it is the user's last remaining location
```

### Recipes

```typescript
// POST /recipes
interface CreateRecipeRequest {
  name: string;
  ingredients: RecipeIngredient[];  // at least one required
  instructions: string;
  sourceUrl?: string;
}

// GET /recipes/{recipeId} response
interface RecipeWithAvailability {
  recipe: Recipe;
  ingredientAvailability: IngredientStatus[];
  missingCount: number;
}
```

### Meal Plans

```typescript
// POST /meal-plans
interface CreateMealPlanRequest {
  date: string;       // ISO date
  mealType: 'breakfast' | 'lunch' | 'dinner';
  recipeId: string;
  recipeName: string; // Denormalized for display
}
```

### Shopping List

```typescript
// POST /shopping-list/generate
interface GenerateShoppingListRequest { startDate: string; endDate: string; }
interface ShoppingListResponse {
  items: ShoppingItem[];
  dateRange: { start: string; end: string };
}

// PUT /shopping-list
interface UpdateShoppingListRequest { items: ShoppingItem[]; }
```

### Receipts

```typescript
// POST /receipts/upload response
interface UploadUrlResponse { uploadUrl: string; receiptId: string; }

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

| Store | Key | Indexes |
|-------|-----|---------|
| inventoryItems | itemId | byCategory, byLocation, byLowStock, byExpirationDate, bySyncVersion |
| recipes | recipeId | byName, bySyncVersion |
| mealPlans | planId | byDate, bySyncVersion |
| syncQueue | id | byStatus, byTimestamp |
| storageLocations | locationId | byName, bySyncVersion |
| metadata | string key | — |
