# Data Model & API Contracts

This is the single source of truth for DynamoDB schemas, entity interfaces, API routes, and S3 structure. Feature specs should reference this file rather than redefining these models.

## DynamoDB Table Design

Single-table design pattern. Table name: `PantryApp`.

| Attribute   | Type   | Description                                                      |
| ----------- | ------ | ---------------------------------------------------------------- |
| PK          | String | Partition Key (e.g., `USER#<userId>`)                            |
| SK          | String | Sort Key (e.g., `ITEM#<itemId>`)                                 |
| GSI1PK      | String | GSI1 Partition Key                                               |
| GSI1SK      | String | GSI1 Sort Key                                                    |
| entityType  | String | Entity discriminator                                             |
| createdAt   | String | ISO timestamp                                                    |
| updatedAt   | String | ISO timestamp                                                    |
| syncVersion | Number | Revision counter; not universally enforced as an optimistic lock |

## Access Patterns

| Access Pattern               | PK                             | SK                           | Index                        |
| ---------------------------- | ------------------------------ | ---------------------------- | ---------------------------- |
| Get user's inventory items   | `USER#<userId>`                | `ITEM#` (begins_with)        | Main                         |
| Get single inventory item    | `USER#<userId>`                | `ITEM#<itemId>`              | Main                         |
| Get user's recipes           | `USER#<userId>`                | `RECIPE#` (begins_with)      | Main                         |
| Get single recipe            | `USER#<userId>`                | `RECIPE#<recipeId>`          | Main                         |
| Get meal plans by date       | `USER#<userId>`                | `MEAL#<date>#` (begins_with) | Main                         |
| Get user's storage locations | `USER#<userId>`                | `LOCATION#` (begins_with)    | Main                         |
| Get items by category        | `USER#<userId>#CAT#<category>` | `ITEM#`                      | GSI1                         |
| Get low-stock groups         | `USER#<userId>`                | `GROUP#` + isLowStock filter | Main                         |
| Check location occupancy     | `USER#<userId>`                | `ITEM#` + location filter    | Main (consistent, all pages) |

## Shared Types

Inventory list responses expose an opaque `lastEvaluatedKey`. The shared frontend reader
loads every page before returning a snapshot and rejects repeated cursors. The server
accepts only inventory keys in the authenticated partition, with integer page limits
from 1 to 1000 (default 50). Mutation bodies must be JSON objects. Malformed envelopes
and inventory cursors return 400 instead of dependency/internal errors.

Location queries read every page. Occupancy checks query the base table consistently
using the lot's `location` field. These checks are not atomic with concurrent inventory
writes; name uniqueness and last-location guarantees also require a future transaction
design. See the audit for the remaining consistency work.

### Language preferences

- Supported values: `en`, `es`, `it`; fallback: `en`.
- Account preference: Cognito standard `locale` attribute, read from the authenticated
  profile and updated through Cognito. No new DynamoDB entity or REST endpoint.
- Device preference: localStorage `pantry-language-v1:<userId>` (or `:guest` before login),
  `{ language, source: 'explicit' | 'account' | 'system' }`.
- Resolve device → account → supported browser language → English. Save account/system
  fallback on the device only after a successful account read (or while logged out).
- Existing user content, canonical unit keys, department values, and stored dates are
  preserved. Translation happens only at display time. See `../features/language/design.md`.

### UnitType

Units are defined once in `packages/domain/src/units.ts` and re-exported by the frontend/backend adapters,
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

### InventoryState

Each account lazily acquires one coordination row at `PK = USER#<userId>`,
`SK = INVENTORY_STATE`, `entityType = InventoryState`, with `createdAt`, `updatedAt`
and an integer `syncVersion` starting at 1. This permanent row is the optimistic lock
for **all** lot/group writes, including recipe placeholders and threshold edits.
It is not returned by inventory list queries. Never delete/reset it when inventory
becomes empty. It prevents a deleted and recreated group's revision from accepting
an older mutation plan.

The repository reads this revision first, then every item/group page consistently.
It writes the next revision conditionally in the same `TransactWriteItems` operation
as the lot and up to two affected groups. A conflicting revision cancels the entire
transaction. Totals are rebuilt from explicitly linked lots in the affected groups,
converting compatible units; expired lots still count for restock thresholds. Keeping
a lot in a group with incompatible units returns 400 and requires reassignment.
The inventory UI converts visible lots into the group's unit using the same shared
stock conversion rule; location-filtered totals remain totals of the visible subset.
Existing incompatible-unit groups display “mixed units” instead of a misleading sum.

