# Testing

## Test layers

- Unit tests exercise one rule or boundary with deterministic examples.
- Property tests exercise invariants across generated inputs; replay the reported seed
  and path on failure. Do not reproduce the implementation as the expected result.
- Handler tests exercise API Gateway contracts with mocked AWS calls; these are not
  tests of real DynamoDB concurrency or IAM behavior.
- Infrastructure tests synthesize the real stack with bundling replaced by inline code
  and assert retention, runtime, authorization and HTTPS. Production synth still bundles.
- Playwright covers critical journeys, navigation, persistence, errors, accessibility
  and layout with mocked auth/APIs. It does not prove live Cognito/AWS integration.

`npm test` includes unit, property and infrastructure suites. `test:unit` and
`test:property` are disjoint selections. `npm run verify` also runs static checks,
production build, bundle guard and the entire browser suite. CI uses the same command.
Tests live in sibling `__tests__/` directories; browser journeys live in `e2e/`.
Test pure extracted rules directly, rather than loading a component or AWS client.

Use the lowest layer that reliably catches the regression, plus a browser journey
when behavior crosses UI boundaries. Prefer user-observable assertions, explicit
fixtures and isolated browser state. Keep failure/error paths and realistic async
timing; avoid arbitrary sleeps and asserting only that a request occurred.

## Browser tests

The backend `inventory-audit.test.ts` suite covers reconciliation, account isolation,
legacy and mixed units, malformed quantities, stale links, non-mutation, stable
fingerprints and complete/failed pagination. It only mocks scan transport. The separate
[recovery drill](recovery.md) exercises an actual AWS restore and compares scanned data;
the isolated table restore itself does not establish transaction correctness.

`backend/src/inventory/__tests__/` now exercises transaction plans with a stateful
test database, generated mutation sequences and real handler contracts. Older suites
that asserted separate lot/group SDK calls were replaced with persisted-outcome checks;
recipe validation tests mock the inventory service, while the cross-feature handler
suite executes recipe placeholder creation through the real repository.

Run `npm run test:inventory:aws` for real DynamoDB semantics: concurrent first group
creation, additions, updates, reassignments, deletion, threshold transitions, actual
queries beyond 1 MB, injected transaction rejection, an ambiguous response after a
successful write, and replay of the same idempotency token. It also checks concurrent
recipe placeholders and cleans up its generated table. This was run successfully in
September 2026; it does not test production Lambda IAM, a high-throughput workload,
or durable HTTP request deduplication. Release browser checks cover the live IAM path.

## Auth Strategy

Cognito uses SRP protocol — impossible to mock at the HTTP level. Instead, a Vite plugin (`mockAuthPlugin` in `frontend/vite.config.ts`) replaces the `cognitoClient.ts` module content at load time when `VITE_MOCK_AUTH=true`:

- The plugin reads `e2e/mocks/cognitoClient.ts` and returns its content when Vite loads the real `cognitoClient.ts`
- The mock accepts any credentials and returns a fake session
- `getCurrentSession()` returns the session after `signIn()` is called, so API auth headers work
- Production builds explicitly fail when `VITE_MOCK_AUTH=true`
- The plugin normalizes Windows backslash paths to forward slashes for Vite compatibility

**Never** try to mock Cognito at the network/fetch/XHR level — the SRP handshake involves client-side crypto before any network call.

## API Strategy

All backend API calls are intercepted via `page.route()` in each test file. `VITE_API_URL` is set to `https://mock-api.test` in `playwright.config.ts` so API fetches don't collide with the Vite dev server.

## Vite Plugin Details

The `mockAuthPlugin` in `frontend/vite.config.ts`:

- Uses `enforce: 'pre'` to run before other plugins
- Uses the `load` hook to intercept module loading by resolved file path
- Normalizes paths with `.split(path.sep).join('/')` for Windows compatibility
- Returns `null` when `VITE_MOCK_AUTH !== 'true'` (no-op for production)

## Dropdown Interaction Pattern

The `AutocompleteDropdown` component uses `onMouseDown` (not `onClick`) to prevent a race condition where the outside-click handler closes the dropdown before selection fires. Always wait for the option to be visible before clicking:

```typescript
async function selectOption(page: Page, text: string) {
  const option = page.locator(`[role="option"]:has-text("${text}")`);
  await expect(option).toBeVisible({ timeout: 3000 });
  await option.click();
}
```

## Selector Pattern

Scope modal selectors to the dialog to avoid strict mode violations with inventory page filter inputs:

```typescript
function modal(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Add Item' });
}
await modal(page).getByLabel('Product Name');
```

## Coverage Expectation

Cover each user journey and meaningful UI regression. Use unit/property tests for
combinatorial validation and arithmetic instead of repeating every input combination
in a browser. Include keyboard/mobile and loading/error states when relevant to the
changed interaction. The suite must not silently omit entire features in CI.

```bash
npm run test:e2e           # headless
npm run test:e2e:headed    # watch the browser
npm run test:e2e:ui        # interactive UI mode
npx playwright test --debug
```

No `.env.test` file needed. All config is in `playwright.config.ts`.

## Issue #4–#6 regression coverage

- `meal-planner-navigation.spec.ts` covers shared detail/cooking return, serving edits,
  category union, retained view/search/focus, keyboard placement, move/removal and
  uncertain-save reconciliation. `meal-planner.spec.ts` covers calendar navigation,
  flexible entries, reload persistence, X hit targets and idempotent retry.

