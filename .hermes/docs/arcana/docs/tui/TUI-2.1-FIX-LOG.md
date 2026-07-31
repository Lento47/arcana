# TUI-2.1 Fix Log — Polish Sprint Round 1

**Date:** 2026-07-31
**Branch:** phase-d-implementation
**Base commit:** 9dc2654e

## SessionBudget Runtime Fix

**Root cause:** `SessionBudget.Service` was `yield*`-ed at runtime inside `runLoop` and `SessionTools.resolve`, but only provided during `SessionPrompt.layer` construction via `Layer.provide`. The service was consumed during construction and not persisted in the `ManagedRuntime` context.

**Fix:** Capture `SessionBudget.Service` during layer construction (like all other services), use the captured closure variable in `runLoop`, and thread it into `SessionTools.resolve` via `Effect.provideService`.

**Files changed:**
- `packages/engine/src/session/prompt.ts` — added `const budget = yield* SessionBudget.Service` at line 130, removed runtime yield from `runLoop`, added `Effect.provideService(SessionBudget.Service, budget)` to tools.resolve call

## Defect Fixes (19 discovered, 17 fixed)

### Rendering Correctness (WS1)

| ID | File | Defect | Fix |
|---|---|---|---|
| PI-01 | production-spine-input.ts:72 | Raw `JSON.stringify` on governance payload — viewport overflow | Truncate at 2000 chars with `… (truncated)` |
| PI-02 | production-spine-input.ts:90 | Missing ellipsis on truncated message summaries | Added `…` when content > 120 chars |
| PI-03 | production-spine-input.ts:78 | Governance events classified as `kind: "approve"` | Changed to `kind: "message"` |
| CS-06 | command-spine-shell.tsx:157-166 | Approval entries always appended after messages | Added `compareOrderingKeys` sort on merge |
| CS-02 | command-spine-shell.tsx:567 | Non-null assertion `get(id)!` crash | Safe access with `null` guard |
| CS-03 | command-spine-shell.tsx:559 | `viewportCulling={false}` rendering all entries | Set to `true` |
| CS-07 | command-spine-shell.tsx:189-191 | Fragile `split(":")[1]` for approval ID | `parts.slice(1, -1).join(":")` |

### Visual Hierarchy (WS2)

| ID | File | Defect | Fix |
|---|---|---|---|
| — | command-spine-shell.tsx:560 | No error boundary — crash unmounts entire chat | Added `ErrorBoundary` with compact fallback |

### Approval Presentation (WS5)

| ID | File | Defect | Fix |
|---|---|---|---|
| SC-01 | approval-shell-controller.ts:147 | UI flicker — shell state cleared before durable refresh | Keep SUBMITTING until durable state arrives |
| SC-02 | approval-shell-controller.ts:187 | `clearSelection()` resets `submitting` mid-flight | Only `executeCommand` clears submitting |
| AD-02 | approval-spine-adapter.ts:183 | CONSUMED receipt has redundant "0 uses" line | Removed duplicate line |
| AD-03 | approval-spine-adapter.ts:188 | DENIED receipt has redundant "approval rejected" line | Removed duplicate line |

### Keyboard (WS6)

| ID | File | Defect | Fix |
|---|---|---|---|
| CS-01 | command-spine-shell.tsx:432-436 | `d` key dead on terminal approvals | Added `isApprovalActionable()` guard |

### Stale Branding (WS1)

| ID | File | Defect | Fix |
|---|---|---|---|
| — | retry.ts:25 | "OpenCode subscription limit" user-visible | "Arcana subscription limit" |
| — | config/index.tsx:73 | "current chat-style" | "legacy chat-style" |
| — | dialog-provider.tsx:75 | "Low cost subscription for everyone" | "Arcana Go — low cost plan for everyone" |

### Truncation (WS7)

| ID | File | Defect | Fix |
|---|---|---|---|
| — | permission.tsx:283 | Untruncated shell commands | `Locale.truncate(command, 120)` |
| — | permission.tsx:310,314 | Untruncated URLs | Truncated at 80 (title) / 120 (body) |
| — | permission.tsx:231,246 | Untruncated glob/grep patterns | Truncated at 60 (title) / 120 (body) |
| — | approval-spine-adapter.ts:116-134 | Untruncated 64-char hashes in body | Truncated to 12-16 chars with ellipsis |

