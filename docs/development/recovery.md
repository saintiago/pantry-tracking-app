# Data recovery and reconciliation

Production is `PantryApp` in account `698643713254`, region `eu-north-1`. This runbook
tests an isolated DynamoDB restore. It does not switch the live application or repair
records. See [deployment](../github-deployment.md), [data contracts](../architecture/data-model.md)
and the [data-model audit](../architecture/data-model-audit-2026-09.md).

## Isolated restore drill

1. Confirm `aws sts get-caller-identity` and the region. Read
   `aws dynamodb describe-continuous-backups --table-name PantryApp --region eu-north-1`
   and record the available restore window. Select a fresh, uniquely named drill table;
   never use the production name as the restore destination.
2. Run `aws dynamodb restore-table-to-point-in-time --source-table-name PantryApp
--target-table-name <fresh-drill-table> --use-latest-restorable-time --region eu-north-1`.
   For an incident, select an explicit known-good timestamp inside the available window
   instead of the latest time. Record the timestamp returned by AWS.
3. Poll `describe-table` for the destination until `ACTIVE`, also checking index status.
   Check the restored `PK`/`SK` schema and `GSI1` against the source. Do not assume
   table status or the approximate table item count proves the data is usable.
4. Run `npm run audit:inventory -- --table <fresh-drill-table> --region eu-north-1
--output <new-private-report.json>`. This builds the shared domain and backend.
   The audit makes only strongly consistent scan requests, follows all pages and
   refuses incomplete pagination. Review every finding before planning repairs.
5. For a quiet source, run the same report on `PantryApp` and compare complete-record
   fingerprints and entity counts. Scan consistency is per read, not snapshot isolation;
   an actively changing source may legitimately differ from the chosen restore time.
   Matching fingerprints prove matching scanned content, not correctness of that content.
6. Preserve the non-sensitive drill evidence in the audit. Keep detailed reports in a
   private location outside version control. Once verification is complete, verify the
   account/region and exact destination again and delete only the table created for
   this drill. Confirm it no longer exists to avoid ongoing storage charges.

## Before an actual application cutover

Review the incident's recovery point and writes since that point; restoring does not
merge later changes. Stop or redirect writers through a planned maintenance window.
Re-establish the destination's IAM access, PITR, alarms, tags, streams, TTL and scaling
where applicable. AWS does not restore all these settings automatically. Validate
encryption and indexes too. See [AWS restore guidance](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/PointInTimeRecovery.Tutorial.html).

The current stack uses a fixed production table name. A cutover needs an explicit
CDK import/reference and Lambda configuration plan, reviewed diff and rollback path;
don't delete production to free its name or substitute an untracked manual rename.
Test authenticated reads and writes against an isolated application configuration
first, then the changed live flows after a deliberate release. Keep the old source
available until the acceptance and rollback window are complete.

Cognito accounts, S3 pictures, and device-local shopping preferences/history are
separate recovery surfaces. Restoring DynamoDB does not restore them. Local shopping
export/import and a full application cutover drill remain outstanding.

## September 7 drill

AWS accepted a restore to `PantryApp-recovery-drill-20260907` at restore point
2026-09-07 08:02:45.369 UTC. The table and GSI1 became active. Complete source and
restored scans returned 86 records with identical fingerprint
`e54f6fdfe21e31aa1f64133a42cd14f2901097e3865e6294d922e056041f19a9`.
The [data-model audit](../architecture/data-model-audit-2026-09.md) records findings.
This establishes successful table recovery and readable content; no application
cutover or production data repair was attempted.
The temporary drill table was deleted after comparison and its absence was verified.
