# Shopping List verification

## Local verification — September 6, 2026

- Full unit/property suite: 323 backend and 650 frontend tests passed (59 suites).
- Full browser regression: 199 tests passed before adding the final missing-recipe
  empty-state regression. The final commit hook reruns the complete suite including
  that additional test; its result is required before pushing.
- Type checking and production builds passed in frontend, backend and infrastructure.
- ESLint passed. Desktop (1440px) and mobile (390px and 320px) layouts were checked.
- Shopping browser coverage: multiple recipe/day/week filters, past-day exclusion,
  servings, paginated inventory, unit conversion, linked low-stock extras, basket
  persistence/review, search, keyboard use, purchase validation/cancel/retry/success,
  refresh/reconnect, storage failure and missing recipe warnings.
- Pure calculation coverage includes chronological stock allocation, expiration,
  explicit/stale/ambiguous links, unknown quantities and account/period isolation.
- Backend regression confirms low-stock groups on later DynamoDB pages are returned.

The first commit-hook run caught a race in an existing inventory browser test:
it inspected mock state immediately after clicking Save. The test now waits for
the inventory category page to return before asserting persistence. The full hook
suite is rerun with this fix; hooks are never bypassed.

## Production verification

The main-branch workflow runs types, build and the meal-planner plus Shopping List
browser suites before deployment. It deploys the Inventory Lambda pagination fix
and frontend, then waits for CloudFront invalidation. The workflow associated with
the implementation commit is the release record. The delivery response records
its outcome and the authenticated live-browser verification.

Basket persistence is intentionally per account, device and selected planning
period. Cross-device sharing and full offline data synchronization are later work.

## Companion and palette extension — September 6, 2026

- Type checking, ESLint and the full unit/property suites pass. The extension adds
  calculation tests for reserve allocation, compatible/manual merging, package
  rounding, partial carry completion, real-lot conversions, purchase cadence and
  malformed storage. Final counts are recorded by the mandatory commit hook.
- Full browser regression: 202 tests passed. The final hook reruns this suite,
  including expanded full-purchase barcode/link/photo assertions. Shopping includes
  cancel/retry, partial purchases, package conversions, manual edit/remove/undo,
  alternative stores, persistence failures, budget preview, copy/export, filters,
  department grouping and cross-tab/mobile palette verification.
- Desktop (1440px), mobile (390px and 320px) screenshots inspected. No shopping
  horizontal overflow; dark text appears on the approved pastel surfaces.
- Purchase and preference navigation preserves the selected trip and view. Explicit
  package conversions follow real lot quantity/expiration; completed inventory
  writes are never retried because of a local storage failure.

Release gate: the main-branch Deploy production workflow must pass its verification
job and finish deployment/CloudFront invalidation. Check the released version in
the authenticated live browser, the three planning lists, mint week selections,
Shopping mode, the complete purchase form, and the manual entry form. Record the
workflow/commit and observed production outcome in the delivery response.

Scope: manual entries/preferences/history remain device-local. Order preview is
a budgeted draft with saved product links, not live pricing or retailer checkout.
