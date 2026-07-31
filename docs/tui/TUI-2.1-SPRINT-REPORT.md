# TUI-2.1 Sprint Report

**Milestone:** `arcana-tui-2.1-production-integration-polish`  
**Branch:** `phase-d-implementation`  
**Report date:** 2026-07-30 (updated after harness + smoke automation)  
**Status:** **Code complete; engine + listen harness fixed; automated smoke green; interactive operator smoke still pending**

Related docs:

- [TUI-2 Interactive Authority Control](./TUI-2-INTERACTIVE-AUTHORITY-CONTROL.md) (frozen prerequisite)
- [TUI-2.1 Production Integration Polish](./TUI-2.1-PRODUCTION-INTEGRATION-POLISH.md) (milestone contract)
- [TUI-2.1 Manual Smoke Test](./TUI-2.1-MANUAL-SMOKE-TEST.md) (operator checklist)

---

## 1. Executive summary

TUI-2.1 mounts the already-proven TUI-2 approval contract into the **real command-spine shell**: adapter, controller, integration hook, keyboard bindings, and production mounting.

| Track | Result |
|-------|--------|
| TUI-2.1 production code | Landed on `phase-d-implementation` |
| TUI-2.1 automated tests | **338 / 338 pass** (adapter + mounted-shell + production + TSX) |
| Typecheck / imports | Cleaned (`18e394bf`) |
| Engine daemon / `Server.listen` | Fixed (EventStore LayerNode + AppRuntime defaultLayer order) |
| `httpapi-listen.test.ts` (Windows) | **5 pass / 6 skip (PTY) / 0 fail** |
| Automated startup smoke | Daemon spawn + `/health` green |
| Interactive operator smoke | Pending (terminal UI checklist) |
| TUI-3 entry | Still blocked until interactive smoke + hard gates signed off |

TUI-2.1 did **not** cause the TUI startup failure. That was a pre-existing engine LayerNode / `defaultLayer` wiring bug exposed when starting the daemon / `Server.listen` and when tests disposed `AppRuntime`.

---

## 2. Objective (recap)

Mount the durable approval lifecycle into production command-spine and keep the authority boundary:

```
real approval event
→ command-spine receipt
→ operator select / inspect
→ ApprovalOperatorService
→ durable state transition
→ runtime worker
→ Phase C PDP/PEP
→ receipts + RunProof
```

**Never:** shell → `GovernedApprovalExecutor` or button → effect.

TUI-3 (delegation / subagent operations) remains blocked until TUI-2.1 hard gates and smoke pass.

---

## 3. Deliverables shipped

### 3.1 Production shell surfaces

| Component | Path | Role |
|-----------|------|------|
| Spine adapter | `packages/tui/src/shell/command-spine/approval-spine-adapter.ts` | `ApprovalRecord` → `SpineEntry` (glyphs, kinds, tones, copy) |
| Shell controller | `packages/tui/src/shell/command-spine/approval-shell-controller.ts` | Operator intents only; no executor imports |
| Integration hook | `packages/tui/src/shell/command-spine/approval-integration.ts` | Production wiring for approvals into the shell |
| Command spine mount | `packages/tui/src/shell/command-spine/command-spine-shell.tsx` | Merge approval entries, keyboard (`a`/`d`/`v`/`esc`), inspector, submitting guard |

### 3.2 Core approval stack (TUI-2 foundation, reused)

| Component | Path |
|-----------|------|
| Lifecycle + states | `packages/core/src/crypto/approval-lifecycle.ts` |
| Operator service | `packages/core/src/crypto/approval-operator-service.ts` |
| Shell state machine | `packages/core/src/crypto/approval-shell-state.ts` |
| SQLite durable store | `packages/core/src/crypto/approval-store-sqlite.ts` |
| Governed executor (runtime, not TUI) | `packages/core/src/crypto/governed-executor.ts` |

### 3.3 Milestone commits (TUI-2.1 line)

| Commit | Summary |
|--------|---------|
| `e0b14a2d` | TUI-2S shell integration + approval operator service + milestone document |
| `7fb54840` | TUI-2.1 milestone doc + approval spine adapter |
| `4bec4620` | TUI-2.1 adapter tests (73) |
| `591b7973` | TUI-2.1 production mounting (+ D-6A-L / D-7.1 parallel work) |
| `43a8e842` | Production approval integration + mounted-shell tests |
| `ae1a6333` | Mount approval integration in `command-spine-shell.tsx` + TSX contract tests |
| `18e394bf` | Cross-package import fixes + default switch cases |

