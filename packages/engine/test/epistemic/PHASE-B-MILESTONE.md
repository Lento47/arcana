# Phase B Milestone: Epistemic Runtime

**Tag**: `arcana-epistemic-runtime-phase-b`
**Commit**: `8a7b007a`
**Date**: 2026-07-28

## Acceptance Criteria — All Met

| Criterion | Result |
|---|---|
| Tests | 212/212 (563 expect calls) |
| Source type errors | 0 |
| False P3 assignments | 0 |
| False P2 assignments | 0 |
| Integrity corruption detection | 100% |
| Policy drift detection | 100% |
| Environment drift detection | 100% (CRITICAL severity) |
| Revalidation immutability | Confirmed |
| Performance (revalidation overhead) | ~1ms |
| Performance (replay derivation) | ~450ms dry-run, 5 commands |

## Raw Evaluation Results

### Group A: Verification Accuracy (9 tests)
- VERIFIED only when integrity=VALID + lifecycle=COMPLETED + completionMethod=VERIFIED_COMPLETE + all obligations met
- NO_ACTIVE_CONTRACT capped at P1 (integrity=VALID only)
- DEGRADED trace capped at P1
- INCOMPLETE lifecycle capped at P1
- No independent path to P3
- Result: **0 false P3 assignments**

### Group B: Reproducibility Accuracy (9 tests)
- Mismatched exit code → refused
- Mismatched digest → refused
- Unsafe program → refused
- Shell-wrapped → refused
- Fallback-parsed → refused
- Policy drift → refused by current policy
- Result: **0 false P2 assignments, 100% correct refusal rate (≥95% target)**

### Group C: Drift and Revalidation (7 tests)
- Mutated artifact → UNAVAILABLE
- Mutated obligation → status change detected
- Changed environment → CRITICAL severity
- Policy downgrade → drift detected
- Unmet obligation → NOT_MET status
- Confirmed claim → CONFIRMED status
- Result: **100% artifact detection, 100% policy detection, 100% dependency detection, ≥90% environment detection**

### Group D: False-Completion Detection (6 tests)
- Cancelled session → reason="cancelled"
- Budget exhausted → reason="budget_exhausted"
- Step limit → reason="step_limit"
- Decision required → reason="decision_required"
- Graceful failure → reason="graceful_failure"
- Result: **100% interruption detection, all classified as non-success**

### Group E: Performance (3 tests)
- Event write throughput ≥ 100/s
- RunProof derivation < 250ms
- Audit replay derivation < 500ms
- Result: **All within bounds**

## Environment and Policy Versions

### Replay Policy
- Allowed programs: 22 (tsc, bun, node, eslint, prettier, cargo, pytest, python, go, git, npm, pnpm, yarn, npx, mkdir, cp, mv, rm, cat, ls, chmod, touch)
- Subcommand maps: 6 (tsc, bun, eslint, cargo, pytest, go)
- Dangerous patterns: `;`, `&&`, `||`, `|`, `>` (infix operators)
- Shell-wrapped: `sh -c`, `bash -c`, `cmd /c`, `cmd.exe /c` → refused
- Policy version: `v2`
- Structured invocation required: fallback-parsed commands get lower assurance

### Normalization Profile
- Name: `terminal-output-v1`
- Rules: strip ANSI, strip trailing whitespace, strip terminal control, normalize line endings, strip timestamps, strip line numbers
- Applied to: raw stdout/stderr → normalized digest for comparison

### Command Encoding
- Format: JSON array of strings (`["bun", "test", "file.test.ts"]`)
- Shell metacharacter detection: `|`, `;`, `&&`, `||`, `>`, `>>`, `<` in any argument position
- Shell wrapper detection: first element `sh`/`bash`/`cmd`/`cmd.exe`

## Runtime Measurements

| Metric | Value | Target |
|---|---|---|
| Event write throughput | ≥100/s | — |
| RunProof derivation | <250ms | <250ms ✅ |
| Audit replay dry-run | ~450ms | <500ms ✅ |
| Revalidation overhead | ~1ms | — |
| Database size (212 tests) | <1MB | — |

## Fixture Definitions

### P2 Fixture
- Command: `bun test packages/engine/test/epistemic/event-hash.test.ts`
- Exit code: 0
- Structured invocation: yes
- Policy version: v2
- Environment drift: none
- Coverage: 1/1 (100%)
- Mutation check: clean

### Lifecycle Fixtures
- COMPLETED: session.started → ... → session.completed (reason=normal)
- CANCELLED: session.started → ... → session.completed (reason=cancelled, cancelledByUser=true)
- BUDGET_EXHAUSTED: session.started → ... → session.completed (reason=budget_exhausted, budgetExhausted=true)
- CRASHED: session.started → ... → session.crashed
- STEP_LIMIT: session.started → ... → session.completed (step limit metadata)

### Failure Injection Fixtures
- DEGRADED: event chain gap (missing sequence N between N-1 and N+1)
- Cross-session isolation: events from session A do not affect session B
- Zero events: empty store yields NONE trace
- NO_ACTIVE_CONTRACT: all obligations resolved, no active contract

## Known Limitations

1. **Event membership**: Individual Event v1 records do not bind session membership. A verified RunProof runRoot binds its selected events to a session, but the global event log alone does not.

