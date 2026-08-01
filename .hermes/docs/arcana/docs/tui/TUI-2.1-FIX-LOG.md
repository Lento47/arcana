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

---

# Round 2.1 — Ollama Discovery Follows the Doctor (2026-07-31)

## Background

The TUI unconditionally probed `http://localhost:11434/api/tags` on every
provider refresh to auto-discover local Ollama models. On machines that never
run Ollama this fired a failed fetch and a `[ollama] Failed to fetch models
from localhost:11434` console log on every refresh and in test output. The
active model was never affected; the probe is a parallel discovery that only
adds an "Ollama (local)" entry to the provider switcher.

## Fix

Shared detection, one source of truth:

- `packages/core/src/providers/ollama.ts` — new `detectLocalOllama()`:
  probes `/api/tags` (honors `OLLAMA_PORT`, defaults 11434), returns
  `{ port, models }` or `null`. Injectable `fetch` for tests.
- `packages/engine/src/cli/cmd/doctor.ts` — the doctor's Ollama check now
  calls the shared detector (was an inline duplicate probe).
- `packages/tui/src/context/sync.tsx` — discovery follows the doctor:
  probe via the shared detector; inject the provider **only when a daemon
  is detected with models**. No detection → no entry, no log. The
  disconnected-entry injection and the failure `console.log` are gone.

Rules: TUI probes exactly when the doctor would report Ollama as running.
Detected but empty catalog → silent (nothing to switch to). Engine-side
ollama handling (`packages/core/src/session/runner/model.ts`,
`packages/arcana/src/agent/providers.ts`) untouched.

## Tests

- `packages/core/test/providers/ollama.test.ts` — 7 tests: detect with
  models, empty catalog, non-OK, network failure, malformed payload,
  malformed entries filtered, default port.
- Typecheck clean: core, engine, tui. PEP regression suite 3/3.

Feature provenance: hermes-plans/2026-07-26_150000-ollama-tui-only.md
(pure addition, no mixing).

---

# Round 3 — SSE Truncation: Resync Liveness, Delta Durability, Crash Capture (2026-07-31)

Implements P2/P3/P4 of `TUI-2.1-SSE-TRUNCATION-FIX-PLAN.md`.

## P2 — Liveness-aware resync merge

**Problem:** the hydration merge kept locally-touched parts (`tracker.parts`)
even when the SSE stream was dead, so a resync after a silent death kept the
truncated prefix instead of the REST full text.

- `packages/tui/src/util/part-merge.ts` — new `shouldKeepLocalPart()`
  predicate: tracked parts are kept only while their last delta is inside
  the heartbeat window (30s); silent past the window, REST wins. The legacy
  empty-REST guard is preserved.
- `packages/tui/src/context/sync.tsx` — `lastPartDeltaAt` map updated on
  `message.part.delta` (with opportunistic prune); both merge sites (main
  hydration :736-750 and `ensureChildMessages` :891-902) use the predicate.
- Tests: `test/part-merge.test.ts` (9 tests). TUI sync suites still green.

## P3 — Throttled delta persistence (engine)

**Problem:** text/reasoning deltas were SSE-only; the projector persists
only full `PartUpdated` events. A daemon death before `text-end` left the
DB itself with only the prefix — permanent truncation, no resync can heal.

- `packages/engine/src/session/processor.ts` — `text-delta` and
  `reasoning-delta` now flush the growing part via `session.updatePart`
  every 500ms or every 64 deltas (`shouldFlushPersist`, exported). State
  reset at `*-start`, `*-end`, and cleaned up in `finishReasoning`.
- The existing final flush at `*-end` (and `cleanup()` for interrupted
  streams) is unchanged, so normal flows persist exactly once more.
- Tests: `test/session/processor-persist.test.ts` (5 tests).

## P4 — Daemon crash capture

**Problem:** 5+ daemon deaths/restarts with zero surviving traces — the
crash handlers wrote only to stderr, which vanishes with the process.

- `packages/engine/src/index.ts` — `daemonLog()` appends to
  `L:/tmp/arcana-daemon.log`: `[boot]` (pid + args), `[crash]`
  (unhandledRejection/uncaughtException stacks), `[shutdown]` (SIGTERM),
  `[exit]` (code). Sync `appendFileSync` so it survives `process.exit`.

## P5 — Deferred

Visible "Reconnecting…" heal feedback — optional polish, no consumer
surface yet. Tracked in the plan doc.

## Verification

- TUI full suite (453 baseline + 9 new part-merge + 5 watchdog): pending in
  Round 3 run.
- Core suite + engine session/capability suites: pending.
- Typecheck clean: tui, engine, core.




## Round 4 — Daemon idle self-destruct (P7+P8, 2026-08-01)

Root cause found by full audit: `daemon/lifecycle.ts` armed a 5-minute idle
timer at boot and `resetActivity()` was exported but NEVER called. Every
daemon died exactly 300s after boot, even with the TUI connected. All day's
deaths (16:03, 16:05, 16:46, 17:18, 23:38, 23:47, 00:09) were this timer.

Fixes:
- `daemon/activity.ts` (NEW) — module-level idle control: `armIdle` arms the
  timer; `resetActivity` re-arms on real activity; `sseConnected`/`sseDisconnected`
  suspend it while an SSE client is connected (refcounted).
- `server/server.ts` — request middleware resets activity on EVERY HTTP request.
- `handlers/event.ts` — SSE connect suspends the idle timer; SSE disconnect
  restarts the countdown; each 10s heartbeat resets activity.
- `daemon/lifecycle.ts` — `stopDaemon` logs `[daemon] stop reason=... uptime=Ns`;
  idle stop exits the daemon process explicitly (ARCANA_DAEMON=1 discriminator)
  so stream fibers cannot leave a zombie.
- `daemon/log.ts` (NEW) — shared durable log (`L:/tmp/arcana-daemon.log`);
  `daemon/entry.ts` now logs boot/stop/crash/exit lines; index.ts uses the
  shared helper.
- Tests: `test/daemon/activity.test.ts` 7/7 (idle fires, reset re-arms,
  cwd mismatch ignored, SSE suspend/resume, refcount, clear).

Live evidence in the log: old-build daemon pid 16156 idle-stopped at exactly
300s (uptime=300s) with the TUI connected; full-build smoke daemon pid 19040
idle-stopped at 300s with zero clients and exited cleanly (exit code=0).

Behavior after fix: TUI open = daemon alive (SSE suspends the timer, HTTP and
heartbeats reset it). TUI closed + no traffic 5 min = clean stop + exit.
