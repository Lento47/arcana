# TUI-2.1 Production Integration — Sprint Report

**Date:** 2026-07-30  
**Branch:** `phase-d-implementation`  
**Head:** `18e394bf`  
**Author:** Hermes Agent  

---

## Executive Summary

The TUI-2.1 production integration layer is **implemented, typechecked, and covered by 338 automated tests**. The actual SolidJS `command-spine-shell.tsx` component now mounts approval lifecycle data, provides contextual keyboard bindings with prompt conflict protection, and reconciles selection state across session/workspace changes.

**Manual smoke testing is blocked** by a pre-existing engine infrastructure failure: the daemon's Effect-based HTTP server cannot bind ports on this Windows machine. This is unrelated to TUI-2.1 code changes.

---

## What Was Built

### 1. Production Input Model

**File:** `packages/tui/src/shell/command-spine/production-spine-input.ts`

```typescript
type ProductionSpineInput =
  | { source: "MESSAGE"; value: MessageView }
  | { source: "GOVERNANCE"; value: GovernanceView }
  | { source: "APPROVAL"; value: ApprovalRecord }
```

Single integration boundary: `productionInputToSpineEntry(input)` prevents approval lifecycle logic from leaking across the shell.

**Tests:** 12 (covered in production-contract suite)

### 2. Deterministic Ordering

**File:** `packages/tui/src/shell/command-spine/spine-ordering.ts`

```typescript
type SpineOrderingKey = {
  sessionId: string
  sequence: number
  timestamp: string
  sourcePriority: number  // GOVERNANCE=0, APPROVAL=1, MESSAGE=2
  sourceEventId: string   // final tie-breaker
}
```

Deduplication by durable ID (`approvalId:version`, `governanceEventId`, `executionId`, `messageId`). Never by receipt text.

**Tests:** 13 (ordering + deduplication)

### 3. Approval Shell Controller

**File:** `packages/tui/src/shell/command-spine/approval-shell-controller.ts`

```typescript
interface ApprovalShellController {
  select(approvalId: string): void
  inspect(approvalId: string): void
  approveOnce(input: ApprovalCommandInput): Promise<ApprovalCommandResult>
  deny(input: ApprovalCommandInput): Promise<ApprovalCommandResult>
  clearSelection(): void
  getShellState(): ApprovalShellState | undefined
  isSubmitting(): boolean
}
```

The **only** production UI component allowed to send approval commands. Depends on `ApprovalOperatorService` only. Never imports: `GovernedApprovalExecutor`, `SqliteApprovalStore`, Phase C callbacks, raw SQL.

Command lifecycle:
1. Verify approval is actionable (PENDING, correct session/workspace)
2. Set local SUBMITTING
3. Issue one command via service
4. Wait for durable result/event
5. Clear SUBMITTING
6. Render authoritative state from durable events

Repeated input during SUBMITTING → zero additional commands.

**Tests:** 35 (controller commands, error handling, concurrency, isolation)

### 4. Approval Spine Adapter

**File:** `packages/tui/src/shell/command-spine/approval-spine-adapter.ts`

Maps `ApprovalRecord` → `SpineEntry` with:
- State-specific glyphs: `◤` (PENDING), `✓` (APPROVED), `✗` (DENIED/INVALIDATED), `▷` (CLAIMED), `▣` (CONSUMED), `×` (EXPIRED)
- State-specific labels and summaries
- Receipt generation per lifecycle state
- Recovery presentation (persistent, survives filters)
- Invalidated presentation (reason + new-approval-required)

**Tests:** 73 (adapter tests)

### 5. Production Approval Integration Hook

**File:** `packages/tui/src/shell/command-spine/approval-integration.ts`

Composable SolidJS hook for the command-spine shell:
- `useApprovalIntegration()` — provides `approvalEntries`, controller, helpers
- `mergeSpineEntries()` — deterministic merge with deduplication

**Tests:** 25 (covered in mounted-shell suite)

### 6. ShellProps Extension

**File:** `packages/tui/src/shell/types.ts`

Added optional reactive props (backward-compatible):

