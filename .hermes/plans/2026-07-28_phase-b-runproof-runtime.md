# Phase B — RunProof Runtime: Implementation Plan

> **Status:** Plan — do not execute until Phase A evaluation gate is passed.
> **Depends on:** Phase A — Epistemic Agent Runtime (contracts, claims, obligations, event trace, completion gate)
> **Governance:** Phase A plan is the sole implementation authority until exit criteria are met. This plan defines Phase B scope only.

---

## Executive Summary

Phase B turns Phase A's tamper-evident event trace into a durable, inspectable, versioned **RunProof execution record**. A RunProof aggregates contracts, claims, obligations, events, artifacts, environment, and completion state into a single provenance-linked document that can answer: what was requested, what happened, what evidence supports it, what changed, and whether the result can still be reproduced.

Phase B introduces three replay modes (audit, deterministic, live revalidation), four proof levels (P0–P3), artifact and environment manifests, and CLI/TUI integration with the existing command spine — all derived from Phase A events rather than bypassing them.

---

## Verified Phase A Implementation Assessment

### What Phase A delivered (verified by code inspection)

| Component | Status | Notes |
|-----------|--------|-------|
| Claim types (8 statuses) | ✅ | `@arcana/core/epistemic/claim.ts` |
| EvidenceRef with eventId linkage | ✅ | Stable lineage to event store |
| Contract types (CompletionContract, TerminalRunState) | ✅ | `@arcana/core/epistemic/contract.ts` |
| Obligation types + 10 baseline templates | ✅ | `@arcana/core/epistemic/obligation.ts` |
| Event type with hash chain (SHA-256) | ✅ | `@arcana/core/epistemic/event.ts` |
| SQL schemas (12 tables via Drizzle) | ✅ | All tables in `core/epistemic/*-sql.ts` |
| ClaimStore, ContractEngine, ObligationEngine, EventStore | ✅ | Engine services with Drizzle-backed Effect layers |
| Completion gate | ✅ | `prompt.ts:1529-1564` — blocks stop on unresolved obligations |
| CLI commands (claims, assumptions, contract, obligations, proof) | ✅ | `cli/cmd/epistemic.ts` — reads DB via bun:sqlite |
| Typecheck | ✅ | 16/16 packages pass |
| Build + smoke test | ✅ | `0.0.0-phase-a-epistemic` binary |

### Phase A gaps (found during inspection)

1. **Event table has no `session_id` column** — Events use global sequencing. RunProof derivation from a single session requires joining through contract/claim tables or adding session_id. This is the most significant architectural gap for Phase B.

2. **Completion gate doesn't filter by `required`** — The gate checks for any unresolved obligations, not just `required=true` ones. A non-required pending obligation would block completion incorrectly.

3. **Evaluation incomplete** — Only 3 of 8 fixture files exist. No evaluation runner. No false-completion rate or overhead measurements. The empirical exit criteria for Phase B (proven reduction in false completion) cannot be verified.

4. **Event recording not integrated into lifecycle** — Task 4.3 (auto-record events on claim/obligation changes) was not implemented. Services exist but are not called from the session processor.

5. **Duplicate contract system** — `cockpit.contract.ts` defines `AgentContract` (operational: what agent can do) separately from `CompletionContract` (epistemic: what must be true before done). These are not integrated.

6. **No `session_id` on events** — Also means the CLI `proof` command can't filter events by session. Current implementation queries all global events.

### No material architectural defects blocking Phase B

Phase B can proceed with these known gaps, provided the Blockers section below is addressed first. None of the gaps make RunProof derivation impossible — they make it less direct.

---

## Gap Analysis: Phase A → Phase B

| Phase A Capability | What Phase B Needs | Gap |
|-------------------|--------------------|-----|
| Global event store | Session-scoped RunProof | Events lack session_id |
| Hash-linked event chain | Artifact digest verification | No artifact manifest |
| Completion contract | RunProof derivation from contract | Contract state is in DB but not materialized as RunProof |
| CLI proof command | TUI :proof integrated into command spine | CLI reads raw DB, not spine rendering |
| Claims with provenance | Claims linked to evidence in RunProof | Claims in DB, not in RunProof aggregate |
| Obligations with status | Obligation resolution in RunProof | Status tracked, not materialized |
| No environment tracking | Environment manifest | No env capture exists |
| No replay concept | Audit/deterministic/live replay | Entirely new capability |
| No proof levels | P0–P3 level calculation | Entirely new capability |
| cockpit contract | Integration with epistemic contract | Two separate contract systems |

