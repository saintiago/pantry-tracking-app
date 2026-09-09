# Settings preferences and help — issue #16

Implements [Settings Features](https://github.com/saintiago/pantry-tracking-app/issues/16).
This supersedes the signed-in header language selector. Settings and Help are next to
one another in the header; the login screen retains language selection. Opening either
utility preserves the previous page and its unsaved form. Back to previous page returns
to it; returning to Inventory after Settings reloads locations and stock.

## Measurements

Choose Metric or Imperial (US customary).
The convention is explicit: ounces/pounds and US fluid ounces, pints, quarts and gallons;
existing cups, teaspoons and tablespoons use US customary volumes. These are not UK
imperial fluid measures. Shared factors govern stock arithmetic and display. Mass and
volume never cross-convert; pieces, handfuls, pinches and other counts have no assumed
weight or volume. Unknown recipe text/units are not inferred from food names.

Switching affects recipes, cooking ingredients, inventory lots/groups/thresholds,
shopping quantities/history/order previews/share text, and quantity editors. Stored
values and canonical keys remain unchanged when preferences change. Converted fields
write the equivalent amount in their current recorded unit only when edited. Untouched
fields keep their original precision. Selecting a unit describes the typed amount in
that unit; changing the Settings measurement system converts the physical quantity. Converted display uses bounded significant figures, retaining tiny values.
Shopping derives its canonical comparison totals in grams/milliliters; it converts those
for display, rather than rewriting its arithmetic around a rounded label. Recipe
availability and expiration matching compare compatible dimensions.

Manage units adds choices from the supported catalog, removes them from pickers, and
moves them up/down. This configures a unit list, not arbitrary custom conversion formulas.
At least one choice remains. Existing saved/editing units remain readable and selectable
even when removed; they can be added again. Reset restores system-aware default choices.
A customized ordering remains explicit when changing measurement systems. Legacy
device settings that used As recorded are treated as Metric the next time preferences
are read.

## Appearance and persistence

Default is the pastel appearance. Minimalist uses neutral black/white surfaces and hides decorative
app/product emojis, retaining text labels, warnings and user-written content. Product
icon editing is hidden there and existing icons return with Pastel. Photographs remain
photographs. System mode follows prefers-color-scheme, including live OS changes, with
a contrasting dark palette. These settings are per account on this device, with storage
failure messages and safe defaults for invalid data. They create no server preferences
or automatic changes to another device. Language retains its separate existing device/
account-default rules. Storage locations also keep a supported pastel color used by
inventory location tags. See the [data model](../../architecture/data-model.md).

## Help

The searchable Help page covers setup, stock and locations, barcode/manual entry,
recipe imports/review/cooking/cookbooks, planner portions and favorites, batches and
leftovers, shopping/removal/purchases/sharing, settings and connection recovery. English,
Spanish and Italian content describes shipped behavior and explains that online writes,
retailer checkout, receipt import and raw-stock deduction are separate boundaries.

See [testing](../../development/testing.md) for coverage and released verification.
