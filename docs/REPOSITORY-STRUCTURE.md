# Repository structure and ownership rules

This document defines how Arcana source is organized while the project converges on M1. It is a boundary guide, not a claim that every existing package has already been migrated.

## Product boundaries

```text
Arcana Runtime
├── CLI
├── TUI
├── Desktop client (separate repository)
├── SDK
├── Node      [later]
└── Control   [later]
```

The runtime is the authority boundary. Presentation clients consume contracts and submit commands. They do not redefine governance records, policy decisions, proof semantics, or approval state machines.

## Repository ownership

| Area | Owns | Must not own |
|---|---|---|
| `packages/core` | pure governance, capability, approval, crypto, persistence primitives | HTTP presentation behavior or TUI state |
| `packages/engine` | runtime orchestration, sessions, PEP integration, daemon and HTTP transport | competing copies of core governance semantics |
| `packages/tui` | terminal projection, interaction, progressive disclosure | direct effect execution or independent authorization |
| `packages/arcana` | command-line entry points and stable machine-facing CLI contract | bypass paths around engine/core enforcement |
| `packages/sdk/js` | generated or hand-written client bindings to stable contracts | server authority or duplicate schemas |
| `packages/enterprise` | later control-plane presentation and service composition | local M1 release authority unless explicitly activated |
| `contracts` | versioned machine-readable client/runtime interface | implementation-specific convenience fields absent from review |
| `docs` | scope, status, decisions, release evidence, history | executable contract definitions duplicated in prose |
| `.hermes`, `.claude`, local agent state | development support only | product authority, release inputs, or editable documentation mirrors |

## Dependency direction

Preferred direction:

```text
core <- engine <- CLI/TUI
contracts -> generated SDK/Desktop client
core/engine -> evidence and RunProof
```

Forbidden directions:

- `core` importing from `engine`, TUI, or Desktop;
- TUI or Desktop importing persistence internals;
- presentation code calling protected executors directly;
- SDK or Desktop defining a competing approval/event schema;
- runtime authorization depending on a client heartbeat or UI state;
- documentation claims changing security behavior without code and tests.

## Change categories

Every pull request should fit one primary category:

1. `security-boundary` — PDP, PEP, approval, identity, routing, containment, proof integrity.
2. `runtime-contract` — versioned API/event changes and generated clients.
3. `product-surface` — CLI, TUI, Desktop behavior consuming existing authority.
4. `reliability` — restart, recovery, sequencing, idempotency, performance.
5. `documentation-evidence` — status, decisions, sign-offs, historical records.
6. `later-track` — Node, Control, federation, ecosystem work not required for M1.

Avoid combining unrelated categories. Security-boundary and contract changes require focused tests and explicit compatibility notes.

## Generated and reference material

Generated, vendored, and research material must be identifiable and reproducible.

- Generated code includes a source artifact and regeneration command.
- Vendored documentation records upstream source and pinned revision.
- Large reference corpora should be fetched into an ignored local directory or isolated repository unless they are required release inputs.
- Mirrored Arcana documents are read-only generated copies; the primary file is named explicitly.
- Temporary agent worktrees, session locks, transcripts, and caches are never product source.

## Branch and review model

Target model:

```text
main
├── feature/*
├── fix/*
├── review/*
└── release/*
```

The current implementation branch is `arcanagov`. The previous `phase-d-implementation` branch is historical. Pull requests target `arcanagov`; CI must run on that target. Long-lived phase branches are historical implementation lines, not permanent substitutes for a maintained default branch.

## Definition of organized

The repository is organized when:

- one default branch represents the current supported product;
- each active document has one clear authority;
- every package has a bounded ownership statement;
- contracts are machine-validated and consumed rather than copied;
- active M1 work is visible as small issues and pull requests;
- historical evidence remains discoverable without directing current implementation;
- deferred tracks cannot silently become release blockers.