---

## Phase B Scope

### In scope

1. **RunProof aggregate** — Versioned document derived from Phase A events
2. **Artifact manifest** — Files created/read/modified with digests
3. **Environment manifest** — OS, runtime, repo state (allowlist only)
4. **Audit replay** — Rendering from stored events, no re-execution
5. **Deterministic replay (bounded)** — Only verifiable local commands
6. **Live revalidation** — Re-run obligations against current workspace
7. **Proof levels P0–P3** — Calculated deterministically from evidence
8. **TUI/CLI integration** — Command spine, :proof inspect/export/replay/revalidate
9. **Persistence** — Versioned schema, migrations, crash recovery
10. **Evaluation** — Integrity/drift detection, false P3 refusal tests

### Explicitly out of scope

- Model routing / Bayesian trust / confidence calibration
- Merkle DAGs / digital signatures / PKI / transparency logs
- Verifier mesh (proposer/challenger/test/spec/security subagents)
- Containers / process isolation
- Capability security redesign
- Deterministic replay of network/external operations
- Cloud synchronization
- Organizational policy management
- Continuous revalidation daemon
- Provenance-aware memory redesign
- Creativity compiler / anti-slop

---

## Architecture Blockers (MUST be resolved before Phase B implementation)

### Blocker 1: Add `session_id` to events table

**Severity:** Critical — RunProof derivation cannot scope events to a session without this.

**Fix:** Add `session_id TEXT` column to `EventTable` with a migration. All existing events are pre-Phase-A and don't need backfill. New events recorded by Phase B components will populate session_id.

**Migration:** `ALTER TABLE events ADD COLUMN session_id TEXT;` — backward compatible, NULL for existing rows.

### Blocker 2: Fix completion gate `required` filter

**Severity:** High — false blocking on non-required obligations undermines Phase A's core invariant.

**Fix:** Modify prompt.ts line 1546 to add `WHERE required = 1` filter:
```ts
.where(and(eq(ObligationTable.contract_id, activeContract[0].id), eq(ObligationTable.required, 1)))
```

### Blocker 3: Complete Phase A evaluation

**Severity:** Critical — cannot justify Phase B without empirical evidence that Phase A reduces false completion.

**Required:** Create fixtures 4-8, implement evaluation runner, record baseline metrics, verify Phase A reduces false completion at <15% overhead.

---

## Phase B Deliverables

### Deliverable 1: RunProof Aggregate & Schema

**Objective:** Define the RunProof type, SQL schema, and derivation from Phase A events.

#### Task 1.1: Define RunProof schema types
- **Files:** Create `packages/core/src/epistemic/runproof.ts`
- **Type:** `RunProof` with version, sessionId, proofLevel, contract, claims, obligations, events, artifacts, environment, replayResults, revalidationResults
- **Type:** `ProofLevel` = "P0_TRACE" | "P1_INTEGRITY" | "P2_REPRODUCIBLE" | "P3_VERIFIED"
- **Type:** `RunProofVersion` with schema version for forward compatibility
- **Acceptance:** TypeScript compilation, Schema validation passes

#### Task 1.2: Define runproof SQL tables
- **Files:** Create `packages/core/src/epistemic/runproof-sql.ts`
- **Tables:** `runproofs` (id, session_id, proof_level, version, created_at, event_root_hash), `runproof_artifacts`, `runproof_environments`, `runproof_replay_results`, `runproof_revalidation_results`
- **Acceptance:** Drizzle schema compiles, foreign keys reference events/contracts

#### Task 1.3: Implement RunProofStore
- **Files:** Create `packages/engine/src/session/epistemic/runproof-store.ts`
- **Methods:** `derive(sessionId)` — reads Phase A tables, assembles RunProof, calculates proof level, persists
- **Methods:** `get(id)`, `listBySession(sessionId)`, `verify(id)` — verifies referenced event chains
- **Derivation rules:**
  - Contract ID maps to session ID
  - Events scoped by session_id (after Blocker 1 fix)
  - P0: events exist and chain verifies
  - P1: P0 + artifact digests match
  - P2: P1 + supported deterministic replay subset passes
  - P3: P2 + all required obligations satisfied
