# Codex Project Instructions

Before working in this repository, read `CLAUDE.md` for the project overview and
quick-reference conventions.

The files in `.kiro/steering/` are the authoritative project documentation:

- Always read `.kiro/steering/workflow.md`.
- Read the steering documents relevant to the task before making decisions:
  - `product.md` for product scope and requirements.
  - `tech.md` for the stack, tooling, commands, and code-quality rules.
  - `structure.md` for repository layout and implementation conventions.
  - `data-model.md` for schemas, entities, API contracts, and routes.
  - `e2e-testing.md` for browser-test patterns and requirements.
- When working on an existing feature, inspect the matching `.kiro/specs/<feature>/`
  documents for requirements, design decisions, and task history.

Treat `.kiro/steering/` as the source of truth if its content differs from the
summary in `CLAUDE.md`. This `AGENTS.md` takes precedence if an instruction here
conflicts with either source.

Complete requested work autonomously, including committing, pushing, and deploying
when needed, without asking for separate approval for each step. Run the required
checks and hooks, verify releases, and report the outcome. Follow any narrower
scope or restriction in the user's request.