PUT values are absolute: after a conflict, supplied fields are reapplied to the latest
item, preserving fields omitted by that request. Concurrent edits to the same supplied
field use the last committed value; client-supplied expected versions are not supported.

Only confirmed transaction cancellations caused by conditions or transaction conflicts
are replanned, with jitter and at most eight attempts. Exhaustion returns 409
`INVENTORY_CONFLICT`; other dependency failures retain their error classification.
Each exact transaction has a UUID `ClientRequestToken`, allowing SDK-level retries
of that same request. An ambiguous timeout/server response is never replanned by the
repository. Separate HTTP POST submissions remain distinct purchases; durable
cross-request purchase deduplication is not implemented. Clients must refresh/check
inventory after an uncertain purchase response before deciding to submit again.

This favors correctness for household-sized partitions: each attempt reads the user's
complete inventory and groups and concurrent writes to different groups still compete
on one account revision. It is not a high-throughput load-tested design. All writers
must participate; direct edits, old Lambda versions during rollout and unsupported
repair tools bypass the guarantee. Run read-only reconciliation after rollout.

See the [data-model audit](data-model-audit-2026-09.md) for redundancy ownership and
observed legacy/dangling records. Lot quantities are authoritative stock facts; group
totals and low-stock flags are materialized values maintained transactionally by the
shared repository. Explicit group membership survives recovery even if lot identity
differs. `npm run audit:inventory` checks these relationships without writing data.
The old group migration's `--apply` mode is retired because it overwrote whole rows,
explicit memberships and threshold units; its default mode now runs reconciliation.

Updating an unlinked legacy lot adopts only that lot into its default group, preserves
an existing group setting or carries its legacy threshold into a newly created group,
and removes obsolete lot-level warning fields. A zero-stock legacy warning maps to a
zero group threshold. Other unlinked lots are never guessed into that group. Existing
missing-location and missing-recipe references still require reviewed repair.

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
  expirationDate: string | null; // ISO date or explicit Not applicable
  icon?: string; // Optional product emoji, at most 32 UTF-16 code units
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
  GSI1PK?: string; // USER#<userId>#CAT#<category>; not a location index
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
  imageId?: string; // UUIDv4 of the optional header image
  instructionImageIds?: (string | null)[]; // aligned with instruction steps
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

### Receipt (planned; no deployed handler)

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

### SyncQueueItem (planned; IndexedDB is not implemented)

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

## Implemented API routes

| Method | Path                        | Lambda          | Auth | Description                                             |
| ------ | --------------------------- | --------------- | ---- | ------------------------------------------------------- |
| POST   | /auth/verify                | Auth            | No   | Verify Cognito token                                    |
| GET    | /inventory                  | Inventory       | Yes  | List all inventory items                                |
| POST   | /inventory                  | Inventory       | Yes  | Add inventory item                                      |
| PUT    | /inventory/{itemId}         | Inventory       | Yes  | Update inventory item                                   |
| DELETE | /inventory/{itemId}         | Inventory       | Yes  | Remove inventory item                                   |
| GET    | /inventory/low-stock        | Inventory       | Yes  | Get groups at or below threshold                        |
| PUT    | /inventory/groups/{groupId} | Inventory       | Yes  | Set or clear a group low-stock threshold                |
| GET    | /inventory/search           | Inventory       | Yes  | Search inventory for autocomplete (query: field, query) |
| POST   | /inventory/barcode-lookup   | Inventory       | Yes  | Lookup product by barcode (external API)                |
| GET    | /recipes                    | Recipe          | Yes  | List all recipes                                        |
| POST   | /recipes                    | Recipe          | Yes  | Create recipe                                           |
| GET    | /recipes/tags               | Recipe          | Yes  | Get all distinct tags across user's recipes             |
| GET    | /recipes/{recipeId}         | Recipe          | Yes  | Get recipe with availability                            |
| PUT    | /recipes/{recipeId}         | Recipe          | Yes  | Update recipe                                           |
| DELETE | /recipes/{recipeId}         | Recipe          | Yes  | Delete recipe                                           |
| GET    | /meal-plans                 | MealPlan        | Yes  | Get meal plans (query: startDate, endDate)              |
| POST   | /meal-plans                 | MealPlan        | Yes  | Create meal assignment                                  |
| PUT    | /meal-plans                 | MealPlan        | Yes  | Set servings on all assignments from startDate onward   |
| PUT    | /meal-plans/{planId}        | MealPlan        | Yes  | Update assignment                                       |
| DELETE | /meal-plans/{planId}        | MealPlan        | Yes  | Remove assignment                                       |
| GET    | /locations                  | StorageLocation | Yes  | List user's storage locations                           |
| POST   | /locations                  | StorageLocation | Yes  | Create storage location                                 |
| PUT    | /locations/{locationId}     | StorageLocation | Yes  | Rename storage location                                 |
| DELETE | /locations/{locationId}     | StorageLocation | Yes  | Remove storage location                                 |