- **Invariant:** P3 MUST be refused if any required obligation.status != "satisfied"
- **Acceptance:** Unit tests for each proof level, derivation correctness, P3 refusal

#### Task 1.4: Canonical serialization
- **Files:** Create `packages/core/src/epistemic/runproof-serialize.ts`
- **Rules:** Stable JSON serialization (sorted keys, UTC timestamps, hex digests)
- **Rules:** Immutable references — RunProof references events by ID, never copies
- **Tests:** Roundtrip serialization, cross-version compatibility, malformed schema rejection
- **Acceptance:** Deterministic serialization produces identical output for identical inputs

### Deliverable 2: Artifact & Environment Manifests

#### Task 2.1: Implement artifact manifest
- **Files:** Create `packages/engine/src/session/epistemic/artifact-manifest.ts`
- **Capture hooks:** Tool results (file reads/writes/deletes), snapshot patches
- **Record:** normalized path, operation (create/read/modify/delete), content digest (SHA-256), size bytes, media type, event ID
- **Edge cases:** missing files → `artifact_absent`, deleted files → `artifact_deleted`, files too large → `digest_skipped` (threshold 64MB), secrets → `content_redacted`
- **Acceptance:** All edge cases tested, no secrets logged

#### Task 2.2: Implement environment manifest
- **Files:** Create `packages/engine/src/session/epistemic/env-manifest.ts`
- **Capture:** OS, arch, node/bun version, git commit, branch, dirty flag, lockfile digests, Arcana version, model/provider
- **Allowlist only:** Selected env vars (PATH, HOME, NODE_ENV) — never capture arbitrary vars
- **Markers:** `required`, `optional`, `unavailable`, `redacted`
- **Acceptance:** No secrets captured, allowlist enforced, unavailable gracefully handled

### Deliverable 3: Replay Modes

#### Task 3.1: Implement audit replay
- **Files:** Create `packages/engine/src/session/epistemic/replay-audit.ts`
- **Behavior:** Read RunProof, reconstruct timeline from stored events, render with command spine format
- **No re-execution:** Tools are not called; raw output is displayed as recorded
- **Verification:** Events preserved in order, relationships preserved, no fabricated content
- **Acceptance:** Audit replay produces identical event ordering to original run

#### Task 3.2: Implement deterministic replay (bounded)
- **Files:** Create `packages/engine/src/session/epistemic/replay-deterministic.ts`
- **Supported operations:** Local shell commands with captured stdin, environment, and no external dependencies; file verification commands
- **Unsupported:** API calls, `git push`, `npm publish`, any network-bound operation
- **Behavior:** When operation is unsupported → mark as `unsupported_replay` with reason, do not attempt
- **Honest refusal:** Never silently treat unsupported ops as deterministic
- **Acceptance:** Supported commands rerun correctly, unsupported ops explicitly refused

#### Task 3.3: Implement live revalidation
- **Files:** Create `packages/engine/src/session/epistemic/revalidate.ts`
- **Behavior:** Load RunProof, re-execute verification obligations, compare with original
- **Report:** unchanged, changed, missing artifacts, dependency drift, env drift, obligations now satisfied/failed/stale
- **Immutability:** Revalidation creates NEW RunProof (or revalidation result record), never modifies original
- **Acceptance:** Drift detection works, original RunProof immutable, new events created

### Deliverable 4: TUI/CLI Integration

#### Task 4.1: Spine entries for RunProof
- **Files:** Modify `packages/tui/src/shell/command-spine/spine-types.ts`, `spine-mapper.ts`
- **New SpineKind:** `"proof"` — distinct visual from existing kinds
- **New glyph:** `◉` for proof entries
- **Receipt:** Proof level, chain status, obligation counts, artifact change summary
- **Acceptance:** RunProof entries render in command spine without breaking existing entries

