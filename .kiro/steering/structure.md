# Project Structure

```
pantry-tracking-app/
├── frontend/                  # React PWA (Vite)
│   ├── public/                # Static assets (manifest.json, sw.js)
│   ├── src/
│   │   ├── auth/              # Authentication components and Cognito client
│   │   ├── components/        # Shared UI components (Layout, OnlineIndicator)
│   │   ├── pages/             # Page-level components (Inventory, Recipes, MealPlan, ShoppingList)
│   │   ├── styles/            # Global CSS
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
│   │   └── index.ts           # Entry point / exports
│   ├── jest.config.ts
│   └── tsconfig.json
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
- Backend handlers go in `backend/src/handlers/` (one file per Lambda)
- Tests are co-located with source files using `.test.ts` / `.test.tsx` suffix
- Property-based tests use `.property.test.ts` suffix
- DynamoDB uses single-table design with PK/SK and GSI1PK/GSI1SK
- Frontend uses simple state-based page routing via Layout component (no router library)
- Environment config is injected at build time via Vite `define` and read from `config.ts`
