# Requirements Document: Barcode Scanner Lazy Load

## Introduction

The frontend's main bundle is currently ~500KB minified, dominated by `@ericblade/quagga2` (~300–400KB). Quagga2 is pulled into the main chunk because `BarcodeScanner` is statically imported by `InventoryPage`, so every user pays the cost on every page load even if they never open the scanner.

This feature converts `BarcodeScanner` into a lazy-loaded component using `React.lazy(() => import(...))` so that `Quagga2` is emitted to a separate chunk and fetched on demand only when the user activates "Barcode Scan" from the Add menu. The expected outcome is a main bundle of ~150–200KB with no functional change to the scanner itself.

The change is a frontend-only code-splitting refactor. There are no backend, DynamoDB, S3, or API contract changes, and no `data-model.md` updates.

## Glossary

- **BarcodeScanner**: The React component at `frontend/src/components/BarcodeScanner/BarcodeScanner.tsx` that wraps `@ericblade/quagga2` and provides the scanner modal UI.
- **InventoryPage**: The page component at `frontend/src/pages/InventoryPage/InventoryPage.tsx`. It is currently the only call site that imports `BarcodeScanner` as a value.
- **Lazy_Import**: A `React.lazy(() => import('...'))` expression that defers loading the underlying module until the component is first rendered.
- **Suspense_Boundary**: A `<React.Suspense fallback={...}>` block that renders a fallback element while a lazy child is loading.
- **BarcodeScannerLoadingFallback**: The local React component rendered by the Suspense boundary while the scanner chunk is being fetched. Provides a visible spinner and an `aria-live` status message.
- **BarcodeScannerErrorBoundary**: A React Error Boundary wrapping the Suspense block to catch chunk-load failures and present a recoverable error to the user.
- **Entry_Chunk**: The JavaScript chunk(s) referenced directly by `<script>` tags in `build/index.html` after `npm run build`.
- **Lazy_Chunk**: A separate JavaScript chunk emitted by Vite/Rollup for a dynamic `import()` expression. Loaded by the browser only when the corresponding `import()` is evaluated.
- **Bundle_Verification_Script**: The Node script `frontend/scripts/verify-bundle-split.mjs` (introduced by this feature) that asserts Quagga2 source code is absent from any Entry_Chunk and present in exactly one Lazy_Chunk.

## Requirements

### Requirement 1: Lazy Load the BarcodeScanner Component

**User Story:** As an end user, I want the app's initial JavaScript bundle to be smaller, so that pages load faster on every visit, even when I do not use the barcode scanner.

#### Acceptance Criteria

1. THE InventoryPage SHALL import `BarcodeScanner` only via a `Lazy_Import` (`React.lazy(() => import('...'))`) for its value reference.
2. THE InventoryPage MAY import `BarcodeLookupResult` as a type-only import (`import type { ... }`) since type-only imports are erased at compile time and do not produce a runtime dependency on the module.
3. THE InventoryPage SHALL NOT contain any other static value import of `BarcodeScanner` or `@ericblade/quagga2`.
4. WHEN the InventoryPage source is searched, no other file in `frontend/src/` SHALL contain a static value import of `BarcodeScanner` or `@ericblade/quagga2`.

### Requirement 2: Conditional Render Behind Suspense

**User Story:** As an end user, I want the scanner chunk to only be downloaded when I actually open the scanner, so that I do not pay for code I never use.

#### Acceptance Criteria

1. THE InventoryPage SHALL render the lazy `BarcodeScanner` element only when its `scannerOpen` state is `true`, using a conditional render of the form `{scannerOpen && (<Suspense ...><BarcodeScanner ... /></Suspense>)}`.
2. THE Suspense_Boundary around `BarcodeScanner` SHALL provide a `fallback` prop that renders a `BarcodeScannerLoadingFallback` element.
3. WHEN `scannerOpen` is `false`, THE InventoryPage SHALL NOT render the `BarcodeScanner` element or its Suspense_Boundary, so that React does not trigger the dynamic `import()`.
4. WHEN the user clicks "Barcode Scan" in the Add menu for the first time in a session, THE InventoryPage SHALL set `scannerOpen` to `true`, which SHALL cause React to evaluate the Lazy_Import and the browser to fetch the corresponding Lazy_Chunk.

### Requirement 3: Initial Bundle Excludes Quagga2

**User Story:** As an end user, I want the main bundle to no longer contain Quagga2, so that the cold-load JavaScript size is reduced from ~500KB toward ~150–200KB.

#### Acceptance Criteria

