# Shopping List design

## Architecture

First release computes a derived view in the frontend using existing authenticated
GET /inventory (all pages), GET /recipes and GET /meal-plans endpoints. There is no
need to persist duplicated recipe/stock calculations or deploy a new Lambda. The
existing Inventory Lambda is updated to return all product-group pages.
Previously documented POST /shopping-list/generate and PUT /shopping-list remain
unimplemented future contracts. This explicitly replaces the original Stage 6
Lambda implementation plan for this release.

A pure calculation module produces ingredient rows, contribution records and low
stock rows. Product identity is a normalized name + base unit unless inventory
matching resolves a specific group. Multiple compatible inventory groups are treated as ambiguous until an explicit
link resolves them; explicitly linked groups remain identifiable. Ambiguity
never silently consumes stock. Allocation tracks remaining quantity per lot globally,
so aliases/links cannot reuse the same stock. Unknown amounts stay separate from
numeric amounts but retain a warning on the consolidated ingredient.

ShoppingListPage owns filters, atomic data loading, search and basket presentation.
Basket persistence is a versioned localStorage entry keyed by authenticated user ID.
Each checked record stores amount and contributing plan IDs; additional demand or
new assignments require review. A record only covers its saved planning period to
avoid reusing a past shopping trip for a new week. Extras are stored per period too.
No credentials or source inventory/recipe datasets are written to this storage.

Purchase entry is a dedicated PurchasePage registered with App's state-based PageId
navigation. It uses existing POST /inventory and GET /locations, validates actual
purchase fields and only clears shopping state on a confirmed successful write.

## Data safety and UX

Calculations use local calendar dates, UTC date arithmetic for adding days, and
unrounded amounts internally. Display uses up to three decimal places and never
turns a positive shortage into an apparent zero. All controls have visible labels,
44px touch targets and keyboard semantics. Rows wrap on narrow screens. Day/recipe controls use a collapsible disclosure so
the shopping lists remain close to the top on mobile.
Errors do not silently replace known data with an empty list. Refresh commits a
complete snapshot; request IDs prevent stale responses replacing newer periods.