#### Task 4.2: TUI commands
- **Files:** Create `packages/engine/src/cli/cmd/runproof.ts`
- **Commands:**
  - `:proof` — summary of latest RunProof (level, contract, claim/obligation counts, chain status)
  - `:proof inspect <id>` — full RunProof dump with collapsible sections
  - `:proof export <id> <path>` — export RunProof JSON with artifact references
  - `:replay audit <id>` — audit replay rendering
  - `:replay deterministic <id>` — bounded deterministic replay
  - `:revalidate <id>` — live revalidation against current workspace
  - `:artifacts <id>` — artifact manifest listing
  - `:environment <id>` — environment manifest display
- **Integration:** Registered in `index.ts` command loaders
- **Acceptance:** All commands functional, no breaking changes to existing command spine

### Deliverable 5: Persistence & Recovery

#### Task 5.1: Schema versioning and migrations
- **Files:** Modify `packages/core/src/epistemic/runproof-sql.ts`
- **Version:** Schema version in RunProof JSON and DB
- **Migrations:** Forward-compatible, backward-compatible read (old versions parseable)
- **Corruption detection:** Hash verification on load, refuse corrupted RunProofs
- **Acceptance:** Version migration tests, corruption detection tests

#### Task 5.2: Crash recovery
- **Files:** Modify `packages/engine/src/session/epistemic/runproof-store.ts`
- **Atomic writes:** Derive → write to temp → rename (atomic on same filesystem)
- **Partial runs:** Incomplete sessions produce honest `incomplete_run` status, not P0-P3
- **Retention:** Configurable cleanup policy, default: keep all RunProofs
- **Acceptance:** Crash during derivation leaves no corrupted RunProof, partial runs correctly marked

### Deliverable 6: Evaluation Suite

#### Task 6.1: Phase B evaluation fixtures
- **Files:** Create `packages/engine/test/epistemic/fixtures/phase-b/`
- **Scenarios (12 minimum):**
  1. Export RunProof, verify event chain
  2. Modify one event, integrity verification fails
  3. Source file changes after completion → artifact digest mismatch
  4. Deleted artifact invalidates obligation
  5. Dependency version drift detected
  6. Audit replay succeeds without rerunning tools
  7. Deterministic replay refuses unsupported external operation
  8. Reproducible local command reruns successfully
  9. Live revalidation detects now-failed obligation
  10. Unresolved required obligations → P3 refused
  11. Sensitive env data excluded from manifest
  12. Crashed session produces honest incomplete RunProof
- **Acceptance:** All scenarios have input data and expected outcomes

#### Task 6.2: Evaluation runner
- **Files:** Create `packages/engine/test/epistemic/eval-phase-b.ts`
- **Metrics:** Integrity-detection rate, drift-detection rate, false-P3 rate, replay success/refusal rate, overhead (tokens, time, storage), command latency, backward-compat failures
- **North-star metric:** Never assign stronger proof level than evidence justifies
- **Acceptance:** Runner produces quantitative results for all metrics

---

## Architectural Invariants

1. **Phase A is source of truth** — RunProof DERIVES from Phase A records, never bypasses completion gate
2. **Every RunProof field has traceable source events** — no field is fabriced
3. **Original events and RunProofs are immutable** — revalidation creates new linked results
4. **Missing information = unknown/unavailable/unsupported/redacted** — never invented
5. **Hash verification proves tamper detection, not actor identity** — honest naming
6. **P3 requires satisfied required obligations** — language alone cannot self-assign P3
7. **Replay never implies stronger reproducibility than demonstrated** — supported/unsupported boundaries explicit
8. **Secrets never captured in manifests, artifacts, exports, or logs** — allowlist-only env vars

---

## Ordered Implementation Tasks

### Phase: Prerequisites (Blockers)
1. Fix event table: add `session_id` column + migration
2. Fix completion gate: add `required = 1` filter
3. Complete Phase A evaluation (fixtures 4-8, runner, baseline)

### Phase: Core RunProof (D1)
4. Define RunProof schema types (Task 1.1)
5. Create runproof SQL tables (Task 1.2)
6. Implement RunProofStore.derive() with P0-P3 calculation (Task 1.3)
7. Implement canonical serialization (Task 1.4)
8. Integrate event recording into lifecycle (Phase A Task 4.3 — prerequisite for RunProof derivation)

