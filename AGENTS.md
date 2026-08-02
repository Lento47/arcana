# AGENTS.md — Arcana Project Context

> **Master specification:** `.hermes/docs/arcana/docs/arcana-Master/Arcana_Project_Master_Specification.md`
> This is the single source of truth for architecture, security model, roadmap, and product identity.
> Read it when you need to understand WHY something exists, not just WHERE the code is.
>
> **Completion gate:** `.hermes/docs/arcana/docs/arcana-Master/ARCANA_PHASES_100_PERCENT_COMPLETION_PLAYBOOK.md`
> Normative release-gate spec. MUST be read and checked before any phase, track, or workstream is declared 100% complete.
> 100% completion requires evidence against every applicable gate PLUS explicit human approval. Never self-certify.

## Hermes Operating Rules (user-mandated)

Follow my instructions word by word, nothing more.
Do not make more things.
If you want, ASK FIRST or make suggestions.
Never run more than what I ask.
When told to change memory or AGENTS.md, change ONLY those — NOT any other file.

## Project Identity

Arcana is a **governed autonomy runtime** — an execution-security kernel, operator console (TUI), and proof system for autonomous agents. The model proposes. The engine decides. The proof records.

**Core invariant:** `¬Authorized(q) ⇒ ¬Executed(q)`

## Primary Languages & Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript 7.x, ECMAScript modules |
| Runtime | Bun 1.3+ (package manager, tests, binary compilation) |
| Effect system | Effect (typed DI, concurrency, failure channels, resource safety) |
| Database | SQLite + Drizzle ORM + Effect bridge; FTS5 for memory/search |
| TUI | OpenTUI + SolidJS (reactive terminal UI) |
| Web/Server | Hono (HTTP API), SolidJS/Start (enterprise dashboard) |
| Validation | Zod (runtime schemas) |
| Build | Turborepo (cross-package task graph) |
| AI/LLM | AI SDK 6, schema-first provider layer |

## Repository Structure

```
arcana/
├── packages/
│   ├── arcana/          CLI distribution, user commands, proof CLI
│   ├── engine/          Session engine, TUI host, agents, tools, PEP
│   ├── core/            Effect runtime, persistence, capabilities, events
│   ├── tui/             OpenTUI + SolidJS presentation (app.tsx is the main surface)
│   ├── ui/              Web component library
│   ├── server/          Hono HTTP API
│   ├── llm/             Schema-first model/provider layer
│   ├── memory/          SQLite + FTS5 memory
│   ├── gateway/         Telegram/Discord/Slack/WhatsApp adapters
│   ├── cron/            Scheduled autonomous jobs
│   ├── skills/          Skill discovery and catalog
│   ├── plugin/          Current extension hooks
│   ├── enterprise/      Web dashboard / control plane
│   ├── sdk/js/          Typed client SDK
│   ├── ml/              Signal and quality evaluation
│   ├── effect-drizzle-sqlite/  Effect ↔ Drizzle bridge
│   ├── effect-sqlite-node/     SQLite platform integration
│   └── script/          Build, release, migration, smoke tooling
├── docs/                Product, architecture, security, operations, ADRs
├── skills/              Repository skill library
└── script/              Root automation scripts
```

## Layered Architecture

| Layer | Packages | Responsibility |
|-------|----------|---------------|
| Entry | arcana, engine, enterprise | CLI dispatch, TUI process, web app |
| Presentation | tui | Terminal rendering, themes |
| Service | server, gateway, plugin, sdk | HTTP API, messaging, extensions |
| Core runtime | core, memory, cron, skills, ml | Sessions, capabilities, events, memory |
| Foundation | llm, effect-drizzle-sqlite, effect-sqlite-node | Provider protocols, persistence |
| Infrastructure | http-recorder, script | Testing cassettes, builds |

## Key Source Files

These are the primary files you will touch most often:

