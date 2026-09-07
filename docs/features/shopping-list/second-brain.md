# Shopping companion and app palette — approved September 6, 2026

This extension supersedes the first-release manual-restock and limited-purchase-form
rules. The user authorized implementation, tests, documentation and production release.

## Behavior

- Three planning lists: recipe ingredients, low-stock replenishment, manual extras.
  Active week shortcuts, day and recipe filters use light green (#D8F3DC).
- Organize ingredients by supermarket department. Carrefour Spain's supermarket
  navigation is the reference, not a claim to know a particular Madrid store's aisle
  layout: https://www.carrefour.es/supermercado (checked September 6, 2026).
  Departments: produce, meat/fish, dairy/eggs, bakery, pantry, frozen, drinks,
  household, personal care, baby, pets, other. Suggested mappings are editable.
- Shopping mode combines compatible products across all three sources, with source
  labels, grouped by preferred store then department. Never merge ambiguous units
  or product identities. Manual quantities are additions to meal/restock demand.
- Threshold is the default desired reserve. Replenishment covers selected meals and
  leaves that reserve: meal shortfall + max(0, reserve - remaining eligible stock).
  At the threshold with no meal use, show Threshold reached and no zero-amount buy
  action. Product preferences can set a different desired reserve without changing
  inventory's warning threshold. Preserve current inventory low-stock semantics.
- Manual entries have name, quantity, unit, department, store and notes. They persist
  across weeks. Editing, removing, checking, buying later, skipping this period,
  marking unavailable, changing store, and specifying a replacement are supported.
  Deferred/unavailable items remain visible in a separate outstanding area with Undo.
- Product preferences remember store/alternative, brand, barcode, product link,
  department, default storage location, package size/unit, estimated package price,
  desired reserve, and substitution preference. Package suggestions round up only
  with an explicit compatible size; show need, packs and expected remainder.
- Put purchases away uses the SAME full inventory Add form with editable name,
  category, quantity/unit, expiration, location/details, brand, barcode, where-to-buy,
  online product URL and photo. Partial purchases retain manual remainder; generated
  demand recalculates from inventory. Incompatible unit changes require an explicit
  covered shopping quantity. Explicit mappings follow the purchased lot’s remaining
  amount and expiry on this device. Do not silently equate a bottle and milliliters.
  Returning from a purchase/editor preserves the selected trip and mode.
- Remember pending generated items across week changes as carry-forward entries;
  reconcile against current rows by stable product identity to avoid duplicates.
  Preserve the reason and date. Skipping/defer controls do not delete source meals.
- Useful explained suggestions: expiry dates within three days, storage location
  reminders, recipe demand/reserve and package remainder. Purchase history supports
  a clearly labeled interval estimate only after at least three purchases.
- Order preview is a draft, grouped by store, with product links, estimates, missing
  price notices, spending/delivery budgets and substitution rules. Export/copy the
  shopping list. Opening links does not submit orders. No retailer checkout API or
  live price source is available; actual ordering and receipt OCR remain integration
  milestones, not simulated capabilities. No automatic financial purchases enabled.

## Persistence and safety

Use versioned, authenticated-user-scoped local storage for manual items, preferences,
carry-forward and purchase history; retain v1 period basket compatibility. State is
saved on this device, not represented as cloud/shared storage. Validate stored values,
report failures, and never silently submit inventory writes or duplicate a successful
purchase because local persistence fails. Carry quantities are reconciled against
new inventory after a confirmed purchase. Files are handled like normal Add Item.

## App theme

Canvas #FAFAFA; cards/inputs #FFFFFF; primary text #2B2D42; muted/icon #8D99AE.
Use a darker companion #586477 for small secondary text requiring readable contrast.
Mint #D8F3DC (produce/selection), lavender #E2E2FF (dairy), peach #FCEADE (pantry),
sky #E0F2FE (frozen/drinks). Status backgrounds: #E2F0D9, #FFF2CC, #FFE5E5.
Centralize tokens and migrate existing inline styles throughout auth, inventory,
recipes, cooking, meal planner, shopping and forms. Pair pastels with dark text.

## Verification

Pure tests: classification, conversions, reserve math, package rounding, merge safety,
carry-forward reconciliation, partial completion and storage validation. Browser:
all new interactions, full purchase form, failure/retry, state restoration, 320/390px
and desktop layouts, theme across main tabs/auth, budget preview and no order submits.
Run all checks/hooks, deploy via main workflow, verify production UI and report release.

## Shopping list readability (issues #9)

Ingredient rows initially show the basket checkbox, name, needed/allocated inventory
and buy quantity. A native, keyboard-accessible "Details for {ingredient}" disclosure
contains recipe/date/meal references, warnings, reserve explanations, stores/sources,
notes, package calculations and product/manual/defer actions. Quantity review notices,
deferred status/Return to list and checked-item purchase actions stay outside it.
The subtitle is "From meal plan to shopping basket.", also localized into Spanish
and Italian.

This week, Next week only and Both weeks occupy equal-width columns above the selected
range. Custom week navigation is inside Day and recipe filters, with 44px arrows and
a flexible date field aligned along their bottom edges. Existing filters and trip
restoration are preserved. Shopping headers have separate food-associated pastels
for all twelve departments; written labels remain and inventory colors are unchanged.
Purchases continue to compose the full shared AddItemPage, including partial purchases,
errors/retry and protection against repeating successful writes.
