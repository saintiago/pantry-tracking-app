# Design Document: Recipe Categories (Tags)

## Overview

This feature adds a tag-based category system to recipes. Every recipe must carry at least one tag. Tags are free-text labels that are always stored and displayed in lowercase. Users enter tags via a dedicated `TagInput` component that renders committed tags as chips and offers autocomplete suggestions drawn from all existing recipe tags. The recipe list gains a `TagCloud` filter control and per-row chip display; the recipe detail view gains a read-only chip section.

The feature touches five layers:

1. **Data model** — add `tags: string[]` to the `Recipe` entity (frontend type + DynamoDB item)
2. **API client** — extend `createRecipe` / `updateRecipe` parameter types; add `fetchRecipeTags`
3. **Backend** — add `validateTags` + normalization; wire into `createRecipe` and `updateRecipe`; add `GET /recipes/tags` endpoint
4. **New component** — `TagInput` (chip row + text input + inline autocomplete dropdown)
5. **Existing components** — `RecipeEditor`, `RecipeList`, `RecipeDetail`, `RecipesPage`

---

## Architecture

```
RecipesPage
├── RecipeList          ← adds TagCloud + per-row chips + activeTagFilters state
├── RecipeDetail        ← adds read-only tag chips section
└── RecipeEditor        ← adds TagInput field + tags validation
      └── TagInput      ← NEW: chips + text input + autocomplete dropdown

frontend/src/api/recipes/recipes.ts   ← Recipe interface + createRecipe/updateRecipe types + fetchRecipeTags
backend/src/handlers/recipe/recipe.ts ← validateTags + normalizeTags + handler wiring + listRecipeTags
```

### Data flow for `allTags`

`RecipesPage` fetches tags independently via a dedicated `GET /recipes/tags` endpoint. The fetch fires on mount in parallel with the recipe list fetch and does not block page render.

```
RecipesPage mounts
  → fires fetchRecipeTags() in parallel with recipe list fetch (non-blocking)
  → stores result in allTags state
  → passes allTags down to RecipeList and RecipeEditor
```

---

## Components and Interfaces

### 1. Recipe API Client (`frontend/src/api/recipes/recipes.ts`)

Add `tags` to the `Recipe` interface and both mutation parameter types:

```typescript
export interface Recipe {
  recipeId: string;
  userId: string;
  name: string;
  tags: string[];           // NEW — required, non-empty
  ingredients: RecipeIngredient[];
  instructions: string;
  sourceUrl?: string;
  prepTime?: number;
  cookTime?: number;
  portions?: number;
  createdAt: string;
  updatedAt: string;
  syncVersion: number;
}

// createRecipe — tags is now part of the Omit<Recipe, ...> type automatically
// updateRecipe — add tags to the partial update type:
export async function updateRecipe(
  recipeId: string,
  data: Partial<Pick<Recipe, 'name' | 'ingredients' | 'instructions' | 'sourceUrl' | 'portions' | 'tags'>> & {
    prepTime?: number | null;
    cookTime?: number | null;
  },
): Promise<Recipe>
```

`tags` is non-optional on `Recipe` because every recipe must have at least one tag. The `createRecipe` parameter type is `Omit<Recipe, 'recipeId' | 'userId' | 'createdAt' | 'updatedAt' | 'syncVersion'>`, so `tags` is automatically included and required.

Add a dedicated function for fetching all distinct tags:

```typescript
/**
 * Fetches all distinct tags across all of the user's recipes.
 * Returns a sorted, deduplicated, lowercased array of tag strings.
 */
export async function fetchRecipeTags(): Promise<string[]>
```

This calls `GET /recipes/tags` and returns the `tags` array from the response body.

### 2. TagInput Component (`frontend/src/components/TagInput/TagInput.tsx`)

A self-contained component that manages chip display, text input, and autocomplete.

```typescript
interface TagInputProps {
  tags: string[];                    // current committed tags
  onChange: (tags: string[]) => void; // called whenever tags change
  allTags: string[];                 // all existing tags across all recipes (for autocomplete)
  tagsLoading: boolean;              // NEW — disables autocomplete while tags are loading
  error?: string;                    // validation error message
}
```

