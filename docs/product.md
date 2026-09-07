# Pantry Tracking App

A Progressive Web App (PWA) for household inventory management. Users track food and household items across storage locations (Pantry, Fridge, Freezer, Limbo Pantry), plan meals, and generate shopping lists.

## Core Features

- Inventory management with add/remove/update, barcode scanning and manual entry
- Low-stock threshold notifications
- Atomic lot/group inventory changes; conflicts preserve saved data and return a retryable error
- Recipe management with ingredient availability checking
- Day/week/two-week meal planner with pastel breakfast/lunch/dinner slots, a single
  alphabetical recipe library with tag filters, shared recipe/cooking navigation,
  per-meal and bulk servings, mouse/pen/touch drag handles with a row copy anchored at the grab point,
  and accessible move/remove actions
- Shopping list generation from meal plans minus current inventory
- Installable app shell with service worker caching; cloud reads and writes require connectivity
- Cognito-based authentication (email/password)

## Target Platform

Mobile-first smartphone experience optimized for quick add/remove operations. Installable as a PWA. Supports screen widths 320px–1920px.

## Languages

English (default), Spanish, and Italian are available from the top-panel flag selector.
Device preference takes precedence over account locale; new devices copy account locale,
or detect a supported browser language and fall back to English. Device choices are scoped
per account. Saving an account default is explicit and leaves other devices unchanged.
Translate app-owned UI and standard labels, including asynchronously loaded views; preserve
user-written names, recipes, notes, tags, and custom categories. See `features/language/`.
Only the selected language catalog downloads; English uses built-in source labels.
Switching preserves unsaved work and keeps the current language if downloading fails,
with a retry action. Previously cached languages work offline; new languages need a connection.

## Shopping companion and visual system (September 2026)

The approved extension in `features/shopping-list/second-brain.md` supersedes the
initial manual-restock quantity and limited purchase-form rules. Planning has three
lists (meals, restock, manual), a combined store/department Shopping mode, product
preferences, package rounding, defer/unavailable controls, partial purchases, purchase
history and an order preview with estimated prices/budgets. Manual items/preferences
are saved per user on this device; inventory and plans retain their cloud APIs.
Ordering is a draft and product links only; retailer checkout and receipt OCR remain
future integrations. Selected filters are mint; all app pages use the shared neutral
and pastel palette with dark text.

Recipe placeholders remain zero-stock inventory entries under Uncategorized, with a
real Limbo Pantry location and group-owned low-stock settings. Inventory writes are
atomic within one account; uncertain HTTP purchase responses still require checking
inventory before resubmitting, because separate submissions create distinct purchases.

## Not implemented

Receipt OCR, IndexedDB entity storage, queued offline mutations and server `/sync`
are roadmap items, not shipped capabilities. Shopping state is per account on the
current device; there is no shared household synchronization of that local state.
The service worker caches app assets; it does not make inventory CRUD offline-capable.

Shopping ingredient details collapse by default, retaining visible quantities, review
notices and purchase actions. Equal-width week shortcuts and distinct shopping-only
department pastels improve mobile scanning; the subtitle is "From meal plan to shopping
basket." See the shopping companion feature record. Scanning an existing barcode
prefers saved household details and focuses expiration for review, requesting the
native date picker where the browser permits it.
