---
inclusion: always
---

# Workflow Rules

## Quality Standards

- **There is no such thing as a "pre-existing issue" that can be ignored.** If a test is failing, a lint warning exists, or a type error is present — fix it, regardless of whether it was introduced by the current task or existed before. The codebase must be left in a better state than it was found.
- When running tests or lint as part of a task, all failures must be resolved before the task is considered complete.

## Git & Deployment

- **Never run `git commit` unless the user explicitly says "commit" in their message.**
- **Never run `git push` unless the user explicitly says "push" in their message.**
- **Never run `./scripts/deploy.sh` or any deployment command unless the user explicitly says "deploy" in their message.**
- When a user says "commit, push and deploy" that counts as explicit permission for all three — but only for that single request. Do not carry over permission to subsequent messages.
- After completing code changes, tests, or fixes — stop. Tell the user what's ready and wait for them to explicitly ask to commit, push, or deploy.
- Do not chain extra commits or pushes during a task (e.g. fixing a bug mid-task does not grant permission to commit that fix — finish the task, report, and wait).
