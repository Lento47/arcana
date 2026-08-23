# `arcana-ai` CLI package

This package provides Arcana's command-line distribution and the fast path into the governed TUI runtime.

```bash
bun run packages/arcana/src/index.ts --help
bun run packages/arcana/src/index.ts doctor
bun run packages/arcana/src/index.ts run "explain this repository"
```

The subcommand surface includes configuration, health checks, memory, skills, gateways, schedules, daemon operation, and non-interactive runs. Bare `arcana` starts the operator console through `packages/engine`.

Protocol conformance is maintained at the repository root:

```bash
bun run conformance --output evidence/conformance.json
```

See [assurance](../../docs/ASSURANCE.md) for the exact claim boundary and [ecosystem](../../docs/ECOSYSTEM.md) for adapter status.
