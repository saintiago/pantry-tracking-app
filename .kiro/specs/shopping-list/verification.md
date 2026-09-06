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
