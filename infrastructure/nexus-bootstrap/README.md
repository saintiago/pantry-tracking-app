# One-time Nexus access bootstrap

This manually dispatched workflow creates the `NexusAccess` CloudFormation stack in account `698643713254`, `eu-north-1`. It creates exactly one new role, `NexusGitHubDeploy`, trusting GitHub OIDC only for `saintiago/nexus` on `main`. It reuses the existing CDK bootstrap deployment and publishing roles. Those CDK roles confer broad infrastructure deployment authority; the role is not a resource-level Nexus-only security boundary.

It changes no application infrastructure and creates no static access key. After deployment, Nexus uses its own CI workflow. This workflow does not deploy Conclave itself.

The bootstrap commit uses `[nexus-bootstrap-only]` in its subject. Existing application verification still runs; the application deployment job omits this commit so setting up Nexus does not release the unrelated app. The existing local commit hook may update the frontend patch version as part of its normal process. Future ordinary app commits continue to deploy normally. The marker does not skip validation and should only be used for this bootstrap change.

After reviewing the exact diff:

1. Merge the bootstrap branch with the marker preserved in the merge/squash commit subject.
2. Manually run `Bootstrap Nexus deployment access` from `main`.
3. Set the Nexus repository variable `AWS_DEPLOY_ROLE_ARN` to the role output.
4. Run Nexus's Conclave workflow and inspect the deployment evidence.

The bootstrap job uses the existing Pantry OIDC role, then assumes its existing CDK deployment role. CloudFormation uses the existing CDK execution role. All AWS changes happen inside GitHub Actions. Local `validate-template` only checked syntax; it is not deployment proof.

Rollback: review trust revocation or removal through a CI CloudFormation change. Do not delete the role while Nexus deployment jobs are running.

Nexus uses GitHub immutable OIDC subjects: the trust condition includes owner ID `11892583` and repository ID `1367767330`, as returned by the repository OIDC settings API. Its exact main subject is `repo:saintiago@11892583/nexus@1367767330:ref:refs/heads/main`. The older Pantry repository keeps its existing name-based subject. Do not disable immutable subjects to match the old trust format.