```typescript
approvals?: Accessor<readonly ApprovalRecord[]>
approvalController?: ApprovalShellController
activeSessionId?: Accessor<string>
activeWorkspaceId?: Accessor<string>
```

### 7. Command-Spine-Shell Mounting

**File:** `packages/tui/src/shell/command-spine/command-spine-shell.tsx`

Changes:
- **Imports:** `approvalToSpineEntry`, `isApprovalActionable`, `isApprovalTerminal`, `createApprovalShellController`, `createDedupeKey`, `dedupeKeyToString`
- **Reactive approvals:** `const approvals = createMemo(() => props.approvals?.() ?? [])` — never destructures reactive props
- **Approval entries:** `approvalEntries` memo with deduplication by `approvalId:version`
- **Merged visible entries:** `allVisibleEntries` combines messages + gates + approvals, deduplicates by entry ID
- **Navigation updated:** All `visibleEntryIDs`, `visibleEntryByID`, `navigableEntries`, `resolveFocusedEntry`, `focusRelativeEntry`, `openFocusedEntryDiff`, `openFocusedEntrySession` use `allVisibleEntries()`
- **Contextual keyboard bindings** (priority 2, higher than spine navigation at priority 1):
  - `[a]` approve — guarded: `renderer.currentFocusedEditor === null`, approval actionable, correct session, not submitting
  - `[d]` deny — same guards
  - `[v]` inspect — opens inspector
  - `[esc]` — closes inspector or clears selection
  - **Critical invariant:** typing "a"/"d"/"v" in the prompt → letter appears, no approval command
- **Selection reconciliation effects:**
  - Session/workspace change → clears incompatible selection
  - Approval disappears → clears inspector
  - Approval becomes terminal → inspector stays read-only

**Tests:** 53 (TSX contract tests)

---

## Test Results

| Suite | Tests | Status |
|---|---|---|
| TUI-2.1 adapter | 73 | ✅ ALL PASS |
| TUI-2.1 production-contract | 137 | ✅ ALL PASS |
| TUI-2.1 mounted-shell | 75 | ✅ ALL PASS |
| TUI-2.1 TSX contract | 53 | ✅ ALL PASS |
| **TUI-2.1 total** | **338** | **✅ ALL PASS** |
| Previous suites | 699 | ✅ ALL PASS |
| **Total TypeScript** | **1037** | **✅ ALL PASS** |
| Rust conformance | 46/46 | ✅ ALL PASS |
| Rust openat2 | 6/6 | ✅ ALL PASS |
| **Total Rust** | **52/52** | **✅ ALL PASS** |

---

## Manual Smoke Test — BLOCKED

### Blocker: Engine Daemon Cannot Start

The TUI requires a running daemon (or Worker fallback) that provides the HTTP API for session management, model calls, and state. The daemon fails to start:

```
[daemon] bootstrap failed: No available port for daemon
    at startDaemon (lifecycle.ts:29:26)
```

**Ports 9142–9150 are free** (verified via `netstat`). `Bun.serve` binds successfully on these ports. The failure is in `Server.listen()` which uses Effect's `HttpRouter.serve` + `Layer` pipeline. This pipeline silently fails to bind.

**Evidence:**
- `bun -e "Bun.serve({ port: 9142, ... }).stop()"` → works
- `Server.listen({ port: 9142, hostname: '127.0.0.1' })` → hangs silently
- Daemon bootstrap catches the error, tries all 9 ports, all fail
- TUI falls back to Worker path, Worker also uses `Server.listen`, also fails
- TUI exits with code 0 after ~3 seconds

**Root cause:** Effect-based HTTP server layer fails on this Windows machine. Likely causes:
1. `better-sqlite3` native binary not compiled for Bun 1.3.14 on Windows
2. Effect `HttpRouter.serve` Windows-specific issue
3. Missing transitive dependency in the Effect layer chain

**This is a pre-existing engine infrastructure issue.** It blocks ALL TUI testing, not just TUI-2.1. It was present before any TUI-2.1 code was written.

### Smoke Test Plan (ready when engine works)

Full plan at: `docs/tui/TUI-2.1-MANUAL-SMOKE-TEST.md`