### Phase: Manifests (D2)
9. Implement artifact manifest capture hooks (Task 2.1)
10. Implement environment manifest capture (Task 2.2)

### Phase: Replay (D3)
11. Implement audit replay (Task 3.1)
12. Implement bounded deterministic replay (Task 3.2)
13. Implement live revalidation (Task 3.3)

### Phase: UI (D4)
14. Add spine entries for RunProof (Task 4.1)
15. Implement TUI/CLI commands (Task 4.2)

### Phase: Persistence (D5)
16. Schema versioning and migrations (Task 5.1)
17. Crash recovery and corruption handling (Task 5.2)

### Phase: Evaluation (D6)
18. Create Phase B evaluation fixtures (Task 6.1)
19. Implement evaluation runner (Task 6.2)
20. Run evaluation, record results, compare with baseline

---

## Dependencies Between Tasks

```
Blockers (1-3)
    ↓
D1: RunProof Core (4-8)
    ↓
    ├── D2: Manifests (9-10) ──┐
    ├── D3: Replay (11-13) ────┤
    └── D5: Persistence (16-17) ┤
                                ↓
                          D4: UI (14-15)
                                ↓
                          D6: Evaluation (18-20)
```

---

## Proof Level Requirements (P0–P3)

| Level | Name | Requirements |
|-------|------|-------------|
| P0 | TRACE | Events were recorded. Hash chain verifies. |
| P1 | INTEGRITY | P0 + all referenced artifact digests match current state. |
| P2 | REPRODUCIBLE | P1 + supported deterministic replay subset passes. Unsupported ops explicitly marked. |
| P3 | VERIFIED | P2 + all required obligations in active contract have status "satisfied" with valid evidence. |

**Critical invariant:** `P3 ⇒ ∀o ∈ O_required, o.status = "satisfied"`. This is a hard gate, not a heuristic.

---

## File-by-File Changes

### New files (create):
```
packages/core/src/epistemic/
├── runproof.ts              # RunProof, ProofLevel types
├── runproof-sql.ts          # Drizzle schema
└── runproof-serialize.ts   # Canonical JSON serialization

packages/engine/src/session/epistemic/
├── runproof-store.ts        # Derivation, storage, verification
├── artifact-manifest.ts     # File operation tracking
├── env-manifest.ts          # Environment capture
├── replay-audit.ts          # Audit replay
├── replay-deterministic.ts  # Bounded deterministic replay
└── revalidate.ts            # Live revalidation

packages/engine/src/cli/cmd/
└── runproof.ts              # :proof, :replay, :revalidate, :artifacts, :environment commands

packages/engine/test/epistemic/fixtures/phase-b/
├── task-1-export-verify.md
├── task-2-corruption-detection.md
├── task-3-digest-mismatch.md
├── task-4-deleted-artifact.md
├── task-5-dependency-drift.md
├── task-6-audit-replay.md
├── task-7-unsupported-replay.md
├── task-8-reproducible-command.md
├── task-9-live-revalidation.md
├── task-10-p3-refusal.md
├── task-11-sensitive-exclusion.md
└── task-12-crashed-session.md

packages/engine/test/epistemic/
└── eval-phase-b.ts          # Phase B evaluation runner
```

### Modified files:
```
packages/core/src/epistemic/event-sql.ts        # Add session_id column
packages/engine/src/session/prompt.ts           # Fix required filter in completion gate
packages/engine/src/session/epistemic/event-store.ts  # Populate session_id on append
packages/tui/src/shell/command-spine/spine-types.ts   # Add "proof" SpineKind
packages/tui/src/shell/command-spine/spine-mapper.ts  # Map runproof events to spine entries
packages/engine/src/index.ts                    # Register runproof command loader
```

---

## Testing Requirements

### Unit tests
- Canonical serialization produces stable output
- Proof level calculation (P0-P3) for all valid state combinations
- P3 refusal when required obligations unresolved
- Artifact digest computation and verification
- Environment manifest allowlist enforcement
- Sensitive value redaction

### Integration tests
- RunProof derivation from Phase A events (full pipeline)
- Event chain verification passes and fails correctly
- Audit replay renders events in order
- Deterministic replay correctly classifies supported/unsupported ops
- Live revalidation creates new events, never mutates original