## API Request/Response Interfaces

### Inventory

```typescript
// POST /inventory
interface AddInventoryRequest {
  name: string;
  category: string;
  expirationDate: string | null; // ISO date or explicit Not applicable
  icon?: string;
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
  expirationDate?: string | null; // null explicitly marks Not applicable
  icon?: string; // empty string restores the default icon
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

Groups with zero-quantity lots remain linked. Deleting the last lot removes an empty
unconfigured group; configured empty groups remain for restock reminders. Clearing
the threshold of an empty group deletes it and returns no `group` field. Clients
remove that group from their local state. Reassignment returns both remaining affected
groups and can notify a low-stock transition in the source group as stock leaves it.

Autocomplete searches read all inventory pages and return the latest created lot per
barcode (or canonical product identity without barcode), capped at ten suggestions.
Adding another lot copies saved quantity, unit, expiration (including null), icon, photo, and location details; group threshold
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

Recipe create/update still creates zero-quantity placeholders for names absent from
inventory (case-insensitive), using the shared transactional writer. Repeated names
and concurrent recipe saves do not create duplicate placeholders. New placeholders
have a group, category/index `Uncategorized`, canonical unit, and a real storage
location: existing `Limbo Pantry` is reused, otherwise `LOCATION#unknown` is created
with that name. A newly created placeholder group has threshold 0; existing group
preferences win. Low-stock fields are never stored on the new lot. The location,
lot, group and inventory revision commit together. Location name uniqueness and
concurrent deletion guards outside this writer are still not fully atomic.

Recipe persistence and its placeholder transactions remain separate: a later failure
can leave a saved recipe and some completed placeholders. Each placeholder is atomic;
retrying recipe PUT completes missing names without duplicating them. Recipe POST
itself has no cross-request idempotency contract. This is not an atomic recipe-plus-
inventory transaction.

```typescript
// POST /recipes
interface CreateRecipeRequest {
  imageId?: string;
  instructionImageIds?: (string | null)[];
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
  imageId?: string | null;
  instructionImageIds?: (string | null)[] | null;
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
`docs/features/shopping-list/requirements.md` and `design.md`.

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

### Receipts (planned API)

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

### Sync (planned API)

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
  body: string; // JSON-encoded { error, message, ...endpointSpecificFields }; requestId is not universal
}
```

## Recipe photos (implemented)

Authenticated `POST /recipe-images` accepts `{ dataUrl }` for JPEG, PNG or WebP,
validates base64, file signatures and a 1 MB decoded limit, and returns `201 { imageId }`.
The browser accepts original files up to 20 MB, resizes their longest edge to at most
1600px, and converts them to bounded JPEG before upload. Recipe rows store UUIDv4
references only. No DynamoDB image binary or publicly accessible bucket is introduced.

Authenticated `GET /recipe-images/{imageId}` checks the object in the requesting
account's prefix and returns `{ url }`, an S3 download URL valid for one hour.
Missing objects return 404; malformed IDs/uploads return 400. The existing private,
retained storage bucket uses `recipe-images/{userId}/{imageId}`. The Recipe Lambda
receives read/put permissions on that prefix. It cannot accept a caller-supplied user
prefix or arbitrary S3 key. Signed URLs are temporary bearer URLs; they are not persisted.

Optional `imageId` and `instructionImageIds` are supported on recipe create/update.
The latter must align with the instructions supplied in the same request; null entries
mean no image for that step. Explicit null removes either optional attribute on PUT.
Updating instructions without supplying their image array clears previous step links,
so older clients cannot leave images attached to the wrong steps. Other partial edits
preserve references. Legacy string instructions count as one step.

