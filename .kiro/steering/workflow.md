---
inclusion: always
---

# Workflow Rules

## Quality Standards

- **There is no such thing as a "pre-existing issue" that can be ignored.** If a test is failing, a lint warning exists, or a type error is present — fix it, regardless of whether it was introduced by the current task or existed before. The codebase must be left in a better state than it was found.
- When running tests or lint as part of a task, all failures must be resolved before the task is considered complete.

## Git & Deployment

- Complete requested work end to end, including commits, pushes and deployments when needed, without waiting for separate approval at each step.
- Follow any narrower scope or restriction in the user's request.
- Run required checks and commit hooks; resolve failures before releasing changes. Never bypass hooks with `--no-verify`.
- Verify deployed behavior and report the commit, released version and verification results.
- Documentation-only changes do not require an application deployment.
