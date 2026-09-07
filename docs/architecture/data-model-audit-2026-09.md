# Data-model audit — September 2026

This follows the [architecture audit](audit-2026-09.md). The maintained schemas remain
in [the data model](data-model.md). Findings distinguish useful duplication from
independently writable values that can disagree. No production records were repaired.

## Baseline redundancies and ownership

| Stored duplication                                             | Evidence and risk                                                                                                                                                                             | Decision / next action                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `InventoryGroup.totalQuantity` and `isLowStock`                | Both derive from child quantities and the group threshold. Inventory mutations write lots and totals separately; threshold updates also race with quantity updates.                           | Retain as materialized values for now, with lots authoritative for quantity and groups authoritative for threshold. Protect all affected rows in one transaction with revision conditions; reconcile existing rows before enabling the new writer. Removing only the boolean would not solve the total race. |
| Group and lot `name`, `category`, `unit`                       | Default identity duplicates the lot fields. The editor explicitly permits retaining a group after changing lot identity. A unit edit can therefore make raw group arithmetic invalid.         | Membership (`groupId`) is authoritative; identity divergence alone is informational. Define compatible-unit conversion and reject or reassign mixed dimensions before transactional writes. Do not reconstruct membership from names during recovery.                                                        |
| `canonicalKey`, deterministic `groupId`, group identity fields | The key is derived from normalized identity and the default ID hashes that key. The old migration normalizes category whitespace differently from the runtime.                                | Keep stable existing IDs. Use runtime normalization in auditing. On future group creation, verify canonical identity when a hash already exists; don't rename groups or rehash existing links automatically.                                                                                                 |
| Lot `threshold` / `isLowStock`                                 | Obsolete after thresholds moved to groups; two production lots still have legacy threshold/low-stock fields and no group link.                                                                | These are removable legacy fields only after a reviewed migration preserves their intent. Don't silently delete them or let them compete with group settings.                                                                                                                                                |
| `GSI1PK`, `GSI1SK`                                             | Category index keys duplicate user/category/item identity. No maintained handler currently issues an `IndexName` query; category filtering is in the browser. The index is still provisioned. | Candidate for removal in a separate infrastructure change after checking actual access/metrics and CDK diff. Keep keys/schema in this release; removing an index is not a prerequisite for correctness.                                                                                                      |
| `PK` + `userId`, `SK` + entity ID/type                         | Intentional DynamoDB addressing plus public identifiers. Redundant copies can disagree on malformed records.                                                                                  | Retain API identifiers and validate equality at write boundaries. Removing them would require a transport migration for little practical benefit.                                                                                                                                                            |
| `MealPlan.recipeName` + `recipeId`                             | Name is a display snapshot supplied by clients; recipe renames don't cascade. Planner/shopping can retain an assignment whose recipe was deleted.                                             | Treat copied name as fallback text, current recipe as authoritative when available. Keep it for missing-recipe recovery; validate references and define deletion policy before removing it.                                                                                                                  |
| Ingredient name/unit + `inventoryItemId`                       | Names are meaningful recipe content; the optional link points to a consumable lot rather than the durable group. A lot deletion can lose the intended product match.                          | Add an explicit group-link contract with a compatibility migration when unifying availability. Preserve ambiguity warnings; don't guess another product from the name.                                                                                                                                       |
| Shopping product preferences + inventory product metadata      | Similar fields have different lifetimes: planned purchase/device preferences versus a saved stock lot. Local purchase history is not another authoritative inventory ledger.                  | Keep separate until product identity and cross-device persistence are explicitly designed. Include local state in recovery planning; DynamoDB restore cannot recover it.                                                                                                                                     |

## Read-only reconciliation

### Active alternate inventory writer

`autoCreateMissingIngredients` in `backend/src/handlers/recipe/recipe.ts` still writes
placeholder `InventoryItem` records on recipe creation/update. They have no `groupId`,
use `location: 'unknown'`, retain lot-level `isLowStock`, and write an `Unknown`
category index key while storing `category: 'Uncategorized'`. These were active writer
defects at the initial audit, not only historical migration residue. The production findings are consistent
with that shape, although this audit does not establish each record's creation history.