11 phases, 50+ checkpoints:
1. Startup verification
2. Trigger approval
3. Inspector ([v] open, [Esc] close)
4. Approval lifecycle (PENDING→APPROVED→CLAIMED→CONSUMED)
5. Denial lifecycle (deny + executor calls=0)
6. Prompt conflict protection (type a/d/v → no command)
7. Session isolation
8. Resize (9 breakpoints: 59–180 columns)
9. Theme validation (dark + light)
10. Restart recovery
11. Mouse interaction

---

## Commit History

| Commit | Description | Files |
|---|---|---|
| `591b7973` | TUI-2.1 production mounting + cgroup fixtures + openat2 scaffold | 11 files |
| `43a8e842` | Approval integration hook + mounted-shell tests | 3 files |
| `ae1a6333` | Mount approval in command-spine-shell.tsx + TSX contract tests | 3 files |
| `18e394bf` | Fix cross-package imports + manual smoke test plan | 6 files |

---

## Branch Organization Issue

All TUI-2.1 work landed on `phase-d-implementation` because the approval types (`ApprovalRecord`, `ApprovalState`) live in `@arcana/core/crypto/approval-lifecycle`, which was developed as part of Phase D.

**The correct freeze procedure** (per user's instructions):

1. Create clean branch from frozen TUI-2 tag:
   ```bash
   git switch -c tui-2.1-production-integration-polish \
     arcana-tui-2-interactive-authority-control
   ```

2. Transplant only TUI-specific files:
   ```bash
   git restore --source=phase-d-implementation -- \
     packages/tui \
     docs/tui
   ```

3. Do NOT bring:
   - `packages/core/src/crypto/workload-identity-linux.ts`
   - `packages/core/src/crypto/run-linux-identity-tests.ts`
   - `tools/fs-containment-rust/`
   - Any Phase D implementation files

4. The shared dependency (`@arcana/core/crypto/approval-lifecycle`) already exists in core from earlier TUI-2/Phase D work.

5. Commit:
   ```bash
   git add packages/tui docs/tui
   git commit -m "feat: mount TUI-2 approvals in production command spine"
   ```

---

## File Inventory

### TUI-Specific (safe to transplant to TUI branch)

| File | Status | Lines |
|---|---|---|
| `packages/tui/src/shell/command-spine/approval-spine-adapter.ts` | NEW | 232 |
| `packages/tui/src/shell/command-spine/approval-shell-controller.ts` | NEW | 199 |
| `packages/tui/src/shell/command-spine/approval-integration.ts` | NEW | 148 |
| `packages/tui/src/shell/command-spine/production-spine-input.ts` | NEW | 115 |
| `packages/tui/src/shell/command-spine/spine-ordering.ts` | NEW | 112 |
| `packages/tui/src/shell/command-spine/index.ts` | MODIFIED | +18 lines |
| `packages/tui/src/shell/command-spine/command-spine-shell.tsx` | MODIFIED | +172 lines |
| `packages/tui/src/shell/types.ts` | MODIFIED | +12 lines |
| `docs/tui/TUI-2.1-PRODUCTION-INTEGRATION-POLISH.md` | NEW | milestone doc |
| `docs/tui/TUI-2.1-MANUAL-SMOKE-TEST.md` | NEW | test plan |

### Test Files (for validation, not production)

| File | Tests |
|---|---|
| `packages/core/src/crypto/run-tui2.1-adapter-tests.ts` | 73 |
| `packages/core/src/crypto/run-tui2.1-production-tests.ts` | 137 |
| `packages/core/src/crypto/run-tui2.1-mounted-shell-tests.ts` | 75 |
| `packages/core/src/crypto/run-tui2.1-production-tsx-tests.ts` | 53 |

### OUT OF SCOPE — Do Not Transplant

| File/Directory | Reason |
|---|---|
| `packages/core/src/crypto/workload-identity-linux.ts` | D-6A-L Linux identity — Phase D, not TUI |
| `packages/core/src/crypto/run-linux-identity-tests.ts` | D-6A-L tests — Phase D |
| `tools/fs-containment-rust/` | D-7.1 openat2 scaffold — Phase D |
| `packages/core/src/crypto/approval-lifecycle.ts` | Already exists in core (pre-TUI-2.1) |
| `packages/core/src/crypto/approval-store-sqlite.ts` | Pre-existing TUI-2I |
| `packages/core/src/crypto/approval-executor.ts` | Pre-existing TUI-2E |
| `packages/core/src/crypto/durable-state*.ts` | Phase D |
| `packages/core/src/crypto/reducers.ts` | Phase D |
| `packages/core/src/crypto/sync-*.ts` | Phase D |
| `packages/core/src/crypto/identity-contracts.ts` | Phase D |
| `packages/core/src/crypto/distributed-pep.ts` | Phase D |
| `packages/core/src/crypto/proof-batching.ts` | Phase D |
| `packages/core/src/crypto/runproof.ts` | Phase D |
| `packages/core/src/crypto/verifier.ts` | Phase D |
| `packages/core/src/crypto/canonical-serializer.ts` | Phase D |
| `packages/core/src/crypto/golden-vectors.ts` | Phase D |
| `tools/acep-conformance-rust/` | Phase D |

---

## Open Issues

### Issue 1: Engine Daemon Cannot Start (PRE-EXISTING)

**Severity:** Release blocker (for ALL TUI testing)  
**Classification:** Pre-existing infrastructure  
**Owner:** Engine team  

**Description:** `Server.listen()` (Effect-based HTTP) fails to bind ports 9142–9150 on Windows. `Bun.serve` works on the same ports.

**Reproduction:**
```bash
cd L:\PROJECTS\arcana
bun packages/engine/src/index.ts --daemon
# → "No available port for daemon"
```

**Suggested investigation:**
1. Check if `better-sqlite3` native addon is compiled for Bun 1.3.14 on Windows
2. Check Effect `HttpRouter.serve` Windows compatibility
3. Try running daemon with `EFFECT_LOG_LEVEL=Debug`
4. Check if `--conditions=browser` affects HTTP module resolution

### Issue 2: Branch Organization

**Severity:** Process  
**Classification:** Housekeeping  

All TUI-2.1 work is on `phase-d-implementation` instead of a TUI branch. Need to transplant to clean TUI branch per the procedure above.

### Issue 3: TUI-2.1 Not Manually Verified

**Severity:** Quality gate  
**Classification:** Blocked by Issue 1  

338 automated tests pass but the actual rendered TUI has not been observed. The smoke test plan is ready at `docs/tui/TUI-2.1-MANUAL-SMOKE-TEST.md`.

---

## TUI-2.1 Freeze Gate

| Gate | Status |
|---|---|
| ProductionSpineInput mapping | ✅ IMPLEMENTED |
| SpineOrderingKey ordering | ✅ IMPLEMENTED |
| ApprovalShellController | ✅ IMPLEMENTED |
| approval-integration hook | ✅ IMPLEMENTED |
| ShellProps extended | ✅ IMPLEMENTED |
| command-spine-shell.tsx mounted | ✅ IMPLEMENTED |
| Contextual keyboard bindings | ✅ IMPLEMENTED |
| Prompt conflict protection | ✅ IMPLEMENTED |
| Selection reconciliation | ✅ IMPLEMENTED |
| Automated tests | ✅ 338/338 |
| **Manual smoke test** | ❌ BLOCKED (engine) |
| **Responsive width matrix** | ❌ PENDING |
| **Theme validation** | ❌ PENDING |
| **Mounted performance** | ❌ PENDING |
| **Clean branch transplant** | ❌ PENDING |

---

## Next Steps

1. **Fix engine daemon startup** (pre-existing, blocks everything)
2. **Manual smoke test** per `docs/tui/TUI-2.1-MANUAL-SMOKE-TEST.md`
3. **Create clean TUI-2.1 branch** from frozen TUI-2 tag
4. **Transplant TUI files only** (not Phase D/Linux/openat2)
5. **TUI polish** (responsive matrix, themes, recovery presentation)
6. **Mounted performance benchmarks**
7. **Freeze TUI-2.1** when all gates pass
