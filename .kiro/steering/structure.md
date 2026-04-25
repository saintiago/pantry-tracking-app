# Project Structure

```
pantry-tracking-app/
├── frontend/                  # React PWA (Vite)
│   ├── public/                # Static assets (manifest.json, sw.js)
│   ├── src/
│   │   ├── api/               # API client modules
│   │   │   └── __tests__/     # Unit tests for API clients
│   │   ├── auth/              # Authentication components and Cognito client
│   │   │   └── __tests__/     # Unit tests for auth modules
│   │   ├── components/        # Shared UI components (Layout, OnlineIndicator, InventoryList)
│   │   │   └── __tests__/     # Unit + property tests for components
│   │   ├── pages/             # Page-level components (Inventory, AddItem, ItemDetail, Recipes, MealPlan, ShoppingList)
│   │   │   └── __tests__/     # Unit tests for pages
│   │   ├── styles/            # Global CSS
│   │   ├── types/             # Shared TypeScript types (units, etc.)
│   │   ├── App.tsx            # Root component with auth gating and page routing
│   │   ├── config.ts          # Runtime config from Vite env vars
│   │   ├── index.tsx          # Entry point
│   │   └── serviceWorkerRegistration.ts
│   ├── jest.config.ts
│   ├── vite.config.ts
│   └── tsconfig.json
├── backend/                   # Lambda handlers
│   ├── src/
│   │   ├── handlers/          # Lambda function handlers (one file per handler)
│   │   │   └── __tests__/     # Unit + property tests for handlers
│   │   ├── types/             # Shared backend types
│   │   └── index.ts           # Entry point / exports
│   ├── jest.config.ts
│   └── tsconfig.json
├── e2e/                       # Playwright end-to-end tests
│   ├── mocks/                 # Mock modules (e.g., cognitoClient.ts)
│   └── *.spec.ts              # E2E test specs
├── infrastructure/            # AWS CDK
│   ├── src/
│   │   ├── app.ts             # CDK app entry point
│   │   └── pantry-stack.ts    # Single stack with all resources
│   └── tsconfig.json
├── scripts/
│   └── deploy.sh              # Full deploy script (CDK + frontend build + S3 sync + CF invalidation)
├── .eslintrc.json
├── .prettierrc
├── tsconfig.json              # Root tsconfig (shared compiler options)
└── package.json               # Workspace root
```

## Conventions
- Frontend pages go in `frontend/src/pages/` as `<Name>Page.tsx`
- Shared frontend components go in `frontend/src/components/`
- Feature-specific frontend modules get their own folder (e.g., `frontend/src/auth/`)
- API client modules go in `frontend/src/api/<feature>/` as `<feature>.ts` with `__tests__/<feature>.test.ts`
- Backend handlers go in `backend/src/handlers/` (one file per Lambda)
- Tests go in `__tests__/` sibling directories next to the source they test
  - Unit tests use `.test.ts` / `.test.tsx` suffix
  - Property-based tests use `.property.test.ts` / `.property.test.tsx` suffix
  - Test file names match the source file they cover (e.g., `InventoryList.test.tsx` tests `InventoryList.tsx`)
- E2E tests go in `e2e/` at the project root using `.spec.ts` suffix — one file per page/feature
- DynamoDB uses single-table design with PK/SK and GSI1PK/GSI1SK
- Frontend uses simple state-based page routing via Layout component (no router library)
- **Prefer full-page navigation over modals/overlays.** New features that require a form or detail view must use a dedicated `<Name>Page.tsx` registered as a `PageId` in `App.tsx`, following the pattern established by `AddItemPage` and `ItemDetailPage`. Modals are only acceptable for simple confirmations (e.g., delete confirmation dialogs).
- Environment config is injected at build time via Vite `define` and read from `config.ts`