### Type Error

| ID | File | Defect | Fix |
|---|---|---|---|
| — | approval-spine-adapter.ts:124 | `contractRevision` is `number`, `short()` expects `string` | `String(approval.contractRevision)` |

## Test Results

| Suite | Passed | Failed |
|---|---|---|
| TUI Adapter | 72 | 0 |
| TUI Production | 135 | 0 |
| TUI Mounted-Shell | 74 | 0 |
| TUI TSX Contract | 53 | 0 |
| Rust Conformance | 2 | 0 |
| Rust Containment | 6 | 0 |
| **Total** | **342** | **0** |

## Build & Typecheck

- 16/16 packages typecheck ✅
- 8/8 builds ✅

## Non-Blocking Items (documented, not fixed)

- Internal "opencode" API names (keymap hooks, SDK client, config values) — breaking refactor, functional identifiers
- `.opencode` config directory — intentional backward compatibility
- `as any` casts on theme tokens (~50+) — type debt, not runtime risk
- Missing error boundaries in Session route and Prompt component — lower priority than spine shell
- Empty `cwd.ts` file — dead code
- WS3 tool lifecycle rendering patterns — deferred to manual smoke test

---

# Round 2 — SSE Silent-Death Recovery (2026-07-31)

## Background

Recurring user reports: a turn renders truncated, verbs stay on `Working` /
`Thinking`, and the TUI never heals. Investigation (grounded in the AI SDK
stream-protocol docs, `.hermes/docs/ai-sdk/`) proved the data is safe in the
durable store (`opencode-local.db`, `finish: "stop"` set) — the TUI simply
never receives the tail events. The engine streams `server.heartbeat` every
10 seconds while the SSE stream is open
(`packages/engine/src/server/routes/instance/httpapi/handlers/event.ts`).
When the daemon dies without closing the socket (half-open TCP, no FIN/RST),
the client `for await` hangs forever: no reconnect, no `sse.reconnected`, no
REST resync, stale UI indefinitely. The verb code was never at fault; the
completion events (`reasoning-end`, `tool-output-available`, `finish`) died
in transit and the TUI had no liveness signal.

## Fix 1: SSE liveness watchdog (silent death → reconnect)

- `packages/tui/src/util/sse-watchdog.ts` — new `createSseWatchdog`:
  silence window, re-armed on every event, single-fire trip, cancellable.
- `packages/tui/src/context/sdk.tsx` — watchdog armed on every SSE event
  (including `server.heartbeat`); trips after `SSE_SILENT_DEATH_MS`
  (30s = 3 missed heartbeats) by aborting only the current attempt
  (`sse.abort()`). Loop break conditions now distinguish unmount
  (`abort.signal.aborted`) and stale loops (generation token) from
  watchdog trips — a trip falls through to the existing backoff →
  `sse.reconnected` → session REST resync path.
- Effect: a silent daemon death now heals within ~35s (30s window + backoff)
  instead of never. AI SDK protocol alignment: "keep-alive through ping,
  reconnect capabilities" (50-stream-protocol.mdx).

## Fix 2: On-view resume resync (stale cache heal)

- `packages/tui/src/routes/session/index.tsx` — after the session-switch
  sync task, if the cached store holds an assistant message without
  `time.completed` (pending) AND no SSE event flowed for
  `SSE_SILENT_DEATH_MS` AND events previously flowed (fresh boots have no
  prior stream), force one `sync.session.resync(sessionID)`.
- Effect: navigating back to a session whose stream died silently heals
  text + verbs from REST. AI SDK resume-streams pattern: the client
  reconnects to the active stream state on mount/return.

## Tests

- `packages/tui/test/sse-watchdog.test.ts` — 5 new tests: trip-once,
  re-arm defers, stop cancels, re-arm after stop, trip-until-re-armed.
- Full TUI suite: 453 pass / 1 skip / 0 fail (was 449/1/0). Typecheck clean.

## Manual smoke (pending)

- Kill the daemon mid-turn → wait ~35s → TUI reconnects, `sse.reconnected`
  fires, session REST resync heals text + `Done`/`Thought` verbs.
- Navigate away and back to a session with a stale partial turn → verbs and
  text restore from REST.

