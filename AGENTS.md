# Project instructions

Read [docs/README.md](docs/README.md) and
[the development workflow](docs/development/workflow.md) before working here.
Check the working tree and branch, then pull the upstream with `git pull --ff-only`
before making implementation decisions. Preserve local work.

Use the relevant current guides before changing behavior:

- [Product and shipped scope](docs/product.md)
- [Module ownership and dependency rules](docs/architecture/modules.md)
- [Data and API contracts](docs/architecture/data-model.md)
- [Tooling](docs/development/tooling.md)
- [Testing](docs/development/testing.md)

Read the matching feature documents in `docs/features/` for requirements and history.
The feature index explains superseded plans. Current guides describe the maintained
system; historical plans do not prove implementation. Update the owning guide when
changing a contract, architecture boundary, command, or product behavior.

Complete authorized work autonomously, including checks, commits, pushes and deployment
when needed. Follow narrower user restrictions. Never bypass commit hooks. Resolve
failures in checks you run, including existing failures. Default delivery is implement,
validate, commit, push to main, wait for that commit's deployment, then manually verify
the released user flows in the browser. Report any blocked verification accurately.

Use UTF-8 without a BOM. Prefer Bash for shell commands and patch tools for edits;
Windows PowerShell 5.1 has incompatible shell syntax and encoding defaults. Never
restore whole files over local changes to simplify an edit.

This file is the single agent instruction entry point. `CLAUDE.md` is an adapter;
do not duplicate instructions there. User instructions take precedence.