**Internal state:**

```typescript
const [inputValue, setInputValue] = useState('');
const [autocompleteOpen, setAutocompleteOpen] = useState(false);
```

**Layout:**

```
┌─────────────────────────────────────────────┐
│ [vegetarian ×] [quick ×] [dessert ×]        │  ← chips row (above input)
│ ┌─────────────────────────────────────────┐ │
│ │ Add a tag…                              │ │  ← text input
│ └─────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────┐ │
│ │ pasta                                   │ │  ← autocomplete dropdown (absolute)
│ │ quick                                   │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

**Chip style:**

```typescript
const chipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.25rem',
  backgroundColor: '#dbeafe',
  color: '#1e40af',
  borderRadius: 16,
  fontWeight: 600,
  fontSize: '0.875rem',
  padding: '0.2rem 0.5rem',
};
```

**Delimiter keys:** `Enter`, `,`, `;`, `.` — on keydown, if the current `inputValue` (trimmed + lowercased) is non-empty and not already in `tags`, commit it as a new tag and clear the input. If it is a duplicate, silently discard and clear.

**Autocomplete behaviour:**

- On `focus`: open dropdown showing `allTags.filter(t => !tags.includes(t))`, up to 10 items
- On `input change`: filter `allTags` by case-insensitive substring match against `inputValue`, exclude already-selected tags, show up to 10
- On `Escape`: close dropdown without committing
- On item click (`mousedown`): commit that tag, keep focus on input, close dropdown
- Click outside: close dropdown
- When `tagsLoading` is `true`: autocomplete dropdown is disabled (does not open on focus or typing); input placeholder changes to `"Loading tags…"` instead of `"Add a tag…"`; normal autocomplete behaviour resumes once `tagsLoading` becomes `false`

**Autocomplete dropdown** is a simple `<ul>` positioned `absolute` below the input (no reuse of `AutocompleteDropdown` component — the interaction model differs):

```typescript
const dropdownStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  right: 0,
  backgroundColor: '#ffffff',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
  maxHeight: 200,
  overflowY: 'auto',
  zIndex: 1000,
  marginTop: 4,
  listStyle: 'none',
  margin: 0,
  padding: 0,
};
```

**Accessibility:**

- Input has `role="combobox"`, `aria-expanded`, `aria-autocomplete="list"`, `aria-controls` pointing to the dropdown `id`
- Dropdown has `role="listbox"`
- Each suggestion item has `role="option"`, `aria-selected`
- Remove button has `aria-label="Remove tag {tagName}"`

### 3. RecipeEditor (`frontend/src/pages/RecipesPage/RecipeEditor.tsx`)

**Props change:**

```typescript
interface RecipeEditorProps {
  recipeId?: string;
  onSaved: (recipeId: string) => void;
  onCancel: () => void;
  allTags: string[];      // passed from RecipesPage
  tagsLoading: boolean;   // NEW — passed from RecipesPage
}
```

**State additions:**

```typescript
const [tags, setTags] = useState<string[]>([]);
```

**FormErrors addition:**

```typescript
interface FormErrors {
  // ... existing fields ...
  tags?: string;
}
```

**Pre-population in edit mode** (inside the `fetchRecipeWithAvailability` `.then()` block):

```typescript
setTags(recipe.tags ?? []);
```

**Placement:** `TagInput` is rendered below the recipe name field and above the instructions field.

```tsx
{/* Tags */}
<div style={styles.fieldGroup}>
  <label style={styles.label}>
    Tags <span aria-hidden="true">*</span>
  </label>
  <TagInput
    tags={tags}
    onChange={(newTags) => {
      setTags(newTags);
      setErrors((prev) => ({ ...prev, tags: undefined }));
    }}
    allTags={allTags}
    tagsLoading={tagsLoading}
    error={errors.tags}
  />
</div>
```

**Validation addition** (inside `validate()`):

```typescript
if (tags.length === 0) errs.tags = 'At least one tag is required.';
```

**Submit inclusion:**

```typescript
// createRecipe
await createRecipe({ ...baseData, ...createTimeFields, portions: Number(portions), tags });

