---
inclusion: always
---

# Workflow Rules

## Quality Standards

- **There is no such thing as a "pre-existing issue" that can be ignored.** If a test is failing, a lint warning exists, or a type error is present — fix it, regardless of whether it was introduced by the current task or existed before. The codebase must be left in a better state than it was found.
- When running tests or lint as part of a task, all failures must be resolved before the task is considered complete.

## Git & Deployment

- Always pull the latest changes before starting a new task or feature, before making implementation decisions or editing files. Check the working tree and branch first, then run `git pull --ff-only` from the branch's upstream. Preserve local work; if the pull is blocked or no upstream is configured, resolve the situation without discarding changes before proceeding.
- After pulling, read `CLAUDE.md`, this workflow, the steering documents relevant to the task, and any matching `.kiro/specs/<feature>/` documents so work follows the latest project guidance.
- Complete requested work end to end, including commits, pushes and deployments when needed, without waiting for separate approval at each step.
- Follow any narrower scope or restriction in the user's request.
- Run required checks and commit hooks; resolve failures before releasing changes. Never bypass hooks with `--no-verify`.
- **Default delivery workflow: implement → validate → commit → push to `main` → wait for deployment → manually verify in the browser.** Complete this workflow autonomously unless the user explicitly requests a narrower scope.
- Deploy by pushing to `main`, which triggers `.github/workflows/deploy.yml`. Wait for the workflow associated with the pushed commit to finish successfully; resolve deployment failures before calling the work complete. Do not use a separate local deployment as the default path.
- After deployment, open the live production app in the browser and manually exercise the changed user flows using the visible UI. Inspect the rendered result, including relevant loading/error states, persistence, and mobile layout. Automated tests, scripted browser assertions, build success, or a successful deployment alone do not replace this manual browser verification.
- Verify the released version and report the commit, deployment outcome, and what was actually checked in the browser. Clearly state any verification blocked by missing access or credentials; do not claim unverified behavior passed.
- Commit and push documentation-only changes too; no separate application deployment is required beyond the pipeline triggered by the push.
