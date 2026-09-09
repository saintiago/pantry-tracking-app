# Pantry Tracking App

A Progressive Web App (PWA) for household inventory management. Users track food and household items across storage locations (Pantry, Fridge, Freezer, Limbo Pantry), plan meals, and generate shopping lists.

## Core Features

- Inventory management with add/remove/update, barcode scanning and manual entry
- Low-stock threshold notifications
- Atomic lot/group inventory changes; conflicts preserve saved data and return a retryable error
- Recipe management with ingredient availability checking
- Day/week/two-week meal planner with pastel breakfast/lunch/dinner slots, a single
  alphabetical recipe library with tag filters, shared recipe/cooking navigation,
  per-meal and bulk servings, direct card dragging with touch press-and-hold,
  pastel removal buttons, saved-state Undo and accessible meal editing
- Shopping list generation from meal plans minus current inventory
- Installable app shell with service worker caching; cloud reads and writes require connectivity
- Cognito-based authentication (email/password)

## Target Platform

Mobile-first smartphone experience optimized for quick add/remove operations. Installable as a PWA. Supports screen widths 320px–1920px.

## Languages

English (default), Spanish, and Italian are available in Settings and on the login screen.
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
notices and purchase actions. Equal-width week shortcuts and distinct
department pastels improve mobile scanning; the subtitle is "From meal plan to your shopping
list." See the shopping companion feature record. Scanning an existing barcode
prefers saved household details and focuses expiration for review, requesting the
native date picker where the browser permits it.

## Recipe and settings improvements (September 2026)

Recipes support an optional header photo and a separate photo for each instruction
step. JPG, PNG and WebP files up to 20 MB are resized on the device and uploaded to
private account storage (1 MB maximum after conversion). Photos appear in details
and cooking; editing can replace or remove each reference. Saving waits for uploads.

The one-/two-week expiration filter narrows recipes to ingredients with positive,
unexpired stock through the inclusive selected date, and orders them by earliest
expiry, then number of matching ingredients and name. It composes with existing
search/tag/time/availability filters. Linked ingredients match their inventory group;
unlinked/stale links match normalized names with compatible units. Expired, zero-stock
and invalid dates are excluded. Inventory read failures offer a retry.

Settings now owns storage-location add/rename/remove using the existing IDs and API.
Inventory keeps left-aligned location filtering and uses pastel green Add and pastel red Remove.
Calendar recipe names wrap at readable size, with servings and kcal on a secondary line.

## Inventory improvements (issues #11–#12)

Add/edit forms offer an explicit Not applicable expiration option and a product
emoji selector. Reusing a saved product copies quantity, unit, expiration choice,
icon and existing metadata while preserving entered values. Inventory categories
share Shopping's department colors and deterministic emoji defaults. Category and product groups show their location,
or Mixed locations; individual lots and details show the actual location. Tags
reflect the currently filtered inventory. Low-stock badges and each lot's quick
remove X use pastel red. Removal asks for confirmation and exposes failures for retry.
The Add menu offers manual entry and barcode scan; receipt photo item entry is not shipped.
The Remove action supports selecting multiple lots and confirms the selected products
before deletion. Low Stock and Expiring Soon filters can be combined.

## Expanded meal planning (issue #13)

The library and scheduled titles are drag surfaces. Mouse/pen use a movement threshold;
touch uses a hold before dragging, with ordinary swipes left available for scrolling.
Scheduled cards have a pastel red X, and dragging back to the recipe library removes
only the assignment. On narrow screens a recipe drawer and visible return target keep
these actions reachable. Detail actions and slot controls provide non-drag alternatives.
Move/remove supports Undo against saved state. Uncertain saves have a durable retry and
an explicit refresh/reconciliation action; other writes wait until it is resolved.

Meals support recipes, linked leftovers, eating out, custom notes and untracked-leftover
notes. Batch plans separate cooking yield from meal portions. Confirmation records actual
yield, preparation date, storage and an optional use-by date, without deducting raw
stock. Reservations, eaten portions and discarded portions are distinct. Removing a
planned source requires resolving its leftovers; already prepared food remains available
in the prepared-batch list. Shortages require explicit allocation changes.