// updateRecipe
await updateRecipe(recipeId, { ...baseData, ...timeFields, portions: selectedPortions, tags });
```

### 4. RecipeList (`frontend/src/pages/RecipesPage/RecipeList.tsx`)

**Props change:**

```typescript
interface RecipeListProps {
  onSelect: (recipeId: string) => void;
  onNew: () => void;
  allTags: string[];        // passed from RecipesPage
  tagsLoading: boolean;     // NEW — passed from RecipesPage
  // onRecipesLoaded REMOVED — RecipesPage fetches tags independently
}
```

**State additions:**

```typescript
const [activeTagFilters, setActiveTagFilters] = useState<string[]>([]);
```

**Derived values:**

```typescript
// allDistinctTags comes from the allTags prop (fetched by RecipesPage via GET /recipes/tags)
// Used directly for the TagCloud display

// Filter by name search AND active tag filters (AND logic)
const filtered = useMemo(
  () =>
    recipes
      .filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))
      .filter((r) => activeTagFilters.every((t) => (r.tags ?? []).includes(t))),
  [recipes, search, activeTagFilters],
);
```

**TagCloud section** (rendered between search input and recipe list; hidden when `allTags.length === 0`; shows an inline spinner while `tagsLoading` is `true`):

```tsx
{tagsLoading ? (
  <div style={styles.tagCloudSpinner} role="status" aria-label="Loading tags…">
    <span style={styles.spinnerDot} />  {/* CSS animation spinner */}
    <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>Loading tags…</span>
  </div>
) : allDistinctTags.length > 0 ? (
  <div style={styles.tagCloud} role="group" aria-label="Filter by tag">
    {allDistinctTags.map((tag) => {
      const isActive = activeTagFilters.includes(tag);
      return (
        <button
          key={tag}
          type="button"
          onClick={() =>
            setActiveTagFilters((prev) =>
              isActive ? prev.filter((t) => t !== tag) : [...prev, tag],
            )
          }
          style={isActive ? styles.tagCloudButtonActive : styles.tagCloudButtonInactive}
          aria-pressed={isActive}
        >
          {tag}
        </button>
      );
    })}
  </div>
) : null}
```

Where `allDistinctTags` is the `allTags` prop passed from `RecipesPage`.

**Tag cloud button styles:**

```typescript
tagCloudButtonInactive: {
  backgroundColor: '#dbeafe',
  color: '#1e40af',
  border: 'none',
  borderRadius: 16,
  padding: '0.25rem 0.75rem',
  fontSize: '0.8125rem',
  fontWeight: 600,
  cursor: 'pointer',
  minHeight: 32,
},
tagCloudButtonActive: {
  backgroundColor: '#1e40af',
  color: '#ffffff',
  border: 'none',
  borderRadius: 16,
  padding: '0.25rem 0.75rem',
  fontSize: '0.8125rem',
  fontWeight: 600,
  cursor: 'pointer',
  minHeight: 32,
},
tagCloudSpinner: {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.5rem 0',
},
```

**Per-row tag chips** (rendered below the recipe name inside each `<button>` row):

```tsx
{(recipe.tags ?? []).length > 0 && (
  <div style={styles.tagChipRow}>
    {recipe.tags.map((tag) => (
      <span key={tag} style={styles.tagChip}>{tag}</span>
    ))}
  </div>
)}
```

**Empty state when filters active:**

```tsx
{filtered.length === 0 && activeTagFilters.length > 0 && (
  <p style={styles.statusText}>No recipes match the selected tags.</p>
)}
```

### 5. RecipeDetail (`frontend/src/pages/RecipesPage/RecipeDetail.tsx`)

Add a read-only tag chips section below the page title and above the time section:

```tsx
{/* Tags */}
{(recipe.tags ?? []).length > 0 && (
  <section style={styles.tagsSection} aria-label="Recipe tags">
    {recipe.tags.map((tag) => (
      <span key={tag} style={styles.tagChip}>{tag}</span>
    ))}
  </section>
)}
```

**Style:**

```typescript
tagsSection: {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.4rem',
},
tagChip: {
  backgroundColor: '#dbeafe',
  color: '#1e40af',
  borderRadius: 16,
  fontWeight: 600,
  fontSize: '0.875rem',
  padding: '0.2rem 0.5rem',
},
```

No remove button — read-only display only.

### 6. RecipesPage (`frontend/src/pages/RecipesPage/RecipesPage.tsx`)

Fetch tags independently on mount, in parallel with the recipe list fetch:

```typescript
const [allTags, setAllTags] = useState<string[]>([]);
const [tagsLoading, setTagsLoading] = useState(true);

