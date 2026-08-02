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

## Streaming Lifecycle Fixes (Round 2 — found during interactive operator testing)

**Date:** 2026-07-31
**Commits:** `aedd96dc` … `e7cc8da6` (13 commits, validated by operator)

| ID | File | Defect | Fix |
|---|---|---|---|
| SL-01 | packages/engine/src/session.ts:701 | `updateMessage` published `msg` by reference — SolidJS reconcile saw no diff, streaming chrome never updated | `publish("message.updated", { info: structuredClone(msg) })` |
| SL-02 | command-spine-shell.tsx:263 | `runState` checked `"running"`/`"thinking"` — engine only emits `"busy"`/`"retry"` | Check `"busy"`/`"retry"` |
| SL-03 | tui-streaming.ts:1670 | `makeInlineThinkEntry` passed no timed `part` — inline thinking shimmer stuck | Pass timed part to `buildTurnLifecycle` |
| SL-04 | **spine-node.tsx:223** | **ROOT CAUSE: `active={!!thinking()}` always true** — plan entries hardcode `thinking="thinking"`, so `!!"thinking"` is always truthy; shimmer never stopped | `active={streaming()}` |
| SL-05 | spine-mapper.ts:570 | `thinkingSummary` always returned "Thinking" — no begin/end marker on reasoning | `thinkingSummary(text, seed, streaming)` → `"Thinking"` while open, `"Thought"` when ended; both call sites pass `streaming` |
| SL-06 | spine-chat.tsx:93-96 | Header shimmer verb `"thinking"` contradicted the flipped `"Thought"` think row | Verb `"writing"` for answer phase (interim) |
| SL-07 | spine-chat.tsx (header) | **Operator decision:** no shimmer verb or spinner in the `✦ arcana` header at all | Removed `ShimmerText` + `SigilSpinner` from chat header; `streaming` still flows to prose body for markdown stability |

**Regression tests added:** `test/spine-mapper.test.ts` — completed+idle → plan `streaming=false`, think summary `"Thought"`; mid-stream (busy) → think superseded `"Thought"`, plan still `streaming=true`.

**Test totals after Round 2:** TUI 434/434 (was 342 at Round 1 close).

## Reasoning Wrap Fix (Round 3 — found during live WS1 debugging)

**Date:** 2026-07-31
**Commit:** `ca73e50e` (8 regression tests, `[bump]`)

| ID | File | Defect | Fix |
|---|---|---|---|
| RW-01 | packages/tui/src/routes/session/index.tsx:2007 | Reasoning body `<code>` had no numeric width — `CodeRenderable` `wrapMode` defaults to `"word"` (docs `components/code.mdx`; dist `TextBufferRenderable._wrapMode = "word"`), but wrap only engages when `width > 0` (dist: `if (this._wrapMode !== "none" && this.width > 0) setWrapWidth(this.width)`). Width auto → no wrap constraint → intrinsic width → long single-line reasoning **clipped at the terminal right edge** (117 of 133 chars visible at 120 cols). Stored reasoning data was always complete — display-only defect. The spine already passed `wrapMode="word"` + a numeric width; the session route never got the same treatment | `wrapMode="word"` (explicit; matches default) + clamped `reasoningBodyWidth()` memo (`ctx.width − 3 − minimal-indent − 1`, `Math.max(1, …)`) on the `<code>` and its body box — the numeric width is the actual cure; `ReasoningPart` + session context exported for testability; SDK type import aliased `ReasoningPartType` |

**Key finding:** the user-approved literal patch (`streaming={true}` + `drawUnstyledText={false}` constants) cannot render deterministically — per the documented contract, `drawUnstyledText` shows text *before* highlighting completes, so `false` + `streaming` (async tree-sitter highlight) gates ALL rendering on highlight completion (`@opentui/core` `index-7z5n7k9m.js:3156` styled-streaming path skips the synchronous buffer update; never resolves in test env; per-token whole-buffer highlight cost in production). Kept the original dynamic flags (`!isDone()`) — the width fix is the actual defect fix.