Removing/replacing photos or deleting/canceling a recipe removes references only;
uploaded objects remain private in retained storage. Orphan cleanup is not implemented.
Uploads and recipe writes are separate operations, so failed saves can reuse uploaded
IDs. Retry of an uncertain upload may create an additional unreferenced object.

## Planned S3 object layout (other features)

```
pantry-app-storage-{env}/
├── receipts/{userId}/{receiptId}.{jpg|png}
├── inventory-items/{userId}/{itemId}.{jpg|png}
└── exports/{userId}/{exportId}.json
```

## Planned IndexedDB schema (not implemented)

Database: `PantryAppDB`, Version: 2

| Store            | Key        | Indexes                                                             |
| ---------------- | ---------- | ------------------------------------------------------------------- |
| inventoryItems   | itemId     | byCategory, byLocation, byLowStock, byExpirationDate, bySyncVersion |
| recipes          | recipeId   | byName, bySyncVersion                                               |
| mealPlans        | planId     | byDate, bySyncVersion                                               |
| syncQueue        | id         | byStatus, byTimestamp                                               |
| storageLocations | locationId | byName, bySyncVersion                                               |
| metadata         | string key | —                                                                   |

## Shopping companion local state

`pantry-companion-v1:<userId>` stores manual entries, product preferences, deferred
items, generated carry-forward rows, up to 500 purchases, optional budgets and
explicit purchased-lot conversions. Existing `pantry-shopping-v1` period basket
keys remain compatible. These are device-local, not DynamoDB entities or shared
household data. No new backend endpoints are introduced.

PurchasePage uses POST /inventory and the returned itemId before completing the
local list. Full AddItemData fields are editable. Explicit incompatible-unit or
renamed-product conversions track the actual lot's remaining quantity and expiration
for shopping calculations; they do not rewrite inventory or recipe records. A failed
local save after successful POST never triggers another POST. Photos are validated
JPG/PNG/WebP up to 250 KB and encoded into the existing pictureUrl field.

Threshold remains the inventory warning trigger. Optional shopping reserve is stored
in the row's canonical unit (g/ml/etc). Purchase quantity covers meal shortfall plus
reserve deficit after allocated usable stock, plus explicit manual additions. See
`../features/shopping-list/second-brain.md` for the complete contract.

## Reserved routes (not deployed)

These designs do not describe callable endpoints.

| Method | Path                          | Lambda       | Auth | Intended behavior                     |
| ------ | ----------------------------- | ------------ | ---- | ------------------------------------- |
| POST   | /shopping-list/generate       | ShoppingList | Yes  | Generate shopping list for date range |
| PUT    | /shopping-list                | ShoppingList | Yes  | Update shopping list (manual edits)   |
| POST   | /receipts/upload              | Receipt      | Yes  | Get presigned URL for upload          |
| POST   | /receipts/{receiptId}/process | Receipt      | Yes  | Trigger OCR processing                |
| GET    | /receipts/{receiptId}/status  | Receipt      | Yes  | Check processing status               |
| POST   | /sync                         | Sync         | Yes  | Batch sync operations                 |

## Inventory expiration and icons (issues #11–#12)

An explicit `expirationDate: null` means Not applicable. Creation still requires
this field: omitted or empty dates are invalid. Date strings must be real calendar
dates in YYYY-MM-DD format. PUT omission preserves the value; null clears a date
to Not applicable. Existing dated records need no migration. Icons are optional
lot metadata; omitted PUT values preserve them and an empty string restores the
box fallback. Photos retain display precedence over the placeholder icon.

Non-expiring lots count toward shopping availability and reserve stock, after dated
lots are allocated. They never enter expiring-soon filters or warnings. Missing or
empty legacy dates are still unknown, not implicitly non-expiring.

## Planner contract version 2 (issue #13)

Canonical runtime-neutral types are in `packages/domain/src/planner.ts`. Existing
`MEAL#<date>#<mealType>#<planId>` keys/IDs remain unchanged. Missing `entryType` means
`recipe`; legacy missing servings use recipe yield when displayed. New assignments
store explicit portions, including compatible positive fractions. Missing kcal is unknown.

- `PlannerEntry` extends meal assignments with `contractVersion: 2`, optional `entryType`
  (`recipe`, `leftovers`, `eating-out`, `custom`, `leftovers-note`), `notes`,
  `kcalPerPortion`, `batchId` and `consumed`. Non-recipe notes use an empty recipe ID and
  store their title in `recipeName` for compatibility with calendar consumers.