1. WHEN `npm run build` is executed in the `frontend` workspace, THE Vite/Rollup output SHALL emit at least one Lazy_Chunk that contains the `BarcodeScanner` module and its `@ericblade/quagga2` dependency.
2. WHEN `npm run build` is executed, NO Entry_Chunk referenced by `build/index.html` SHALL contain Quagga2 source code.
3. THE Bundle_Verification_Script SHALL exit with status `0` after a successful build that satisfies Acceptance Criteria 3.1 and 3.2.
4. IF an Entry_Chunk contains a Quagga2 marker (e.g., `'@ericblade/quagga2'`, `Quagga.onProcessed`, or `CameraAccess`), THEN THE Bundle_Verification_Script SHALL exit with a non-zero status and a diagnostic message identifying the offending chunk filename.
5. IF zero Lazy_Chunks contain Quagga2 markers, OR more than one Lazy_Chunk contains Quagga2 markers, THEN THE Bundle_Verification_Script SHALL exit with a non-zero status and a diagnostic message describing the count.
6. WHEN the InventoryPage is rendered with `scannerOpen === false` in a real browser, THE browser SHALL NOT issue a network request for the Lazy_Chunk that contains Quagga2.

### Requirement 4: Functional Equivalence of the Scanner

**User Story:** As an end user, I want the barcode scanner to work exactly as it does today, so that lazy loading is invisible to me except for being faster overall.

#### Acceptance Criteria

1. WHEN the user activates the scanner via the Add menu after lazy loading, THE BarcodeScanner SHALL initialize the camera and detect barcodes using the same `Quagga.init`/`Quagga.start`/`Quagga.onDetected` flow as before the refactor.
2. WHEN the BarcodeScanner detects a barcode, THE InventoryPage SHALL receive the same `BarcodeLookupResult` callback shape (`barcode`, `found`, `product`) as before the refactor and SHALL navigate to AddItemPage with the same prefill data.
3. THE BarcodeScanner SHALL preserve all existing user-visible behaviors: 30-second countdown timer, retry-after-timeout, manual barcode entry fallback when the camera is unavailable, and permission-denied messaging.
4. THE public TypeScript surface of `BarcodeScanner` (`default export` plus the `BarcodeLookupResult` named type) SHALL remain unchanged so that consumers can keep importing the type with `import type`.
5. THE `e2e/barcode-autofill.spec.ts` test suite SHALL continue to pass without modification of its assertions.

### Requirement 5: Suspense Loading Fallback

**User Story:** As an end user, I want a clear loading indicator while the scanner is being fetched, so that I am not confused by a delay between clicking "Barcode Scan" and seeing the scanner.

#### Acceptance Criteria

1. THE BarcodeScannerLoadingFallback SHALL render a visible loading message (e.g., "Loading scanner…") and a visible spinner while the Lazy_Chunk is being fetched.
2. THE BarcodeScannerLoadingFallback SHALL include `role="status"` and `aria-live="polite"` (or equivalent) so that assistive technology announces the loading state.
3. THE BarcodeScannerLoadingFallback SHALL include a stable test selector (`data-testid="barcode-scanner-loading"`) so unit and e2e tests can assert its presence and disappearance.
4. WHEN the user clicks "Barcode Scan" and the Lazy_Chunk has not yet been loaded, THE BarcodeScannerLoadingFallback SHALL be visible until the BarcodeScanner has fully mounted, at which point it SHALL be unmounted.
5. WHEN the user clicks "Barcode Scan" a second time within the same session and the Lazy_Chunk is already cached, THE Suspense_Boundary SHALL resolve synchronously and the BarcodeScannerLoadingFallback SHALL NOT be rendered.

### Requirement 6: Chunk Load Failure Recovery

**User Story:** As an end user, I want the rest of the inventory page to keep working if the scanner chunk fails to load (for example because I am offline), so that one failed feature does not break my whole session.

#### Acceptance Criteria

1. THE InventoryPage SHALL wrap the Suspense_Boundary that contains `BarcodeScanner` in a BarcodeScannerErrorBoundary that catches errors thrown during render of the lazy element, including chunk-load failures.
2. WHEN the BarcodeScannerErrorBoundary catches a chunk-load error, THE BarcodeScannerErrorBoundary SHALL render a user-visible error overlay with a "Retry" action and a "Close" action, and SHALL NOT propagate the error further up the component tree.
3. WHEN the user clicks "Retry" in the chunk-load error overlay, THE InventoryPage SHALL reset the error state and trigger another attempt to load the Lazy_Chunk.
4. WHEN the user clicks "Close" in the chunk-load error overlay, THE InventoryPage SHALL set `scannerOpen` to `false`, unmount the Suspense_Boundary, and continue to function normally for all other interactions on the page.
5. WHILE the BarcodeScannerErrorBoundary is showing the error overlay, THE rest of the InventoryPage (inventory list, locations, add/remove buttons, navigation) SHALL remain functional.

### Requirement 7: No Backend or Data Model Changes