**Regression tests added:** `test/reasoning-part-wrap.test.tsx` — 8 tests: 120-col wrap (head + tail on different rows), final words visible, no duplication after `time.end`, streaming partial content, complete after final delta, minimal mode collapsed until click, show mode stays expanded, width sweep 59/80/100/120/180, degenerate-width clamp, in-place `resize()` narrower/wider preserves content. Test harness installs `MockTreeSitterClient` via OpenTUI's singleton registry (`globalThis[Symbol.for("@opentui/core/singleton")]`, key `"tree-sitter-client"`).

**Test totals after Round 3:** TUI 444/444 pass (1 skip), 0 fail.

## SSE Gap-Closer on Reconnect (Round 4 — live WS1 debugging)

**Date:** 2026-07-31
**Commit:** `aeb89f53` (3 regression tests, `[bump]`)

**Defect:** a new-session exchange froze mid-stream at the last delivered snapshot ("Hello. How") while the engine store was already complete (`time.end` set). Old sessions opened later rendered complete via REST hydration — proving the engine data was intact and the display was stale. Root cause: the daemon re-registered mid-exchange (session lock rewrote at 14:49, SSE connections 7→1), tearing down the TUI's SSE stream. The tail events were never delivered and never recovered: SSE events carry no `id:` (Last-Event-ID replay impossible), the parser discards partial buffered events at stream end (`serverSentEvents.gen.ts`), and the sync store's `fullSyncedSessions` guard marks a session synced once — so no re-fetch ever happened. The gap was permanent until TUI restart.

**Fix (3 files, surgical):**
| File | Change |
|---|---|
| `src/context/sdk.tsx` | After reconnect backoff, before the next fetch, emit a synthetic `sse.reconnected` GlobalEvent through the existing emitter |
| `src/context/sync.tsx` | New `resync(sessionID)`: clears the `fullSyncedSessions` guard + the older-messages exhausted marker, then re-runs the existing full hydrate (`session.get` + messages + parts + todo + diff). Reuses `sync()` so live-delta tracker merge and race guards are identical. Fail-closed: on fetch failure the guard stays cleared, so the next attempt retries |
| `src/routes/session/index.tsx` | Listens for `sse.reconnected` (defensive name check, same pattern as `approval.updated`) and calls `resync(route.sessionID)`, errors swallowed |

**Verification:** 3 regression tests in `test/cli/cmd/tui/sync-resync.test.tsx` — (1) resync clears the guard and re-fetches: stale partial "Hello. How" is replaced by the complete REST snapshot, second REST read proven by request counter; (2) live deltas arriving during the resync hydrate are preserved, not clobbered; (3) engine-down failure rejects, guard stays cleared, recovery attempt succeeds. TUI suite 447/448 pass (1 skip), 0 fail. Typecheck clean.

**Operator validation (2026-07-31, live `dev:tui`):** a fresh new-session exchange rendered complete end to end — label flipped `Thinking` → `Thought` with the full reasoning visible, assistant reply complete ("Sure. What do you need help with?"). The exact failure mode that froze at "Hello. How" now resolves to the full reply. WS1 stream-completion checkpoint: PASS.

**Note:** the reconnect *fetch* itself still throws (pre-existing) if the daemon refuses at the exact retry moment, killing the loop; the resync heals the display but live streaming would need a restart. Deferred to WS2 lifecycle robustness.

