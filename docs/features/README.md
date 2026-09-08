# Feature requirements and history

These records preserve acceptance criteria, design decisions and task history. They
were migrated from the retired Kiro layout; no tool-specific metadata is retained.
Read [the current product guide](../product.md) and [module guide](../architecture/modules.md)
first. Older designs and unchecked tasks are not an implementation inventory.

Key precedence notes:

- [Settings and help](settings/preferences-and-help.md) supersedes the header language
  selector and adds reversible measurement preferences, unit lists and appearance choices.

- `shopping-list/second-brain.md` extends its initial requirements/design.
- `meal-planner/recipe-navigation.md` and `open-issues-4-6/` record later planner behavior.
- `meal-planner/expanded-planner.md` supersedes their drag handles, overflow menus and
  deferred batches/templates/calories roadmap with issue #13.
- `language/` owns multilingual acceptance details.
- [Recipe imports and navigation](recipe-management/imports-and-navigation.md) replaces
  the bottom Settings tab and all-planned-portions calorie display with issue #14.
- [Cookbooks and sharing](recipe-management/cookbooks-and-sharing.md) extends issue #14
  with account cookbooks, recorded-time sliders, shopping organization and sidebar favorites.
- `recipe-units-format/` describes the original duplicated modules; the shared domain
  package now supersedes that implementation decision while preserving stored values.
- `offline-sync/`, `receipt-ocr/` and `optional-features/` contain future work.
- `pantry-tracking-app/` is the original broad plan, not a list of shipped services.

Feature folders:

- [barcode-autofill](barcode-autofill/)
- [barcode-camera-switch-fix](barcode-camera-switch-fix/)
- [barcode-scanner-lazy-load](barcode-scanner-lazy-load/)
- [barcode-scanning](barcode-scanning/)
- [foundation-and-auth](foundation-and-auth/)
- [inventory-category-view](inventory-category-view/)
- [inventory-core](inventory-core/)
- [item-detail-view](item-detail-view/)
- [language](language/)
- [meal-planner](meal-planner/)
- [modal-to-page-migration](modal-to-page-migration/)
- [offline-sync](offline-sync/)
- [open-issues-4-6](open-issues-4-6/)
- [optional-features](optional-features/)
- [pantry-tracking-app](pantry-tracking-app/)
- [receipt-ocr](receipt-ocr/)
- [recipe-categories](recipe-categories/)
- [recipe-management](recipe-management/)
- [recipe-misc-fixes](recipe-misc-fixes/)
- [recipe-portions-counter](recipe-portions-counter/)
- [recipe-search-filter](recipe-search-filter/)
- [recipe-time-fields](recipe-time-fields/)
- [recipe-units-format](recipe-units-format/)
- [settings](settings/)
- [shopping-list](shopping-list/)
- [threshold-revamp](threshold-revamp/)
