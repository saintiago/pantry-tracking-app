# Tooling

Use Node.js 24 (see `.nvmrc`) and the committed npm lockfile. `npm ci` installs the
four workspaces and builds `@pantry/domain`. There are no additional package managers.

- Frontend: React 18, TypeScript strict mode, Vite 6, Cognito client, inline styles.
- Backend: Node.js 24 Lambda, AWS SDK v3, DynamoDB single table; one handler per feature.
- Infrastructure: AWS CDK v2. Data, identity and hosting resources use retention on deletion.
- Tests: Jest 29 / ts-jest, Testing Library, fast-check and Playwright Chromium.
- Quality: ESLint with zero tolerated warnings, Prettier, EditorConfig and architecture budgets.

| Command (root)                                                        | Purpose                                                                       |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `npm ci`                                                              | Reproducible install and shared-domain build                                  |
| `npm run build:domain`                                                | Rebuild shared contracts after edits                                          |
| `npm run dev --workspace frontend`                                    | Vite development server                                                       |
| `npm run type-check`                                                  | Rebuild shared domain and check every workspace                               |
| `npm run lint`                                                        | Lint, rejecting warnings                                                      |
| `npm run check:architecture`                                          | Check module boundaries and size budgets                                      |
| `npm run check:docs`                                                  | Check local guide links and UTF-8 encoding                                    |
| `npm test`                                                            | All Jest unit, property and infrastructure tests                              |
| `npm run test:unit`                                                   | Jest tests excluding `.property.test.*`                                       |
| `npm run test:property`                                               | Property suites only                                                          |
| `npm run test:e2e`                                                    | All browser tests (starts its own mock-auth server)                           |
| `npm run build --workspace frontend`                                  | Type-check and production Vite build                                          |
| `npm run verify:bundle --workspace frontend`                          | Assert lazy scanner and separate on-demand language catalogs                  |
| `npm run verify:static`                                               | Type-check, lint and architecture checks                                      |
| `npm run test:e2e:production`                                         | Test the existing production build and language asset caching                 |
| `npm run verify`                                                      | Complete local/CI/commit validation gate, including production browser checks |
| `npm run audit:inventory -- --table <table> --output <new-file.json>` | Read-only complete table audit; builds domain/backend first                   |

The legacy `migrate:inventory-groups` entry point now delegates to the read-only
audit; `--apply` fails before any database request. See the [recovery runbook](recovery.md).

`npm run test:inventory:aws` builds the backend and runs isolated DynamoDB integration
checks. It requires AWS CLI credentials for the documented development account and
permission to create/read/write/delete its own temporary on-demand table. It generates
the table name itself (`PantryApp-inventory-test-*`), never accepts a production target,
and deletes the table in `finally`. Check cleanup output even on failure. This explicit
AWS lane is separate from the credential-free verification gate.
| `npm run format` | Format files; review the diff before committing |

Use workspace test commands to pass Jest options, for example
`npm test --workspace frontend -- --runInBand`. Build the shared domain first when
bypassing root scripts. `npm test` does not include Playwright; `npm run verify` does.

The frontend reads Vite configuration from the shell environment. See the root README
for AWS development values. Mock auth is only for Vite development tests; production
builds reject `VITE_MOCK_AUTH=true`. Real credentials never belong in fixtures.

Production delivery and AWS setup are documented in [deployment](../github-deployment.md).
Use the GitHub pipeline by default. The local deployment script is an operational
fallback, not a second normal release path.

Dependency maintenance: run `npm audit` against the committed lockfile, inspect proposed
updates, then rerun the complete gate. September 2026 remediation upgraded Vite to 6.4.3
and patched transitive dependencies. Quagga is pinned to 1.12.0: the published browser
bundle is identical to 1.12.1, which adds unused Node-only optional image dependencies
with a vulnerable Sharp range. Revisit that pin when upstream updates the range; do not
use a blanket forced audit update or omit optional dependencies to hide advisories.
