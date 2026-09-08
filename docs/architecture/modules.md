# Architecture and module ownership

This is an npm workspace containing one browser application, five Lambda handlers,
one CDK stack and a small shared domain package. Keep this deployment shape until
independent scaling, ownership or release requirements justify additional services.

| Location                            | Responsibility                                                               | Dependency direction                                    |
| ----------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------- |
| `packages/domain/src/`              | Canonical units and platform-independent contracts                           | No platform dependencies                                |
| `frontend/src/domain/`              | Pure browser-domain models and calculations                                  | Own domain and shared domain only                       |
| `frontend/src/api/`                 | HTTP contracts, endpoint wrappers, snapshot composition                      | Auth/config/domain; never components or pages           |
| `frontend/src/api/client.ts`        | Authenticated transport, error fallback, cancellation, bounded meal requests | No UI; never automatically retry writes                 |
| `frontend/src/auth/`                | Cognito and authentication UI/state                                          | Shared frontend primitives                              |
| `frontend/src/i18n/`                | Language preferences, catalogs and display formatting                        | Keep canonical stored values unchanged                  |
| `frontend/src/components/`          | Reusable rendered controls                                                   | Feature pages should compose these                      |
| `frontend/src/pages/<Feature>Page/` | Feature composition and feature-local UI/hooks                               | API/domain/shared controls                              |
| `frontend/src/App.tsx`              | Auth gating, page selection and contextual return navigation                 | Composition root                                        |
| `backend/src/http/`                 | API Gateway identity and response transport                                  | No feature imports                                      |
| `backend/src/db/`                   | Shared paginated database reads                                              | AWS SDK; no HTTP or feature imports                     |
| `backend/src/inventory/`            | Shared inventory transactions, group rules and revision coordination         | Shared DB/domain; used by inventory and recipe handlers |
| `backend/src/handlers/<feature>/`   | Route dispatch, validation and persistence orchestration                     | Shared HTTP/domain and feature-local rules              |
| `infrastructure/src/`               | AWS resources and route bindings                                             | Backend entry points by path                            |
| `e2e/`                              | Browser journeys against intercepted APIs                                    | Test-only mocks                                         |

The API and domain rules and production module size budgets are enforced by
`npm run check:architecture`. Existing oversized files have explicit ceilings;
new production modules default to 500 lines. Line counts are review triggers, not
a reason to fragment cohesive code. Lower ceilings after extraction; do not raise
them to avoid decomposing an unrelated new responsibility.

## Adding or changing a feature

1. Locate its requirements through [the feature index](../features/README.md).
2. Put stable, cross-runtime values in `@pantry/domain`; keep localization, React,
   AWS clients and browser storage out of that package. Run `npm run build:domain`
   after editing it; root test/type-check commands rebuild it automatically.
3. Put browser models/calculations in `frontend/src/domain/<feature>/`. Keep pure
   rules independent of fetching and rendering. Feature-only visual helpers and
   hooks belong alongside their page. Share only after identifying real consumers.
4. Add endpoint wrappers under `api/<feature>/` using `apiRequest`. Preserve public
   response shapes and canonical error messages used by translations. Pass a signal
   for cancelable reads and an explicit empty response mode for deletes.
5. Keep backend route dispatch separate from pure rules (`recipe-rules.ts` is the
   example). Preserve the authenticated user partition in every database operation.
   All stock-lot and group writes must go through `InventoryRepository`. Its permanent
   per-account revision makes its paginated read/transaction plans safe against other
   participating inventory writers. Never update these rows directly or reset/delete
   `INVENTORY_STATE`; location-name/reference guards remain a separate open boundary.
6. Use full pages for forms/detail views and confirmations for small dialogs. Register
   state-based `PageId` navigation in App/Layout. Preserve return context in planner,
   recipe, cooking and shopping journeys. A router migration needs its own design.
