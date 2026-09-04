# GitHub issues #4–#6 implementation and verification

## Scope

Implement every request in open issues #4, #5, and #6. Existing code and earlier
checked task lists are inputs, not evidence of current completion. Preserve the
inventory-group work already present in the worktree. Complete delivery under the
autonomous workflow in `.kiro/steering/workflow.md`.

## Tool readiness (2026-09-04)

- GitHub connector reads the repository and issues.
- Node, npm, installed dependencies, and Playwright Chromium are available.
- Browser launch needs an approved execution outside the process sandbox; the
  launch smoke check succeeded. No additional installation is currently needed.
- App access details were supplied in an attachment; do not copy credentials into
  repository files, test fixtures, screenshots, or reports.

## Requirement audit

- [x] #4: `unit` option and alphabetical visible unit labels.
- [x] #4: ingredient sections and backwards-compatible unsectioned recipes.
- [x] #4: empty handful quantity with validation for other units.
- [x] #4: optional Chef's notes below instructions, including editing/removal.
- [x] #4: compact single ingredient list with available/partial/missing statuses.
- [x] #4: stable ingredient inputs while editing portions, scaling once on save.
- [x] #4: numbered editable instruction steps, including add/remove and legacy text.
- [x] #5: all recipes in a categorized left sidebar, with empty/error/retry states.
- [x] #5: drag and drop onto calendar meal slots; accessible click/touch alternative.
- [x] #5: at least 14 consecutive calendar dates, with navigation and month boundaries.
- [x] #5: servings update for all assignments from the user's current date onward,
      including assignments beyond the visible calendar, without changing past meals
      or the source recipes. Persist assignment servings and verify reload behavior.
- [x] #6: working barcode scanning, permission/error handling, camera lifecycle.
- [x] #6: adding another item copies all latest matching item details, including
      expiration date, photo, and the existing group's threshold.
- [x] #6: identical products grouped while stock lots remain individually editable.
- [x] #6: threshold measurement-unit selection and meaningful stock comparison.
- [x] #6: Location Details below Location, persisted on add/edit and displayed.
- [x] Thorough Playwright coverage for every requirement and error/recovery paths.
- [x] Visual browser review at desktop and mobile sizes with screenshots inspected.
- [x] Unit/property tests, type checking, lint, and builds pass.
- [x] Update steering contracts and relevant feature requirements/design/tasks.

## Implementation decisions

Recipe categories use the existing recipe tags; recipes with multiple tags appear
in each matching category, and older untagged recipes remain in Uncategorized.
The planner keeps its seven-day navigation increment but displays two weeks.
Bulk servings use the user's local calendar date and apply to all future saved
assignments, not merely those loaded for the current two-week view.

## Completion evidence

See `verification.md` for the requirement mapping, command results and release limits.