### 3.4 Docs

| Doc | Status |
|-----|--------|
| `docs/tui/TUI-2.1-PRODUCTION-INTEGRATION-POLISH.md` | Milestone contract (IN PROGRESS → update after smoke) |
| `docs/tui/TUI-2.1-MANUAL-SMOKE-TEST.md` | Operator checklist (unchecked pending run) |
| `docs/tui/TUI-2.1-SPRINT-REPORT.md` | This report |

---

## 4. Automated verification

Re-run on report date from repo root:

```text
bun run packages/core/src/crypto/run-tui2.1-adapter-tests.ts
  → Total: 73  Passed: 73  Failed: 0

bun run packages/core/src/crypto/run-tui2.1-mounted-shell-tests.ts
  → TUI-2.1 Mounted-Shell Integration: 75 passed, 0 failed

bun run packages/core/src/crypto/run-tui2.1-production-tests.ts
  → TUI-2.1 Production Integration: 137 passed, 0 failed

bun run packages/core/src/crypto/run-tui2.1-production-tsx-tests.ts
  → TUI-2.1 Production TSX Integration: 53 passed, 0 failed
```

| Suite | Passed | Failed |
|-------|--------|--------|
| Adapter | 73 | 0 |
| Mounted shell | 75 | 0 |
| Production integration | 137 | 0 |
| Production TSX | 53 | 0 |
| **Total** | **338** | **0** |

Coverage themes (representative):

- State → glyph / kind / tone mapping (PENDING…INVALIDATED)
- APPROVED ≠ EXECUTED, CLAIMED ≠ SUCCEEDED
- Inspector fields and redaction
- Operator command path only (shell-to-executor paths = 0)
- Duplicate submit suppression while SUBMITTING
- Session isolation / terminal invalidation
- Recovery-required copy and non-retry semantics

---

## 5. Hard gates (contract status)

From [TUI-2.1 Production Integration Polish §11](./TUI-2.1-PRODUCTION-INTEGRATION-POLISH.md):

| Gate | Automated | Manual smoke | Notes |
|------|-----------|--------------|-------|
| Production command-spine mounted | PASS (code + tests) | PENDING | Mounted in `command-spine-shell.tsx` |
| Shell-to-executor direct paths | **0** (tests) | PENDING | Enforced in adapter/controller design + TSX tests |
| Button-to-effect paths | **0** (tests) | PENDING | Same |
| Duplicate commands | **0** (tests) | PENDING | SUBMITTING guard covered |
| Cross-session approvals | **0** (tests) | PENDING | Isolation cases in suites |
| Right-edge truncation defects | — | PENDING | Width matrix in smoke plan |
| Viewport overflow defects | — | PENDING | Smoke phases 8–9 |
| Selection loss during resize | — | PENDING | Smoke phase 8 |
| Hydration crashes | Partial (tests) | PENDING | Full child-session path needs live TUI |
| False COMPLETE traces | — | PENDING | Needs live RunProof observation |
| APPROVED rendered as EXECUTED | **0** (tests) | PENDING | Adapter assertions |
| Recovery-required auto-retries | **0** (tests) | PENDING | |
| Critical states hidden by filters | Partial (tests) | PENDING | |
| Stale branding strings | Partial | PENDING | Smoke phase 1 |

**Verdict:** Automated gates for authority boundaries and rendering contracts are green. **Operator smoke is still required** to close visual/resize/live RunProof gates.

---

## 6. Engine blocker: diagnosis and fix

### 6.1 Symptom (pre-fix)

TUI could not start: daemon / worker `Server.listen` appeared to hang on ports **9142–9150**.  
Bun native listen and `Bun.serve` on the same ports worked. Hypothesis of Effect HTTP bind / better-sqlite3 / Windows-only platform bug was **incorrect**.

### 6.2 Actual root cause

`Server.listen` builds the HTTP app through **`LayerNode`**, not through each service’s `defaultLayer`.

