# Implementation tasks

- [x] Inspect current contracts and save approved requirements/design.
- [x] Implement and test pure aggregation, allocation and basket rules.
- [x] Implement paginated loading, filters, two lists and persistence.
- [x] Implement dedicated purchase entry and app navigation.
- [x] Verify browser behavior and desktop/mobile layout.

## Release procedure

Run commit hooks without bypasses, push to main, and verify the Deploy production
run attached to the commit. Verify the new version and Shopping List using the
existing authenticated production browser session. Report commit, version, workflow
and live verification in the delivery response. See verification.md for local checks.

## Approved companion extension

See [second-brain.md](second-brain.md) for the September 2026 requirements and
implementation contract, which supersedes initial manual-restock and purchase-form
limitations. Release verification is recorded in [verification.md](verification.md).