### Property tests
- Serialization roundtrip for all RunProof versions
- Event ordering preservation across derivation
- Corruption detection for: modified hash, broken chain link, injected event, deleted event
- Immutable derivation: same inputs → same RunProof ID and content

### Edge case tests
- Empty session → honest incomplete RunProof
- Session with events but no contract → P0 only
- Contract with zero obligations → can achieve P3 (vacuous truth)
- Artifact deleted after completion → P1 downgrade
- Environment drift → P2 downgrade for affected operations
- Backward compatibility with Phase A event format

---

## Evaluation Metrics

| Metric | Target |
|--------|--------|
| Integrity detection rate | 100% (any tampering detected) |
| Drift detection rate | 100% (any artifact/env change detected) |
| False P3 assignment rate | 0% (never assign P3 without evidence) |
| Replay success (supported ops) | 100% |
| Honest refusal (unsupported ops) | 100% |
| RunProof generation overhead | <10% additional tokens |
| Storage overhead | <5MB per RunProof (avg) |
| Command latency | <500ms for :proof summary |
| Backward-compat failures | 0 |

**North-star metric:** Arcana never assigns a stronger proof level than available evidence, environment, and replay support justify.

---

## Definition of Done

Phase B is complete when:
- [ ] RunProofs derive from real Phase A events with session scoping
- [ ] P0-P3 levels calculated deterministically
- [ ] P3 cannot occur with unresolved required obligations
- [ ] Event chain corruption is reliably detected
- [ ] Artifact and environment drift are visible
- [ ] Audit replay works without re-execution
- [ ] Bounded deterministic replay is honest about supported/unsupported operations
- [ ] Live revalidation creates new immutable results
- [ ] Phase A behavior remains compatible (no regressions)
- [ ] Sensitive data never captured in manifests or exports
- [ ] All tests pass (unit, integration, property, edge case)
- [ ] Evaluation results recorded and compared against Phase A baseline
- [ ] No Phase C or later scope crept in
- [ ] Typecheck 16/16 passes
- [ ] Build passes with smoke test

---

## Exit Criteria for Phase C

Phase C implementation is justified only when:
1. Phase B evaluation demonstrates all metrics met
2. RunProofs have been generated for ≥10 real sessions
3. Integrity/drift detection works on real-world scenarios
4. P3 never falsely assigned in any test run
5. User-visible complexity does not degrade the TUI experience
6. Storage and generation overhead are acceptable in practice

---

## Deferred Phase C+ Items

- Digital signatures / PKI / signed attestations
- External trust roots and transparency logs
- Organizational attestors
- Continuous revalidation daemon
- Merkle DAGs for sub-agent proofs
- Containerized deterministic replay
- Remote artifact verification
- Cross-device RunProof synchronization
- Marketplace proof exchange
- Formal TLA+ verification of proof level invariants

---

## Most Important Architectural Decision

**RunProof as a derived materialized view, not a competing source of truth.** RunProof aggregates Phase A events rather than duplicating state. The event chain remains the canonical record; RunProof is a derived, versioned, exportable snapshot. This prevents split-brain between events and RunProof records and keeps the epistemic state machine as the single source of truth for completion.

---

## Largest Identified Risk

**Deterministic replay scope creep.** The temptation to make "everything deterministically replayable" through containers, remote execution, or process isolation is strong but belongs in later phases. Phase B must draw a hard line: only local shell commands with captured inputs/environment and no network dependencies. If we blur this boundary, we ship an incomplete, misleading replay system that implies stronger reproducibility than it delivers. Honest refusal is the feature.

---

## Verified Phase A Blocker

**Event table lacks `session_id`.** Without it, RunProof derivation requires joining events through contracts (which have session_id) — this works but adds unnecessary indirection and could miss events not linked to a contract. The fix (add `session_id` column, migration, backfill via contract join) should be Phase B's first task.

---

## Exact Empirical Condition Before Implementation

Phase B implementation may begin when:

1. Phase A evaluation completes with measured false-completion rate
2. Phase A demonstrates **any reduction** in false completion vs baseline (governance rule: the evaluation proves the gate works)
3. Typecheck still passes 16/16
4. Build still passes with smoke test
5. Event table blocker fix is accepted (either add session_id or document the derivation approach)
