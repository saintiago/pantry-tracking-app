# Implementation Plan: Barcode Scanner Lazy Load

## Overview

This refactor lazy-loads `BarcodeScanner` (and therefore `@ericblade/quagga2`) so the heavy barcode-scanning code is only fetched when the user opens the scanner. Work proceeds in five small layers: (1) the `InventoryPage` source change, (2) a Suspense fallback component, (3) an Error Boundary for chunk-load failures, (4) updated unit tests and a new e2e test, (5) a deterministic build-output verification script that asserts the bundle has actually been split.

The existing `BarcodeScanner.tsx` component is not modified — its public surface stays exactly the same, which is why the existing `e2e/barcode-autofill.spec.ts` continues to pass without changes.

This feature has no fast-check property-based tests. As documented in the design, the observable invariants are either source-text invariants, build-output invariants, or single-event behavioral invariants, all of which are best verified by example-based unit tests, an e2e test, and the build-output script. There is no input space worth quantifying with fast-check.

## Tasks

- [x] 1. Add the Suspense fallback and Error Boundary infrastructure inside `InventoryPage`
  - [x] 1.1 Add a `BarcodeScannerLoadingFallback` component to `frontend/src/pages/InventoryPage/InventoryPage.tsx`
    - Local React component (defined in the same file or a small sibling file in the same folder)
    - Renders a modal-style overlay matching the visual weight of the scanner modal
    - Includes a visible spinner and the text "Loading scanner…"
    - Includes `role="status"`, `aria-live="polite"`, `aria-label="Loading barcode scanner"`
    - Includes `data-testid="barcode-scanner-loading"` for test selectors
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 1.2 Add a `BarcodeScannerErrorBoundary` class component in `frontend/src/pages/InventoryPage/InventoryPage.tsx` (or a sibling file)
    - Standard React Error Boundary using `componentDidCatch` / `getDerivedStateFromError`
    - State: `{ error: Error | null }`
    - When `error` is truthy, renders a small overlay with a clear message ("Couldn't load the scanner."), a `Retry` button, and a `Close` button
    - Props: `onClose: () => void`, `onRetry: () => void`, `children: React.ReactNode`
    - Includes `data-testid="barcode-scanner-error"` on the error overlay
    - _Requirements: 6.1, 6.2, 6.4_

- [x] 2. Convert the `BarcodeScanner` import in `InventoryPage` to a lazy import
  - [x] 2.1 Replace the static value import with `const BarcodeScanner = lazy(() => import('../../components/BarcodeScanner/BarcodeScanner'))`
    - Keep `import type { BarcodeLookupResult } from '../../components/BarcodeScanner/BarcodeScanner'` exactly as a type-only import (erased at compile time, no runtime dependency)
    - Add `Suspense` and `lazy` to the existing `import React from 'react'` line
    - _Requirements: 1.1, 1.2_

  - [x] 2.2 Wrap the rendered `BarcodeScanner` element with the new error boundary, the Suspense boundary, and a conditional render keyed off `scannerOpen`
    - Replace `<BarcodeScanner isOpen={scannerOpen} onClose={...} onBarcodeDetected={...} />` with:
      ```
      {scannerOpen && (
        <BarcodeScannerErrorBoundary
          onClose={() => setScannerOpen(false)}
          onRetry={() => { setScannerOpen(false); setTimeout(() => setScannerOpen(true), 0); }}
        >
          <Suspense fallback={<BarcodeScannerLoadingFallback />}>
            <BarcodeScanner
              isOpen={scannerOpen}
              onClose={() => setScannerOpen(false)}
              onBarcodeDetected={handleBarcodeDetected}
            />
          </Suspense>
        </BarcodeScannerErrorBoundary>
      )}
      ```
    - The conditional render is essential — without it, the lazy element would mount on every InventoryPage render and trigger the dynamic import immediately, defeating the optimization
    - The `onRetry` toggles `scannerOpen` off and back on so React re-evaluates the lazy import
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 6.3_

  - [x] 2.3 Verify no other static value imports of `BarcodeScanner` or `@ericblade/quagga2` remain in `frontend/src/`
    - Run `rg -n "from '.*BarcodeScanner'" frontend/src` and confirm only the lazy import in `InventoryPage.tsx` and the type-only import remain
    - Run `rg -n "@ericblade/quagga2" frontend/src` and confirm `BarcodeScanner.tsx` is the only consumer
    - _Requirements: 1.3, 1.4_

- [x] 3. Add the Bundle Verification Script
  - [x] 3.1 Create `frontend/scripts/verify-bundle-split.mjs`
    - Read `frontend/build/index.html` and extract entry chunk filenames from `<script>` tags
    - Walk every `.js` file in `frontend/build/assets/` and search each for Quagga2 markers (e.g. `@ericblade/quagga2`, `Quagga.onProcessed`, `CameraAccess`)
    - Assert: zero entry chunks contain a marker; exactly one non-entry chunk contains a marker
    - Print a success message and exit `0` on success
    - Print a clear diagnostic and exit `1` on failure
    - _Requirements: 3.3, 3.4, 3.5_

  - [x] 3.2 Add a `verify:bundle` npm script to `frontend/package.json`
    - `"verify:bundle": "node scripts/verify-bundle-split.mjs"`
    - Document in the task description that this script is to be run after `npm run build`
    - _Requirements: 3.3_

  - [x] 3.3 Run the script against a fresh production build and confirm Property 2 holds
    - Execute `cd frontend && npm run build && npm run verify:bundle`
    - On success the script prints "OK: bundle split verified" and exits 0
    - This is the canonical assertion for Requirement 3 (initial bundle excludes Quagga2)
    - _Requirements: 3.1, 3.2, 3.3_