| Area | File | Purpose |
|------|------|---------|
| TUI main | `packages/tui/src/app.tsx` | Main TUI surface, command spine, all /commands |
| Engine entry | `packages/engine/src/` | Session, agents, tools, execution pipeline |
| Core types | `packages/core/src/` | Capabilities, events, persistence, schemas |
| CLI commands | `packages/arcana/src/cli/` | User-facing CLI commands |
| Proof system | `packages/arcana/src/proof/` | RunProof, proof-manager, types |
| Proof runtime | `packages/arcana/src/cli/run/proof-runtime.ts` | Runtime proof recording |
| LLM layer | `packages/llm/src/` | Provider protocols, streaming, caching |
| Agent config | `packages/engine/src/agent/` | Agent types, runner, tool registration |

## Conventions

### Effect Code
- Use `Effect.gen(function* () { ... })` for composition.
- Use `Effect.fn("Domain.method")` for named/traced effects.
- Use `Schema.Class` for multi-field data, `Schema.TaggedErrorClass` for typed errors.
- Prefer Effect services (`FileSystem`, `HttpClient`, `ChildProcessSpawner`) over raw Node APIs.
- Use `Effect.forkIn(scope)` (not `Effect.fork` — it doesn't exist in v4 beta).
- Use `makeRuntime` from `src/effect/run-service.ts` for all services.
- Use `InstanceState` for per-directory/per-project state needing per-instance cleanup.

### Module Pattern
- Do NOT use `export namespace Foo { ... }`. Use flat top-level exports with self-reexport:
  ```ts
  export interface Interface { ... }
  export class Service extends Context.Service<Service, Interface>()("@arcana/Foo") {}
  export * as Foo from "./foo"
  ```
- No barrel `index.ts` in multi-sibling directories. Each file has its own self-reexport.

### Testing
```bash
# Typecheck
bun --cwd packages/tui typecheck
bun run --filter @arcana/engine typecheck

# Tests
bun test packages/tui                    # TUI suite (needs root preload: scripts/tui-test-preload.ts)
bun test packages/engine                 # Engine suite
bun test packages/core                   # Core suite
bun test packages/arcana                 # CLI/proof suite
bun test packages/arcana/src/proof/proof-manager.test.ts  # Proof manager

# Full build
bun run build
```

### TUI-Specific Rules
- TUI source changes (`packages/tui/`) need engine RESTART to take effect.
- SolidJS `createMemo` is EAGER — memo before its dependency = TDZ crash.
- The TUI observes engine state; it never invents truth.
- Root `bunfig.toml` has test preload for `packages/tui`, `packages/engine`, and Solid files.
- Use `bun test packages/tui` from repo root as single source of truth for TUI QA.

### Git
- Commit locally per task, push once at end.
- Neutral messages: `type: concise subject`.
- Types: `fix:`, `feat:`, `refactor:`, `docs:`, `chore:`.
- Never revert/restore without permission. Fix forward surgically.
- Use `[bump]` prefix to trigger CI version bump.

## When to Research Docs

**DO research** (load from `.hermes/docs/`):
- Architectural decisions → read the Master Spec
- Effect patterns you haven't seen → read `packages/engine/AGENTS.md`
- Tool/registry architecture → read `packages/core/src/tool/AGENTS.md`
- LLM/provider behavior → read `packages/llm/AGENTS.md`
- SolidJS reactive patterns (signals, memos, stores, effects) → read `.hermes/docs/solidjs/concepts/` and `.hermes/docs/solidjs/reference/`
- OpenTUI component/API questions → read `.hermes/docs/opentui/`
- AI SDK / LLM provider layer questions → read `.hermes/docs/ai-sdk/ai-main/content/docs/`
- TypeScript type patterns → read `.hermes/docs/typescript/`
- Rust (if touching native bindings) → read `.hermes/docs/rust/`
- Security model details → read `docs/security/` and Master Spec §10–12
- RunProof internals → read `packages/arcana/src/proof/` and Master Spec §11
- Database schema → read `docs/architecture/database-schema.md`
- Phase D distributed architecture → read `docs/architecture/phase-d/`
- Declaring any phase/track/workstream 100% complete → read `ARCANA_PHASES_100_PERCENT_COMPLETION_PLAYBOOK.md` (see Completion Gate)

**DON'T research** (just do it):
- Simple file reads, edits, patches
- Running tests you already know
- Git operations (commit, status, diff)
- Searching for code patterns
- Fixing typecheck errors in code you can see
- Standard TypeScript/JavaScript patterns
- Bun commands you've used before

## Documentation Index

All docs live in `.hermes/docs/`:

**Routing rule:** arcana-specific questions → `arcana/` docs only. For everything else — OpenTUI, AI SDK, TypeScript, SolidJS, Rust — go to that directory in the library below. The library is the authoritative reference for these five; do not rely on memory or external docs.

| Directory | Content | When to use |
|-----------|---------|-------------|
| `arcana/docs/` | Product, architecture, security, ops | Project-specific questions |
| `arcana/docs/arcana-Master/` | Master Spec, 100% Completion Playbook | Architecture decisions, completion gates |
| `arcana/root/` | README, CHANGELOG, CONTRIBUTING, LICENSE | Repo metadata |
| `arcana/agents/` | Per-package AGENTS.md (9 files) | Package-specific conventions |
| `arcana/skills/` | Repository skills (644 files) | Skill authoring reference |
| `arcana/hermes-plans/` | Plans, feedback, vision (51 files) | Historical context |
| `ai-sdk/` | Vercel AI SDK repo checkout (7,315 files; docs under `ai-main/content/docs`, plus cookbook, providers, tools-registry) | AI SDK / LLM provider layer questions |
| `typescript/` | TypeScript handbook + reference | TS type system questions |
| `solidjs/` | SolidJS docs (330 files: concepts, reference, guides, router, start) | TUI reactive patterns, signals, memos, JSX |
| `opentui/` | OpenTUI docs (46 files) | TUI component/API reference |
| `daemon/` | Daemon docs: process lifecycle, PID files, respawn/supervision (systemd, launchd, SCM, runit, s6, supervisord, pm2) | Daemon/background process design, restart policy, readiness, crash-loop handling |
| `rust/book/` | The Rust Book | Rust language reference |
| `rust/reference/` | Rust language reference | Rust specification |
| `rust/rust-by-example/` | Rust by Example | Rust patterns |

## Security Model Quick Reference

- **PDP**: Pure deterministic allow/deny/approval over immutable snapshot.
- **PEP**: Fresh-context check, stale-decision rejection, atomic grant/approval claim.
- **Capabilities**: Durable, exact, revocable, use-limited, ancestry-tracked.
- **Approvals**: Exact hash, single-use, expiring, crash-recoverable.
- **Delegation**: Zero ambient authority. `Authority(child) ⪯ Authority(parent)`.
- **Provenance**: 10 labels (SYSTEM_POLICY through MCP_DESCRIPTION). UNKNOWN lineage on HIGH/CRITICAL = fail closed.
- **Sensitivity**: PUBLIC < INTERNAL < PRIVATE < SECRET.

## 100% Completion Gate

Before declaring any phase, track, workstream, or feature 100% complete:

1. Read `ARCANA_PHASES_100_PERCENT_COMPLETION_PLAYBOOK.md` in full (`.hermes/docs/arcana/docs/arcana-Master/`).
2. Check the work against every applicable playbook criterion: scope, production integration, hard invariants, adversarial tests, positive utility, persistence and restart, performance, observability, frozen documentation.
3. Present the evidence checklist to the user with concrete results (test counts, adversarial outcomes, restart and performance measurements).
4. Wait for explicit human approval. A phase is NOT 100% complete without it.

Rules:
- Unit tests passing is never sufficient. The real runtime path must use the feature.
- Security invariants and exit gates cannot be weakened without an explicit architecture decision record.
- If a criterion does not apply, state that explicitly and why.

## Phase Status

| Phase | Status |
|-------|--------|
| A: Epistemic Foundation | COMPLETE |
| B: Verification & Replay | COMPLETE |
| C: Local Governed Autonomy | EVALUATION PASS (95 fixtures, 0 false allows, 722 tests) |
| D: Distributed Authority | PLANNED |
| TUI 1.0 | PARTIAL (Command Spine active, governance visibility pending) |
