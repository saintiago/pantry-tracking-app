#!/usr/bin/env node

// Keep the old entry point, but never replay unsafe whole-record batch writes.
if (process.argv.includes('--apply')) {
  console.error(
    'The legacy migration is retired: it can overwrite group membership, thresholds and concurrent edits. Use npm run audit:inventory for read-only reconciliation. No writes performed.',
  );
  process.exitCode = 1;
} else {
  await import('./audit-inventory.mjs');
}