- [x] 4. Update existing `InventoryPage` unit tests to handle the asynchronous mount
  - [x] 4.1 Add a default `jest.mock(...)` for `BarcodeScanner` in `frontend/src/pages/InventoryPage/__tests__/InventoryPage.test.tsx`
    - Stubs the module with `__esModule: true, default: jest.fn(() => <div data-testid="barcode-scanner-mock" />)`
    - Ensures Quagga is never required in the jsdom test environment (which has no camera anyway)
    - Existing tests already check for `Barcode Scan` menu item text only; they continue to pass without other changes
    - _Requirements: 4.5, 8.1_

  - [x] 4.2 Add a unit test that asserts the loading fallback appears on first scanner open
    - Use a deferred Promise to mock the dynamic import so the lazy element stays suspended during the assertion window
    - Click "Add" → "Barcode Scan", assert `screen.getByTestId('barcode-scanner-loading')` is present
    - Resolve the deferred promise, await `findByTestId('barcode-scanner-mock')`, assert the loading fallback is gone
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 4.3 Add a unit test that asserts the loading fallback does NOT appear on second open within the same test
    - Open scanner, close it, reopen — assert the loading fallback never appears the second time (module is cached)
    - _Requirements: 5.5_

  - [x] 4.4 Add a unit test that asserts the error boundary catches a failed import
    - Mock the dynamic import to reject with `new Error('Loading chunk failed')`
    - Click "Add" → "Barcode Scan"
    - Assert `screen.getByTestId('barcode-scanner-error')` is present with `Retry` and `Close` buttons
    - Click `Close`, assert the error overlay unmounts and other inventory UI (the inventory list, the Add button) remains visible and clickable
    - _Requirements: 6.1, 6.2, 6.4, 6.5_

  - [x] 4.5 Add a unit test for Retry behavior
    - Mock the dynamic import to reject once then resolve on the second call
    - Click `Retry` after the first failure, await the scanner mock, assert it eventually appears
    - _Requirements: 6.3_

- [x] 5. Add a focused e2e test for lazy-load behavior
  - [x] 5.1 Create `e2e/barcode-scanner-lazy-load.spec.ts`
    - Use the same auth/mock setup pattern as `e2e/barcode-autofill.spec.ts`
    - Login, navigate to Inventory
    - Use `page.waitForLoadState('networkidle')` then assert that no request URL matches `/barcode-scanner.*\\.js$/i` (or equivalent pattern for whichever filename Vite emits) has been issued yet
    - Click "Add" → "Barcode Scan"
    - Assert the loading fallback (`data-testid="barcode-scanner-loading"`) becomes visible OR the chunk request is observed via `page.waitForRequest`
    - Assert the scanner overlay (`data-testid="barcode-scanner-overlay"`) eventually appears
    - Close the scanner, reopen, assert the loading fallback does not reappear
    - _Requirements: 2.3, 2.4, 3.6, 5.4, 5.5_

- [x] 6. Service worker cache check
  - [x] 6.1 Inspect `frontend/public/sw.js` to confirm it does not enumerate explicit chunk filenames in a precache list
    - If it does, update the pattern to include `assets/*.js` or the new chunk filename so subsequent visits cache the new chunk
    - If it uses a runtime-cache strategy with no precache list, no change is needed; document this finding in the task notes
    - _Requirements: 4.5, 8.5_

- [x] 7. Final checkpoint — Run the full quality gate
  - [x] 7.1 Run `npm run type-check` from the workspace root and confirm no new type errors
    - _Requirements: 8.3_
  - [x] 7.2 Run `npm run lint` and confirm no new lint errors or warnings
    - _Requirements: 8.4_
  - [x] 7.3 Run `npm run test:unit` and confirm all unit tests pass
    - _Requirements: 8.1_
  - [x] 7.4 Run `npm run test:property` and confirm all property tests pass (no new property tests are added by this feature, but the existing suite must still pass)
    - _Requirements: 8.2_
  - [x] 7.5 Run `npm run build` then `npm run verify:bundle` from `frontend/` and confirm the script exits 0
    - _Requirements: 3.1, 3.2, 3.3_
  - [x] 7.6 Run the Playwright e2e suite and confirm `e2e/barcode-autofill.spec.ts` and the new `e2e/barcode-scanner-lazy-load.spec.ts` both pass
    - _Requirements: 4.5, 8.5_
  - [x] 7.7 Per `.kiro/steering/workflow.md`: any pre-existing failures uncovered during the gate must be fixed, not skipped
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

## Notes

- No tasks are marked optional (no `*`); each task in this plan is needed to satisfy at least one acceptance criterion. The plan is intentionally small because the change is small.
- This feature has no fast-check property-based tests. The prework analysis (stored in context) explains why: the observable invariants here are deterministic build outputs, source-text constraints, or single-event behaviors — none has an input space worth quantifying. Example-based unit tests, an e2e test, and the build-verification script are the natural and sufficient verification mechanism. If a future change introduces a parameterized aspect (e.g., a chunk-naming strategy), property-based testing should be reconsidered.
- The `BarcodeScanner.tsx` component itself is intentionally unchanged. This is what guarantees Property 1 (functional equivalence) for free and is why `e2e/barcode-autofill.spec.ts` continues to pass without modification.
- The bundle-verification script is the canonical assertion for the headline goal of this feature ("Quagga2 is not in the main bundle"). It is fast, deterministic, and easy to wire into CI later if desired.
- Rollback is trivial: revert the `InventoryPage.tsx` change to the static import and remove the Suspense/conditional render. No data migration, no API change, no infrastructure change.
- Per `.kiro/steering/workflow.md`, do not run `git commit`, `git push`, or `./scripts/deploy.sh` as part of executing this plan. Each task should leave the working tree in a clean, testable state.
