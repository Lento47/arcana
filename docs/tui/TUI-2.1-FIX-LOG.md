# TUI-2.1 Fix Log

**Branch:** `phase-d-implementation`  
**Period:** 2026-07-30 → 2026-07-31  
**Purpose:** Single inventory of **all fixes** landed (or pending commit) while unblocking TUI-2.1 interactive smoke.  
**Not a feature design doc** — for contracts see [TUI-2.1 Production Integration Polish](./TUI-2.1-PRODUCTION-INTEGRATION-POLISH.md); for narrative see [TUI-2.1 Sprint Report](./TUI-2.1-SPRINT-REPORT.md).

---

## How to read this log

| Field | Meaning |
|-------|---------|
| **ID** | Stable fix id for smoke / PR references |
| **Status** | `committed` on branch · `working tree` not yet committed · `docs only` |
| **Surface** | Engine / TUI / Core capability / Docs |
| **Milestone** | Blocks smoke if unchecked |

**Related docs:**

- [TUI-2 Interactive Authority Control](./TUI-2-INTERACTIVE-AUTHORITY-CONTROL.md)
- [TUI-2.1 Production Integration Polish](./TUI-2.1-PRODUCTION-INTEGRATION-POLISH.md)
- [TUI-2.1 Manual Smoke Test](./TUI-2.1-MANUAL-SMOKE-TEST.md)
- [TUI-2.1 Sprint Report](./TUI-2.1-SPRINT-REPORT.md)

---

## Summary matrix

| ID | Status | Surface | One-line |
|----|--------|---------|----------|
| F-01 | committed | Engine | EventStore LayerNode → `Server.listen` can start |
| F-02 | committed | Engine | AppRuntime `defaultLayer` Database order for EventStore |
| F-03 | committed | Engine | Daemon listen errors logged (no silent multi-port hang) |
| F-04 | committed | Engine tests | `httpapi-listen` trust + dispose path green on Windows |
| F-05 | committed | TUI | Cross-package imports + switch defaults (`18e394bf`) |
| F-06 | committed | TUI | Solid preload so TUI does not instant-exit |
| F-07 | working tree | TUI | SSE AbortError no longer kills process |
| F-08 | working tree | TUI | `focusedEntryID` TDZ / declaration order in spine shell |
| F-09 | working tree | Core | Session agent grants (principal mismatch) |
| F-10 | working tree | Core | PEP tool-name → action map covers production tools |
| F-11 | working tree | Engine/Core | Shell/bash spawn diagnostics + Windows `cmd /c` |
| F-12 | working tree | TUI-2.1 | Esc closes inspector / clear selection (doc-aligned) |
| F-13 | working tree | TUI | `session.interrupt` does not swallow Esc |
| F-14 | docs only | Docs | Esc contract + smoke phases + this log |

---

## F-01 — EventStore LayerNode (daemon / Server.listen)

| | |
|--|--|
| **Symptom** | TUI / daemon appeared to hang on ports 9142–9150; Effect HTTP bind looked broken |
| **Root cause** | `Server.listen` uses **LayerNode**. `@arcana/EventStore` was used by SessionProcessor / SessionPrompt but had no `LayerNode` and was not listed as a node dependency. `as any` hid the gap at compile time. Runtime: `Service not found: @arcana/EventStore` |
| **Why silent** | `daemon/lifecycle.ts` treated every listen failure as “try next port” with empty `catch` |
| **Fix** | Add `EventStore.node = LayerNode.make(layer, [Database.node])`; depend on `EventStore.node` from processor / prompt nodes |
| **Files** | `packages/engine/src/session/epistemic/event-store.ts`, `session/processor.ts`, `session/prompt.ts` |
| **Commit** | `c4bc62bd` |
| **Verify** | `startDaemon` + `GET /health` → 200; TUI daemon spawn ready |

---

## F-02 — AppRuntime defaultLayer provide order

| | |
|--|--|
| **Symptom** | `httpapi-listen` tests failed in `afterEach` dispose with `Service not found: @arcana/v2/storage/Database` even when listen succeeded |
| **Root cause** | Providing `Database` then `EventStore.layer` left EventStore’s Database requirement unsatisfied on dispose / AppLayer rebuild |
| **Fix** | Provide `EventStore.layer` with trailing `Database.defaultLayer` so Database re-satisfies EventStore |
| **Files** | `packages/engine/src/session/processor.ts`, `session/prompt.ts` |
| **Commit** | `ef876998` |
| **Verify** | `bun test test/server/httpapi-listen.test.ts` → 5 pass / 6 skip (PTY Windows) / 0 fail |

---

## F-03 — Daemon listen error visibility

