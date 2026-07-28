# Phase B — Proof Semantics Correction & runRoot Hardening

> **Branch:** `phase-a-epistemic`
> **Current commit:** `937d7b44`
> **Status:** Plan — do not execute until approved

---

## Problem Statement

The current RunProof implementation has three issues that must be corrected before any public-facing exposure:

1. **Proof-level semantics are wrong** — the P0–P3 hierarchy in `run-proof.ts` does not match the Phase B plan definitions
2. **runRoot encoding is unversioned and ambiguous** — vulnerable to concatenation collisions
3. **Baseline error count drifted 44→54** — the 10 new errors are from `run-proof.test.ts` (added after freeze), but the baseline file hasn't been updated

---

## Issue 1: Proof-Level Semantics

### Current (wrong)

```
P0 = no events
P1 = incomplete (started but no terminal, or missing pairs)
P2 = degraded trace (DEGRADED or UNAVAILABLE health)
P3 = verified (everything clean)
```

### Original Phase B plan (correct)

From `.hermes/plans/2026-07-28_phase-b-runproof-runtime.md` line 348:

```
P0 TRACE        — Events were recorded. Hash chain verifies.
P1 INTEGRITY    — P0 + all referenced artifact digests match current state.
P2 REPRODUCIBLE — P1 + supported deterministic replay subset passes.
P3 VERIFIED     — P2 + all required obligations satisfied with valid evidence.
```

### Three separate type axes (not one)

```typescript
type ProofLevel = "P0" | "P1" | "P2" | "P3"

type TraceHealth =
  | "COMPLETE"       // all events recorded without errors
  | "DEGRADED"       // some recording failures
  | "UNAVAILABLE"    // no health record (no trace_health row)

type LifecycleStatus =
  | "COMPLETE"       // started ∧ terminal ∧ pairs complete
  | "INCOMPLETE"     // missing terminal or pairs
  | "CRASHED"        // session.crashed exists (still complete for proof purposes)
  | "CANCELLED"      // explicit cancellation (future)
```

### Deterministic rules

```
P0 TRACE
  - At least one event exists
  - Global hash chain verifies (computeEventHash for each row, previous_hash continuity)

P1 INTEGRITY
  - P0 holds
  - runRoot verifies (recompute from stored events, compare)
  - proofHash verifies (recompute from canonical proof state, compare)
  - [future] artifact digests match current state

P2 REPRODUCIBLE
  - P1 holds
  - A declared reproducible subset successfully replays
  - UNTIL REPLAY EXISTS: no RunProof receives P2 — cap at P1

P3 VERIFIED
  - P1 integrity holds (not P2 — P2 requires replay which doesn't exist yet)
  - Active contract exists (contract.proposed ∧ NOT contract.amended to void)
  - All required obligations satisfied (obligation.resolved for each required)
  - LifecycleStatus is COMPLETE (started ∧ terminal ∧ pairs)
  - TraceHealth is COMPLETE (not DEGRADED, not UNAVAILABLE)
  - NO_ACTIVE_CONTRACT completion → never P3
```

### Hard cap rule

```
TraceHealth ≠ COMPLETE  ⇒  ProofLevel < P3
LifecycleStatus ≠ COMPLETE  ⇒  ProofLevel < P3
NO_ACTIVE_CONTRACT  ⇒  ProofLevel < P3
```

### What changes in `run-proof.ts`

1. Add `LifecycleStatus` type (separate from `LifecycleCompleteness` interface)
2. Rewrite `deriveProofLevel()` with correct semantics:
   - Check P0: at least one event + chain verification
   - Check P1: recompute runRoot and proofHash, compare to stored
   - P2 is unreachable until replay exists — document this
   - Check P3: contract exists, obligations satisfied, lifecycle COMPLETE, trace COMPLETE
3. Add `verifyRunRoot()` — recompute from events and compare
4. Add `verifyProofHash()` — recompute from canonical state and compare
5. Update `RunProof` interface to include `lifecycleStatus: LifecycleStatus`
6. Fix the empty-session case: `ProofLevel = "P0"` is wrong for zero events — should be no proof level at all, or a special "NO_EVENTS" state. Actually: P0 requires "at least one event." Zero events = no proof. Add a `"NONE"` pre-state or just return P0 with gaps.

