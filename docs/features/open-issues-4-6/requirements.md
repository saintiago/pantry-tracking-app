# Open issues #4–#6: current requirements

These requirements extend the existing recipe, meal-planner, inventory-group and
barcode specifications. Steering contracts remain authoritative.

## Recipes (#4)

Provide alphabetically sorted unit choices including `unit`; optional ingredient
sections; empty quantity only for handful; optional Chef's notes below instructions;
a compact, single ingredient list containing available, partial and missing rows;
and editable numbered instruction steps. Preserve legacy string instructions and
recipes without the new optional fields. Notes and steps can be removed.

Editing portions leaves ingredient inputs unchanged. Saving scales numeric quantities
once by new/original portions and keeps null handful quantities null. View-mode
portion controls scale the display immediately without persisting recipe changes.

## Meal planner (#5)

1. Load all recipes into a left-hand categorized library on desktop. Categories are
   the existing recipe tags. Multi-tag recipes appear in each category; untagged
   recipes appear under Uncategorized. Categories and recipes are alphabetical.
2. Drag a recipe to a dated breakfast/lunch/dinner target to create an assignment.
   Provide keyboard and touch selection followed by calendar activation as well.
   Show failures without inserting an unsaved card; keep selection available to retry.
3. Display fourteen consecutive dates starting on Monday of the current week.
   Keep seven-day previous/next navigation, month/year labels, loading and retry.
   At small widths the library stacks above a horizontally scrollable calendar.
4. A servings form updates all saved meals from the user's local today onward,
   including beyond the visible fortnight. Reject nonpositive/fractional counts.
   Persist servings on assignments; do not change earlier meals or recipe quantities.
   Display counts on cards and preserve them when reloading/navigating.
5. Handle library loading/empty/error states and show an explicit success/error for
   bulk updates. Retrying an interrupted bulk operation safely sets the same count.
6. Mouse dragging must work without first selecting a recipe and without relying
   on native HTML drag events. Show a moving recipe label and highlight the target.
   Preserve the exact recipe across library scrolling, scroll to offscreen dates
   while dragging, and save once. Releasing outside a target or cancelling must
   not create a meal or leave the recipe selected. Preserve touch list scrolling.

## Inventory (#6)

1. Decode product barcodes from the camera, prefer a physical macro/rear device and
   lock its device ID for the session. Cancel pending startup and release streams
   on close, detection, timeout and unmount. Offer retry/manual entry on timeout,
   and manual barcode lookup when camera access is unavailable or denied.
2. Suggest the latest created matching product lot, including expiration date,
   photo and location details. Adding one more lot keeps group threshold settings.
   Do not overwrite values the user already entered.
3. Show identical products in one persisted group, with aggregate quantity and
   individually editable stock lots. Group identity follows the threshold-revamp
   design: normalized name, category and canonical stock unit.
4. Permit choosing a threshold unit compatible with the stock unit. Support mass
   and volume conversion (g/kg, ml/l), and counted units such as bottles/cans in
   their corresponding groups. Compare aggregate stock against the converted
   threshold. Clearing a threshold disables its warning; failed saves retain inputs.
5. Add optional Location Details immediately below Location in add/edit forms.
   Save, reload, copy and clear this field independently of the storage location.

## Verification

Cover these requirements in Playwright, including real decoder execution against
a generated barcode video, stateful API mocks for persistence, accessible controls,
failure/retry paths and desktop/mobile layout. Pair mock API browser tests with
backend persistence/validation tests. Review rendered screenshots. Run the complete
existing suite, type checking, lint and production builds; document actual results.