Phase A/B introduced `@arcana/EventStore` and used it from:

- `SessionProcessor` (`yield* EventStore.Service`)
- `SessionPrompt` (`yield* EventStore.Service`)

`SessionProcessor.defaultLayer` provided `EventStore.layer`, but:

1. `EventStore` had **no** `LayerNode` node
2. `SessionProcessor.node` / `SessionPrompt.node` did **not** list `EventStore` in their dependency arrays
3. `as any` on `LayerNode.make` **hid** the missing dependency at compile time

Runtime failure:

```text
Service not found: @arcana/EventStore
  (packages/engine/src/session/epistemic/event-store.ts)
```

### 6.3 Why it looked like a silent multi-port hang

`packages/engine/src/daemon/lifecycle.ts` treated **all** listen errors as “try next port”:

```ts
} catch {
  continue
}
```

TUI auto-spawn also used **`stdio: ignore`**, so bootstrap errors never reached the operator. Each port failed for the **same layer bug**, not because Effect could not bind.

### 6.4 Environment note

This worktree temporarily lacked a complete `node_modules` install. After `bun install`, catalog versions resolved correctly:

- `effect@4.0.0-beta.74`
- `@effect/platform-node@4.0.0-beta.74`

Incomplete installs can also produce misleading resolution into Bun cache (Effect 3.x) and stack-overflow storms; that was secondary noise, not the daemon bug.

### 6.5 Fix applied (engine, not TUI-2.1 feature work)

| Change | File |
|--------|------|
| Add `EventStore.node = LayerNode.make(layer, [Database.node])` | `packages/engine/src/session/epistemic/event-store.ts` |
| Depend on `EventStore.node` | `packages/engine/src/session/processor.ts` |
| Depend on `EventStore.node` | `packages/engine/src/session/prompt.ts` |
| Log real `Server.listen` errors; aggregate on total failure | `packages/engine/src/daemon/lifecycle.ts` |

### 6.6 Post-fix probes

| Probe | Result |
|-------|--------|
| `Server.listen({ hostname: "127.0.0.1", port: 9146 })` | OK (~257 ms), `/health` → 200 |
| `Server.listen({ port: 0 })` | Prefers 4096 when free |
| `startDaemon(cwd, version)` | OK on **9142**, `/health` → `{"status":"ok",...}` |
| TUI-style daemon spawn (`index.ts --daemon`) | Ready on 9142 after ~9 health polls |

---

## 6b. Follow-up: `httpapi-listen` test harness (Database + plugin)

### 6b.1 What looked like a test-only failure

`Server.listen` **succeeded** under bun test. The failure came from `afterEach` → `disposeAllInstances()` → `AppRuntime.runPromise(InstanceStore.disposeAll())`, which built `AppLayer` and hit:

```text
Service not found: @arcana/v2/storage/Database
```

### 6b.2 Root cause (AppRuntime / defaultLayer order)

`SessionProcessor.defaultLayer` did:

```ts
Layer.provide(Database.defaultLayer),
Layer.provide(EventStore.layer), // EventStore still requires Database → bubbles open
```

Providing `Database` **before** `EventStore` only satisfies `SessionProcessor`’s direct use. `EventStore.layer` re-introduces a Database requirement that was not re-satisfied.

`SessionPrompt.defaultLayer` yielded `EventStore.Service` but never provided `EventStore.layer`.

### 6b.3 Fixes

| Change | File |
|--------|------|
| Provide `EventStore.layer` then `Database.defaultLayer` | `packages/engine/src/session/processor.ts` |
| Provide `EventStore.layer` + trailing `Database.defaultLayer` | `packages/engine/src/session/prompt.ts` |
| Plugin listen test sets `ARCANA_TRUST_WORKSPACE=1` | `packages/engine/test/server/httpapi-listen.test.ts` |

Plugin test detail: ARC-SEC-I02 strips project plugins on untrusted workspaces, so the tmpdir plugin never loaded (`initialized` never written). Trust escape hatch is correct for an intentional project-plugin test.

### 6b.4 Results (`bun test test/server/httpapi-listen.test.ts`)

| Result | Count |
|--------|-------|
| Pass | **5** (incl. port-0 prefer/fallback, plugin client, stop, default handler) |
| Skip | **6** (PTY websocket cases — skipped on Windows) |
| Fail | **0** |

