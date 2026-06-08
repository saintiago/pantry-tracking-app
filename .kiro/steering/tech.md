# Tech Stack

## Monorepo Structure
npm workspaces monorepo with three packages: `frontend`, `backend`, `infrastructure`.

## Frontend
- React 18 with TypeScript
- Vite for dev server and bundling (output to `frontend/build/`)
- Jest + ts-jest + jsdom for testing (@testing-library/react, @testing-library/user-event)
- fast-check for property-based testing
- amazon-cognito-identity-js for auth
- Service worker for offline/PWA support
- Inline styles (React.CSSProperties objects), no CSS framework

## Backend
- AWS Lambda (Node.js) handlers in TypeScript
- AWS SDK v3: DynamoDB (single-table design), S3, S3 presigner
- aws-jwt-verify for token validation
- Jest + ts-jest (node environment) for testing
- fast-check for property-based testing

## Infrastructure
- AWS CDK v2 (TypeScript)
- Services: DynamoDB, S3, Cognito, API Gateway REST, CloudFront, Lambda (NodejsFunction)
- Single stack: `PantryStack`

## Code Quality
- ESLint with @typescript-eslint (warn on unused vars and explicit any)
- Prettier: single quotes, trailing commas, 100 char width, 2-space indent, semicolons
- TypeScript strict mode, target ES2022

## Common Commands

```bash
# Install dependencies (from root)
npm install

# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run property-based tests only
npm run test:property

# Type check all workspaces
npm run type-check

# Lint
npm run lint

# Format
npm run format

# Frontend dev server
cd frontend && npm run dev

# Frontend build (requires VITE_USER_POOL_ID, VITE_USER_POOL_CLIENT_ID, VITE_API_URL env vars)
cd frontend && npm run build

# Backend build
cd backend && npm run build

# CDK deploy
cd infrastructure && npx cdk deploy

# Full deploy (infra + frontend)
./scripts/deploy.sh

# Frontend-only deploy
./scripts/deploy.sh --frontend-only
```

## GitHub CLI

The `gh` CLI tool is installed and authenticated for GitHub interactions (issues, PRs, releases, etc.). Use it directly for GitHub operations such as `gh issue view`, `gh pr create`, and `gh pr list`.
