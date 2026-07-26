# Tool "did not finish" False Error Fix

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Fix the false "Tool did not finish" error that appears when a tool's state is still "pending" at turn completion but the tool actually completes successfully moments later.

**Architecture:** The spine-mapper's `finalizeToolState` (spine-mapper.ts:840-887) prematurely marks "pending" tools as errors when the turn finishes. The tool was queued but the engine hasn't transitioned it to "running" yet. Fix: keep "pending" tools as "pending" — don't finalize them at all — and let the engine update their state normally.

**Tech Stack:** TypeScript, spine-mapper logic.

---

## Full Code Path Audit

### How tool states flow

```
Engine creates part: status = "pending"       (session-data.ts:739 startTool)
  ↓ (engine starts executing)
Engine updates: status = "running"            (subagent-data.ts:207 / stream.transport.ts:987)
  ↓ (tool completes)
Engine updates: status = "completed"           (subagent-data.ts:199)

Spine-mapper finalizeToolState reads part.state.status
  ↓
  if status !== "pending" && status !== "running" → return state as-is  (line 841) ✅
  if !turnDone && !superseded → return state as-is (tool still active)  (line 857) ✅
  if status === "running" → return as "completed" with output           (line 860) ✅
  else (status === "pending") → return as "error" "Tool did not finish" (line 878) ❌ BUG
```

**Bug:** Line 878 fires when:
1. Tool is "pending" (engine hasn't started it yet)
2. Turn is done (message.time.completed exists) OR superseded (later text/tool exists)

The engine may still transition the tool to "running" → "completed" AFTER this code runs. The TUI shows both the error AND the eventual completion.

### What happens after the error

The spine entry with `status: "error"` is rendered. Then when the engine updates the part to "completed", the spine-mapper re-computes the entry and replaces it with the completed version. The user sees a brief error flash before the result appears.

---

## Regression Analysis

**REG-1: Changing "pending" to NOT be finalized may leave orphaned pending tools visible.**
If a tool stays "pending" forever (engine crash, tool dropped), it would show the pending spinner indefinitely. **Mitigation:** This is the EXISTING behavior without the premature error. The user would prefer a spinner over a false error. Additionally, the engine has cleanup for stale pending tools. **Acceptable.**

**REG-2: `!turnDone && !superseded` guard at line 857 already handles active tools.**
When a tool is "pending" and the turn is NOT done and the tool is NOT superseded, the function returns the state as-is (keeps it as "pending"). This is correct — the tool is still active. The bug is only when the turn IS done or the tool IS superseded. **Fix must still respect this guard.**

**REG-3: Superseded pending tools.**
If a tool is "pending" and a LATER text/tool exists, the tool was superseded (the assistant moved on without using this tool). In this case, the tool genuinely never ran. But instead of marking it as "error", it should be marked as "skipped" or simply not rendered. **Fix: mark superseded pending tools as "skipped" instead of "error". Added to plan.**

---

## Files

| Action | Path | ~Lines |
|---|---|---|
| Modify | `packages/tui/src/shell/command-spine/spine-mapper.ts` | -5 lines |

---

## Bite-Sized Tasks

### Task 1: Fix premature "Tool did not finish" error (3 min)

**Objective:** Stop marking "pending" tools as errors when the turn finishes. Instead, keep them as "pending" (spinner continues) or mark as "skipped" if superseded.

**File:** `packages/tui/src/shell/command-spine/spine-mapper.ts` — lines 878-886

**Current code:**
```typescript
  return {
    status: "error",
    input: state.input ?? {},
    error: "Tool did not finish",
    time: {
      start: message.time.created,
      end,
    },
  }
```

**Replace with:**
```typescript
  // Tool was "pending" and never started. If superseded by later content,
  // mark as skipped (not an error). Otherwise leave as pending — the engine
  // may transition it to running/completed later.
  if (superseded) {
    return {
      status: "skipped",
      input: state.input ?? {},
      time: {
        start: message.time.created,
        end,
      },
    }
  }
  // Still pending, turn may not be fully done — keep as pending
  return state
```

**Verification:**
- Run a session with multiple shell commands
- Tools that were pending at turn-end no longer show "Tool did not finish"
- Tools that actually fail still show their real error (status === "error" from engine)
- Superseded (unused) tools are silently skipped instead of showing as errors

**Commit:**
```bash
git add packages/tui/src/shell/command-spine/spine-mapper.ts
git commit -m "tui: stop marking pending tools as errors when turn finishes"
```

---

### Task 2: Build and verify (2 min)

```bash
cd L:/PROJECTS/arcana && bun run build
```

Expected: 8/8 successful.

```bash
git push
```

---

## Risks

1. **Pending tools may show spinner forever if engine never starts them.** This is better than a false error — the user can see the tool is still pending. The engine's `sync.data` store will trigger a re-render when state eventually updates. If the engine truly drops the tool, the pending state is the correct UX (the tool was queued but never executed). **Acceptable.**

2. **"Skipped" status shows as "pending" in receipt badge.** `toolStateToReceipt` at line 974 returns `{ label: tool, status: "pending" }` as the default for unknown statuses. This is acceptable — the receipt is a small gutter badge. The tool entry itself won't render visibly since superseded tools have later visible content. **Acceptable.**