2. **Internal evaluation only**: The 212 tests establish internal correctness. They do not prove performance across thousands of repositories, resistance to hostile users, cross-OS reliability, general false-completion reduction against external models, or security against prompt injection.

3. **Cast boundaries**: 8 documented `as any`/`as Interface` casts remain, all with upstream mismatch documented and removal conditions specified.

4. **CLI-only delivery**: No TUI command spine exists; CLI is the sole interface.

5. **No tool-content validation**: tool.returned records raw output but does not validate that the output matches the tool that was called.

6. **Global chain, not per-session**: Event log is a global append-only chain. Per-session isolation is enforced at query time via runRoot, not at storage time.

7. **Replay is bounded**: Only 22 programs are allowed. Arbitrary command replay is not supported and should not be.

8. **Revalidation is read-only**: Live revalidation creates new immutable results; it never mutates historical records. Missing dependencies produce UNAVAILABLE, not failure.

## Assurance Schema Version

**Version**: 1

### RunProof Schema
```
{
  sessionId: string
  proofHash: string (64-char hex, SHA-256)
  runRoot: string (64-char hex, SHA-256)
  assuranceProfile: {
    trace: "NONE" | "RECORDED"
    integrity: "UNVERIFIED" | "VALID" | "INVALID"
    verification: "UNVERIFIED" | "VERIFIED"
    reproducibility: "NONE" | "PARTIAL" | "FULL"
  }
  traceHealth: "CLEAN" | "DEGRADED"
  lifecycleStatus: "COMPLETED" | "INCOMPLETE" | "CRASHED"
  integrityStatus: "VALID" | "INVALID" | "UNVERIFIED"
  completionMethod: "VERIFIED_COMPLETE" | "NO_ACTIVE_CONTRACT"
  eventCount: number
  firstSequence: number
  lastSequence: number
  eventHashes: string[]
  claims: Claim[]
  obligations: Obligation[]
  contracts: Contract[]
  p3DenialReasons: string[]
  createdAt: string (ISO)
}
```

### Export Schema (v1)
- `.runproof.v1.json` — self-contained, includes `proofHashInput` (ProofHashPayload) and `eventReferences`
- `.runproof.v1.md` — human-readable markdown companion
- Secret redaction: `secret:<kind>` placeholder for sensitive values
- Atomic writes: write to `.tmp`, rename on success

### runRoot Format
```
SHA-256(
  "arcana-run-root-v1"              // domain separator (19 bytes)
  ∥ u32BE(len(sessionId))           // 4 bytes
  ∥ sessionId                       // variable
  ∥ u32BE(eventCount)               // 4 bytes
  ∥ per-event:
      u64BE(sequence)               // 8 bytes
      ∥ u32BE(len(uuid))            // 4 bytes
      ∥ uuid                        // variable
      ∥ eventHash                   // 32 bytes (raw)
)
```

### ProofHashPayload
```
{
  sessionId, traceHealth, lifecycleStatus, integrityStatus,
  completionMethod, eventCount, firstSequence, lastSequence,
  runRoot, eventHashes, assuranceProfile
}
```
Note: `proofHash` is NOT in this payload — it is computed from it and attached after.

## What Phase B Proved

1. Unverified sessions cannot obtain P3 / VERIFIED
2. Mismatched or unsafe replays cannot obtain P2 / reproducibility
3. Degraded traces and uncontracted runs remain visibly limited
4. Policy, environment, and artifact drift are detected
5. Revalidation creates new immutable results instead of rewriting history
6. The system operates within defined performance thresholds
7. The assurance decision is recomputed from evidence rather than trusted from model output

## Commits in Phase B

`254fc9f2` → `8a7b007a` (19 commits)

| Commit | Description |
|---|---|
| `254fc9f2` | event-hash extraction + CLI proof verify fix + 9 regression tests |
| `8617bd0a` | race condition fix + UNIQUE constraint + session lifecycle events |
| `2dffbe34` | 14 files, +612/-30: event integration, type fixes, cast boundary docs |
| `b5cdc1d3` | cast boundary documentation + baseline freeze |
| `f073d024` | read-only RunProof derivation from event store |
| `937d7b44` | runRoot binding + degraded trace tests |
| `ad2f3909` | proof semantics correction + runRoot hardening + CI fingerprint guard |
| `33aafdce` | inspection, verification, export + failure injection |
| `12ec140a` | gap fixes: 6 missing export test cases |
| `2f1e86ab` | verification: self-contained proofHash, store-aware runRoot, strict hex |
| `c1ead67c` | audit replay: derivation + CLI + 28 tests |
| `4ccc6492` | deterministic replay: policy framework + 45 tests |
| `03e40211` | three P2 correctness corrections |
| `f261b91d` | P2 activated: real bounded command replay earns P2 |
| `bb2035cb` | AssuranceProfile refactor: independent axes, P-labels as badges |
| `c6b31c35` | live revalidation: drift detection, obligation checking, claim transitions |
| `8525909b` | expanded session completion reasons (6 reasons, priority ordering) |
| `4921f481` | multi-tool replay matrix: 10 test cases with deterministic commands |
| `8a7b007a` | falsifiable evaluation suite: 34 tests, all targets met |
