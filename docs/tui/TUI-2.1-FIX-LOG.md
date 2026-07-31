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

**Note:** the reconnect *fetch* itself still throws (pre-existing) if the daemon refuses at the exact retry moment, killing the loop; the resync heals the display but live streaming would need a restart. Deferred to WS2 lifecycle robustness.

**SDK contract note (from `packages/sdk/openapi.json`, the SDK's only documentation — no markdown exists):** the API documents an intended catch-up channel — `POST /sync/history` returns sync events with `seq >` the client's last-known per-aggregate sequence, and `POST /sync/replay` replays a full history. The TUI never uses seq bookkeeping; the REST `resync()` achieves the same heal with less state. Revisit `/sync/history` as a WS2 candidate for true event-level catch-up. SSE stream is `GET /global/event` (`sdk.global.event`); `sseMaxRetryAttempts` is a client-side option, not an API parameter.

**Test totals after Round 4:** TUI 447/448 pass (1 skip), 0 fail.

## Non-Blocking Items (documented, not fixed)

- Internal "opencode" API names (keymap hooks, SDK client, config values) — breaking refactor, functional identifiers
- `.opencode` config directory — intentional backward compatibility
- `as any` casts on theme tokens (~50+) — type debt, not runtime risk
- Missing error boundaries in Session route and Prompt component — lower priority than spine shell
- Empty `cwd.ts` file — dead code
- WS3 tool lifecycle rendering patterns — deferred to manual smoke test
