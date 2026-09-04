# Verification — issues #4, #5 and #6

Verified locally on 2026-09-04. Existing inventory-group work was preserved and
extended. No commit, push, migration, deployment or live data mutation was performed.

## Results

| Check                                  | Result                                                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Full Playwright suite                  | 177 passed                                                                                               |
| Backend unit/property suite            | 322 passed across 13 suites                                                                              |
| Frontend unit/property suite           | 638 passed across 44 suites                                                                              |
| Dedicated property command             | 26 backend + 52 frontend passed                                                                          |
| Type checking                          | All workspaces passed                                                                                    |
| ESLint                                 | Passed                                                                                                   |
| Backend and frontend production builds | Passed                                                                                                   |
| Diff whitespace check                  | Passed                                                                                                   |
| Visual review                          | Planner and recipe detail screenshots inspected at desktop/mobile sizes                                  |
| Live access                            | Signed in successfully after explicit approval; deployed v0.0.47 still has the original one-week planner |

The unit commands include property files; the dedicated property count is not an
additional independent test total. The backend's final run includes the two new
recipe pagination tests added during the completion audit.

## Requirement evidence

| Requirement                             | Implementation / authoritative verification                                                                                                                                               |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #4 unit option and alphabetical choices | Existing units metadata; `recipe-management.spec.ts` and `recipe-units-format.spec.ts` verify choices and quantity labels                                                                 |
| #4 ingredient sections                  | Recipe editor/detail; create/detail tests plus multiple-section/unsectioned checks in `recipe-issue4-edge-cases.spec.ts`                                                                  |
| #4 empty handful                        | Creation with null quantity, detail rendering and handful-to-unit validation; backend recipe validation/property tests                                                                    |
| #4 Chef's notes                         | Creation, display below instructions, edit and removal; stateful edge-case test verifies persisted null removal                                                                           |
| #4 compact unified ingredients          | One occurrence per ingredient, inline available/partial/missing statuses and measured quantity/name spacing at 390px and 1440px                                                           |
| #4 editing portions                     | Inputs remain unchanged until save; request scales numeric quantities once, preserves null; reopening and second save do not scale again                                                  |
| #4 numbered instructions                | Add/remove/renumber/save tests and existing legacy-string rendering/editing coverage                                                                                                      |
| #5 all categorized recipes              | Library categories, multi-tag and untagged cases, empty/error/retry tests; backend reads all recipe and tag database pages                                                                |
| #5 drag and drop                        | Actual Playwright `dragTo` produces the expected dated dinner assignment; keyboard and mobile selection alternatives also tested                                                          |
| #5 two-week calendar                    | Fourteen dates spanning August/September, navigation, persistence after navigation, and existing add/remove regressions                                                                   |
| #5 future servings                      | Today and far-future assignments change; yesterday and source recipe portions stay unchanged; invalid input and retry tested; backend pagination/ownership-scoped writes tested           |
| #6 barcode scanning                     | Real Quagga EAN-13 decoding from generated video, macro device constraint, stopped tracks, close/reopen, denied/unavailable manual lookup, real timeout, retry and manual-form navigation |
| #6 latest item details                  | Backend pagination sorts by creation time, not modification time; browser verifies copied expiration, photo, brand, shelf, quantity one and retained group threshold                      |
| #6 identical-product grouping           | Existing category/grouping suite plus adding another lot produces one group with three individually editable lots                                                                         |
| #6 threshold units                      | Persisted kg/g selection and low-stock boundary, clearing, save failures/retry; backend conversion and incompatible-unit rejection tests                                                  |
| #6 Location Details                     | Field follows Location; add/copy/edit/reopen/clear browser checks plus backend persistence and text validation                                                                            |

## Browser findings fixed during verification

- Expiration-date focus used a delayed timer that could steal focus from later typing.
  Focus now runs immediately after the autofill update.
- Scanner Retry previously ran while the video container was absent after timeout.
  Retry now starts through the effect after the container has rendered.
- Timeout manual entry now opens the Add Item form directly.
- Recipe lists and categories now read every database page for large libraries.

## Limits and release notes

Browser persistence tests use the project's documented mock-auth and stateful API
strategy. Backend tests independently verify database requests and validation.
The generated video exercises the real decoder, but does not establish optical
performance on every physical phone camera.

The changes are local. Live-account inspection verified access and the deployed
baseline; it did not publish this implementation or alter household data. A future
release must include the new collection-level `PUT /meal-plans` route and preserve
the inventory-group migration/release procedure already documented in
`../threshold-revamp/codex-plan.md`.