// On mount — fires in parallel with recipe list fetch, does NOT block page render
useEffect(() => {
  fetchRecipeTags()
    .then(setAllTags)
    .catch(() => {}) // silent fail — autocomplete just won't have suggestions
    .finally(() => setTagsLoading(false));
}, []);
```

Pass `allTags` and `tagsLoading` to `RecipeList` and `RecipeEditor`:

```tsx
// list view
<RecipeList
  onSelect={...}
  onNew={...}
  allTags={allTags}
  tagsLoading={tagsLoading}
/>

// editor-new
<RecipeEditor
  onSaved={...}
  onCancel={...}
  allTags={allTags}
  tagsLoading={tagsLoading}
/>

// editor-edit
<RecipeEditor
  recipeId={view.recipeId}
  onSaved={...}
  onCancel={...}
  allTags={allTags}
  tagsLoading={tagsLoading}
/>
```

---

## Data Models

### Frontend — `Recipe` interface

```typescript
// frontend/src/api/recipes/recipes.ts
export interface Recipe {
  recipeId: string;
  userId: string;
  name: string;
  tags: string[];           // required, non-empty array of lowercase strings
  ingredients: RecipeIngredient[];
  instructions: string;
  sourceUrl?: string;
  prepTime?: number;
  cookTime?: number;
  portions?: number;
  createdAt: string;
  updatedAt: string;
  syncVersion: number;
}
```

### Backend — DynamoDB Recipe item

The `tags` field is stored as a DynamoDB `List` of `String` values. No schema migration is needed — DynamoDB is schemaless; existing items without `tags` will return `undefined` for the field, which the frontend handles with `recipe.tags ?? []`.

```typescript
// Stored on the DynamoDB item:
tags: string[]   // normalized: trimmed, lowercased, deduplicated
```

### Backend — `validateTags` pure function

```typescript
/**
 * Validates the tags field in a parsed request body.
 * Returns an error string if tags is absent, not an array, or empty after normalization.
 * Returns null if valid.
 */
export function validateTags(parsed: Record<string, unknown>): string | null {
  if (parsed.tags === undefined || parsed.tags === null) {
    return 'tags is required';
  }
  if (!Array.isArray(parsed.tags)) {
    return 'tags must be an array';
  }
  const normalized = normalizeTags(parsed.tags as unknown[]);
  if (normalized.length === 0) {
    return 'At least one tag is required';
  }
  return null;
}

/**
 * Normalizes a raw tags input: trims, lowercases, filters empty strings, deduplicates.
 * Pure function — no side effects.
 */
export function normalizeTags(raw: unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const normalized = item.trim().toLowerCase();
    if (normalized.length === 0) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}
```

### Backend — `createRecipe` handler changes

After existing validations, add:

```typescript
const tagsError = validateTags(parsed);
if (tagsError) {
  return response(400, {
    error: 'VALIDATION_ERROR',
    message: tagsError,
    details: [{ field: 'tags', message: tagsError }],
  });
}

const normalizedTags = normalizeTags(parsed.tags as unknown[]);

