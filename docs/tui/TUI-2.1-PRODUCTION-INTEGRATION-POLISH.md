# TUI-2.1: Production Integration and Operator Polish

**Tag:** `arcana-tui-2.1-production-integration-polish`
**Status:** IN PROGRESS

## 1. Objective

Mount the already-tested approval contract into the real application
and make the interaction production-quality. TUI-3 delegation/subagent
operations are blocked until this milestone passes.

## 2. Scope

- Real command-spine integration
- Approval panel and inspector mounting
- Keyboard and mouse behavior
- Durable event-driven updates
- Responsive rendering
- Focus and selection stability
- Recovery-state presentation
- Visual hierarchy and consistency
- Performance and long-session reliability
- Terminal compatibility

## 3. Authority Boundary

```
real approval event
→ command-spine receipt
→ operator selects approval
→ exact-request inspector
→ ApprovalOperatorService
→ durable state transition
→ event stream refresh
→ runtime worker
→ Phase C PDP/PEP
→ receipts and RunProof update
```

The application shell must never import or invoke:
- GovernedApprovalExecutor
- Raw approval database mutations
- Phase C executor callbacks
- Process or filesystem effect handlers

## 4. Non-Goals

Frozen as non-goals:
- Capability creation
- Policy editing
- Delegation mutation
- Remote-node control
- Approval scope editing
- Automatic recovery resolution

## 5. Visual Hierarchy

Approval states must be immediately distinguishable:

| State | Treatment |
|---|---|
| PENDING | Actionable |
| SUBMITTING | Temporary local state |
| APPROVED | Authorized, not executed |
| CLAIMED | Execution in progress |
| CONSUMED | Terminal success |
| INVALIDATED | Terminal authority failure |
| RECOVERY_REQUIRED | Terminal manual intervention |

Never visually confuse:
- APPROVED ≠ EXECUTED
- CLAIMED ≠ SUCCEEDED
- RETRYABLE ≠ SAFE TO BLINDLY REPLAY

Critical states remain persistent and prominent:
- INVALIDATED
- RECOVERY_REQUIRED
- Trace DEGRADED
- Integrity INVALID

## 6. Responsive Rendering

| Width | Layout |
|---|---|
| <60 | Minimal |
| 60–79 | Narrow |
| 80–99 | Compact |
| 100–119 | Standard |
| ≥120 | Wide |

No text crosses viewport boundaries. No silent clipping of
security-critical fields. Ellipsis visible when abbreviation occurs.

## 7. Interaction Polish

**Keyboard:**
- `a` approve once
- `d` deny
- `v` inspect
- `esc` close inspector or clear selection

**Mouse:**
- click: select approval
- double-click: inspect
- hover: stable highlight without layout shift
- scroll: never loses selection unexpectedly

Repeated input while SUBMITTING must not emit duplicate commands.

## 8. Focus and Session Behavior

- Resize preserves valid selection
- Session switch clears incompatible selection
- Child-session hydration never crashes parent TUI
- Late events from old session cannot update current selection
- Inspector closes safely if its approval disappears

Hydration failure test:
```
child governance event arrives before child session metadata
→ no crash
→ temporary UNKNOWN or DEGRADED view
→ resolves when metadata arrives
```

## 9. Recovery Presentation

RECOVERY_REQUIRED needs persistent, unmistakable treatment:

```
! recovery required
  effect outcome uncertain
  automatic replay blocked
  manual reconciliation required
  execution exec_...
```

Must not disappear under ordinary filters.

INVALIDATED displays why fresh authorization is required:

```
× approval invalidated
  capability revoked
  new approval required
```

## 10. Performance Targets

| Metric | Target |
|---|---|
| Approval receipt append p95 | <20ms |
| Inspector open p95 | <50ms |
| Approval command feedback p95 | <100ms |
| Resize reflow p95 | <50ms |
| Session switch p95 | <100ms |
| Filter update p95 | <100ms |
| 10,000-event session load | <2s |

## 11. Hard Gates

| Gate | Value |
|---|---|
| Production command-spine mounted | PASS |
| Shell-to-executor direct paths | 0 |
| Button-to-effect paths | 0 |
| Duplicate commands | 0 |
| Cross-session approvals | 0 |
| Right-edge truncation defects | 0 |
| Viewport overflow defects | 0 |
| Selection loss during resize | 0 |
| Hydration crashes | 0 |
| False COMPLETE traces | 0 |
| APPROVED rendered as EXECUTED | 0 |
| Recovery-required auto-retries | 0 |
| Critical states hidden by filters | 0 |
| Stale branding strings | 0 |

## 12. Entry Criteria for TUI-3

TUI-3 (Delegation and Subagent Operations) may begin when:
- All TUI-2.1 hard gates pass
- At least one real approval submitted through production shell
- Recovery state tested in production
- Performance targets met
- Polish test matrix passes across terminal variants
