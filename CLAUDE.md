# Pantry Tracking App — Claude Context

## What this app is
A mobile-first PWA for household inventory management. Users track food/household items across storage locations (Pantry, Fridge, Freezer, Limbo Pantry), plan meals, and generate shopping lists. Installable as a PWA, offline-first via service worker.

## Monorepo layout
```
frontend/   React 18 + TypeScript + Vite (inline styles, no CSS framework)
backend/    AWS Lambda (Node.js/TS) — DynamoDB single-table, S3, Cognito
infrastructure/  AWS CDK v2 — PantryStack (DynamoDB, S3, Cognito, API GW, CloudFront)
e2e/        Playwright tests (mock auth via Vite plugin, mock API via page.route())
scripts/    deploy.sh (CDK + S3 sync + CF invalidation)
.kiro/steering/  Authoritative specs: product, tech, structure, data-model, workflow, e2e-testing
```

## Frontend structure
```
frontend/src/
  api/          API client modules per feature
  auth/         Cognito client + auth components
  components/   Shared UI: Layout, InventoryList, OnlineIndicator, TagInput, AutocompleteDropdown, BarcodeScanner, StorageLocationManager
  pages/        InventoryPage, AddItemPage, ItemDetailPage, RecipesPage, MealPlanPage, ShoppingListPage
  styles/       global.css (reset only — all component styles are inline React.CSSProperties)
  types/        units.ts (UnitType, UNIT_METADATA, VALID_UNITS, resolveUnit)
  utils/        quantity.ts (formatQuantity)
  App.tsx       Auth gating + page routing via PageId state (no router library)
  config.ts     Vite env vars (VITE_USER_POOL_ID, VITE_USER_POOL_CLIENT_ID, VITE_API_URL)
```

## Key conventions
- **Styling**: Inline `React.CSSProperties` objects only — no CSS modules, no Tailwind, no styled-components
- **Routing**: State-based via `PageId` in `App.tsx` + `Layout`. No react-router. New pages = new `PageId` + `<Name>Page.tsx`
- **No modals for forms** — use dedicated full pages (see `AddItemPage`, `ItemDetailPage`)
- **Tests**: `__tests__/` sibling dirs. Unit = `.test.tsx`, property-based = `.property.test.tsx`, E2E = `e2e/*.spec.ts`
- **Commits/push/deploy**: Never without explicit user instruction per message

## Design tokens (current — being redesigned)
- Primary: `#4a90d9` (blue) | Text: `#1a1a1a` | BG: `#f5f5f5` | Card: `#ffffff`
- Border: `#e5e7eb` | Input border: `#d1d5db` | Muted: `#6b7280`
- Low stock: `#fef3c7` / `#92400e` | Success: `#16a34a` | Error: `#dc2626`
- Radii: 6px inputs, 8–10px cards, 16px chips, 20px toggle

## Common commands
```bash
npm install                    # from root
npm test                       # all tests
npm run test:unit              # unit only
npm run type-check             # all workspaces
npm run lint / format
cd frontend && npm run dev     # dev server
cd frontend && npm run build   # needs VITE_USER_POOL_ID, VITE_USER_POOL_CLIENT_ID, VITE_API_URL
npm run test:e2e               # Playwright headless
```

## E2E testing gotchas
- Auth: Vite plugin replaces cognitoClient when `VITE_MOCK_AUTH=true` — never mock Cognito at network level
- API: intercepted via `page.route()` — `VITE_API_URL=https://mock-api.test`
- AutocompleteDropdown uses `onMouseDown` (not `onClick`) — use `await option.click()` after waiting for visibility
- Scope modal selectors to `getByRole('dialog')` to avoid conflicts with page inputs

## Data model quick ref
- DynamoDB single-table `PantryApp` — PK: `USER#<id>`, SK: entity-prefixed
- Entities: `InventoryItem`, `StorageLocation`, `Recipe`, `MealPlan`, `Receipt`
- Units: defined in `frontend/src/types/units.ts` + `backend/src/types/units.ts`
- Full schema + API routes: `.kiro/steering/data-model.md`

## Active design initiative
Redesigning the UI: warm pastel aesthetic (blush/lavender/sage), game-like interaction feedback (shake on error, bounce on success, hover scale+shadow on desktop, form field pulse on validation error). Piloting on Inventory page first.
