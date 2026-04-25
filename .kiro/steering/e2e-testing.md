---
inclusion: fileMatch
fileMatchPattern: "e2e/**"
---

# E2E Testing Guide

## Auth Strategy

Cognito uses SRP protocol — impossible to mock at the HTTP level. Instead, a Vite plugin (`mockAuthPlugin` in `frontend/vite.config.ts`) replaces the `cognitoClient.ts` module content at load time when `VITE_MOCK_AUTH=true`:

- The plugin reads `e2e/mocks/cognitoClient.ts` and returns its content when Vite loads the real `cognitoClient.ts`
- The mock accepts any credentials and returns a fake session
- `getCurrentSession()` returns the session after `signIn()` is called, so API auth headers work
- Production builds are never affected — the plugin is only active when `VITE_MOCK_AUTH=true`
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
await modal(page).getByLabel('Product Name')
```

## Coverage Expectation

Every user-facing interaction should have an e2e test. When implementing a new feature or fixing a bug that involves UI interaction, write or update e2e tests to cover it. This includes:

- Clicking buttons, links, menu items
- Filling and submitting forms
- Dropdown/autocomplete selection
- Keyboard navigation
- Error states visible to the user
- Any conditional UI (loading states, empty states, success/error messages)

If a user can do it in the browser, there should be a test for it.

```bash
npm run test:e2e           # headless
npm run test:e2e:headed    # watch the browser
npm run test:e2e:ui        # interactive UI mode
npx playwright test --debug
```

No `.env.test` file needed. All config is in `playwright.config.ts`.

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
- Vite dev server reuse — if component changes aren't picked up, kill the server and rerun.