7. Test pure rules directly, transport contracts at the boundary, and user journeys
   in Playwright. Update the current guides when behavior or contracts change.

## Compatibility and existing boundaries

Inventory types/grouping now live in `frontend/src/domain/inventory/`; InventoryList
re-exports old names for compatibility. New non-UI consumers import the domain directly.
Backend and frontend unit entry points re-export `@pantry/domain`; the frontend adds
localized display labels. English metadata and legacy unit normalization have one owner.
Recipe rules are extracted from their Lambda handler, which retains compatibility exports.

Shopping's `useShoppingSnapshot.ts` owns request cancellation, stale responses, account
isolation, timeouts and reconnect refresh. `companion.ts` owns calculations and validated device persistence;
`ShoppingRows.tsx` is shared by its list modes. `PurchasePage` reuses the full inventory
form and records successful cloud writes before updating local state. Larger page
controllers still need staged decomposition; see the audit instead of introducing a
generic form or state framework without a concrete need.

## Visual and localization conventions

Use inline `React.CSSProperties` (including feature-local style modules) with tokens
from `frontend/src/styles/palette.css`; no CSS framework is required. Prefer existing
accessible controls. Inventory theme tokens alias the shared palette.
Translated components subscribe with `useLanguage()` and translate at render time.
One JSON catalog per language is fetched on demand through `i18n/catalogs.ts`; only URL
metadata belongs in the initial bundle. Do not import catalog contents into production
TypeScript modules or restore an eager combined translation chunk. Language activation
and device persistence wait for successful loading and ignore superseded requests.
Preserve user names, tags, notes, canonical unit keys and IDs. `localizedUnits()` sorts
display labels; request values and calculations must remain locale-independent.

Recipe photo transport belongs to `api/recipes/images.ts`; shared photo display/upload
controls are in `components/RecipePhoto/`. The existing Recipe Lambda also serves
`/recipe-images`, with account-scoped S3 access in its feature-local helper. Recipe
query pagination and placeholder orchestration have separate feature helpers.
Expiration prioritization is a pure rule under `domain/recipes/`. Settings composes
the existing shared StorageLocationManager and location API; it creates no new data store.

Inventory item cards and location/stock tags are reusable components under
`components/InventoryList/`. Its department palette is also re-exported by Shopping.
`ExpirationField` owns the date/Not applicable control; `ItemIconField` owns emoji
selection. Add form contracts/defaults live alongside the page in `form.ts`.

Planner version 2 contracts and portion/calorie arithmetic live in `@pantry/domain`.
The MealPlan Lambda delegates routes to `planner-handler.ts`, invariant checks to
`planner-rules.ts`, and all persisted meal mutations to `PlannerStore`. Legacy routes
participate in the same revision guard. `usePlannerWorkspace` owns complete snapshots,
pending operation reconciliation and revision-checked Undo. Planner entry, batch and
copy UI are separate page components; recipe editing and cooking remain shared.
Copy/template transformation is a pure frontend domain rule. Grocery ranking reuses
Shopping's existing calculator and remaining-stock map; it never mutates stock.
`RecipeCalories` owns the nutrition input and header display; `recipeFormRules` owns
the existing editor's time/yield validation. No new Lambda or infrastructure is needed.

Issue #14 adds `/recipe-import` to the existing Recipe Lambda, with scoped Bedrock
invocation permission and a 28-second timeout. `import-fetch` owns bounded public-HTTPS
fetching and redirect/DNS checks; `import-page` owns schema.org/text extraction;
`import-model` owns Bedrock prompts and output validation. Shared draft contracts and
conservative printed-text parsing live in `@pantry/domain`. Imports never write records.
`RecipeImporter` coordinates inputs/cancellation; `ImportReview` explains uncertainty
and optional image import; the existing editor owns confirmation/saving. Tesseract is
loaded only for fallback. The Vite OCR asset plugin serves/emits versioned self-hosted
runtime/language assets without eager downloading.