- Recipes gain optional `totalKcal` (finite, nonnegative; null removes it on PUT).
  Recipe yield remains the single per-portion divisor. Ordinary assignments refresh
  their displayed nutrition when recipes reload. Prepared batches freeze kcal/portion
  from the authenticated recipe at confirmation, rather than trusting the client.
- `CookingBatch` stores source assignment/recipe IDs and name, cooking date,
  `plannedYield`, status `planned|prepared`, optional actual yield/preparation date/
  storage/use-by/kcal per portion, total consumed/discarded, and a server-owned
  `consumedAllocations` ledger. Allocations live on meal entries. Uneaten entries reserve
  portions; eating records consumption once. Removing/restoring an eaten entry retains
  the ledger, preventing double consumption. Prepared batches cannot be deleted or
  changed back to planned. Cooking does not mutate raw inventory.
- `FavoriteWeek` stores ID, name, entries with day offsets 0–6 and included planned
  batches. Applying creates new entry/batch IDs and clears consumption/prepared status.
  An omitted cooking source or unavailable recipe blocks the preview.

`GET /meal-plans?view=workspace` returns the complete `PlannerSnapshot` (version,
revision, mealPlans, batches, favorites). Date-range GET retains `mealPlans` and adds
all batch metadata so shopping resolves dependencies outside the selected dates.

`POST /meal-plans` also accepts `{ action: 'change', change: PlannerChange }`, containing
an operation ID, expected revision, upsert arrays and removal ID arrays. All writes,
including legacy CRUD/bulk routes, use a conditional transaction coordinated by the
permanent `USER#<userId>/PLANNER_STATE` row. This row stores revision, version, batches
and favorites (maximum serialized metadata 350 KB). Reads check the revision before
and after all meal pages. Conflicts return 409, validation returns 400, and foreign
assignment lookups through legacy routes return 404. Upserts are always scoped to the
verified caller's partition, never a body user ID.

`PLANNER_OP#<operationId>` is a durable receipt with a request fingerprint and committed
revision. Identical retries read saved state; changed payloads cannot reuse a receipt.
`{ action: 'reconcile', change }` returns saved state or atomically writes a cancellation
receipt plus a revision fence. This prevents a delayed request from committing after
the user resumes editing. Undo is an inverse mutation against the saved revision; it
cannot overwrite intervening edits. A response reflecting a later revision offers no Undo.

Operations accept at most 90 records per array and 98 changed meal rows (a date move
uses two), reserving transaction slots for revision and receipt. Oversized changes fail
before persistence. Legacy bulk servings now completes atomically and excludes batch-linked
entries; those need individual allocation review. There is no offline mutation queue.

## Recipe import drafts (issue #14)

Authenticated `POST /recipe-import` returns a draft, never a recipe or inventory write.
`{action:'recipe',url}` (action optional) fetches a public HTTPS page and interprets
its text with Bedrock. Shared `RecipeImportDraft` has name, ingredients (name, nullable
quantity, canonical-or-empty unit, original line), steps, optional yield/times/source/
image URL, extracted text, warnings and method `bedrock|metadata|ocr`. Imported data
must pass existing recipe POST validation after explicit confirmation.

`{action:'photo',dataUrl}` accepts JPG/PNG/WebP base64 up to 1.4 MB encoded, prepared
by the existing browser converter. Bedrock returns `{draft}`; model unavailability or
unreadable output returns `{fallback:'ocr',message}` without saving. The browser offers
on-device recognition. The source photo is not automatically retained in S3.

`{action:'image',url}` returns `{dataUrl}` for an optional source image after a user
permission choice; normal `/recipe-images` stores the private reference. HTML is
bounded to 2 MB, images to 1 MB, URLs to 2048 characters, redirects to three and fetch
time to 6.5 seconds. HTTPS requests reject userinfo/nonstandard ports/non-public DNS
results and pin the validated address. Bedrock uses 17 seconds, one attempt, 35,000
source characters and 4,000 output tokens. Incomplete output falls back explicitly.
Model-returned URLs are never trusted or fetched.

The Recipe Lambda has 28 seconds total execution and can invoke only the regional
`amazon.nova-lite-v1:0` model. Missing model access does not disable manual creation
or metadata/OCR fallback. No persisted schema migration is required.