Copy day/week previews add independent assignments to the destination. Named favorite
weeks persist per account and can be renamed, updated, removed and applied. Copies reset
prepared-food status; missing recipes or omitted cooking sources block application.
Bulk transactions support at most 90 submitted records and 98 meal row writes; oversized
operations fail before saving. Favorite/batch metadata has a bounded account storage
limit and reports an actionable error when full.

Recipe kcal are optional manual estimates stored for the whole recipe. Yield changes
keep total kcal fixed. Calendar figures show kcal per portion for one portion of every
dish, clearly marking unknown entries. Ordinary meals use current recipe nutrition;
prepared food retains its cooking snapshot. Shopping counts planned cooking yield once,
including a source outside the selection with a notice; prepared portions and notes add
no ingredient demand. The optional Fewest additional groceries sort compares independent
candidates against stock remaining after planned cooking, flags uncertainty, and counts
missing ingredient lines rather than price.

## Compact navigation and recipe imports (issue #14)

Settings is the gear beside the language selector; storage locations start collapsed.
The planner has a dedicated View group, top-right Shopping action, calendar-adjacent
Undo, expandable servings/favorite controls and the subtitle “From recipes to your
meal plan.” Household/all-planned-portions kcal are no longer shown.

Recipe availability and expiration filters are adjacent matching toggles; expiration
reveals its one-/two-week window. New Recipe offers manual, photo and link imports.
Bedrock extracts a review draft; unavailable AI falls back to webpage metadata/text
or offers on-device printed-text recognition in English/Spanish/Italian. Imports
never automatically save recipes. Review explains uncertainty and supports editing
and reordering. Source images require an explicit permission choice. See
[imports and navigation](features/recipe-management/imports-and-navigation.md).

## Cookbooks, sharing and shopping organization (issue #15)

Recipes can be organized into cloud-saved cookbooks with descriptions and private cover
photos. A recipe may belong to multiple books; removing a book keeps the recipes.
Recorded-time sliders replace the free-number filters. Accounts open on a recipe
library that shows the cookbook shelf and All recipes together; the All recipes and
My cookbooks collection switches remain available.

Shopping supports recipe/aisle/alphabetical/recent arrangement, food emojis, and confirmed
period-scoped removal with restoration. Both Shopping and Meal Plan offer native sharing
or a plain-text copy fallback. View and a servings slider share the planner toolbar;
Undo stays visible but disabled when empty. Prepared batches and saved favorite days/weeks
are beneath the recipe sidebar. See [issue #15](features/recipe-management/cookbooks-and-sharing.md).

## Settings and help (issue #16)

Language selection is now in Settings; the login screen keeps its selector. Help sits
beside Settings in the header and provides searchable instructions in all three languages.
Both utilities preserve the page underneath, including unsaved form contents.

Measurement preferences offer Metric and explicitly US customary Imperial.
Quantities and units convert together across recipes/cooking, inventory, shopping and
editors without rewriting saved data when switching. Supported unit choices can be
added, removed and reordered; saved units remain readable. Mass and volume never mix.
Appearance offers Default, black/white Minimalist without decorative emojis, and System
mode following device light/dark preferences. Settings are per account on this device.
Storage locations support a pastel color used by product location tags.
See [preferences and help](features/settings/preferences-and-help.md).

## Visual recipe library (issue #17)

Recipes Library shows compact cookbook covers plus the All recipes list. My cookbooks
shows compact covers; All recipes shows only recipes. Cookbook contents and the full
library support List, Icons and Larger images with recipe cover photos. Time filters
sit above search/tags. Returning from details preserves the collection, filters and
view. New cookbook sits beside New Recipe; icon actions appear on hover, focus or touch
hold, and inside the cookbook. Cookbooks can be reordered on the device. New covers are
compressed to at most 720px; card images load near the viewport. See
[visual library](features/recipe-management/visual-library.md).
