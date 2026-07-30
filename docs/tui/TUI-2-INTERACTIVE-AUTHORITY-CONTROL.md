# TUI-2: Interactive Authority Control Milestone

**Tag:** `arcana-tui-2-interactive-authority-control`
**Date:** 2026-07-30

## 1. Objective

Enable an authenticated human operator to inspect, approve, or deny
execution requests through a durable lifecycle that converges on the
same Phase C PDP/PEP boundary used by distributed authority.

The shell is a command surface, not an execution surface.

## 2. Scope

- Durable approval lifecycle (PENDING → APPROVED → CLAIMED → CONSUMED)
- Security denial invalidation (INVALIDATED is terminal)
- Retryable failure semantics (only when effect definitely not started)
- Recovery-required semantics (uncertain effect, no automatic replay)
- SQLite-backed durable store with transactional outbox
- Governed executor binding to real Phase C PDP/PEP
- Shell interaction state machine
- Approval operator service
- RunProof integration
- Crash and recovery behavior

## 3. Authority Boundary

```
keyboard input
→ ApprovalOperatorService
→ durable approval state transition
→ runtime worker
→ Phase C PDP/PEP
→ effect
→ durable lifecycle events
→ receipts and RunProof
```

Never:
```
keyboard input
→ GovernedApprovalExecutor
```

The shell cannot directly cause an effect. It can only change
durable approval state through the operator service. The governed
executor runs in a separate runtime context with its own PDP/PEP
binding.

## 4. Approval State Model

```
PENDING → APPROVED → CLAIMED → CONSUMED
PENDING → DENIED
PENDING → EXPIRED
APPROVED → EXPIRED
CLAIMED → INVALIDATED (authority changed)
```

**INVALIDATED** is terminal. A policy revocation followed by later
restoration does NOT silently reactivate an old human approval.

## 5. Execution Outcome Semantics

| Outcome | Approval State | Retryable |
|---|---|---|
| SUCCEEDED | CONSUMED | No (exhausted) |
| DENIED | INVALIDATED | No (authority changed) |
| RETRYABLE_FAILURE | APPROVED | Yes (effect never started) |
| RECOVERY_REQUIRED | CLAIMED | No (manual only) |

**Key invariants:**

```
RetryAllowed ⟺ EffectDefinitelyNotStarted
EffectMayHaveOccurred ⟺ ¬AutomaticReplay
```

## 6. Durable SQLite Lifecycle

- WAL mode for concurrent read/write
- `synchronous=FULL` for power-loss durability
- Foreign keys enforced
- Busy timeout 5000ms
- Schema integrity verified at startup

Tables:
- `approval_records` — approval state with version CAS
- `approval_executions` — execution binding with idempotency key
- `approval_outbox` — transactional event outbox

## 7. Transactional Outbox

Every state transition produces an outbox event in the same
transaction. The dispatcher publishes events independently.

Outbox lifecycle: PENDING → CLAIMED → DELIVERED → POISONED

No event is dispatched before the state transition is committed.

## 8. Governed Executor

The `RealGovernedApprovalExecutor` binds approvals to real Phase C:

1. Load fresh approval (verify state, version, request hash)
2. Load protected request from canonical store (never trust panel)
3. Atomically claim with executionId
4. Phase C PDP reevaluation
5. Phase C PEP freshness recheck
6. Execute effect
7. Record result
8. Consume approval (or enter RECOVERY_REQUIRED)

Denial classification:
- `CAPABILITY_REVOKED` → INVALIDATED
- `POLICY_CHANGED` → INVALIDATED
- `NODE_QUARANTINED` → INVALIDATED
- `REQUEST_STALE` → INVALIDATED
- `WORKSPACE_CHANGED` → INVALIDATED

## 9. Shell Interaction Architecture

Shell-local states (ephemeral, not durable):
- IDLE
- SELECTED (approvalId, expectedVersion)
- INSPECTING (approvalId, expectedVersion)
- SUBMITTING (approvalId, command)
- COMMAND_FAILED (approvalId, reason)

After command submission, the shell reloads from the durable event
stream. It never infers the next lifecycle state locally.

## 10. Exact-Request Inspector

Displays full canonical fields:
- Approval ID, version, state
- Request hash, action, resource
- Principal, session, workspace
- Contract ID, revision
- Policy snapshot hash
- Capability/grant ID
- Expiry
- Execution ID (when claimed)