| | |
|--|--|
| **Symptom** | Same layer failure looked like multi-port bind hang |
| **Fix** | Log real `Server.listen` errors; aggregate on total failure instead of silent `continue` |
| **Files** | `packages/engine/src/daemon/lifecycle.ts` |
| **Commit** | With F-01 line (`c4bc62bd` / related) |
| **Note** | TUI spawn still uses `stdio: ignore` in places — stderr visibility remains a follow-up |

---

## F-04 — httpapi-listen harness (trust + plugin)

| | |
|--|--|
| **Symptom** | Plugin client listen case failed / incomplete under untrusted workspace |
| **Root cause** | ARC-SEC-I02 strips project plugins when workspace untrusted |
| **Fix** | Set `ARCANA_TRUST_WORKSPACE=1` in the intentional project-plugin test |
| **Files** | `packages/engine/test/server/httpapi-listen.test.ts` |
| **Verify** | Same suite as F-02 |

---

## F-05 — TUI import / switch hygiene

| | |
|--|--|
| **Symptom** | Typecheck / build friction on TUI-2.1 mount |
| **Fix** | Correct cross-package imports; add default switch cases |
| **Commit** | `18e394bf` |

---

## F-06 — TUI Solid preload (instant exit)

| | |
|--|--|
| **Symptom** | TUI process opened then closed immediately |
| **Root cause** | OpenTUI Solid transform not preloaded in-process from monorepo root |
| **Fix** | Ensure Solid preload path from monorepo root / in-process |
| **Commits** | `2b05dd3b`, `d86640d3` |
| **Verify** | `bun run dev:tui` / `./arcana.cmd` stays open |

---

## F-07 — SSE AbortError crash on chat / reconnect

| | |
|--|--|
| **Symptom** | TUI crash after chat send / SSE restart (`abort` unhandledRejection) |
| **Root cause** | `sdk.global.event` / stream abort thrown out of SSE loop; empty `.catch(() => {})` still allowed process-killing rejections in some paths |
| **Fix** | Classify AbortError; break cleanly on abort; log non-abort SSE failures without killing TUI |
| **Files** | `packages/tui/src/context/sdk.tsx` |
| **Status** | working tree |
| **Verify** | Send chat, interrupt, restart SSE — no process exit |

---

## F-08 — focusedEntryID TDZ in command spine

| | |
|--|--|
| **Symptom** | Runtime error: Cannot access `focusedEntryID` before initialization |
| **Root cause** | Solid memos closed over focus signals declared later (TDZ) |
| **Fix** | Declare expand/focus signals before memos that read them; document constraint |
| **Files** | `packages/tui/src/shell/command-spine/command-spine-shell.tsx` |
| **Status** | working tree (order preserved in current shell) |
| **Verify** | Open session with spine — no TDZ crash |

---

## F-09 — Session agent capability grants (principal mismatch)

| | |
|--|--|
| **Symptom** | Tools DENY with principal mismatch; agent principalId (e.g. `build`) had no ACTIVE grants |
| **Root cause** | Production AuthorizationRequests use `principalId = agent.name`; PDP requires grants for that principal |
| **Fix** | Session-scoped agent grant bootstrap (issuer `policy`, agent-bound; does not bypass approval/risk rules) |
| **Files** | `packages/core/src/capability/session-grants.ts` (new), wiring in session tools / PEP path |
| **Status** | working tree |
| **Verify** | Legitimate agent tools pass principal gate; high-risk still permission/approval |

---

## F-10 — PEP tool → action mapping completeness

| | |
|--|--|
| **Symptom** | Production tool IDs (`shell`, `read`, `write`, …) not mapped; only legacy names matched |
| **Fix** | Map production + legacy tool names to CapabilityAction / resource kind |
| **Files** | `packages/core/src/capability/pep-integration.ts` |
| **Status** | working tree |
| **Verify** | shell/read/write/edit resolve to expected actions |

---

## F-11 — Shell / bash diagnostics + Windows cmd

| | |
|--|--|
| **Symptom** | CLI shell commands failed with empty/opaque output on Windows |
| **Root cause** | (1) `cmd.exe` invoked without `/d /s /c` so the command string was not executed as a command line; (2) spawn errors collapsed to no useful meta |
| **Fix** | Windows cmd path: `ChildProcess.make(shell, ["/d", "/s", "/c", command], …)`; capture spawn errors into tool meta (`Failed to spawn…`, shell/cwd/command) |
| **Files** | `packages/engine/src/tool/shell.ts`, `packages/core/src/tool/bash.ts` (related) |
| **Status** | working tree |
| **Verify** | Shell tool on Windows shows command output or explicit spawn failure text |