**User Story:** As a maintainer, I want this refactor to be limited to the frontend bundling, so that the backend, database, and API contracts are not affected.

#### Acceptance Criteria

1. THIS feature SHALL NOT modify any file under `backend/`.
2. THIS feature SHALL NOT modify `.kiro/steering/data-model.md`.
3. THIS feature SHALL NOT modify `infrastructure/`.
4. THIS feature SHALL NOT change any API route, request body, or response body.
5. THIS feature SHALL NOT change any DynamoDB access pattern, S3 layout, or IndexedDB schema.

### Requirement 8: Existing Tests Continue to Pass

**User Story:** As a maintainer, I want the existing test suite to remain green after the refactor, so that I have high confidence that no regression has been introduced.

#### Acceptance Criteria

1. WHEN the unit test suite is run via `npm run test:unit`, all existing tests SHALL pass.
2. WHEN the property test suite is run via `npm run test:property`, all existing tests SHALL pass.
3. WHEN the type checker is run via `npm run type-check`, no new type errors SHALL be introduced.
4. WHEN the linter is run via `npm run lint`, no new lint errors or warnings SHALL be introduced.
5. WHEN the Playwright e2e suite is run, the existing `e2e/barcode-autofill.spec.ts` SHALL pass without modification of its assertions; e2e tests that mount `InventoryPage` MAY use `await waitFor(...)` or `findBy*` queries to handle the new asynchronous mount of `BarcodeScanner`, but SHALL NOT need to be deleted or rewritten to assert different behavior.

## Correctness Properties

### Property 1: Functional Equivalence of the Scanner

*For any* user-driven flow that activates the barcode scanner from the Add menu, THE lazy-loaded BarcodeScanner SHALL produce a working scanner UI behaviorally indistinguishable from the eagerly-loaded BarcodeScanner. Camera initialization, barcode detection, manual entry fallback, timeout, retry, and the `onBarcodeDetected` callback SHALL all behave exactly as in the pre-refactor implementation.

**Verification:** Existing example-based tests (`InventoryPage.test.tsx`) and the existing e2e test (`e2e/barcode-autofill.spec.ts`) continue to pass.

**Validates: Requirements 4.1, 4.2, 4.3, 4.5**

### Property 2: Initial Bundle Excludes Quagga2

*For any* production build of the frontend (`npm run build`), THE Entry_Chunk(s) loaded synchronously by `build/index.html` SHALL NOT contain Quagga2 source code, AND Quagga2 SHALL be present in exactly one Lazy_Chunk.

**Verification:** `frontend/scripts/verify-bundle-split.mjs` (the Bundle_Verification_Script) reads the build output, identifies entry chunks via the `<script>` tags in `index.html`, scans every emitted JS file for Quagga2 markers, and asserts that no entry chunk matches and exactly one non-entry chunk matches.

This is a deterministic build-output property, not a fast-check property.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

### Property 3: Suspense Fallback During Chunk Load

*For any* first-time activation of the scanner within a session (when the Lazy_Chunk is not yet cached), THE BarcodeScannerLoadingFallback SHALL be visible to the user from the moment `scannerOpen` becomes `true` until the chunk has finished loading and `BarcodeScanner` has mounted.

**Verification:** A unit test in `InventoryPage.test.tsx` mocks the dynamic import with a deferred promise, clicks "Barcode Scan", asserts the fallback appears, resolves the import, and asserts the fallback is replaced by the scanner mock.

**Validates: Requirements 5.1, 5.2, 5.3, 5.4**

### Property 4: Lazy Chunk Is Not Fetched Before Activation

*For any* render of `InventoryPage` where `scannerOpen === false`, THE browser SHALL NOT issue a network request for the BarcodeScanner Lazy_Chunk. The chunk SHALL only be requested after `scannerOpen` first transitions to `true`.

**Verification:** An e2e test loads the inventory page, monitors network requests for `*barcode-scanner*.js` (or whichever filename Vite emits), asserts no such request occurred before user interaction, then clicks "Barcode Scan" and asserts the request now appears.

**Validates: Requirements 2.1, 2.3, 2.4, 3.6**

### Property 5: Chunk Load Failure Is Recoverable

*For any* simulated failure of the dynamic `import()` (network error or HTTP 404), THE BarcodeScannerErrorBoundary SHALL catch the error, present a recoverable overlay with Retry and Close actions, and leave the rest of the InventoryPage interactive. After clicking Close, THE user SHALL be able to continue using all other inventory features.

**Verification:** A unit test mocks the dynamic import to reject with an Error, asserts the error overlay renders with both buttons, clicks Close, and asserts the inventory list remains visible and interactive.

**Validates: Requirements 6.1, 6.2, 6.4, 6.5**