- `recipe-issue4-edge-cases.spec.ts` adds stateful edit/save coverage for sections,
  handful validation, deferred portion scaling, notes removal, and instruction
  renumbering. It checks compact ingredient layout at desktop and mobile widths.
- `meal-planner-improvements.spec.ts` covers batch yield, linked leftovers, prepared
  consumption, dependent removal/Undo, copy previews, favorite persistence, nutrition
  subtotals and grocery ranking errors. `meal-planner-drag.spec.ts` uses real pointer
  and browser touch input for scheduling/moving/removing, occupied targets, cancellation,
  long libraries, scroll, touch hold and 320/390px previews. Card surfaces replace the
  superseded handle and overflow menu assertions. The shared stateful API fixture
  validates the actual planner invariants; backend tests prove transaction behavior.
- `inventory-improvements.spec.ts` checks photo/expiration/shelf copying, persisted
  grouping, threshold units and errors, and Location Details editing/clearing.
- `barcode-scanning.spec.ts` substitutes camera hardware with a canvas video stream
  containing a valid generated EAN-13 pattern. Quagga decoding runs unchanged. It
  checks camera locking, stream release, permission/unavailable fallback, timeout,
  retry and manual entry. Do not replace the decoder with a success callback.

Scope recipe-name assertions to calendar date columns when the recipe library
contains the same names. Use exact labels for instruction fields because remove
buttons include the same step text. Never put live credentials into test fixtures.

## Structure

```
e2e/
├── mocks/
│   └── cognitoClient.ts   # Mock auth module loaded by Vite plugin
└── *.spec.ts
```

## Known Gotchas

- `global is not defined` — fixed by `global: 'globalThis'` in `vite.config.ts`. Don't remove it.
- Windows path separators — the Vite plugin normalizes `\` to `/` for path matching.
- `VITE_API_URL` must be set to a non-empty dummy URL (e.g. `https://mock-api.test`) so API fetches don't hit the Vite dev server.
- Playwright starts its own server on port 4173 and refuses server reuse. Override `PLAYWRIGHT_PORT` if occupied; custom contexts must inherit the `baseURL` fixture. The ordinary development server can remain on 5173.
- Its Vite server forces dependency optimization on startup so rebuilt workspace exports cannot use an older cached bundle.
- Keep builds and browser runs sequential. Rebuilding the shared package during a Vite
  browser run can invalidate dependency state and makes failures difficult to diagnose.

## Shopping companion coverage

`language.spec.ts` covers language selection, separate browser contexts sharing an account,
reload persistence, fallback, async data, unchanged user content, forms, cooking, shopping,
save failures, and mobile layout. The mock Cognito client optionally routes locale reads
and writes through `/test-account-language` when `mock-language-api` is set in localStorage.
This opt-in behavior is used only by the mock-auth Vite plugin, never production builds.

`language-loading.spec.ts` verifies selected-only fetches, fresh device preferences and
download-error retry without losing a form. It blocks service workers so intercepted
failures reach the page instead of a worker's cache fallback. Await the selected
button's `aria-pressed` state before testing persistence or reloading.

`npm run test:e2e:production` serves the existing production build on port 4176
(`PLAYWRIGHT_PRODUCTION_PORT` overrides it). It uses the real build without mock auth or
signing in. `e2e-production/language-catalogs.spec.ts` checks actual emitted JSON requests,
English/no-download startup, fresh Italian/only-Italian startup, cached offline reload,
and unavailable-language retry. Outage routes use the context so they cover worker
fetches too. This lane runs after the regular browser suite in the full gate; build first
when invoking it directly. The bundle guard also rejects inlined or preloaded dictionaries.

`shopping-list.spec.ts` covers mint week/day/recipe filters, department grouping,
reserve math, shared basket state, manual edit/remove/undo, full purchase fields and
partial completion, preferences/package rounding, store shopping, budget/link/export
preview, deferral/unavailable, errors/reconnect and desktop/320/390px palette layouts.
Use role/name locators for full AddItem fields: required-marker label text differs
from the accessible name. Mock `/recipes/tags` when navigating across all app tabs.

## Issue #10 images, expiration and Settings

`issue10-recipes-settings.spec.ts` covers real browser image decoding/conversion,
private-image API boundaries with mocked transport, busy-save controls, upload/save
retry, instruction-photo alignment, detail/cooking/reload/removal, expiration windows
and inventory retry, and Settings location CRUD plus Inventory refresh at 320px.
Recipe-image handler tests cover bounded formats, reference alignment, authentication
and account-scoped keys; pure expiration tests cover date boundaries, invalid/expired
or empty stock, linked groups, compatible units, ordering and non-mutation.

`inventory-issues-11-12.spec.ts` covers copying quantity/unit/N/A/icon, saving and
reopening dates, category colors, location summaries, low-stock and removal colors,
confirmation cancel/accept, keyboard removal, failure retry and 320px layout.
Handler tests exercise null/date transitions and icon persistence through transactions;
shopping tests verify non-expiring stock allocation and reserve calculations.

## Expanded planner contracts

Meal-plan handler tests retain legacy CRUD and generated validation/persistence checks.
`planner-v2.test.ts` uses a stateful database double with conditional transactions and
pagination to cover ownership, conflicting allocations, ambiguous commit receipts,
cancellation fences, prepared nutrition, actual-yield shortages and consumption history
through removal/restoration. Pure frontend tests cover recipe/daily calorie arithmetic,
unknown values, batch shopping, cross-week dependencies, copy identity and pantry scoring.
These doubles do not prove AWS transaction/IAM integration; verify released UI operations
against the real authenticated API. Prepared-batch confirmation never deducts raw stock.
