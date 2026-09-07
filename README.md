# Pantry Tracking App

React/TypeScript frontend, AWS Lambda backend, and AWS CDK infrastructure in an npm workspace.

## Local setup

Use Node.js 24 (the exact setup version is in `.nvmrc`) and npm. From the repository root:

```sh
npm ci
npx playwright install chromium
npm run type-check
npm run build --workspace frontend
```

## Develop and test without AWS

The existing Playwright setup provides mock Cognito authentication and per-test API fixtures. It automatically starts a separate Vite test server on http://localhost:4173.

```sh
npm run test:e2e -- e2e/meal-planner.spec.ts
npm run test:e2e:ui -- e2e/meal-planner.spec.ts
```

The UI command opens Playwright's interactive test runner. API mocks only apply inside tests; they do not provide a backend for an ordinary browser tab. Tests refuse to reuse a server on their port. Set `PLAYWRIGHT_PORT` to another free port if needed; the ordinary development server can stay on 5173.

Other checks:

```sh
npm test
npm run type-check
npm run lint
```

To pass Jest options directly, use `npm run test --workspace frontend -- --runInBand` (or `backend`).

## Frontend with an AWS development backend

Supply the outputs from an existing development stack in the same terminal before starting Vite:

```sh
export VITE_USER_POOL_ID='your-development-user-pool-id'
export VITE_USER_POOL_CLIENT_ID='your-development-client-id'
export VITE_API_URL='https://your-development-api-url'
npm run dev --workspace frontend
```

Open http://localhost:5173. The current Vite configuration reads these values from the shell environment, so putting them in `.env.local` alone will not configure the app. Real sign-in and data require the AWS services; there is no local Lambda/DynamoDB server in this repository.

Start with the [documentation index](docs/README.md) for architecture, contracts,
testing, feature history and the maintenance audit. Agent instructions live in
[AGENTS.md](AGENTS.md).

`npm run verify` runs the same full validation gate used by commits and CI.
The `@pantry/domain` workspace owns shared units; root test/type-check commands rebuild
it automatically. Run `npm run build:domain` after edits when using Vite directly.

## Production deployment

GitHub Actions deployment on pushes to `main` is defined in `.github/workflows/deploy.yml`. Before it can run successfully, an administrator must configure the AWS OIDC role and repository variable described in [GitHub deployment setup](docs/github-deployment.md).