**SDK contract note (from `packages/sdk/openapi.json`, the SDK's only documentation — no markdown exists):** the API documents an intended catch-up channel — `POST /sync/history` returns sync events with `seq >` the client's last-known per-aggregate sequence, and `POST /sync/replay` replays a full history. The TUI never uses seq bookkeeping; the REST `resync()` achieves the same heal with less state. Revisit `/sync/history` as a WS2 candidate for true event-level catch-up. SSE stream is `GET /global/event` (`sdk.global.event`); `sseMaxRetryAttempts` is a client-side option, not an API parameter.

**Test totals after Round 4:** TUI 447/448 pass (1 skip), 0 fail.

## Destroyed EditBuffer Guard (Round 5 — live WS1 debugging)

**Date:** 2026-07-31
**Commit:** `27746683` (`[bump]`)

**Defect:** `[command-execution-error] [Keymap] Error running command "prompt.autocomplete.select": EditBuffer is destroyed` — keypress → `select()` (autocomplete.tsx:735) → slash-command option `onSelect` (autocomplete.tsx:614) → `item.onSelect()` executes and navigates (unmounting the composer, destroying the TextareaRenderable's EditBuffer) → `props.clearPrompt()` then calls `input.clear()` on the destroyed buffer. OpenTUI `EditBuffer.guard()` throws on any call after `destroy()`. The keymap command outlives the component it targets.

**Fix (surgical, 2 guards in `packages/tui/src/component/prompt/index.tsx`):** `clearPrompt()` and PromptRef `reset()` skip `input.clear()` / `input.extmarks.clear()` when `input.isDestroyed` (public getter, `Renderable.d.ts:282`). Store reset still runs (idempotent). Covers all 17+ clearPrompt callers (submit, clear command, palette, autocomplete). Fail-closed: clearing a dead composer is a no-op.

**Verification:** typecheck clean; TUI suite 447/448 pass (1 skip), 0 fail (no regressions). **Operator validation (2026-07-31, live `dev:tui`):** slash-command select with navigation no longer logs the error. PASS.

## OPEN DEFECT — Daemon re-registration loses in-memory InstanceRef registry (WS2 lifecycle blocker)

**Date:** 2026-07-31 (second occurrence; first at 14:49)
**Status:** OPEN — diagnosis complete, fix not implemented

**Symptoms (live):** every tool call (`echo test` included) fails `EXECUTION_FAILED Error: InstanceRef not provided`; the agent churns retrying; the assistant reply freezes mid-stream in the display while the durable store holds the complete text (`step-finish` present, `time.end` set). SSE gap-closer alone cannot heal: the REST re-hydration fails for the same reason the tools fail.

**Evidence:**
- Two daemon locks in `~/.arcana/daemon/`: `a36c69a17d38.json` (workspace `L:\PROJECTS\arcana`, pid 28124, 15:24 — process DEAD, lock stale) and `97f015ffe189.json` (workspace `packages/engine`, pid 5040, 15:28 — alive, owns port 9142, 4 ESTABLISHED SSE connections).
- `InstanceRef` is an Effect service (`packages/engine/src/effect/instance-ref`); tool effects `Effect.die("InstanceRef not provided")` when the service is missing (`cli/cmd/agent.ts:65-66`, same pattern in `github.handler.ts:156-157`). The engine middleware provides `InstanceRef` for request-derived context (per `engine_src_server_routes_instance_httpapi_AGENTS.md`).
- The instance registry is in-memory: a daemon re-registration wipes it. The TUI reconnects SSE (global stream, no instance needed) but never re-bootstraps (the `server.instance.disposed` event never arrives on stream teardown — the same gap the Round 4 fix addresses) → the new daemon never re-registers the session's instance → all instance-scoped requests fail.
- Ground truth check: durable `part` table shows the turn completed (`step-finish`, reason `stop`) with the full text; the TUI displayed only the first token ("All"). Display stale, engine data intact.

**Blocker chain:** daemon dies (cause still unknown; engine dev process ~557MB) → in-memory instance registry lost → InstanceRef not provided on every tool → agent loops → reply stalls. The Round 4 `resync()` is fail-closed (guard stays cleared) but has no retry trigger when the stream is alive and REST is broken.

**Fix candidates (WS2):**
1. Persist/restore the instance registry across daemon restarts, or re-register instances lazily on first instance-scoped request (fixes tools AND REST).
2. TUI: on `sse.reconnected`, if `resync()` rejects, retry with bounded backoff (3 attempts) — heals display even when the daemon is mid-transition.
3. Root-cause the daemon death (crash logs, OOM, watcher restart).

## Non-Blocking Items (documented, not fixed)

- Internal "opencode" API names (keymap hooks, SDK client, config values) — breaking refactor, functional identifiers
- `.opencode` config directory — intentional backward compatibility
- `as any` casts on theme tokens (~50+) — type debt, not runtime risk
- Missing error boundaries in Session route and Prompt component — lower priority than spine shell
- Empty `cwd.ts` file — dead code
- WS3 tool lifecycle rendering patterns — deferred to manual smoke test

## F-15 — OpenTUI 0.4.5 compiled-binary worker-path crash (TUI would not open)

**Date:** 2026-08-02
**Status:** FIXED

**Symptoms:** `bun run dev:tui` (and the compiled `arcana.exe`) opened for
miliseconds and closed on Windows. Dev mode crashed natively
(0xC0000409 / STATUS_STACK_BUFFER_OVERRUN) on Bun 1.3.14; the compiled binary
exited 1 with `undefined is not an object (evaluating 'loadedPath.startsWith')`
at OpenTUI `normalizeLoadedFilePath`.

**Root cause:** Bun compile bundles `@opentui/core/parser.worker` (imported
with `with: { type: "file" }`) as a JS module without a default export.
OpenTUI 0.4.5 eagerly resolves that asset at module load
(`resolveBundledFilePath`) and `normalizeLoadedFilePath(undefined)` throws. In
compiled binaries the real worker path is available via the engine's
`OTUI_TREE_SITTER_WORKER_PATH` define, but the eager call crashes before it is
used.

**Fix:** null guard in `normalizeLoadedFilePath` (undefined → undefined)
applied by `script/patch-opentui.ts`, version-pinned to @opentui/core 0.4.5
and wired as the root `postinstall`. OpenTUI stays on 0.4.5 (no revert).

**Verification:** rebuilt engine binary runs 5/5 console launches and renders
(terminal capability output present); `bun run --conditions=browser
./src/index.ts` stays running in console mode; TUI suite 775/1/0.

## F-16 — Daemon boot crash: obligation_templates seed UNIQUE violation

**Date:** 2026-08-02
**Status:** FIXED

**Symptoms:** `bun run dev:tui` and the compiled binary did not open. The
engine daemon exited 1 with repeated `Failed query: insert into
"obligation_templates" …` across ports 9142–9150, ending in "No available
port for daemon".

**Root cause:** `ObligationEngine.seedTemplates` inserts the baseline
templates unconditionally at daemon bootstrap. `rule_id` is the PRIMARY KEY,
so once seeded, every later boot violates UNIQUE and the daemon bootstrap
(`Server.listen` → layer init) throws on every port attempt.

**Fix:** `db.insert(ObligationTemplateTable).values(…).onConflictDoNothing()`
— idempotent seed.

**Verification:** daemon boots on 9142 with `/health` 200 for both dev
(`bun run --conditions=browser ./src/index.ts`) and the compiled
`arcana.exe`; obligation/contract engine tests 35/0; engine typecheck clean.
Binary rebuilt (0.0.0-phase-d-implementation-202608021008).

## F-17 — Governance/proof rows rendered as chat cards when healthy

**Date:** 2026-08-02
**Status:** FIXED

**Symptoms:** healthy (`ok`) governance groups and RunProof rows rendered with
chat-card chrome (label + timestamp + full prose block), making turns far
taller than needed and forcing long scrolls through expanded event groups.

**Root cause:** `SpineEntry.isChatProse` classified any `kind === "ok"` row as
chat, including governance-sourced rows.

**Fix:** governance-sourced rows (`source.kind === "governance"`) always use
the compact operator row. Also added: whole-row left-click expand for
collapsed toggleable blocks (focus retained), auto-collapse of expanded
governance groups when a new user turn starts, `H`/`G` scroll-to-top/bottom
keys, and correct `N pending approval` aggregation labels.

**Verification:** spine-entry interaction suite 4/4 (incl. new governance
left-click test); full TUI suite 777 pass / 1 skip / 0 fail (778 tests).

## F-18 — Completion gate idempotency was per-session, not per-contract

**Date:** 2026-08-02
**Status:** FIXED

**Symptoms:** after the first contract resolved (`VERIFIED_COMPLETE`), every
later contract in the same session stayed open: its obligation remained
`pending` and RunProof stayed `DEGRADED` / `UNVERIFIED` with the gap
"1 required obligation(s) unresolved" even after the turn completed with real
executed effects.

**Root cause:** `SessionPrompt.epistemicCompletionGate` short-circuited when
the session had ANY `completion.resolved` event. The gate therefore never ran
for contract 2+ — the obligations were never verified against the durable
evidence that existed (e.g. `authorization.executed` for the approved `pwd`).

**Fix:** idempotency is now per contract
(`contractCompletionAlreadyResolved` checks the active contract's own
`completion.resolved` event). New contracts always run the gate; re-runs of an
already-resolved contract are still skipped.

**Verification:** engine typecheck clean; new regression suite
`test/session/completion-gate-idempotency.test.ts` (3 tests); epistemic
contract/completion/run-proof suites green (36/0 combined). **Live
confirmation (2026-08-02):** the second+ contract in a real session now
resolves — RunProof flipped to `P3 · complete · VERIFIED` with
`Obligations: satisfied 2` after the gate re-ran on the open contract.

## F-19 — Criteria receipts were never emitted in production

**Date:** 2026-08-02
**Status:** FIXED

**Symptoms:** an obligation like "Relevant tests and checks pass" stayed
`pending` forever even after the agent ran `cargo check`/tests. RunProof
stayed `P1 · degraded · UNVERIFIED` with the gap "1 required obligation(s)
unresolved".

**Root cause:** the completion verifier requires a durable `evidence.attached`
event with kind `test_receipt` (and `build_receipt` for builds), but the only
`evidence.attached` producer was the claim store. No production path emitted
criteria receipts, so test/build-aware obligations were unsatisfiable by
design.

**Fix:** the PEP now emits `evidence.attached` with kind `test_receipt` /
`build_receipt` after a successful execution whose command is a recognized
test/build runner (`cargo|bun|npm|pnpm|yarn|npx|go|node|python|pytest|mvn|…
` with `test|check|verify|regression|clippy` or `build|compile`). Commands
like `Test-Path` and the `goal_check` tool never classify as receipts.

**Verification:** new classifier suite
`packages/core/test/capability/receipt-kind.test.ts` (8 tests); core
typecheck clean; epistemic contract/completion/run-proof suites 36/0.

## F-20 — RunProof hid operator-rejected executions

**Date:** 2026-08-02
**Status:** FIXED

**Symptoms:** an effect that was allowed by the PDP then rejected at the
operator permission gate (`authorization.execution_failed`,
"PermissionRejectedError") left no trace in the RunProof summary or body —
the proof read "allowed … executed" with no mention of the refusal, so the
operator could not tell a rejected call from one that never happened.

**Root cause:** `executionFailures` was computed by the RunProof projection
and returned in the authorization profile, but the TUI proof entry never
rendered it.

**Fix:** the proof body now shows `Execution failures: N`, and the summary
appends `· N failed` when N > 0. Rejected effects are still NOT counted as
executed, and their allows are accounted as refused (not unmatched) — the
`unauthorizedExecutions = 0` invariant is unchanged.

**Verification:** governance-spine proof suite 10/10 (incl. new
operator-rejection test); full TUI suite 778 pass / 1 skip / 0 fail.

## F-21 — Proof/governed rows swapped order on live updates ("duplicate proof")

**Date:** 2026-08-02
**Status:** FIXED

**Symptoms:** while events streamed in, a second "proof-like" row appeared
next to the persistent proof and vanished immediately. The operator observed
the governed actions row ending up below the proof, then swapping back.

**Root cause:** the proof row's sort key was `lastSequence + 1`. When the
proof payload lagged behind the newest governance event sequence, the proof
sorted BEFORE the newest events — so the aggregated `governed` row and the
proof swapped positions on every proof update, reading as a transient
duplicate.

**Fix:** the proof entry now sorts with a stable maximum key
(`Number.MAX_SAFE_INTEGER`) so it always renders after every governance event;
display indices are renumbered per frame anyway, so the gutter stays correct.
Also added a defensive unique-id guard in the shell's row list so a keyed
`<For>` can never receive a duplicate id.

**Verification:** governance-spine suite 17/0 combined with grouping +
sync-governance tests; full TUI suite 778 pass / 1 skip / 0 fail.

## F-22 — Daemon idle-stop left the TUI with "Failed to send prompt / Unable to connect"

**Date:** 2026-08-02
**Status:** FIXED

**Symptoms:** after ~5 minutes without traffic the daemon idle-stops (by
design, `daemon/activity.ts`). The TUI stayed open, and the next prompt
submission failed with "Failed to send prompt — Unable to connect. Is the
computer able to access the url?" Retrying never recovered because nothing
respawning the daemon.

**Root cause:** the daemon lifecycle is reactive (idle self-destruct +
durable lock), but the TUI client had no recovery path: a connection-refused
fetch surfaced to the user instead of bringing the daemon back.

**Fix:**
- The engine host (`cli/cmd/tui.ts`) now publishes the exact daemon spawn
  command via `process.env.ARCANA_DAEMON_CMD` (resolved to an absolute script
  path in dev mode so the spawn survives `chdir` to the project directory).
- The TUI SDK (`context/sdk.tsx`) wraps every daemon fetch. On a connection
  error (ECONNREFUSED / "unable to connect" / fetch failed), it spawns the
  daemon once (3s debounce), waits up to 7s for `/health`, then retries the
  original request. The SSE reconnect loop shares the same wrapped fetch, so
  a dead daemon is also recovered on reconnect.

**Verification:**
- New regression test `packages/tui/test/daemon-respawn.test.ts` (+ fixture
  `test/fixture/daemon-helper.ts`): kills the server, then proves the wrapped
  fetch respawns it and retries successfully.
- Live end-to-end: rebuilt `arcana.exe`, killed the daemon, and drove the
  real TUI fetch wrapper against the real binary — `/health` recovered with
  a fresh daemon process in under 1s (daemon log confirms the new boot).
- Full TUI suite 779 pass / 1 skip / 0 fail; engine + TUI typecheck clean.

## F-23 — Approval inspector invisible + spine keys unreachable from the keyboard

**Date:** 2026-08-02
**Status:** FIXED

**Symptoms:** the runbook Phase 3–4 keyboard path felt broken: pressing `v`
appeared to do nothing, and `j`/`k`/`a`/`d`/`v` typed letters into the
composer (or did nothing) unless the user clicked a spine row with the mouse.

**Root cause (two defects):**
1. `inspectorApprovalId` was set by `v` but never rendered anywhere — the
   "inspector" had no visible surface. The only details were the compact
   receipt body with truncated hashes (`Locale.truncate` at 12–16 chars).
2. The composer textarea is auto-focused and owns letter keys while focused.
   Spine bindings (`j`/`k`/`a`/`d`/`v`, and even `d`-diff) are gated on
   `renderer.currentFocusedEditor === null`, and there was no keyboard path
   to blur the composer — so keyboard-only operators could never reach the
   approval keys.

**Fix:**
- New `ApprovalInspector` dialog (`routes/session/approval-inspector.tsx`):
  `v` opens it with EVERY field untruncated (full 64-char request hash,
  approval/session/workspace IDs, contract revision, expiry, operator,
  execution id). Esc/ctrl+c/click-outside closes it and the approval entry
  stays SELECTED (Phase 3.2); Esc again clears selection (3.3).
- Keyboard spine mode: while the session is IDLE, Esc now leaves the
  composer (activating `j`/`k`/`v`/`a`/`d`); with nothing focused, Esc
  returns to the composer. While BUSY, Esc keeps its existing two-press
  `session.interrupt` meaning — the new bindings are idle-only.

**Follow-up (same day):** a parked durable approval keeps the turn BUSY while
it waits for the operator, so the idle-only Esc guard still made the approval
keys unreachable. Esc now also leaves the composer (and can return to it)
whenever a PENDING durable approval exists for the active session, even
mid-turn. While a permission/question ACTION GATE is open, Esc remains
bound to Reject — the gate owns the keyboard by design.

**Verification:** new `approval-inspector.test.ts` (2 tests: full untruncated
rows, optional-row omission); TUI typecheck clean; full TUI suite
781 pass / 1 skip / 0 fail (782 tests).
