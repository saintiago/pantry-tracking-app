# Cookbooks, shopping organization and planner sharing — issue #15

Implements [issue #15](https://github.com/saintiago/pantry-tracking-app/issues/15).
This extends imports/navigation and supersedes numeric time inputs, the planner's
expandable servings control, and the previous placement of batches and favorite plans.

Cookbooks are named account-owned collections with a description, optional private
cover photo and up to 500 recipe references. Recipes may belong to multiple cookbooks.
Existing recipes remain in All recipes; accounts with cookbooks open on the cookbook
shelf instead of the long list. Selecting a cookbook filters its recipes and resets time
filters. Editing membership never duplicates recipes. Removing a cookbook requires
confirmation and keeps its recipes. Missing/deleted recipe references are not shown as
available recipes. Cloud errors retain the draft; concurrent edits require reloading.
Covers reuse the established private photo upload, resizing and busy-save behavior.

Prep/cook/total filters are keyboard-accessible sliders whose stops are the distinct
recorded times in the current collection, plus Any time. Total time uses the existing
partial-time calculation. Unknown times are excluded by an active filter; an empty
set of recorded times disables its slider. Search, tags, availability and expiration
still compose. Former free-number/invalid-input UI cases are superseded.

Shopping can be arranged by Recipe, Aisle, A to Z, or Recently added. A combined product
appears once: Recipe groups use all contributing recipe names instead of duplicating
quantities. Shopping mode still groups stores first. Aisles order produce, meat/fish,
bakery, dairy/eggs, herbs/spices, pantry, then the remaining established departments.
Saved product department choices take precedence. Icons prefer the inventory's chosen
emoji, then a multilingual food mapping (including ginger and fenugreek), then a
category icon. No AI request is needed to render the list. Recent ordering uses the
latest recorded source creation date; older undated items use a stable name tie-break.

The pastel-red X asks for confirmation and removes a product from the selected shopping
period, across all list modes, independently of basket checks. Inventory, meals and
source manual entries remain unchanged. Removed items can be restored. Suppression is
per account/device/period; changing the period can bring the requirement back. No source
meal or stock write occurs. Carry-forward omits removed rows in that period.

Sharing begins only on a click, uses the native share sheet when supported, and falls
back to selectable/copyable plain text. Cancelling native sharing is harmless. Shopping
shares the current filtered products, quantities and basket marks; planner sharing uses
the visible date range, slots, titles and portions. No recipients are selected and no
message is sent by the app automatically.

The planner keeps View and the servings slider together (a compact View selector on
small screens). The slider sets portions for new assignments; Update future meals is
an explicit bulk action. Undo is always visible and disabled without a saved undoable
change. Lunch uses a fork/knife emoji. Recipes, prepared batches and favorites use
consistent emoji headers. Prepared batches and Favorite Weeks/Days live beneath Recipes
in the sidebar, reached through Recipe drawer on narrow screens. Favorites have a
visible list and distinguish saved days/weeks; selecting one opens the existing
preview/apply flow with destination date, collision notices and revision protection.

See [data contracts](../../architecture/data-model.md), [module ownership](../../architecture/modules.md)
and [testing](../../development/testing.md) for implementation and validation boundaries.
