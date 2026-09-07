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
neither establishes transaction correctness for the existing inventory writer.

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

- `meal-planner-navigation.spec.ts` covers the shared detail/cooking return flow,
  planned servings save/retry, category unions, calendar views, move/remove actions,
  mobile meal palette and contextual shopping. Titles open details; use the separate
  `Place <recipe>` handle for pointer, keyboard and touch placement. Open the meal
  action summary before removing an assignment.

- `recipe-issue4-edge-cases.spec.ts` adds stateful edit/save coverage for sections,
  handful validation, deferred portion scaling, notes removal, and instruction
  renumbering. It checks compact ingredient layout at desktop and mobile widths.
- `meal-planner-improvements.spec.ts` checks categorized recipes, real drag/drop,
  keyboard and mobile selection, two-week navigation, bulk servings and retries.
- `meal-planner-drag.spec.ts` checks mouse press/move/release independently of native
  HTML dragging, destination feedback, exact recipe identity after library scrolling,
  cancellation, and edge scrolling. Verify one saved meal, not only that a POST occurred.
  To check installed Windows Chrome, run
  `PLAYWRIGHT_CHANNEL=chrome npx playwright test e2e/meal-planner-drag.spec.ts`
  in Bash. Omitting the variable keeps the bundled Chromium default.
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
- Keep builds and browser runs sequential. Rebuilding the shared package during a Vite
  browser run can invalidate dependency state and makes failures difficult to diagnose.

## Shopping companion coverage

`language.spec.ts` covers language selection, separate browser contexts sharing an account,
reload persistence, fallback, async data, unchanged user content, forms, cooking, shopping,
save failures, and mobile layout. The mock Cognito client optionally routes locale reads
and writes through `/test-account-language` when `mock-language-api` is set in localStorage.
This opt-in behavior is used only by the mock-auth Vite plugin, never production builds.

`shopping-list.spec.ts` covers mint week/day/recipe filters, department grouping,
reserve math, shared basket state, manual edit/remove/undo, full purchase fields and
partial completion, preferences/package rounding, store shopping, budget/link/export
preview, deferral/unavailable, errors/reconnect and desktop/320/390px palette layouts.
Use role/name locators for full AddItem fields: required-marker label text differs
from the accessible name. Mock `/recipes/tags` when navigating across all app tabs.