// In the recipe object:
recipe.tags = normalizedTags;
```

### Backend — `updateRecipe` handler changes

After existing validations, add:

```typescript
if (parsed.tags !== undefined) {
  const tagsError = validateTags(parsed);
  if (tagsError) {
    return response(400, {
      error: 'VALIDATION_ERROR',
      message: tagsError,
      details: [{ field: 'tags', message: tagsError }],
    });
  }
  const normalizedTags = normalizeTags(parsed.tags as unknown[]);
  const alias = '#f_tags';
  const valAlias = ':v_tags';
  expressionAttrNames[alias] = 'tags';
  expressionAttrValues[valAlias] = normalizedTags;
  updateParts.push(`${alias} = ${valAlias}`);
}
```

### Backend — `listRecipeTags` handler

New route handler for `GET /recipes/tags`. Must be registered in the route dispatcher **before** `GET /recipes/{recipeId}` to avoid the `recipeId` path segment matching the literal string `"tags"`.

```typescript
/**
 * GET /recipes/tags
 * Returns all distinct tags across all of the user's recipes.
 * Uses a ProjectionExpression to fetch only the tags field — does not load full recipe data.
 */
export async function listRecipeTags(userId: string): Promise<{ tags: string[] }> {
  // Query: PK = USER#<userId>, SK begins_with RECIPE#
  // ProjectionExpression: tags
  // Flatten all tags arrays, deduplicate, lowercase, sort alphabetically
  // Returns { tags: string[] }
}
```

Response body: `{ tags: string[] }` — a sorted, deduplicated, lowercased array.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Tag normalization idempotence

*For any* array of strings, applying `normalizeTags` twice should produce the same result as applying it once. The output should contain no two tags that are equal when compared case-insensitively, and every output tag should be lowercase with no leading or trailing whitespace.

**Validates: Requirements 7.4, 7.5, 8.1**

### Property 2: Tag filter AND correctness

*For any* array of recipes and any set of active filter tags, the result of filtering by those tags should contain a recipe if and only if the recipe's `tags` array contains every tag in the active filter set (case-sensitive match on already-normalized lowercase tags).

**Validates: Requirements 6.2, 8.2**

### Property 3: Filter result is a subset

*For any* array of recipes and any active filter set, every recipe in the filtered result should also appear in the original unfiltered list.

**Validates: Requirements 8.3**

### Property 4: Empty filter returns full list

*For any* array of recipes, filtering with an empty active filter set should return all recipes unchanged.

**Validates: Requirements 6.4, 8.4**

### Property 5: Backend rejects empty tags

*For any* otherwise-valid `POST /recipes` request body where `tags` is absent, an empty array, or an array of only whitespace strings, the handler should return a 400 response with `error: 'VALIDATION_ERROR'` and a `details` entry for the `tags` field.

**Validates: Requirements 1.2**

### Property 6: Backend rejects empty tags on update

*For any* `PUT /recipes/{recipeId}` request body where `tags` is present but empty (or all-whitespace), the handler should return a 400 response with `error: 'VALIDATION_ERROR'`.

**Validates: Requirements 1.3**

### Property 7: Committed tags are always lowercase

*For any* non-empty string input committed via a delimiter key in `TagInput`, the resulting tag in the `tags` array should equal the trimmed, lowercased version of the input.

**Validates: Requirements 2.2**

### Property 8: Deduplication prevents duplicate chips

*For any* existing `tags` array and any input string whose trimmed+lowercased value already exists in `tags`, committing that input should leave the `tags` array unchanged (no duplicate added).

**Validates: Requirements 2.4**

### Property 9: Autocomplete suggestions are bounded and filtered

*For any* `allTags` array and any `inputValue` string, the autocomplete suggestions should be a subset of `allTags` that (a) contain `inputValue` as a case-insensitive substring, (b) exclude tags already in the current `tags` array, and (c) number at most 10.

**Validates: Requirements 4.1, 4.4, 4.6**

### Property 10: Tag cloud shows sorted distinct tags

*For any* array of recipes, the tags displayed in the `TagCloud` should equal the sorted, deduplicated union of all `recipe.tags` arrays across all recipes.

**Validates: Requirements 6.1**

---

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | /recipes/tags | Returns all distinct tags across all user's recipes |

(All other recipe routes are unchanged — see `data-model.md` for the full route table.)

---

## Error Handling

| Condition | Layer | Response |
|-----------|-------|----------|
| `tags` absent or empty on `POST /recipes` | Backend | 400 `VALIDATION_ERROR`, `details[{field:'tags'}]` |
| `tags` empty array on `PUT /recipes/{recipeId}` | Backend | 400 `VALIDATION_ERROR`, `details[{field:'tags'}]` |
| `tags` not an array | Backend | 400 `VALIDATION_ERROR` |
| Tags field empty in RecipeEditor form | Frontend | Inline error: "At least one tag is required." |
| Recipe fetch fails in edit mode | Frontend | Existing error banner pattern |
| `recipe.tags` missing on old records | Frontend | `recipe.tags ?? []` — graceful fallback, no crash |
| `GET /recipes/tags` fails | Frontend | Silent fail — `allTags` stays `[]`, autocomplete has no suggestions, `tagsLoading` set to `false` |

Existing error handling patterns (401, 404, 500, DynamoDB errors) are unchanged.

---

## Testing Strategy

### Unit tests

**`frontend/src/components/TagInput/__tests__/TagInput.test.tsx`**

- Renders chips for each tag in `tags` prop
- Pressing Enter commits trimmed+lowercased input as a chip
- Pressing `,`, `;`, `.` commits the current input
- Pressing Escape closes the autocomplete without committing
- Clicking a suggestion commits that tag and clears the input
- Clicking the remove button on a chip removes that tag
- Remove button has `aria-label="Remove tag {tagName}"`
- Duplicate input is silently discarded
- Empty/whitespace input is not committed
- On focus, autocomplete shows all `allTags` not in `tags` (up to 10)
- Error message is rendered when `error` prop is set

**`frontend/src/components/TagInput/__tests__/TagInput.property.test.tsx`**

Property-based tests using fast-check (minimum 100 iterations each):

- Property 7: For any non-empty string, committing via delimiter produces a lowercase trimmed tag
- Property 8: For any tags array and any duplicate input, the array is unchanged after commit attempt
- Property 9: For any allTags and inputValue, suggestions are bounded ≤ 10, filtered by substring, and exclude current tags

**`backend/src/handlers/recipe/__tests__/recipe.test.ts`** (additions)

- `POST /recipes` with valid `tags` returns 201 with normalized tags
- `POST /recipes` with absent `tags` returns 400
- `POST /recipes` with empty `tags: []` returns 400
- `POST /recipes` with whitespace-only tags returns 400
- `POST /recipes` with mixed-case tags stores them lowercased
- `POST /recipes` with duplicate tags stores deduplicated result
- `PUT /recipes/{recipeId}` with `tags: []` returns 400
- `PUT /recipes/{recipeId}` with valid tags updates the tags field

**`backend/src/handlers/recipe/__tests__/recipe.property.test.ts`** (additions)

Property-based tests using fast-check (minimum 100 iterations each):

- Property 1: `normalizeTags` idempotence — `normalizeTags(normalizeTags(arr))` equals `normalizeTags(arr)` for any string array
- Property 1 (output invariants): output tags are all lowercase, no duplicates, no empty strings
- Property 5: For any valid recipe body with empty/absent tags, handler returns 400
- Property 6: For any update body with `tags: []`, handler returns 400

### Property-based tests — filter logic

**`frontend/src/pages/RecipesPage/__tests__/RecipeList.property.test.tsx`** (new file)

- Property 2: AND filter correctness — for any recipes and filter set, filtered result contains exactly the recipes having all filter tags
- Property 3: Filter result is a subset of the original list
- Property 4: Empty filter returns full list
- Property 10: Tag cloud tags equal sorted distinct union of all recipe tags

### Integration tests

- `GET /recipes` returns recipes with `tags` field (example-based, 1–2 cases)
- `GET /recipes/{recipeId}` returns recipe with `tags` field
- `GET /recipes/tags` returns sorted distinct tags across all user's recipes (example-based, 1–2 cases)
- `GET /recipes/tags` is routed correctly and does not conflict with `GET /recipes/{recipeId}`

### Property test configuration

- Library: fast-check (`fc`)
- Minimum iterations: 100 per property (`{ numRuns: 100 }`)
- Frontend component tests: `{ numRuns: 50 }` to avoid timeout (30 s timeout)
- Tag format in test comments: `Feature: recipe-categories, Property {N}: {property_text}`
