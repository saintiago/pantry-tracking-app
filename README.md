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

The existing Playwright setup provides mock Cognito authentication and per-test API fixtures. It automatically starts Vite on http://localhost:5173.

```sh
npm run test:e2e -- e2e/meal-planner.spec.ts
npm run test:e2e:ui -- e2e/meal-planner.spec.ts
```

The UI command opens Playwright's interactive test runner. API mocks only apply inside tests; they do not provide a backend for an ordinary browser tab. Stop any independently running Vite server before these commands so the test runner starts it with the correct mock environment.

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

Architecture and workflow details are in `.kiro/steering/` and `CLAUDE.md`.

## Production deployment

GitHub Actions deployment on pushes to `main` is defined in `.github/workflows/deploy.yml`. Before it can run successfully, an administrator must configure the AWS OIDC role and repository variable described in [GitHub deployment setup](docs/github-deployment.md).
