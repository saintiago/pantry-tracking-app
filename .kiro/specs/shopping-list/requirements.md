# Shopping List — approved September 6, 2026

The user approved this behavior before implementation. This document supersedes the
original Stage 6 date-range/generation plan for the first release.

## First release

1. Render two independent sections: Ingredients for planned meals and Low-stock
   inventory. Use the app's mobile-first pastel design and accessible controls.
2. Default to the current local Monday–Sunday week, excluding dates before local
   today. Offer previous/next week, this week, next week, both weeks, week-start
   selection, and Include past days. Allow multiple dated days and recipes;
   selections intersect. Empty selections mean all. Reset day/recipe selections
   when the period changes. Low stock is independent of these filters.
3. Scale recipe ingredients by assignment servings / recipe portions (legacy
   assignments use recipe portions). Count every assignment, aggregate compatible
   ingredients and subtract inventory once. Display needed, allocated inventory,
   to-buy quantity, and each contributing recipe/date/meal. Hide fully covered
   ingredients unless Show ingredients already in stock is selected.
4. Read all inventory pages and all recipe/meal data. Prefer explicit inventory
   links to product groups; otherwise match normalized names with compatible units.
   Different product categories or explicit groups must not be silently merged.
   Convert g/kg and ml/l; keep other units separate. Ambiguous, stale-linked, or
   incompatible matches show Check inventory match and do not subtract uncertain
   stock. Unknown quantity remains Quantity to check. Missing recipes show a warning.
5. Exclude expired stock from meal allocation, flag stock that expires before a
   contributing meal, and allocate eligible lots in meal date order, earliest
   expiration first. Do not change inventory's existing low-stock semantics.
6. Low stock uses persisted groups at/below configured thresholds, including empty
   groups. Show stock, threshold, recipe references or General restock, and optional
   editable purchase quantities. A warning threshold is not a replenishment target.
7. Link the checkbox of a confidently matched product appearing in both lists.
   Label its low-stock quantity Extra to buy, and show meal amount + extra = total.
   Do not add the meal requirement twice. Normalize linked quantities to the same
   unit. Search filters both lists without changing underlying calculations.
8. Checking means In basket, not an inventory mutation. Collapse checked rows into
   In basket areas. Save checkmarks and extra quantities per authenticated account
   on this device, surviving navigation/reload. Store the checked amount and meal
   scope so an increase or new meal marks the row Needs review. Filters alone must
   not irreversibly discard saved basket state. Report storage failures.
9. Refresh on entry, window focus, reconnect and explicit Refresh. Never display a
   partial calculation as complete. Loading/failure/retry states are explicit.
   Explain no meals, everything in stock, no low-stock products, and no search hits.
10. Provide Add purchases to inventory from checked rows using a dedicated page
    with actual quantity, category, storage location and expiration date. A successful
    add creates one stock lot, clears that basket entry/extra and refreshes inputs.
    A failed add preserves the form; cancel does not mutate inventory.

## Later enhancements (not part of this release)

Restock targets; store/category shopping order; manual extras; sharing/export;
cloud synchronization and a complete offline shopping workflow. Saved basket state
in this release is device-local, not a claim of cross-device or offline data sync.

## Validation and release

Test aggregation, scaling, repeated meals, allocation, expiry, units, ambiguity,
filters, linked duplicates, basket persistence/review, pagination and account isolation.
Cover desktop/mobile browser interactions, purchase mutation success/failure and
retry/empty states. Run complete tests, types, lint, builds and commit hooks. Push
and verify the production workflow, published assets and live browser behavior.
