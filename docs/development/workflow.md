# Development and delivery

1. Follow [AGENTS.md](../../AGENTS.md), inspect the working tree, and pull the branch's
   upstream with `git pull --ff-only`. Preserve unrelated local changes.
2. Read the relevant current guide and feature requirements. Establish the baseline
   before changing behavior. Capture concrete failure cases for defects.
3. Make cohesive changes following [module boundaries](../architecture/modules.md).
   Keep persisted IDs, API contracts and CloudFormation resource identities stable
   during structural refactors. Inspect CDK differences before infrastructure releases.
4. Run focused checks while iterating, then `npm run verify`. Resolve every failure in
   checks you run, including existing failures. Never bypass hooks or conceal skipped
   coverage. Avoid rerunning unchanged checks except where delivery hooks require them.
5. Commit and push the authorized change. The pre-commit hook fails fast, runs the full
   gate, then bumps the frontend patch version and synchronizes its lockfile entry.
   A failed validation must not increment the version. Do not use `--no-verify`.
6. Pull requests and pushes to main run the same gate. Production deployment is gated
   by verification and runs only on main. Wait for the run corresponding to the pushed
   commit; fix deployment failures before claiming release success.
7. Open the live app and manually exercise changed flows through the visible UI,
   including relevant persistence/error states and mobile layout. A green pipeline or
   scripted assertions do not replace this check. Report the release version/commit,
   actual browser checks and any access or credential limitations.

Default delivery includes commit, push and deployment without repeated approvals;
follow any narrower user request. Documentation changes are committed and pushed too.
Keep transient execution logs and generated build/test artifacts untracked.