---

## F-12 — TUI-2.1 Esc: close inspector / clear selection

| | |
|--|--|
| **Contract** | [Production Integration Polish §7](./TUI-2.1-PRODUCTION-INTEGRATION-POLISH.md); [TUI-2 §9](./TUI-2-INTERACTIVE-AUTHORITY-CONTROL.md) |
| **Symptom** | Esc failed to “cancel” inspector (smoke Phase 3.2); often armed interrupt instead |
| **Root cause** | Approval bindings required focused approval **and** `currentFocusedEditor === null`, so Esc was inactive while composer focused; `session.interrupt` owned Escape |
| **Fix** | Split `a`/`d`/`v` from Esc; Esc priority 3 while INSPECTING (always close inspector); clear selection only when SELECTED + composer unfocused; blur composer on focus/inspect; wire controller `select` / `inspect` / `clearSelection` |
| **Files** | `packages/tui/src/shell/command-spine/command-spine-shell.tsx`, `approval-shell-controller.ts` |
| **Status** | working tree |
| **Verify** | Manual smoke Phases 3.2–3.3, 6.4 |

**Esc truth table:**

| State | Esc |
|-------|-----|
| INSPECTING | Close inspector → SELECTED (even if composer focused) |
| SELECTED, composer unfocused | Clear selection → IDLE |
| Composer focused, not inspecting | Not an approval command |

**Out of scope:** PermissionV1 Action Gate Esc-as-reject (separate surface).

---

## F-13 — session.interrupt Esc hygiene

| | |
|--|--|
| **Symptom** | Esc no-op or interrupt arming while approval inspector should own Esc |
| **Fix** | Disable interrupt when composer gate-disabled; return `false` when not focused / autocomplete so keymap does not consume Esc as a silent handled binding |
| **Files** | `packages/tui/src/component/prompt/index.tsx` |
| **Status** | working tree |
| **Pairs with** | F-12 |

---

## F-14 — Documentation updates

| Doc | What changed |
|-----|----------------|
| `TUI-2.1-PRODUCTION-INTEGRATION-POLISH.md` | §7–8 keyboard table, Esc rules, focus, PermissionV1 out of scope |
| `TUI-2-INTERACTIVE-AUTHORITY-CONTROL.md` | §9 transitions + keyboard ownership |
| `TUI-2.1-MANUAL-SMOKE-TEST.md` | Phases 3.2–3.3, 6.1–6.4, 8.2, Esc release blocker |
| `TUI-2.1-SPRINT-REPORT.md` | §6d Esc fix; links; remaining smoke steps |
| `TUI-2.1-FIX-LOG.md` | **This document** |

---

## Explicit non-fixes / non-goals

| Item | Note |
|------|------|
| PermissionV1 Action Gate Esc/reject UX | Not TUI-2.1 approval contract; do not “fix” as spine Esc |
| IntentBindingStore / LEGACY_COMPAT | Follow-up Phase D |
| TUI-3 delegation UI | Blocked until TUI-2.1 smoke + hard gates |
| PTY listen tests on Windows | Pre-existing skip (6 cases) |
| Full p95 performance measurement | Live metrics still pending |
| Merge to `main` | Operator policy: smoke + flags first |

---

## Verification checklist

### Automated (already green when committed suite run)

- [x] TUI-2.1 adapter / mounted / production / TSX contract suites (historical **338/338**)
- [x] Daemon `/health` after F-01/F-02
- [x] `httpapi-listen` Windows: 5 pass / 6 skip / 0 fail

### Interactive (operator — still required to freeze TUI-2.1)

- [ ] Smoke Phase 1 startup (F-06)
- [ ] Chat send without crash (F-07)
- [ ] Tools run without principal DENY for normal agent (F-09/F-10)
- [ ] Shell shows output or clear spawn error on Windows (F-11)
- [ ] Approval `v` then Esc closes inspector (F-12/F-13)
- [ ] Esc again clears selection when spine focused (F-12)
- [ ] Typing `a`/`d`/`v` in prompt does not approve (F-12 Phase 6)

---

## Suggested commit grouping (when committing working tree)

1. **engine/core capability** — F-09, F-10 (+ any epistemic migration already staged)
2. **engine/core shell diagnostics** — F-11
3. **tui stability** — F-07, F-08
4. **tui-2.1 esc** — F-12, F-13
5. **docs** — F-14 (all `docs/tui/*` including this log)

Do not mix PermissionV1 redesign into the Esc commit.

---

## Changelog

| Date | Note |
|------|------|
| 2026-07-31 | Initial fix log: F-01…F-14 from smoke-unblock workstream |