---

## 6c. Automated smoke (non-interactive)

| Check | Result |
|-------|--------|
| TUI-2.1 adapter / mounted / production / TSX | **338/338** |
| `startDaemon` + `/health` | PASS |
| Daemon spawn path used by TUI (`--daemon`) | PASS |
| Interactive checklist phases 1–9 | **Not run** (requires human terminal) |

Interactive phases still required: approval glyphs, `a`/`d`/`v`/`esc`, resize matrix, themes, prompt conflict protection. See [TUI-2.1 Manual Smoke Test](./TUI-2.1-MANUAL-SMOKE-TEST.md).

---

## 7. Authority boundary audit (TUI-2.1)

| Rule | Status |
|------|--------|
| Shell issues operator intents only | Held in code + tests |
| No TUI import of `GovernedApprovalExecutor` | Held (adapter header contract) |
| No button → effect | Held |
| Fresh PDP/PEP on execute (runtime) | TUI-2 / Phase C path; not reopened by 2.1 |
| INVALIDATED terminal | Held in lifecycle + presentation tests |
| Secrets not leaked into spine/inspector copy | Covered in production suites |

---

## 8. Out of scope / non-goals (unchanged)

Frozen non-goals for TUI-2.1:

- Capability creation / policy editing
- Delegation mutation / remote-node control
- Approval scope editing
- Automatic recovery resolution
- Full multi-panel cockpit (still aspirational; default remains command-spine)

Parallel Phase D work on the same branch (ACEP-1, D-6/D-7/D-8A, workload identity, openat2 scaffold) is **not** TUI-2.1 deliverable, but coexists on `phase-d-implementation`.

---

## 9. Remaining work

### Must-do to close TUI-2.1

1. **Run** [TUI-2.1 Manual Smoke Test](./TUI-2.1-MANUAL-SMOKE-TEST.md) on a real terminal (startup, approve, deny, resize matrix, themes).
2. Record smoke results (checkboxes + width table) and freeze milestone status in `TUI-2.1-PRODUCTION-INTEGRATION-POLISH.md`.
3. Optional git hygiene: clean TUI-2.1 branch from frozen TUI-2 tag via transplant strategy (separate from runtime fix).

### Nice-to-have / follow-ups

- Consider not ignoring daemon stdio in TUI spawn (or pipe stderr to a log file)
- Performance targets from §10 of the milestone doc (p95 metrics) still need live measurement
- PTY listen tests remain skipped on Windows (pre-existing platform gate)

### Explicitly blocked until interactive smoke

- TUI-3: Delegation and Subagent Operations

---

## 10. How to reproduce green engine startup

```bash
# from repo root, after bun install
bun --conditions=browser -e "
  const { startDaemon } = await import('./packages/engine/src/daemon/lifecycle.ts')
  const { removeLock } = await import('./packages/engine/src/daemon/lock.ts')
  removeLock(process.cwd())
  const r = await startDaemon(process.cwd(), 'smoke')
  console.log(r)
  console.log(await fetch(r.url + '/health').then(x => x.text()))
"

# or launch TUI
./arcana.cmd
# or
bun --conditions=browser packages/engine/src/index.ts
```

Then execute the manual smoke checklist.

---

## 11. Bottom line

| Question | Answer |
|----------|--------|
| Is TUI-2.1 code done? | **Yes** for production mount + automated contract |
| Are automated tests green? | **338/338** TUI-2.1; **5/5 runnable** httpapi-listen on Windows |
| Was TUI-2.1 responsible for no-start? | **No** |
| What blocked smoke? | Missing `EventStore` in LayerNode + bad `defaultLayer` provide order + silent daemon catch |
| Is that fixed? | **Yes** (LayerNode + AppRuntime defaultLayer + daemon logging) |
| Listen harness Database error? | **Fixed** (was afterEach dispose, not listen) |
| Can TUI-3 start? | **Not yet** — needs interactive operator smoke sign-off |

**Recommended next operator action:** open a real terminal, run `./arcana.cmd` (or engine TUI), execute [manual smoke](./TUI-2.1-MANUAL-SMOKE-TEST.md), then freeze the TUI-2.1 tag when gates pass.
