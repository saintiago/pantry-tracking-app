# Expanded planner — issue #13

This approved implementation supersedes the handle/overflow controls and deferred
planner roadmap in `recipe-navigation.md`. The source requirements are
[issue #13](https://github.com/saintiago/pantry-tracking-app/issues/13).

## Contract decisions before implementation

Contract version 2 retains existing MEAL keys and IDs. Missing entry type means
recipe; missing nutrition means unknown. Meals gain flexible entry fields and an
optional batch link. Cooking yield and portions eaten at the first meal are separate.
Prepared batches and favorite weeks are account-owned records, separate from raw
inventory. Confirming cooking records prepared food only: it never deducts raw stock.
The existing guided cooking experience likewise retains its current stock behavior.

All planner mutations use a permanent account revision with conditional transactions.
Client operation IDs identify saved results so an uncertain response can be reconciled
and retried without creating duplicate meals. Bulk edits are bounded and atomic;
oversized requests fail before writing. Undo uses saved before/after state and refuses
to overwrite intervening changes. Batch links are validated against the entire plan,
including dates outside the visible week.

An allocation reserves portions until marked consumed. Consumed and discarded portions
are recorded separately. Actual yield cannot be below consumed, discarded and reserved
portions; the user must resolve affected allocations explicitly. Removing a planned
source requires resolving/removing its dependents. Prepared batches survive removal of
their source assignment. Copies create independent planned batches and clear food status;
copies containing a leftover without its source require resolution before applying.

Recipe nutrition stores optional total kcal, with recipe yield as the single basis.
Changing yield retains total kcal. Ordinary planned recipes use current recipe nutrition
and display this policy; prepared batches freeze kcal/portion at confirmation. Daily
figures show one portion of every dish and the quantity-weighted total, with unknown
entry counts. Flexible entries use optional manually entered kcal per portion.

Favorite weeks have date-independent weekday offsets, fresh IDs on application, and
account persistence. Copy previews show occupied destinations and unavailable recipes;
default application adds entries. Grocery ranking scores each hypothetical addition
against the same remaining inventory after current planned cooking demand, reusing
shopping allocation and uncertainty rules. It counts missing lines, not price.

## Delivery and acceptance

Implement cards/drag/removal, contracts/flexible entries, batches/shopping,
copy/favorites, nutrition and grocery ranking as cohesive stages. Cover pointer and
touch cancellation, keyboard alternatives, scrolling, saved-state Undo, concurrent
writes, legacy records, batch arithmetic, cross-week demand, copying, nutrition and
uncertain ingredient matching. Verify English/Spanish/Italian and 320/390px layouts.
The maintained product/data/testing guides record shipped behavior after validation.