The atomic inventory repository must own this path too. Decide whether unrecognized
ingredients need a durable product/group record instead of a fictitious stock lot;
preserve the existing recipe-entry behavior through an explicit contract update. Fixing
only the inventory Lambda or running a cleanup would allow malformed rows to reappear.

`npm run audit:inventory -- --output <new-file.json>` reads every table page with
consistent reads. It reports group totals/flags, incompatible units, explicit identity
differences, dangling links, obsolete lot fields, key/index copies and revision shape.
It uses the maintained group normalization and threshold conversion functions, includes
expired stock in restock totals, and never chooses a new group for an unlinked lot.
Invalid or incompatible quantities suppress suggested totals for that group.

The summary contains counts and a deterministic full-record SHA-256 fingerprint;
the optional file also contains record keys and numeric/boolean mismatch details.
Store it outside version control and handle it as account data. Existing output files
are not overwritten. A failed page or cursor loop fails the run without publishing a
partial report. This is a bounded in-memory operational audit, not a streaming tool
for arbitrarily large tables or a complete request-schema validator.

Consistent scan pages do not form a snapshot. Compare fingerprints only on a quiescent
table or validate on an isolated restore; a difference can reflect legitimate writes.
Findings are review inputs, never automatic repair instructions. See the
[recovery runbook](../development/recovery.md).

## Observed production and restore evidence

On 2026-09-07, complete reads of production at 08:12:14 UTC and the isolated restore
at 08:12:30 UTC returned the same 86 records and full-content fingerprint. Counts:
28 inventory lots, 23 groups, 9 locations, 7 recipes and 19 meal assignments.

| Finding                                       | Count |
| --------------------------------------------- | ----: |
| Lots referencing missing locations            |     9 |
| Lots with obsolete threshold/low-stock fields |     2 |
| Lot category-index mismatches                 |     2 |
| Lots without group links                      |     2 |
| Meal assignments referencing absent recipes   |     4 |

Finding counts overlap: the two unlinked lots also carry legacy fields and index
mismatches. Linked groups had no detected total/low-stock drift in this snapshot.
That is not proof of concurrency safety, nor does it include the unlinked lots in
any inferred group. No names, account IDs or full data exports are committed here.

## Atomic-write follow-through

The shared inventory repository is now implemented and tested against real DynamoDB.
One permanent `InventoryState` coordination row per account guards all paginated
inventory snapshots and is written conditionally with the changed lot/groups. This
additional record is a concurrency control, not another stock ledger. Lots remain
authoritative; affected totals/flags are rebuilt transactionally using compatible units.

The recipe placeholder writer now participates and creates real location/group links,
with group-owned threshold 0 for new placeholder groups. It preserves existing group
preferences. Editing legacy lots adopts only the edited lot and preserves a legacy
threshold when creating its group; a zero-stock legacy warning becomes threshold 0.
The historical 86-row audit above is unchanged evidence, not a claim that every dangling
reference has been repaired. The unsafe general batch migration stays disabled.

The isolated AWS test covered >1 MB reads, concurrent creation/add/update/reassign/delete,
threshold changes, injected cancellation without partial state, lost responses after
commit, exact-token deduplication and concurrent recipe placeholders. A current group
can be deleted and recreated safely because the per-account revision is permanent.
See [the data contract](data-model.md) for the cost, rollout and HTTP idempotency limits.

## Remaining implementation sequence

1. Review existing missing locations, unlinked legacy lots and dangling recipe references;
   preserve user meaning rather than deleting or guessing records from numeric totals.
2. Share availability allocation across recipe detail, filters and shopping: compatible
   units, stable group links, dates, repeated demand and unknown quantities. Restock
   totals intentionally include expired lots; usable meal stock does not.
3. Extend inventory coordination to location reference/deletion guards and conditional
   location-name uniqueness. Add durable HTTP purchase idempotency and measure the
   account-wide coordination cost before increasing write throughput.
4. Decide index retirement, meal-reference policy and local-state export independently.
   Continue recovery testing through isolated application cutover; the table restore
   drill does not prove Cognito, S3 or browser-local state recovery.
