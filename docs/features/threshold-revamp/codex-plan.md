# Persisted Inventory Groups and Group-Level Thresholds

September 2026 follow-through: [the data-model audit](../../architecture/data-model-audit-2026-09.md)
records production reconciliation and redundancy ownership. The original batch
migration's apply mode is retired; read-only reconciliation preserves explicit
membership and converts threshold units. Transactional mutations below remain
unimplemented. A real isolated table restore was verified; see the
[recovery runbook](../../development/recovery.md).

## Summary

Introduce a persisted InventoryGroup domain entity representing the runtime grouping currently derived from normalized name +
category + unit. Inventory rows remain individual stock lots and gain a stable groupId.

The group owns the low-stock threshold and aggregate quantity. A group is low stock when the sum of its lots’ quantities is less
than or equal to its threshold. Individual items no longer contain threshold or isLowStock.

## Key Changes

- Store InventoryGroup records in the existing DynamoDB table with:
  - groupId
  - canonical grouping key and key hash
  - optional threshold
  - totalQuantity
  - derived isLowStock
  - timestamps and syncVersion

- Add groupId to every inventory item.
- Maintain one default group per canonical name + category + unit key. Newly added items automatically join it; concurrent
  creation must use a conditional/transactional write to prevent duplicates.

- Permit explicit reassignment or creation of a non-default group for unusual cases. New items continue joining the canonical
- Update item create, quantity change, reassignment, and deletion transactionally so affected group totals and low-stock state
  remain consistent.

- Delete empty groups unless they have a configured threshold; retain configured empty groups so their warning preference
- Move low-stock indexing and notifications from inventory items to groups. Trigger a notification only when an aggregate group
  transitions from not-low to low.

## API and UI

- GET /inventory returns both items and groups; the frontend joins them by groupId instead of reconstructing group identity.
- Add a group update endpoint for setting or clearing the threshold and a reassignment endpoint for moving a lot to an existing
  or automatically matched group.

- Change GET /inventory/low-stock to return low-stock groups with aggregate quantities rather than individual lots.
- Add an edit-threshold action to each grouped inventory row. An unset threshold disables low-stock warnings for that group.
- When an item edit changes name, category, or unit, prompt whether to keep it in its current group:
  - Keep: retain its existing groupId.
  - Do not keep: automatically join or create the canonical group for its new values.

- Display one low-stock badge per group based on aggregate quantity. Category summaries count low-stock groups, not low-stock
  lots.

- Remove legacy threshold and isLowStock attributes and rebuild affected index keys.
- Record conflicts and migrated counts; rerunning the script must not create duplicate groups or change completed assignments.
- Deploy backend/schema support, back up the table, run and verify the migration, then release the frontend in a coordinated
  rollout. No permanent legacy dual-read path is retained.

## Test Plan

- Unit and property tests for canonical-key normalization, automatic assignment, aggregate totals, maximum-threshold migration,
  and low-stock boundary behavior.

- Backend tests for concurrent group creation, transactional quantity changes, reassignment between two groups, deletion, empty
  configured groups, and notification transitions.

- Migration tests for mixed thresholds, missing thresholds, already-migrated rows, malformed rows, and repeat execution.
- Frontend tests confirming thresholds appear only on group rows, group badges use total quantity, and identity-changing edits
  follow both prompt outcomes.

- E2E coverage for adding another brand to an existing group, editing the group threshold, crossing the threshold through
  quantity changes, and moving an item to another automatic group.

## Assumptions

- Group thresholds compare against total quantity, including expired lots.

- Existing threshold conflicts resolve to the maximum value.
- Group membership is automatic by default but explicitly editable.
- The coordinated migration can use a short maintenance window, so mixed legacy/new inventory models do not need long-term
  support.