Hashes may be shortened in the spine, never in the inspector.

## 11. Receipt Semantics

Pending:
```
◤ approval   filesystem.write · exact request required
```

Approved:
```
◤ approval   approved once · operator user:lejzer
```

Claimed:
```
◤ approval   claimed · execution exec_...
```

Successful:
```
✓ allow      exact approval and Phase C authority satisfied
▷ execute    protected operation
▣ authority  approval consumed · 0 uses
■ proof      trace complete · replay executions 0
```

Invalidated:
```
✗ deny       capability revoked
× approval   invalidated · new authorization required
```

Recovery:
```
! recovery   effect outcome uncertain · automatic replay blocked
```

INVALIDATED and RECOVERY_REQUIRED remain visible when ordinary
lifecycle events are filtered.

## 12. RunProof Integration

Every governed executor path produces a RunProof with:
- Approval authority source event
- Operator verification event
- Local grant derivation event
- PDP decision event
- PEP recheck event
- Effect event (if executed)
- Receipt event (if succeeded)

Trace health:
- COMPLETE: all required events present and valid
- DEGRADED: effect occurred but authority event missing
- INVALID: integrity mismatch
- INCOMPLETE: events pending

## 13. Crash and Recovery Behavior

| Crash Point | Recovery |
|---|---|
| After approval commit | Approval durable, recovery loads |
| After claim commit | CLAIMED visible, claim lease expires |
| After effect, before consume | RECOVERY_REQUIRED, no blind replay |
| Outbox dispatch fails | Event retained for retry |
| SQLite corruption | Fail closed (QUARANTINE) |

## 14. Test and Adversarial Matrix

| Test | Result |
|---|---|
| Exact approval → real PEP → effect once | PASS |
| Operator denial → zero executor calls | PASS |
| Two operators → one winner | PASS |
| Two executors → one winner | PASS |
| Request hash change → STALE | PASS |
| Cross-workspace → rejected | PASS |
| Cross-session → rejected | PASS |
| Expired → rejected | PASS |
| Consumed → cannot reactivate | PASS |
| INVALIDATED → cannot reactivate | PASS |
| Quarantined → INVALIDATED | PASS |
| Revoked → INVALIDATED | PASS |
| Effect not started → RETRYABLE_FAILURE | PASS |
| Effect uncertain → RECOVERY_REQUIRED | PASS |
| Effect throws → RECOVERY_REQUIRED | PASS |
| Crash after approval → persists | PASS |
| Crash after claim → recovery visible | PASS |
| Outbox delivery failure → retained | PASS |
| PRAGMA synchronous=FULL verified | PASS |
| RunProof agreement with database | PASS |
| Shell SUBMITTING blocks duplicates | PASS |
| Shell SESSION_CHANGED clears selection | PASS |
| Shell never imports executor | PASS |
| SUBMITTING not in ApprovalState | PASS |
| APPROVED never rendered as EXECUTED | PASS |

## 15. Test Results

| Suite | Tests |
|---|---|
| TUI-2 approval lifecycle | 43 |
| TUI-2I SQLite lifecycle | 32 |
| TUI-2E governed executor | 42 |
| TUI-2S shell integration | 50 |
| **TUI-2 total** | **167** |
| **Full Phase D suite** | **618 TypeScript** |
| **Rust conformance** | **46/46** |

## 16. Known Limitations

- Shell wiring to actual TUI rendering not yet implemented
- Approval expiry timer not yet implemented
- Outbox dispatcher not yet production-ready
- Effect dispatcher is in-memory (test adapter)
- No real operator authentication (uses declared identity)
- No approval delegation or multi-operator consensus

## 17. Explicit Non-Goals

These are frozen as non-goals for TUI-2:

- Capability creation
- Capability widening
- Manual capability revocation
- Delegation termination
- Approval scope editing
- Policy editing
- Contract mutation
- Remote-node control
- Distributed grant issuance
- Recovery-required automatic resolution

## 18. TUI-3 Entry Criteria

TUI-3 (Delegation and Subagent Operations) may begin when:

- TUI-2 shell is wired to actual TUI rendering
- At least one real approval has been submitted through the shell
- Approval expiry timer is implemented
- Outbox dispatcher handles real delivery
- Operator authentication uses actual runtime identity