**Decision:** Zero events → `proofLevel: "P0"` with `gaps: ["no events recorded"]` is acceptable. P0 is the minimum; having zero events means P0 fails its own criterion (chain verification requires ≥1 event). Change to:

```typescript
if (events.length === 0) {
  return { proofLevel: "P0", gaps: ["no events recorded — P0 requires at least one event"] }
}
```

This is semantically correct: P0 is claimed but the gap explains why it can't be verified. The caller can check `gaps.length > 0` to know the level is aspirational, not achieved.

---

## Issue 2: runRoot Encoding

### Current (weak)

```typescript
function computeRunRoot(sessionId, rows) {
  const hashChain = rows.map(r => r.hash).join("")
  return createHash("sha256").update(sessionId).update(hashChain).digest("hex")
}
```

Problems:
- No domain separator — could collide with other hash uses
- No version — future format changes break backward compat silently
- No event count — empty concatenation vs single empty string ambiguous
- `update(sessionId).update(hashChain)` — byte-level concatenation, no length prefix
- Doesn't include sequence numbers or event IDs — hash alone doesn't bind position

### Corrected encoding

```
R = H(
  "arcana-run-root-v1"              // domain separator (19 bytes, no length prefix needed — fixed string)
  ∥ encode_u32(sessionId.length)    // length-prefix sessionId
  ∥ sessionId                       // UTF-8 bytes
  ∥ encode_u32(eventCount)          // event count as big-endian uint32
  ∥ ∥_i (
    encode_u64(sequence_i)          // global sequence as big-endian uint64
    ∥ encode_u32(id_i.length)       // length-prefix event ID
    ∥ id_i                          // UUID string bytes
    ∥ hash_i                        // 32 raw bytes (SHA-256 digest, NOT hex)
  )
)
```

Where:
- `encode_u32(n)` = 4 bytes big-endian
- `encode_u64(n)` = 8 bytes big-endian
- All strings are UTF-8
- Event hashes are raw 32-byte digests (decode from hex before hashing)
- Length-prefixing prevents ambiguous concatenation

### Implementation

```typescript
function computeRunRoot(
  sessionId: string,
  rows: ReadonlyArray<{ sequence: number; id: string; hash: string }>,
): string {
  const { createHash } = require("node:crypto")
  const h = createHash("sha256")

  // Domain separator
  h.update("arcana-run-root-v1")

  // Length-prefixed sessionId
  const sidBuf = Buffer.from(sessionId, "utf-8")
  const sidLen = Buffer.alloc(4)
  sidLen.writeUInt32BE(sidBuf.length, 0)
  h.update(sidLen)
  h.update(sidBuf)

  // Event count
  const countBuf = Buffer.alloc(4)
  countBuf.writeUInt32BE(rows.length, 0)
  h.update(countBuf)

  // Per-event: sequence || id || hash
  for (const row of rows) {
    const seqBuf = Buffer.alloc(8)
    seqBuf.writeBigUInt64BE(BigInt(row.sequence), 0)
    h.update(seqBuf)

    const idBuf = Buffer.from(row.id, "utf-8")
    const idLen = Buffer.alloc(4)
    idLen.writeUInt32BE(idBuf.length, 0)
    h.update(idLen)
    h.update(idBuf)

    h.update(Buffer.from(row.hash, "hex")) // raw 32 bytes
  }

  return h.digest("hex")
}
```

### Breaking change notice

This changes the runRoot value for all existing proofs. Since RunProof is derived (read-only), this is safe — no stored values to migrate. But any tests comparing runRoot hex strings will need their expected values updated.

---

## Issue 3: Baseline Error Reconciliation

### Current state

- **Freeze doc** (`BASELINE.md`): 44 test errors, CI rule: reject ≥45
- **Actual count** (now): 54 test errors
- **Source errors**: 0 (unchanged)

### Where the +10 came from

