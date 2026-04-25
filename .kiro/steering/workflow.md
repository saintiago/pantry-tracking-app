---
inclusion: always
---

# Workflow Rules

## Git & Deployment

- **Never run `git commit` unless the user explicitly says "commit" in their message.**
- **Never run `git push` unless the user explicitly says "push" in their message.**
- **Never run `./scripts/deploy.sh` or any deployment command unless the user explicitly says "deploy" in their message.**
- When a user says "commit, push and deploy" that counts as explicit permission for all three — but only for that single request. Do not carry over permission to subsequent messages.
- After completing code changes, tests, or fixes — stop. Tell the user what's ready and wait for them to explicitly ask to commit, push, or deploy.
- Do not chain extra commits or pushes during a task (e.g. fixing a bug mid-task does not grant permission to commit that fix — finish the task, report, and wait).
