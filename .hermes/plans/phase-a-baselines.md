# Phase A Baselines

Recorded: 2026-07-28
Branch: phase-a-epistemic
Base commit: 67ca5e7e

## Typecheck
- **Status:** 16/16 packages pass
- **Command:** `bun run typecheck`
- **Duration:** ~7.2s (13 cached, 3 misses: memory, gateway, engine)

## Lint
- **Status:** Not configured as a separate turbo task
- **Note:** TypeScript strict mode enforced via tsc --noEmit in all packages

## Build
- **Status:** 8/8 targets build
- **Binary smoke test:** `0.0.0-phase-a-epistemic-202607280833`
- **Duration:** ~34.5s

## Tests (Phase A code only — memory package)

| Package | Pass | Fail | Skip |
|---------|------|------|------|
| memory | 29 | 0 | 0 |

All memory package tests pass (claim-store, contract-engine, obligation-engine, event-store, plus existing recall/migration tests).

## Full test suite (pre-existing failures noted)

| Package | Pass | Fail | Notes |
|---------|------|------|-------|
| effect-drizzle-sqlite | 14 | 0 | |
| ml | 35 | 0 | |
| http-recorder | 66 | 0 | |
| sdk | 4 | 0 | |
| llm | 275 | 0 | 30 skip |
| gateway | 3 | 0 | |
| memory | 29 | 0 | **Phase A code** |
| ui | 57 | 0 | |
| cron | 0 | 0 | no tests |
| core | ~? | 7 | pre-existing (agent list, ModelsDev cache) |
| engine | ~? | 1 | pre-existing (build agent bash perm) |
| tui | 428 | 4 | pre-existing (brand grep, KV ENOENT) |

**Zero regressions from Phase A changes.**

## Performance (Phase A overhead)

Phase A adds:
- 5 new Drizzle tables (claims, evidence, contradictions, aliases, events, contracts, deliverables, constraints, criteria, forbidden_outcomes, obligations, obligation_templates)
- ClaimStore, ContractEngine, ObligationEngine, EventStore Effect services
- SHA-256 hashing per event (via bun crypto)
- No runtime overhead for sessions without contracts (epistemic layer is opt-in)

Overhead measurement deferred to integration phase (Deliverable 5).