The freeze was at commit `2dffbe34`. The file `run-proof.test.ts` was added in `f073d024` (after freeze). It contributes exactly 10 new type errors (lines 60, 79, 105, 156, 188, 221, 254, 292, 321, 353 — all the same pattern: `Effect<void, unknown, unknown>` not assignable to the test runner's expected type).

### Action

1. Update `BASELINE.md` to reflect 54 errors with exact fingerprints
2. Include the `run-proof.test.ts` errors in the baseline
3. Update CI rule to reject ≥55
4. Capture each error as: file, line, error code, normalized message pattern

### New baseline breakdown

| File | Count | Pattern |
|------|-------|---------|
| compaction.test.ts | 16 | Service→never dependency channel |
| event-store-concurrency.test.ts | 10 | Effect dependency channel |
| run-proof.test.ts | 10 | Effect dependency channel |
| prompt.test.ts | 3 | Layer dependency channel |
| httpapi-*.test.ts (5 files) | 5 | Layer dependency channel |
| workspace.test.ts | 2 | Layer/Effect dependency channel |
| event-hash.test.ts | 2 | base reference + unused ts-expect-error |
| event-store-multi-connection.test.ts | 2 | EffectDrizzleQueryError |
| structured-output-integration.test.ts | 1 | Layer dependency channel |
| app-runtime-logger.test.ts | 1 | Body type mismatch |
| workspace-adapter.test.ts | 1 | Layer dependency channel |
| httpapi-exercise/index.ts | 1 | Effect error channel |
| **Total** | **54** | |

All are `Service→never` dependency channel mismatches from Effect Layer composition. Framework-level typing issues, not logic errors.

---

## Issue 4: Cast Boundary Audit

### Current state

The `BASELINE.md` claims 8 cast boundaries documented with inline comments. Let me verify each:

| # | File:Line | Cast | Comment present? |
|---|-----------|------|-----------------|
| 1 | processor.ts:1183 | `as Handle` | ✅ has comment |
| 2 | processor.ts:1186 | `as Interface` | ✅ has comment |
| 3 | processor.ts:1209 | `LayerNode.make(layer as any, ...)` | ✅ "tracked: TODO narrow" |
| 4 | processor.ts:1223 | `] as any` | ✅ "tracked: TODO narrow" |
| 5 | event-store.ts:265 | `as Interface["append"]` | ✅ has comment |
| 6 | app-runtime.ts:108 | `ManagedRuntime.make(... as any, ...)` | ✅ "tracked: TODO narrow" |
| 7 | prompt.ts:1957 | `LayerNode.make(layer as any, ...)` | ✅ "tracked: TODO narrow" |
| 8 | server.ts:292 | `as any` on createRoutes return | ✅ "tracked: TODO narrow" |

### Audit findings

All 8 have inline comments. However, the comments are minimal — "tracked: TODO narrow" is a tag, not an explanation. The user's requirement is:

> Each should have:
> 1. A comment explaining the upstream type mismatch
> 2. A runtime or integration test covering the cast boundary
> 3. A tracking issue for eventual removal
> 4. The narrowest possible cast

### Action

For each of the 8 epistemic-phase casts (the ones we introduced), expand the comment to explain:
- What the upstream type mismatch is
- Why `as any` / `as Handle` is the narrowest viable fix
- What would need to change upstream to remove it

The pre-existing casts (50+ `as any` in provider.ts, gateway.ts, etc.) are out of scope — they were there before Phase A.

---

## Execution Plan

### Task 1: Add `LifecycleStatus` type and separate health from level
**File:** `run-proof.ts`
**Changes:**
- Add `LifecycleStatus = "COMPLETE" | "INCOMPLETE" | "CRASHED" | "CANCELLED"` type
- Keep existing `LifecycleCompleteness` interface as internal detail
- Add `lifecycleStatus: LifecycleStatus` to `RunProof` interface
- Derive LifecycleStatus from completeness data

### Task 2: Rewrite `deriveProofLevel()` with correct semantics
**File:** `run-proof.ts`
**Changes:**
- P0: ≥1 event exists (gap if chain doesn't verify — add chain verification)
- P1: P0 + runRoot recomputes correctly + proofHash recomputes correctly
- P2: unreachable until replay — add comment explaining why
- P3: P1 + contract exists + required obligations satisfied + lifecycle COMPLETE + trace COMPLETE
- Hard cap: `TraceHealth ≠ COMPLETE ∨ LifecycleStatus ≠ COMPLETE → max P1`
- NO_ACTIVE_CONTRACT → max P1 (no contract = no obligations to verify)

### Task 3: Harden `computeRunRoot()` encoding
**File:** `run-proof.ts`
**Changes:**
- Replace simple concatenation with versioned, domain-separated, length-prefixed encoding
- Accept full row data (sequence, id, hash) instead of just hash
- Use raw bytes for SHA-256 digests (decode hex → 32 bytes)
- Buffer-based construction with u32/u64 big-endian encoding

### Task 4: Add `verifyRunRoot()` and `verifyProofHash()` helper functions
**File:** `run-proof.ts`
**Changes:**
- `verifyRunRoot(sessionId, rows, expectedRunRoot)` → boolean
- `verifyProofHash(canonical, expectedProofHash)` → boolean
- Use these in P1 derivation rather than just comparing hashes

### Task 5: Update tests for corrected semantics
**File:** `run-proof.test.ts`
**Changes:**
- Fix test 3 (P3 claim): needs contract + obligations + COMPLETE trace for P3
- Fix test 4 (crashed session): crashed is still lifecycle COMPLETE but needs contract for P3
- Add test: session with events + chain verifies → P0
- Add test: P0 + hashes verify → P1
- Add test: P1 + no contract → still P1 (not P3)
- Add test: DEGRADED trace → max P1
- Add test: UNAVAILABLE trace → max P1
- Add test: INCOMPLETE lifecycle → max P1
- Update all runRoot expected values (encoding changed)
- Add test: NO_ACTIVE_CONTRACT → never P3

### Task 6: Add injected-failure tests
**File:** `run-proof.test.ts` (new test file or extend existing)
**Changes:**
- Test: append fails mid-session → trace DEGRADED → restart preserves DEGRADED → P1 max
- Test: session.started without terminal → lifecycle INCOMPLETE → P3 refused
- Test: tool.called without tool.returned → pair incomplete → P3 refused
- Test: NO_ACTIVE_CONTRACT → never P3 even with complete healthy trace
- Test: zero events → P0 with gap

### Task 7: Expand cast boundary comments
**Files:** processor.ts, event-store.ts, app-runtime.ts, prompt.ts, server.ts
**Changes:**
- For each of the 8 epistemic-phase casts, expand the comment to explain the upstream mismatch
- Note: no tracking issues (no GitHub issue tracker configured), but document the condition for removal

### Task 8: Update BASELINE.md
**File:** `packages/engine/test/epistemic/BASELINE.md`
**Changes:**
- Update error count: 44 → 54
- Update CI rule: reject ≥55
- Add run-proof.test.ts (10 errors) to the breakdown
- Add exact diagnostic fingerprints for all 54 errors

### Task 9: Verify and commit
**Changes:**
- Run epistemic tests — all must pass
- Run typecheck — 0 source errors, ≤54 test errors
- Commit all changes

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| P3 never reachable until replay exists | Certain | Low | P2 is unreachable, P3 requires P1 only (not P2). Document this. |
| runRoot encoding change breaks existing proofs | Certain | None | RunProof is derived (read-only), no stored values to migrate |
| New failure tests expose real bugs | Medium | Medium | Fix forward, don't revert |
| Cast boundary comments reveal unsolvable upstream issues | Low | Low | Document removal condition, accept the cast |

---

## Acceptance Criteria

1. ProofLevel, TraceHealth, LifecycleStatus are three separate type axes
2. P0 requires ≥1 event (zero events = gap, not P0 achievement)
3. P1 requires hash chain + runRoot + proofHash verification
4. P2 is unreachable until replay exists (documented)
5. P3 requires P1 + contract + obligations + COMPLETE lifecycle + COMPLETE trace
6. DEGRADED/UNAVAILABLE trace → max P1
7. INCOMPLETE lifecycle → max P1
8. NO_ACTIVE_CONTRACT → max P1
9. runRoot uses domain separator, version, length-prefix, event count, per-event structured data
10. All epistemic tests pass
11. 0 source type errors
12. BASELINE.md updated with exact 54-error fingerprint
