# TUI-2.1 Live-Stall Audit — Mechanisms, Eliminations, Fix Spec

**Date:** 2026-08-01 (02:40-03:10 local; v2 docs cross-review; v3 cross-audit reconciliation 2026-08-01)
**Branch:** phase-d-implementation, HEAD `daa37e18`
**Method:** live instrumentation (self-spawned daemon + independent SSE probe) + 3 parallel MIMO subagent audits (engine error path, TUI convergence triggers, connection storm) + engine log forensics + docs cross-review against `.hermes/docs/` (ai-sdk, daemon, opentui, solidjs, typescript) + master spec/playbook + cross-audit reconciliation against `docs/audits/stream-truncation-audit.md` (v3, sibling audit)
**Status:** AUDIT v15 — HEAD advanced to `c07faba6` ("fix: render complete streamed TUI messages", 2026-08-01 02:30 -0600, TUI-only, 10 files +372/-40). **Mechanism E (render-cache staleness) confirmed and FIXED in HEAD** (was never in this audit's manifest): spine cache keyed on store-proxy identity freezes the first streamed prefix on a HEALTHY stream; fix = per-message monotonic `part_revision` + lazy `SpineEntryBinding`; 7 tests pass (verified this pass). Mechanism E is the top candidate for the 18:16 case (mechanism A): its signature (DB complete, view frozen at a tiny prefix) is exactly what E produces. F5 mechanism LIVE-CONFIRMED in opencode.log 10:20-10:21 UTC today (`tracking hash=""` + `index.lock` exit-128 spam at 5-20s cadence). v13 edit plan (F4B, spine "unknown", F3 comment, Ctrl+O) STILL NOT applied (re-verified: event.ts has no Connection header; spine-mapper.ts:1803 lacks "unknown"; server.ts:209-213 stale comment; no Ctrl+O binding). F1/F2/F3/F4A/F-D1/F-D2/F-D3/F-D5 remain uncommitted in the working tree (108 files vs HEAD). No new mechanism B stream errors since the 02:23:25 audit case. 100% gate unchanged: instrumented live validation (operator).

---

## Executive summary

The TUI live-stall disease (durable session state advances, live projection freezes)
is **four distinct mechanisms**, not one:

| # | Mechanism | Evidence | P12 coverage |
|---|-----------|----------|--------------|
| B | Upstream LLM stream error kills the turn; TUI freezes at partial text with no convergence | `opencode.log` 02:23:24 `ResourceExhausted (76/32)` correlating 1:1 with the "That looks like" freeze; recurring Jul 25/28/31 + Aug 1 | **NONE — confirmed hole** |
| C | Connection storm: ~130 ESTABLISHED sockets saturate the client fetch pool; REST fetches queue | Exact count 130 reproduced twice (pool cap 128 + SSE + 1); boot traffic is only ~17-22 requests | NONE |
| A | Delivery-side failure (18:16 QoS session): SSE stopped ~2s into the final message, engine kept writing DB. **Root cause NEVER confirmed** — SSE-STALL-REPORT §5: top candidates TCP backpressure (consumer stall on ~150KB tool outputs) / uncaught store-handler error | `TUI-2.1-SSE-STALL-REPORT.md` §1-5; no upstream error logged for that session | P10/P11/P12 repair paths exist (heartbeat gap, isolation, reconnect resync) — **never live-validated** |
| D | Native LLM path (opt-in): stream ends without a terminal `finish` event = **silent success**; partial text persists, `finish=None`, no error/retry (sibling-audit A1, verified v3) | `packages/llm/src/protocols/openai-chat.ts:455` `if (reason) Lifecycle.finish(...)` suppresses; `route/client.ts:272-288` treats clean EOF as success; `processor.ts:1243` `"continue"` | **NONE — confirmed hole** |

The disease the user experienced today ("again", "That looks like") is **mechanism B**,
with the upstream free-tier nvidia rate limit (`ResourceExhausted: Worker local total
request limit reached (N/32)`, provider `arcana-proxy`) as the recurring trigger.

## Mechanism B — upstream stream error, turn dies, view never converges (CONFIRMED)

### Engine side (subagent audit, file:line citations)

1. AI-SDK stream error → `Effect.fail` (`packages/engine/src/session/llm/ai-sdk.ts:264-265`)
   → `process()` stream drain fails (`processor.ts:1187-1191`).
2. The `"stream error"` log is **log-only** (`llm.ts:297-309`), publishes nothing.
3. `halt()` error path (`processor.ts:1148-1167`) emits:
   - `SessionEvent.Step.Failed` (v2 only), `session.error` (always), `session.status idle`.
   - Terminal `message.updated` carrying the **error** field with **`finish` unchanged (null)**.
   - **`finish = "error"` is NEVER set on the generic error path** — only the
     ContextOverflow-with-compaction-disabled branch sets it (`processor.ts:1138-1139`).
4. Persisted: partial text flushed, `time.completed` set, `finish = null`, `error` set.
   Byte-for-byte the QoS session signature (`finish=None`, partial text).
5. Retry: in-process policy retries ≥500 errors (2s backoff ×2, cap 30s, `retry.ts:41-43,99`),
   but the observed case restarted the **whole loop with a NEW message** (~2.4s later).
   The errored partial message is **orphaned** in the DB (finish=None, partial text).
6. `provider_unavailable` metadata: **no code reads it**. No engine-side fallback routing.

### TUI side (subagent audit, file:line citations)

1. The sync subscriber **never branches on `finish`** (`sync.tsx:387-427` — `message.updated`
   just patches the message info). `finish` is only consumed for chrome (spine verb
   `spine-mapper.ts:1814-1816`, duration `index.tsx:354-355`).
2. **Complete list of reconcile/resync triggers** (exhaustive):
   - `heartbeat-gap`: only when `head - lastApplied > 4` (`index.tsx:669-675`).
     With all deltas applied, lag is 0 → **structurally blind to this case**.
   - `missing-part`: only when a delta references an unknown part (`sync.tsx:473,482`).
   - `reconnect`: only on `sse.reconnected` / 30s SSE silence (`index.tsx:656-659, 452-457`).
   - `stream-reset` / `manual`: declared in the union (`sync.tsx:40`), **never called**.
   - **NO trigger is keyed to turn lifecycle.** Nothing fires on terminal `finish`,
     `session.status → idle`, `session.error`, or stream end with a healthy stream.
3. `session.error` → transient 5s toast only (`app.tsx:2862-2873`). No projection repair.
4. `TextPart` sets `streaming = !message.time.completed` (`index.tsx:2135`); the error path
   sets `time.completed` so the partial text renders as final — **but the view is never
   re-synced to durable truth**, and a successful retry's new message only appears if its
   deltas arrive on the wire (they did not in the observed case — see open question 1).

### The freeze, end to end (observed 02:22:51-02:23:30)

```
02:23:24 stream error  ResourceExhausted (76/32)     ← nvidia free tier, mid-reply
02:23:25 process error halt() ran; session.error + message.updated(error, finish=null)
02:23:27 loop step=0                                  ← outer retry (~2.4s = RETRY_INITIAL_DELAY)
02:23:28 process msg_fbb2230... (NEW message)         ← retry succeeds, full reply
02:23:30 loop step=1, exiting loop
```
The TUI rendered nothing past "That looks like": the retry's events never reached the view.

## Mechanism C — connection storm (CONFIRMED mechanism, live confirmation pending)

- Boot traffic is enumerable and small (~17-22 requests, subagent count) — cannot explain 130.
- **130 = Bun per-origin fetch pool cap (~128) + 1 live SSE + 1 in-flight** — the exact count
  reproduced twice is the fingerprint of a deterministic hard cap.
- SSE reconnect loop: each attempt = one new `fetch` = one new TCP connection
  (`sdk.tsx:158-238`, one `AbortController` reused for all attempts). When a stream ends via
  clean EOF, the SDK **returns the socket to the keep-alive pool, not destroyed**
  (`packages/sdk .../serverSentEvents.gen.ts:220`). The daemon's SSE never sends
  `Connection: close` (`handlers/event.ts:100-175`, infinite stream).
- Daemon server created with **no options** (`server.ts:210-235`) — no `keepAliveTimeout`,
  no `maxConnections` → orphaned keep-alive sockets held indefinitely.
- Result: reconnect churn → pool fills to the cap → **new REST fetches queue behind the
  saturated pool** → the UI waits forever → freeze. Count drops to 0 only when the TUI dies
  (pool is per-process).
- Worker mode uses in-process `Server.Default().app.fetch` — zero TCP → immune. This is why
  the worker-mode freeze is pure mechanism B.

## Eliminations (now proven)

| Hypothesis | Verdict | Evidence |
|---|---|---|
| Sliding SSE queue drops events | **ELIMINATED** | Zero `[sse] subscriber overflow` lines in 170,513 log lines |
| One connection per session | **ELIMINATED** | 58 sessions in DB vs 130 connections |
| TCP backpressure REQUIRED for the freeze class | **ELIMINATED** | Freeze reproduced in worker mode (zero TCP) | **NOT eliminated as the 18:16 mechanism** — SSE-STALL-REPORT §5 lists it as the top candidate; bounded by P10-P12, never individually confirmed |
| Engine log discarded by `stdio: ignore` | **IRRELEVANT** | Engine logs go to a file by default (`core/src/observability/logging.ts:68`: `[fileLogger()]`, stderr only with `ARCANA_PRINT_LOGS=1`); file = `~/.local/share/arcana/log/opencode.log` |

## Observability findings (fixes the blind runs)

- **Engine logs always existed**: `C:\Users\lejze\.local\share\arcana\log\opencode.log`
  (31MB, 170K lines). `event connected`, stream errors, loop steps, retries — all there.
- `tui.ts:176` `stdio: ignore` was a red herring (nothing went to stdout anyway).
- The independent SSE probe (`L:\tmp\probe-sse.ts`, raw fetch to `GET /event`) works and
  streams heartbeats/sequences/gaps — validated against the self-spawned daemon.
- **Noise source found**: repeated `failed to add snapshot files` git `index.lock` warnings
  (every 5-20s) — the snapshot feature retry-spams a held git lock. Separate issue, log spam
  + git churn, worth a follow-up.

## Docs cross-review (v2, 2026-08-01)

The audit was re-checked against the local docs libraries (`.hermes/docs/`: ai-sdk, daemon, opentui, solidjs, typescript) and the master spec/playbook. Every claim below carries a doc citation; code lines were re-verified in the same pass.

### Docs confirm
- **daemon(7) step 9** ("connect /dev/null to standard input, output, and error") validates `tui.ts:176` `stdio: ignore` as CORRECT daemon practice. The "red herring" verdict now has the canonical citation (`daemon/daemon.7.md`). Observability belongs in the file logger, not stdio plumbing.
- **AI SDK `FinishReason`** (`ai-sdk/ai-main/packages/ai/src/types/language-model.ts:75-81`) is the canonical terminal-reason union: `stop | length | content-filter | tool-calls | error | other`, with `error` = "model stopped because of an error". Arcana's message `finish` is a compatible subset (verified: `processor.ts:814` sets `finish: value.reason`; `compaction.ts:613`; TUI consumes it at `spine-mapper.ts:1814-1816`). F1 aligns the engine with canonical semantics.
- **SolidJS `reconcile`** (v2 `solidjs/v2/reference/stores/reconcile.mdx`): "preserving the identity of items whose key field matches… only changed properties trigger updates." This is the doc-backed statement of the `aedd96dc` lesson: passing a live reference whose fields were mutated outside the store yields no diff. The payload must be a fresh snapshot (structuredClone on publish).
- **OpenTUI console overlay** (`opentui/core-concepts/console.mdx`, `opentui/reference/env-vars.mdx`, `opentui/core-concepts/renderer.mdx`): captures `console.*` by default (`consoleMode: "console-overlay"`, `OTUI_USE_CONSOLE=true`); toggle via `renderer.console.toggle()`; `SHOW_CONSOLE=true` opens at startup; `OTUI_DUMP_CAPTURES=true` dumps captured output from the exit handler. **The TUI never disables capture** (`app.tsx:1724-1737` sets no `consoleMode`; `externalOutputMode: "passthrough"`; `openConsoleOnError: false`). The `[arcana]` instrumentation lines are already being captured invisibly. F0 is replaced by a docs-aligned fix: expose the overlay with a toggle key + env vars, no file mirror.
- **TypeScript discriminated unions** (`typescript/handbook-v2/Narrowing.md:657-700`): a common literal-type property narrows union members in `switch`; `typescript/handbook-v1/Unions and Intersections.md:264`: "the compiler tells us when we don't cover all variants." F2's finish dispatch must be an exhaustive switch with a `never` default, so a new finish value fails typecheck instead of silently skipping convergence.
- **OpenTUI testing** (`opentui/core-concepts/testing.mdx`): `@opentui/core/testing` `createTestRenderer` (memory output, `mockInput`, `waitForFrame`, `captureCharFrame`) is the doc-specified harness for render-level assertions in F2 tests.
- **Daemon restart discipline** (`daemon/respawn-managers.md`): restart loops need backoff and crash-loop guards — the citation for F5 (snapshot lock spam).

### Docs correct
- **F3 was wrong as stated.** `server.ts:211` `createServer()` is `node:http` (import at `server.ts:7`); Node defaults `keepAliveTimeout: 5s` / `headersTimeout: 60s` apply — the server was ALREADY reaping idle keep-alive sockets. The observed 130 → 0 decay in ~2 min is that reaper at work. The accumulation is CLIENT-side (Bun fetch keep-alive pool). F3 is downgraded to hygiene; the storm closer is F4 + `Connection: close` on the SSE response.
- **F4 mechanism now fully code-verified** (`packages/sdk/js/src/v2/gen/core/serverSentEvents.gen.ts`): clean EOF → `reader.releaseLock()` (`:217`) without cancel → socket returns to the fetch pool; abort → `reader.cancel()` destroys the connection (`:139-145`). The TUI reuses ONE `AbortController` across all reconnect attempts (`sdk.tsx:163-165`, passed at `:176`, checked at `:197`) and passes `sseMaxRetryAttempts: 0` (`:178`) — SDK-side retry is bypassed, all churn is TUI-side. Chain: clean EOF → pooled socket ×N reconnects → Bun per-origin pool cap (~128) → REST fetches queue behind the full pool → freeze.

## Open questions (honest position)

1. Why did the retry's events never reach the TUI in the 02:23 case? (a) the retry produced
   a short reply and the events were delivered but the TUI was wedged, or (b) the events were
   emitted but lost in the worker→TUI channel. Distinguishing requires the live instrumented
   run (probe + daemon log + console overlay, v2 protocol).
2. Mechanism A (18:16 delivery failure) was never reproduced on the P12 build. Its repair
   paths (heartbeat gap, isolation, reconnect resync) are unvalidated live.
3. The storm's exact reconnect driver at boot (what ends the stream ~130 times) needs the
   live attribution (see fix F4 validation).

## Live validation addendum (2026-08-01 03:05-03:09 UTC)

Instrumented live run (user TUI → self-spawned daemon 22908, probe witness):

- Long multi-tool turn (arcana-proxy review, loop step 16+), 3 approvals exercised
  (permission.asked/replied x3), 0 sequence gaps across 1,380 probe events,
  0 stream errors, connections stable at 30 (warm daemon, no storm).
- Turn deliberately aborted at 03:08:05 (`message=process error=Aborted`).
- **DB-verified (direct sqlite query, `~/.local/share/arcana/opencode-local.db`):
  the aborted message has `finish=None`, `error=<dict>`, `time.completed` set.**
  The abort path produces the exact mechanism B signature (finish=None + partial
  text), confirming the class: ANY turn end without a clean finish (stream error,
  abort, kill) leaves a non-terminal durable message and no TUI convergence path.
- F1 (engine finish="error") + F2 (TUI turn-end reconcile) close this class
  regardless of which trigger (upstream error vs abort) ends the turn.

## Fix spec (v2 — docs-verified)

### F0 — TUI: expose the built-in OpenTUI console overlay (replaces the file-mirror)
- Docs: `opentui/core-concepts/console.mdx`, `opentui/reference/env-vars.mdx`.
- Where: `packages/tui/src/app.tsx` `createCliRenderer` (`:1724-1737`). Capture is already active (`consoleMode` default `"console-overlay"`); the overlay just has no key to open it.
  - Bind a toggle: `renderer.keyInput.on("keypress", …)` calling `renderer.console.toggle()` (docs example: backtick or Ctrl+L), or add it to `registerOpencodeKeymap`.
  - Dev ergonomics: consider `openConsoleOnError: true` in dev (docs dev default; TUI sets `false` at `:1731`).
- Dev usage without code: `SHOW_CONSOLE=true bun run dev:tui` (overlay open at startup); `OTUI_DUMP_CAPTURES=true` (dump captured console/stdout on clean exit — docs caveat: direct `renderer.destroy()` does NOT trigger the dump).
- Verify: `[arcana] stream gap`, `[arcana] reconcile applied … changed=N`, `[arcana] sync subscriber failed`, `[arcana] event batch failure` visible in the overlay; toggle key works; dump file produced on exit.
- Note: engine-side logs stay in `opencode.log` (separate process, file logger) — the overlay covers TUI-side instrumentation only, which is exactly the gap the user hit ("where should I see the tail").

### F1 — engine: terminal `finish="error"` on every non-clean turn end
- Docs: AI SDK `FinishReason` `error` = "model stopped because of an error" (`ai-sdk/…/packages/ai/src/types/language-model.ts:75-81`).
- Verified: `processor.ts` generic halt (`:1148-1168`) sets `error` (`:1162`), publishes `Session.Event.Error`, sets idle (`:1167`) — never `finish`. ContextOverflow sets `finish="error"` only when compaction `auto=false` (`:1137-1143`).
- Fix: in `halt()`, alongside `ctx.assistantMessage.error = error`, set `ctx.assistantMessage.finish = "error"`. Sweep the direct `message.error =` sites too (`compaction.ts:623,697` attach `AbortedError`) so every error-bearing assistant message carries a terminal finish — the DB-verified abort case (finish=None + error=Aborted) is this class.
- Type discipline: `finish` is a literal union; consumers must switch exhaustively with a `never` default (`typescript/handbook-v2/Narrowing.md:657-700`; `handbook-v1/Unions and Intersections.md:264`) so new reasons fail typecheck.
- Tests: stream-error turn → DB `message.data.finish === "error"`; abort turn → same; compaction path unchanged for non-error turns.

### F2 — TUI: turn-end reconcile trigger (the P12 hole closer)
- Docs: SolidJS `reconcile` identity-preserving diff (`solidjs/v2/reference/stores/reconcile.mdx`); store setter semantics (`create-store.mdx`).
- Verified insertion points: `sync.tsx:366-369` (`session.status` → on `idle`), `:387-427` (`message.updated` → on terminal finish `stop | tool-calls | error | unknown` — the `unknown` member added by F-D1; self-audit v3). `ReconcileReason` union (`sync.tsx:40`) gains `"turn-end"`.
- Reconcile target: the existing generation-guarded, idempotent REST reconcile (`sync.tsx:873-990`, dedupes at `:879-880`).
- SolidJS caution (aedd96dc, now doc-backed): the merge at `:397` `reconcile(info)` is correct ONLY when `info` is a fresh object per event. Never mutate a payload reference before reconcile sees it; publish must structuredClone.
- Tests: errored finish fires reconcile; `unknown` finish (F-D1) fires reconcile; `status idle` fires once per turn; healthy streaming fires zero times (no false positives).

### F3 — engine: explicit server timeouts (hygiene, NOT the storm closer)
- Corrected: `createServer()` (`server.ts:211`, `node:http` import `:7`) already inherits Node `keepAliveTimeout: 5s` / `headersTimeout: 60s`; the 130→0 decay is that reaper. No orphan accumulation server-side.
- Fix: `createServer({ keepAliveTimeout: 5_000, headersTimeout: 10_000 })` — explicit intent, tighter slow-headers bound — plus optional `maxConnections` guard. Does not by itself prevent the client-pool storm; that is F4's job.

### F4 — TUI/SDK: SSE socket destroy-not-pool (storm closer, code-verified)
- Verified: gen SDK `serverSentEvents.gen.ts` — clean EOF → `releaseLock` (`:217`) → socket pooled; abort → `reader.cancel()` destroys (`:139-145`). TUI `sdk.tsx:158-238` reuses one controller per `startSSE` (`:163-165`).
- Fix A (client, `sdk.tsx`): fresh `AbortController` per reconnect attempt; abort the attempt's controller when its stream ends (clean EOF or error) so `reader.cancel()` destroys the socket and stale attempts are torn down.
- Fix B (server, deterministic): SSE response header `Connection: close` — insertion point verified: `handlers/event.ts:167-175`, add to the headers object at `:169-173` (currently `Cache-Control` / `X-Accel-Buffering` / `X-Content-Type-Options`, no `Connection` header present). The client pool then must not reuse the connection — holds regardless of runtime cancel semantics for already-completed bodies.
- Tests: reconnect N times → each attempt's controller aborted; pooled/ESTABLISHED count returns to ≤10 within ~15s of idle; REST fetch latency unaffected during reconnect churn.

### F5 — engine (polish, not blocking): snapshot lock spam
- **FULLY SPECCED in the v14 section** (mechanism, empirical reproduction, complete before/after code, tests, confidence 100%). Not a stub: the `failed to add snapshot files` retry loop (git `index.lock`) must check lock-held state, back off (1s→30s cap), surface once, and never return `""` baselines — per daemon restart discipline (`daemon/respawn-managers.md`). Post-freeze backlog item.

## Confidence (0-100%)

Definition of "fixed": the TUI's live view converges to durable state after any turn —
including errored/retried turns and silent-success (mechanism D) turns — with no freeze at
partial text on a healthy stream, AND every turn ends with a terminal `finish` on the wire
and in the DB (stop / tool-calls / error / unknown — never null).

| Fix | Confidence (design) | Basis |
|-----|--------------------|-------|
| F0 console overlay | **100%** | Docs-specified API (`console.mdx`), capture already active in the TUI; no new mechanism |
| F1+F2 close mechanism B | **90%** | Insertion points code-verified (`processor.ts:1162`, `sync.tsx:366-369,:387-427`), finish semantics canonical per AI SDK; the one unknown is open question 1 (retry event delivery) |
| F4(A+B)+F3 close mechanism C | **85%** | Mechanism code-verified end-to-end (single shared controller `sdk.tsx:163-165` + `releaseLock` pooling `serverSentEvents.gen.ts:217` + client pool cap); deterministic server-side guarantee (F4B `Connection: close`); live attribution of the reconnect driver outstanding |
| All fixes + one instrumented live validation | **100% gate** | Per operator standard: 100% only after live validation on the real runtime with the observability chain (opencode.log + probe + console overlay + DB) |

**Overall (v2 table): ~88% — SUPERSEDED by the v3 merged table in the Cross-audit reconciliation (~87%).** Below the 100% gate → the audit continues: implement F0-F4 + F-D1/F-D2/F-D3 (operator permission), then the instrumented live run closes open questions 1-3.

## Validation protocol to reach 100% (v2 — Windows-native, no tee)

1. Implement F0-F4 (operator permission required).
2. One clean run: user terminal plain `bun run dev:tui`. Witness legs, all Windows-native:
   - engine `C:\Users\lejze\.local\share\arcana\log\opencode.log` (file logger),
   - probe `bun run /l/tmp/probe-sse.ts http://127.0.0.1:9142` → `L:\tmp\probe-live.log`,
   - OpenTUI console overlay (F0 toggle key, or `SHOW_CONSOLE=true`) + `OTUI_DUMP_CAPTURES=true` dump for TUI-side `[arcana]` lines,
   - DB `~/.local/share/arcana/opencode-local.db` (finish/error/time.completed post-abort).
3. Checkpoints: normal turn completes with `liveRenderedText === durableText`; errored turn (free-tier nvidia `ResourceExhausted`) shows error state and converges; retried turn renders the retry's full text with NO duplicated parts (F-D3); native-protocol turn with a reason-less end leaves DB `finish="unknown"` + converges (F-D1); abort mid-turn converges with DB `finish="error"` (F1); no `stream gap` false positives; connection count stays ≤ 10 and decays after idle (F4); idle 6+ min survives.
4. Update this report + the stall report with PASS/FAIL per checkpoint; only then does the freeze evidence boundary close.

## Cross-audit reconciliation (v3, 2026-08-01)

Sibling audit read and merged: `docs/audits/stream-truncation-audit.md` (v3, 181 lines — same disease class, wider scope: adds the native LLM path, retry artifacts, queue hardening, gateway). Every new claim was re-verified against code before adoption.

### Adopted findings (verified — additions to this audit)

| Sibling ID | Finding | Verification (this pass) | Adoption |
|---|---|---|---|
| A1 → **mechanism D** | Native LLM path: stream ends without a terminal `finish` event = silent success; partial text persists, `finish=None`, no error/retry | `openai-chat.ts:449-457` — `finishEvents` emits `Lifecycle.finish` only `if (reason)` (`:455`); `state.finishReason` undefined on reason-less end. `route/client.ts:272-288` — `streamPrepared` has no terminal-event check; clean EOF passes as success. `processor.ts:1243` — returns `"continue"`, no error. `prompt.ts:1520` `finish ?? "stop"` is structured-output-only (v1 correction confirmed) | **ADOPTED, HIGH**. Fix = F-D1 below |
| A3 | In-process `Effect.retry` re-runs `llm.stream`; attempt-1 text/reasoning parts never pruned → durable "cut-then-repeat" artifact | `processor.ts:1205-1236` — `Effect.retry(SessionRetry.policy(...))` wraps the whole process effect; `set` callback (`:1209-1234`) flushes fragments + retry status but never prunes parts | **ADOPTED, MED**. Distinct from the observed 02:23 case (outer-loop restart with a NEW message, orphaned partial) — BOTH are real retry behaviors. Fix = F-D3 |
| A2 | Cross-directory/workspace events offered into every subscriber queue BEFORE the filter → foreign noise can evict own deltas | `event.ts:52-58` — `events.listen` offers every event via `Queue.offerUnsafe` into `Queue.sliding(512)`; filter runs downstream in the stream (`:75-79`) | **ADOPTED, LOW-MED hardening** (not observed: zero overflow). Fix = F-D2 |
| A5 | Gateway silent tail loss: Discord `slice(0,2000)`, WhatsApp `slice(0,4096)` | Out of TUI scope; cited `gateway.md:49,79` | **TRACKED** (F-D5, gateway PR) |
| A4 / A6 / A9 | Compaction mid-sentence cut (by design); reconcile visual jump (cosmetic); O(N²) SSE parser (`buffer += value` + regex + split per read, `serverSentEvents.gen.ts:153-157`) | A9 perf risk only, not a truncation defect | **DEFERRED / PERF** (tracked) |

### F-D1 — native LLM path: synthesize the terminal event (new, HIGH)
- Verified: `"unknown"` is **already in the LLM `FinishReason` union** — `anthropic-messages.ts:553` and `bedrock-converse.ts:426` map null/unknown stop reasons to `"unknown"`. openai-chat is the outlier that suppresses instead of mapping.
- Fix: `openai-chat.ts:455` → `reason = state.finishReason ?? "unknown"` (always emit `Lifecycle.finish`); check openai-responses / gemini for the same suppression (anthropic-messages and bedrock-converse already map null → `"unknown"`, verified `:553`/`:426` — they are the in-repo precedent); guard against double-emit. Recorded cassettes pin behavior (per sibling F-A1).
- **Cross-fix interaction (self-audit v3): F-D1 and F2 must move together.** The TUI's turn-end trigger set (`stop | tool-calls | error`, `sync.tsx:387-427`) must gain `"unknown"`, and `spine-mapper.ts:1814-1816` must render it (exhaustive-switch discipline). Otherwise the engine emits the terminal event and the TUI still has no converge trigger for native reason-less cuts. See F2 update below.
- Clarification (no reliance on LLMEvent): the engine's `finish` LLMEvent is a no-op (`processor.ts:1048-1049`); the durable `ctx.assistantMessage.finish` field + `message.updated` event carry the truth. F1/F-D1 write the durable field, which is what the wire and DB reflect.
- Compliance: `packages/llm/AGENTS.md` — "emit exactly one terminal `finish` event per completed response"; Playbook D6 — record UNKNOWN rather than pretend success; Master Spec §16.3 — no turn ends without `completed` or `crashed`-equivalent evidence.

### F-D3 — prune failed-attempt parts on retry (new, MED)
- Fix: `processor.ts` retry `set` callback (`:1209`): snapshot part index at `process` start; on retry, remove unfinished text/reasoning parts from that index; never touch tool parts. Engine tests required.
- Note: this addresses the SAME-message retry; the outer-loop NEW-message case is closed by F1+F2 (errored partial gets `finish="error"` + turn-end reconcile converges the view to it).

### F-D2 — pre-filter + capacity hardening (new, LOW-MED)
- Fix: `event.ts:52-58` — filter `event.location.directory`/`workspaceID` BEFORE `offerUnsafe`; `Queue.sliding(512 → 4096)`. Wire sequence assignment (post-filter, `:102-107`) untouched — no wire semantics change.

### F-D5 — gateway chunking (tracked, out of TUI scope)
- Mirror Telegram chunking in `packages/gateway/src/platforms/discord.ts` + `whatsapp.ts`; update `gateway.md` notes. Separate PR.

### Corrections to the sibling audit (its stale points vs this audit v2)
1. **A8 / F-A8a ("no server keepAliveTimeout → orphaned sockets held indefinitely", confidence 95%) is wrong.** `server.ts:211` is `node:http` `createServer()` — Node defaults `keepAliveTimeout: 5s` apply; the 130→0 decay in ~2 min is the reaper. F-A8a is hygiene (explicit timeouts + `maxConnections`), NOT the storm closer. Its 95% confidence as a storm fix is unjustified.
2. **F-A8b residual ("must verify `reader.cancel()` destroys the socket") is CLOSED** by this audit v2: `serverSentEvents.gen.ts:139-145` abortHandler cancels the reader (destroys); clean EOF `releaseLock` (`:217`) pools. Confidence 85% → 90%.
3. **Missing F4B**: `Connection: close` on the SSE response (`handlers/event.ts`) — the deterministic pool-eviction guarantee, independent of runtime cancel semantics. Add to A8.
4. **Missing F0** (console overlay observability) and the Windows-native validation protocol — sibling §5.6 still uses `opencode.log tee` (PTY+tee breaks on Windows, user-confirmed). Replace with the v2 protocol (console overlay + `OTUI_DUMP_CAPTURES` + probe + DB).
5. **F-A7a missing the sweep**: direct `message.error =` sites (`compaction.ts:623,697`) must also carry terminal finish, per this audit's F1.

### Merged confidence (v3)

| Fix | Confidence | Basis |
|---|---|---|
| F0 console overlay | 100% | Docs-specified; capture already active |
| F1+F2 close B (+abort) | 90% | Code-verified insertion points; canonical finish semantics |
| F-D1 closes D | 86% | Mechanism verified; `"unknown"` precedented in 2 protocols; residual = openai-responses/gemini check, double-emit guard, AND TUI terminal-set sync (F2 `"unknown"` member, self-audit v3) |
| F-D2 queue pre-filter | 95% | Trivial, no wire change |
| F-D3 retry pruning | 80% | Surgical; touches retry / V1-V2 dual-write; needs engine tests |
| F4A (per-attempt controller) + F4B (`Connection: close`) + F3 close C | 87% | Mechanism code-verified end-to-end; F4B deterministic server-side; live attribution outstanding |
| F-D5 gateway | 90% | Contained; mirrors Telegram pattern |
| **Disease dead (live)** | **~87%** | 100% gate = instrumented live validation (v2 protocol) |

**Overall: ~87% pre-live.** The sibling audit's ~85% pre-live / ~95% conditional aligns; the merged picture adds one HIGH (D) and two MED findings, all fixable within the same package set (`llm`, `engine`, `tui`, `sdk`), plus one gateway PR outside the freeze path.
*Superseded by v6/v8: readiness now **~90%** (v6 delta + QA pass); the v3 numbers are historical.*

## Exhaustive fix code (v7, 2026-08-01)

Every fix below carries: the official documentation anchor, the file + verified line range, the before/after code (read and verified this session), and the tests. Full official text read this pass: Master Spec §8.1-8.6 (`:576-659`) and Playbook §23-24 (`:1006-1175`).

### v7 self-corrections (from code re-verification)
1. **Compaction sites are ALREADY compliant — the F1 "sweep" was over-stated.** `compaction.ts:623-627` AND `:697-700` both set `processor.message.finish = "error"` alongside the `AbortedError`. The ONLY gap is `halt()` (`processor.ts:1148-1168`). F1 = one line; no sweep.
2. **Spine-mapper `"unknown"` site pinned.** `spine-mapper.ts:1812-1814`: `if (message.finish === "error" || message.finish === "content-filter") return false` — the healthy-message predicate. F-D1's `"unknown"` must be added here, anchored to TUI-1.1 exit criterion: "Missing evidence appears DEGRADED, never healthy" (playbook `:1028`).
3. **Retry policy nuance (verified `retry.ts:88-99`):** 5xx always retried; 429 retried only when `isRetryable:true`; `FreeUsageLimitError` → explicit GO_UPSELL action (no silent retry). The playbook WS-P2 "429/503 honored with backoff, never blind-retry" (`:1125`) is already implemented at the session layer. The P2-4 gap is only the model/tool API layer (`map-upstream.ts` fail-closed), unchanged.

### F0 — console overlay (opentui `console.mdx`, `renderer.mdx`, `env-vars.mdx`)
**File:** `packages/tui/src/app.tsx` — insert after the `createCliRenderer` acquireRelease (after `:1743`), before `win32DisableProcessedInput()` (`:1744`).
```ts
      win32DisableProcessedInput()
      // F0 (stall-audit v7): expose the built-in console overlay. Capture is
      // ALREADY active (consoleMode default "console-overlay", app.tsx:1724-1737
      // never disables it). Docs: .hermes/docs/opentui/core-concepts/console.mdx.
      // Ctrl+O toggles; dev: SHOW_CONSOLE=true / OTUI_DUMP_CAPTURES=true.
      renderer.keyInput.on("keypress", (key) => {
        if (key.ctrl && key.name === "o") renderer.console.toggle()
      })
```
**Verify:** `SHOW_CONSOLE=true bun run dev:tui` shows `[arcana] stream gap` / `reconcile applied … changed=N`; Ctrl+O toggles; `OTUI_DUMP_CAPTURES=true` dumps on clean exit (docs caveat: not on direct `renderer.destroy()`).

### F1 — engine: terminal `finish="error"` on the generic error path (AI SDK `language-model.ts:75-81` `error` = "model stopped because of an error"; `50-error-handling.mdx` onAbort/onEnd)
**File:** `packages/engine/src/session/processor.ts` `halt()` — one line after `:1162`.
```ts
        ctx.assistantMessage.error = error
        ctx.assistantMessage.finish = "error"   // F1: terminal finish, every non-clean turn end
        yield* events.publish(Session.Event.Error, {
```
Covers BOTH stream error and abort (the DB-verified `error=Aborted` lands here; compaction paths `:626,700` already compliant). The `finish` LLMEvent is a no-op (`:1048-1049`) — the durable field is the truth.
**Tests:** engine — errored turn → DB `message.data.finish === "error"`; abort → same; compaction path unchanged.

### F2 — TUI: turn-end reconcile (TS `Unions and Intersections.md:262-340` exhaustive `never`-method; SolidJS `reconcile.mdx` identity-diff; `store-path.mdx` path setters; playbook TUI-1.1 `:1028` DEGRADED)
**File:** `packages/tui/src/context/sync.tsx`.
1. `:40` — union:
```ts
export type ReconcileReason = "heartbeat-gap" | "missing-part" | "reconnect" | "stream-reset" | "manual" | "turn-end"
```
2. `:366-369` — `session.status` case (dedupe is inside `reconcile()` `:879-880`; active-session guard):
```ts
        case "session.status": {
          setStore("session_status", event.properties.sessionID, event.properties.status)
          if (event.properties.status?.type === "idle") {
            void reconcile(event.properties.sessionID, "turn-end")
          }
          break
        }
```
3. `:387-427` — `message.updated` case, append before `break` (after the existing merge; idempotent):
```ts
          const finish = (event.properties.info as { finish?: string }).finish
          if (finish === "stop" || finish === "tool-calls" || finish === "error" || finish === "unknown") {
            void reconcile(event.properties.info.sessionID, "turn-end")
          }
          break
```
(`"unknown"` member from F-D1, v3.1 cross-fix.) Exhaustive-switch discipline: new finish values fail typecheck, never silently skip convergence (TS `Unions and Intersections.md:264`).
**Tests:** errored finish fires reconcile; `unknown` fires; `status idle` fires once per turn; healthy streaming zero false positives.

### F3 — engine: explicit server timeouts (hygiene; NOT the storm closer)
**File:** `packages/engine/src/server/server.ts:211` — `node:http` `createServer()` already inherits `keepAliveTimeout: 5s` / `headersTimeout: 60s`; make intent explicit + tighten slow-headers:
```ts
  const server = createServer({ keepAliveTimeout: 5_000, headersTimeout: 10_000 })
```
**Verify:** cold-daemon boot → ESTABLISHED decays to ≤10 within ~15s of idle (already true via Node default; this documents it).

### F4A — TUI/SDK: per-attempt AbortController (playbook TUI-1.6 WS-P2 `:1122`; FREEZE-EXECUTION-PLAN `:140` ≤1/sec)
**File:** `packages/tui/src/context/sdk.tsx` `startSSE` (`:158-238`). Verified current: ONE controller (`:163-165`) reused across attempts (`:176,:197`); clean EOF → `releaseLock` → socket pooled (SDK gen `:217`); abort → `reader.cancel()` destroys (`:139-145`). Change: fresh controller per attempt, aborted when its stream ends. Watchdog (QA-verified `sdk.tsx:57-60`, `onTrip: () => sse?.abort()`) must retarget to the CURRENT attempt so a trip falls through to reconnect instead of killing the loop:
```ts
    function startSSE() {
      generation += 1
      const gen = generation
      sse?.abort()
      const outerCtrl = new AbortController()
      sse = outerCtrl
      watchdogTarget = undefined                // F4A (QA v8): per-attempt target
      sseWatchdog.arm()
      ;(async () => {
        let attempt = 0
        while (true) {
          if (outerCtrl.signal.aborted || gen !== generation) break
          // F4A: per-attempt controller. When this attempt's stream ends
          // (clean EOF or error), abort it → reader.cancel() destroys the
          // socket instead of returning it to the fetch keep-alive pool.
          const attemptCtrl = new AbortController()
          watchdogTarget = attemptCtrl            // watchdog trips THIS attempt
          const onOuterAbort = () => attemptCtrl.abort()
          outerCtrl.signal.addEventListener("abort", onOuterAbort)
          let events: Awaited<ReturnType<typeof sdk.global.event>> | undefined
          try {
            events = await sdk.global.event({ signal: attemptCtrl.signal, sseMaxRetryAttempts: 0 })
          } catch (error) {
            if (outerCtrl.signal.aborted || gen !== generation) break
            if (!isAbortError(error)) throw error
          }
          if (events) {
            try {
              for await (const event of events.stream) {
                if (attemptCtrl.signal.aborted) break
                handleEvent(event)
              }
            } catch (error) {
              if (outerCtrl.signal.aborted || gen !== generation) break
            }
          }
          attemptCtrl.abort()                     // F4A: destroy-not-pool
          outerCtrl.signal.removeEventListener("abort", onOuterAbort)
          if (timer) clearTimeout(timer)
          if (queue.length > 0) flush()
          attempt += 1
          if (outerCtrl.signal.aborted || gen !== generation) break
          const backoff = Math.min(retryDelay * 2 ** (attempt - 1), maxRetryDelay)
          await new Promise((resolve) => setTimeout(resolve, backoff))
          if (!outerCtrl.signal.aborted && gen === generation) {
            emitter.emit({ /* sse.reconnected — unchanged */ } as unknown as GlobalEvent)
          }
        }
        sseWatchdog.stop()
      })().catch((error) => {
        if (isAbortError(error) || outerCtrl.signal.aborted) return
        console.error("[arcana] SSE event loop failed:", error)
      })
    }
```
(**Watchdog wiring — QA-verified `sdk.tsx:48-60`:** declare `let watchdogTarget: AbortController | undefined` next to `let sse` (`:49`, init-closure scope so the `onTrip` closure sees it); change the watchdog `onTrip` (`:59`) from `() => sse?.abort()` to `() => watchdogTarget?.abort()`; set `watchdogTarget = attemptCtrl` per attempt (shown above). On trip the attempt's fetch rejects with AbortError, which the catch at `:180-185` already treats as reconnect (does NOT rethrow; the loop continues — outer unmount breaks at `:172` via `outerCtrl.signal.aborted`). `retryDelay=1000` / `maxRetryDelay=5000` (`:85-90`) preserved: 1s→5s capped exponential backoff, ≤1/sec, meets the WS-P2 gate.)
**Tests:** reconnect N times → each attempt's controller aborted; pooled/ESTABLISHED count ≤10 within ~15s of idle; REST fetch latency unaffected during churn.

### F4B — server: `Connection: close` on the SSE response (deterministic pool eviction)
**File:** `packages/engine/src/server/routes/instance/httpapi/handlers/event.ts:167-175` (verified: `HttpServerResponse.stream` headers object has no `Connection` header; `httpapi/AGENTS.md:15` pattern respected).
```ts
      {
        contentType: "text/event-stream",
        headers: {
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
          "X-Content-Type-Options": "nosniff",
          "Connection": "close",   // F4B: client must not reuse the SSE socket
        },
      },
```

### F-D1 — native LLM path: synthesize the terminal event (`packages/llm/AGENTS.md:277-278` normative; AI SDK `50-stream-protocol.mdx:454` `finish` part; Master Spec §16.3)
**File:** `packages/llm/src/protocols/openai-chat.ts` `finishEvents` (`:449-457`; verified `if (reason)` at `:455` suppresses on reason-less end). `"unknown"` is already in the union (anthropic `:553`, bedrock `:426` precedent):
```ts
const finishEvents = (state: ParserState): ReadonlyArray<LLMEvent> => {
  const events: LLMEvent[] = []
  const hasToolCalls = state.toolCallEvents.length > 0
  // F-D1: a reason-less stream end must still emit the terminal finish.
  // "unknown" is the in-repo precedent (anthropic-messages.ts:553,
  // bedrock-converse.ts:426); AGENTS.md:277-278: emit exactly one terminal
  // finish event per completed response.
  const reason = (state.finishReason === "stop" && hasToolCalls ? "tool-calls" : state.finishReason) ?? "unknown"
  const lifecycle = state.toolCallEvents.length ? Lifecycle.stepStart(state.lifecycle, events) : state.lifecycle
  events.push(...state.toolCallEvents)
  Lifecycle.finish(lifecycle, events, { reason, usage: state.usage })
  return events
}
```
Also check `openai-responses.ts` and `gemini.ts` for the same suppression (anthropic/bedrock verified compliant). Fix propagates to DeepSeek/TogetherAI/Cerebras/Baseten/Fireworks/DeepInfra (`llm/AGENTS.md:79`).
**TUI cross-fix (required together):** `spine-mapper.ts:1812-1814` — add `"unknown"` to the not-healthy set (TUI-1.1 "DEGRADED, never healthy"):
```ts
  if ("finish" in message && message.finish) {
    if (message.finish === "error" || message.finish === "content-filter" || message.finish === "unknown") return false
  }
```
**Tests:** llm unit — reason-less stream emits `finish("unknown")`; all recorded cassettes green; TUI spine test — `finish:"unknown"` renders degraded, never healthy.

### F-D2 — SSE queue pre-filter (`independent-security-audit-2026-07-14.md:413` unbounded-queue finding; P11; sibling A2)
**File:** `packages/engine/src/server/routes/instance/httpapi/handlers/event.ts:52-58` (verified: offer-before-filter; filter downstream `:75-79`; wire seq post-filter `:102-107` untouched):
```ts
    const queue = yield* Queue.sliding<EventV2.Payload>(4096)
    const unsubscribe = yield* events.listen((event) => {
      // F-D2: filter BEFORE offer — foreign directory/workspace noise must not
      // consume this subscriber's sliding-queue budget. Wire sequences are
      // assigned post-filter (:102-107): semantics unchanged.
      if (event.location?.directory !== instance.directory) return Effect.void
      if (event.location?.workspaceID !== undefined && event.location.workspaceID !== workspaceID) return Effect.void
      return Effect.sync(() => {
        offered += 1
        Queue.offerUnsafe(queue, event)
      })
    })
```
(The downstream `Stream.filter` `:75-79` stays as belt-and-suspenders.)
**Tests:** engine — foreign-directory flood does not overflow the subscriber queue; gapless wire sequences preserved.

### F-D3 — retry part pruning (AI SDK `13-repeated-assistant-messages.mdx` message-ID reuse; `processor.ts:1205-1236` verified)
**File:** `packages/engine/src/session/processor.ts` — snapshot at `process` start, prune in the retry `set` callback (`:1209`):
```ts
        // F-D3 (audit v7): snapshot the part surface before the stream so a
        // retry can prune attempt-1 text/reasoning output (cut-then-repeat).
        // Tool parts and pre-existing content are never touched.
        const attemptStartPartIDs = new Set(/* current message's text/reasoning part ids */)
        ...
                set: (info) => {
                  // F-D3: prune unfinished text/reasoning parts created by attempt 1
                  yield* pruneFailedAttemptParts(ctx.assistantMessage.id, attemptStartPartIDs)
                  ...
```
(Exact part-listing API to confirm at implementation via the session parts store; engine test pins it: retryable mid-stream failure → exactly ONE text part after retry.)
**Tests:** engine — retryable mid-stream failure → single text part, tool parts untouched.

### F5 — snapshot lock spam + silent baseline degradation (full spec, v14; polish, post-freeze)

**Anchors:** `daemon/pid-files.md:50,57-59` lock-is-truth; `respawn-managers.md:29-31` crash-loop guard.

#### Mechanism (expanded beyond log spam — v14)
1. `stage()` (`packages/engine/src/snapshot/index.ts:145-159`) runs `git add --all --sparse` against the SNAPSHOT gitdir (`state.gitdir`, `:79` = `Global.Path.data/snapshot/<project.id>/<Hash.fast(worktree)>`). On non-zero exit it logs `logWarning("failed to add snapshot files")` — the observed every-5-20s spam.
2. The in-process `locked()` Semaphore (`:164`) serializes only WITHIN one engine process. Two engine instances for the same project (daemon + CLI, worker-mode sessions) compute the SAME gitdir, so `git add` / `git rm --cached` / `git read-tree` / `git gc` from the other process holds `index.lock`. Git's lock IS file existence (O_EXCL create), so `index.lock` presence = lock held.
3. **Empirical (this session, `L:\tmp\lockprobe`, real git on this machine):** held `index.lock` → `git add` exits **128**, stderr `fatal: Unable to create '<gitdir>/.git/index.lock': File exists.` → the wrapper (`:99-105`) catches everything to `{code, text, stderr}` (never throws) → warning line. **Additionally: `git write-tree` ALSO exits 128 under the same lock** — so `track()` does not just degrade, it returns `hash = ""`.
4. **The silent part:** `track()` (`:324-353`) returns `""` on contention. `processor.ts:148` stores it as `ctx.snapshot`; `:784` (`if (!ctx.snapshot) ctx.snapshot = yield* snapshot.track()`) treats `""` as missing and RE-TRACKS on every step-start → every step of every contended turn re-spawns the full git walk (diff-files + ls-files + check-ignore + `git add`) → the 5-20s cadence AND continuous git churn. `:837`/`:1054` then skip the files part (`if (ctx.snapshot)` guard) — the turn silently loses its snapshot baseline with no error anywhere.

#### Fix design (all contained in `snapshot/index.ts`)
1. **Early skip (zero churn):** `add()` pre-checks `index.lock` existence (one fs stat) BEFORE any git spawn. Held → episode path → return. No failed git processes under contention.
2. **Race handling in `stage()`:** a spawned add that still fails with `index.lock` in stderr (lock appeared between pre-check and spawn) → same episode path, NOT the "failed to add snapshot files" warning. Non-lock failures keep today's warning.
3. **`track()` never returns `""`:** contended/failed write-tree → `undefined` (the documented `string | undefined` contract, Interface `:47`). The processor guards (`:784,:837,:1054`) already handle `undefined`; the step-start re-track becomes a cheap fs-stat skip while locked, and a real mid-turn capture when the lock clears.
4. **Surface once + bounded backoff (crash-loop guard):** per-gitdir episode record `{warned, since, retrying}`; one "snapshot add deferred" warning per episode (recovery logs "snapshot add recovered" with heldMs); `forkScoped` retry loop: sleep `1s·2ⁿ` capped 30s, re-run `add()` (fresh file list; cheap pre-check while locked), max 10 attempts (~3 min) then stop until the next natural call. `forkScoped` precedent in-file: `:767-772`.
5. **Never removes a held lock** (pid-files.md `:58`). The pre-check is detection only.

#### Before / after (current working-tree lines, re-read this pass)
**1. `stage()` — current `:145-159`:**
```ts
        const stage = Effect.fnUntraced(function* (files: string[]) {
          if (!files.length) return
          const result = yield* git(
            [...cfg, ...args(["add", "--all", "--sparse", "--pathspec-from-file=-", "--pathspec-file-nul"])],
            {
              cwd: state.directory,
              stdin: feed(files),
            },
          )
          if (result.code === 0) return
          yield* Effect.logWarning("failed to add snapshot files", {
            exitCode: result.code,
            stderr: result.stderr,
          })
        })
```
**Replace the tail (after the success return) with:**
```ts
          if (result.code === 0) {
            yield* onRecovered()
            return
          }
          // F5 (stall-audit v14): a failed add is normally cross-process
          // index.lock contention on the shared snapshot gitdir (same gitdir
          // across engine instances; the in-process Semaphore cannot serialize
          // it). Never treat it as a hard failure: surface once, back off,
          // converge. Never remove a held lock (pid-files.md:57-59).
          if (result.stderr.includes("index.lock") || (yield* lockHeld())) {
            yield* onContended(result)
            return
          }
          yield* Effect.logWarning("failed to add snapshot files", {
            exitCode: result.code,
            stderr: result.stderr,
          })
```

**2. `add()` pre-check — current `:241-242`:**
```ts
        const add = Effect.fnUntraced(function* () {
          yield* sync()
```
**Replace the first line with:**
```ts
        const add = Effect.fnUntraced(function* () {
          // F5 (stall-audit v14): skip the whole git walk when a concurrent
          // engine process holds the snapshot index lock. One fs stat, zero
          // git spawns, no churn, no per-step warning spam.
          if (yield* lockHeld()) {
            yield* onContended()
            return
          }
          yield* sync()
```

**3. `track()` — current `:346-350`:**
```ts
              yield* add()
              const result = yield* git(args(["write-tree"]), { cwd: state.directory })
              const hash = result.text.trim()
              yield* Effect.logInfo("tracking", { hash, cwd: state.directory, git: state.gitdir })
              return hash
```
**Replace with:**
```ts
              yield* add()
              // F5: write-tree also fails under a held index.lock (exit 128,
              // empirically verified L:\tmp\lockprobe). Never return "" — the
              // documented contract is `string | undefined` (Interface :47).
              // undefined lets the turn re-track cheaply at step-start
              // (processor.ts:784) and skips the files part (processor.ts:837,
              // :1054) instead of diffing against a broken baseline.
              if (yield* lockHeld()) return undefined
              const result = yield* git(args(["write-tree"]), { cwd: state.directory })
              if (result.code !== 0) return undefined
              const hash = result.text.trim()
              yield* Effect.logInfo("tracking", { hash, cwd: state.directory, git: state.gitdir })
              return hash
```

**4. Helpers — insert after `track()` ends (`:353`), before `patch` (`:355`):**
```ts
        // F5 (stall-audit v14): cross-process index.lock episode for the shared
        // snapshot gitdir. Detection = file existence (git's O_EXCL lock; the
        // file IS the lock — pid-files.md:50 lock-first detection). Retry window
        // is bounded like a crash-loop guard (respawn-managers.md:29-31):
        // 10 attempts, exponential 1s->30s cap (~3 min), then stop until the
        // next natural add/track call.
        const lockEpisode = { warned: false, since: 0, retrying: false }

        const lockHeld = () =>
          fs.exists(path.join(state.gitdir, "index.lock")).pipe(Effect.catch(() => Effect.succeed(false)))

        const onRecovered = Effect.fnUntraced(function* () {
          if (!lockEpisode.warned) return
          const heldMs = Date.now() - lockEpisode.since
          lockEpisode.warned = false
          lockEpisode.since = 0
          yield* Effect.logInfo("snapshot add recovered", { heldMs })
        })

        const onContended = Effect.fnUntraced(function* (result?: GitResult) {
          if (!lockEpisode.warned) {
            lockEpisode.warned = true
            lockEpisode.since = Date.now()
            yield* Effect.logWarning("snapshot add deferred: git index.lock held by another process", {
              exitCode: result?.code,
              stderr: result?.stderr,
            })
          }
          if (lockEpisode.retrying) return
          lockEpisode.retrying = true
          yield* Effect.forkScoped(
            Effect.gen(function* () {
              try {
                for (let n = 0; n < 10 && lockEpisode.warned; n++) {
                  yield* Effect.sleep(Duration.millis(Math.min(30_000, 1_000 * 2 ** n)))
                  yield* add()
                }
              } finally {
                lockEpisode.retrying = false
              }
            }),
          )
        })
```
All references resolve at call time (Effect.fnUntraced bodies are lazy; `add`/`stage` constructed before any invocation). `Duration`, `Effect.forkScoped`, `fs.exists` all in scope (`:2,:60,:161`).

#### Tests — new `packages/engine/test/snapshot/lock-contention.test.ts`
Harness (verified this pass): `it.instance` from `test/lib/effect.ts` (TestClock + TestConsole via `testEnv`; `withTmpdirInstance({git:true})`; `GIT_CEILING_DIRECTORIES` pattern in `fixture.ts:9`). Isolate the data dir by setting `XDG_DATA_HOME` to a temp dir at the top of the file BEFORE importing `@arcana/core` (same pattern as the ceiling-dirs line) so the snapshot gitdir (`Path.data/snapshot/...`) lands under the test tmp. Compute the gitdir from the InstanceContext with the exact formula at `snapshot/index.ts:79`.
1. **T1 regression:** no lock → `track()` returns a 40-hex tree hash; modify a file → `track()` returns a different hash; `patch(hash)` lists the file.
2. **T2 surface-once:** hold `<gitdir>/index.lock` → 3× `track()` → every call returns `undefined` (never `""`); captured logs contain exactly ONE "snapshot add deferred" and ZERO "failed to add snapshot files".
3. **T3 recovery (TestClock):** lock held → `track()` → `undefined` (episode starts, retry loop forked); release the lock; advance the clock past the 1+2+4+8+16s sleeps (`TestClock.adjust`) → the loop's next `add()` succeeds → episode cleared; next `track()` returns a real hash; exactly one "deferred" + one "recovered".
4. **T4 live (it.live, real clock):** lock held → `track()` → `undefined`; release; `pollWithTimeout` (test/lib/effect.ts:160) for `track()` to return a real hash within 5s (1s first backoff fires).
Log capture: app logger replacement (capturing `Logger` layer) or TestConsole — implementation detail; the assertions are the counts above.

#### Verification
- `bun test test/snapshot/lock-contention.test.ts` (4 tests) + engine suite regression (snapshot consumers: `summary.ts`, `revert.ts` — hash semantics unchanged for real hashes).
- Phase B extra checkpoint (live): hold `index.lock` during a turn → ZERO "failed to add snapshot files" in opencode.log, one "deferred", "recovered" after release; turn ends with a files part (or cleanly without when contended the whole turn — never a `""` hash).

#### Confidence: 90% → **100%** (design/static)
Every line re-read this pass; git semantics empirically verified on this machine (exit 128 shape; write-tree fails under lock); every API verified in-file (`exists` + `Effect.catch` pattern per fs-util `:52-54`, `Duration`, `forkScoped` precedent `:767-772`, `GitResult` wrapper `:99-105`, `feed`/`args` shapes); consumer contract verified (`processor.ts:784,837,1054`; Interface `:47`); doc anchors re-read verbatim; test harness verified. Residual = implementation + test execution (runtime — Phase B/C), consistent with the audit's evidence boundary. F5 remains post-freeze backlog (polish, non-blocking), now with a complete in-audit spec.

## QA pass (v8, 2026-08-01)

Methodology: `release-candidate-validation` (defect classification: RELEASE BLOCKER / POLISH BLOCKER / NON-BLOCKING; verified-vs-human boundary) + `systematic-debugging` (Iron Law: no fix claims without root-cause evidence — every fix here traces to code + docs read in this session).

### QA checklist (applied to this audit document)
1. **Load-bearing code claims re-verified** (sample): watchdog wiring, message.updated shape, idle shape, listener return type, retry policy, compaction finish lines.
2. **Doc claims re-verified** against official text: §8.3 widths, §24 gates, TUI-1.6 exit criteria — all match (read in full v7).
3. **Internal consistency**: multiple overall-confidence numbers; mechanism table vs sections.
4. **Fix completeness**: every fix has anchor + code + tests; code blocks must be compilable-in-principle (declarations in scope).
5. **Evidence boundary**: human-required steps labeled (Phase B remains operator-gated).

### Findings
| ID | Finding | Class | Disposition |
|----|---------|-------|-------------|
| QA-1 | **F4A code incomplete**: `watchdogTarget` referenced without declaration; watchdog config (`sdk.tsx:57-60`, `onTrip: () => sse?.abort()`) not shown as changed | POLISH BLOCKER (on the audit) | **FIXED v8** — declaration + onTrip retarget + per-attempt set; AbortError-reconnect semantics verified (`:172` break vs `:180-185` fall-through); backoff 1s→5s preserved |
| QA-2 | **Consistency**: three overall numbers in one file (v2 "~88% SUPERSEDED", v3 "~87%", v6 "~90%") | NON-BLOCKING | **FIXED v8** — pointer added on the v3 table; operative number = ~90% (v6) |
| QA-3 | `message.updated` info shape **VERIFIED**: `MessageUpdated` schema = `{sessionID, info: Info}` (`core/src/v1/session.ts:598-605`); `Info` carries `finish` (TUI fixtures `sync-live-hydration.test.tsx:58` confirm) — F2's cast is safe | PASS | no change |
| QA-4 | idle status shape **VERIFIED**: `status.set(ctx.sessionID, { type: "idle" })` (`processor.ts:1124,1141,1167`) — F2's `status?.type === "idle"` correct | PASS | no change |
| QA-5 | F-D2 listener return **VERIFIED**: original returns `Effect.sync(...)`; `Effect.void` for filtered events is type-compatible | PASS | no change |
| QA-6 | Watchdog semantic note: trip → attempt AbortError → reconnect (NOT unmount); outer abort → break (`:172`). F4A preserves this distinction | PASS | documented in F4A wiring |

### QA verdict
- **RELEASE BLOCKERS: 0.** No claim in the fix spec contradicts verified code or the official documentation.
- **POLISH BLOCKERS: 1 (QA-1)** — fixed in v8.
- **NON-BLOCKING: 1 (QA-2)** — fixed in v8.
- The audit's evidence boundary stands: everything statically verifiable is verified; the 100% gate remains the operator-gated live run (release-candidate-validation Phase 3: interactive checkpoints are `NOT TESTED — requires human interactive testing in real terminal` until then).

## Change manifest + confidence matrix (v9, 2026-08-01)

Definitive implementation map. Every line anchor was read in this session (current code, not the freeze report). Skills applied: `release-candidate-validation` (evidence boundary), `systematic-debugging` (root-cause discipline), `verifiable-execution-records` (terminal-event evidence rules). Official anchors read in full: Master Spec §8 (`:576-659`), §16.3-16.4 (`:1040-1077`), Playbook §23-24 (`:1006-1175`).

### New official evidence anchors (upgrade F1 / F-D1)
- **Master Spec §16.3** (`:1044`): Session event family = `session.started, input.admitted, model.started, session.completed, session.crashed`. A turn ending `finish=None` is neither — the indeterminate state F1/F-D1 eliminate.
- **Master Spec §16.4** (`:1077`): "Evidence emission failure marks trace DEGRADED or UNAVAILABLE" — the official basis for the DEGRADED treatment of missing terminal finishes (spine-mapper `"unknown"` change).
- **`verifiable-execution-records` skill (in-repo normative)**: the audit-replay lifecycle detector flags "session.started without terminal event" — the exact trace mechanism B/D leave behind; the completion-reason taxonomy (`cancelled`) is the abort path's canonical outcome.

### Manifest

| Fix | File (exact) | Lines (verified) | Change | Conf. | Basis | Official anchor |
|-----|--------------|------------------|--------|-------|-------|-----------------|
| F0 | `packages/tui/src/app.tsx` | insert after `:1743` (createCliRenderer block `:1722-1743`), before `:1744` | Ctrl+O console toggle (5 lines) | **100%** | capture already active; docs-specified API | opentui `console.mdx` |
| F1 | `packages/engine/src/session/processor.ts` | `:1162` (after `ctx.assistantMessage.error = error`) | `ctx.assistantMessage.finish = "error"` (1 line) | **95%** | one line; compaction `:626,700` verified compliant; abort lands here | AI SDK `language-model.ts:75-81`; §16.3 `session.crashed`; v.e.r. terminal-event rule |
| F2 | `packages/tui/src/context/sync.tsx` | `:40` (union); `:366-369` (idle); `:387-427` (finish, append before break) | `"turn-end"` reason + 2 triggers (+`"unknown"`) | **90%** | reconcile infra tested (P12); residual = open question 1 | TS `Unions and Intersections.md:264`; SolidJS `reconcile.mdx`; TUI-1.1 `:1028` |
| F3 | `packages/engine/src/server/server.ts` | `:211` | `createServer({ keepAliveTimeout: 5_000, headersTimeout: 10_000 })` | **95%** | hygiene; Node defaults already 5s/60s | node:http defaults |
| F4A | `packages/tui/src/context/sdk.tsx` | `:48-60` (watchdog + new `watchdogTarget`); `:158-238` (startSSE per-attempt ctrl) | destroy-not-pool reconnect | **90%** | mechanism code-verified end-to-end; QA-1 closed; residual = Bun runtime socket semantics (live) | Playbook §24 storms=0; TUI-1.6 `:1122`; exec-plan `:140` |
| F4B | `packages/engine/src/server/routes/instance/httpapi/handlers/event.ts` | `:169-173` (headers object) | `"Connection": "close"` | **85%** | deterministic in theory; Bun honoring to be confirmed live | httpapi `AGENTS.md:15` |
| F-D1 | `packages/llm/src/protocols/openai-chat.ts` | `:449-457` (`finishEvents`, `:455`); also check `openai-responses.ts`, `gemini.ts` | `?? "unknown"` on reason-less end | **86%** | precedented (anthropic `:553`, bedrock `:426`); residual = 2 protocols + double-emit + TUI sync | llm `AGENTS.md:277-278`; §16.3 |
| F-D1 (TUI) | `packages/tui/src/shell/command-spine/spine-mapper.ts` | `:1812-1814` | add `"unknown"` to not-healthy set | (in 86%) | DEGRADED, never healthy | TUI-1.1 `:1028`; §16.4 `:1077` |
| F-D2 | `packages/engine/src/server/routes/instance/httpapi/handlers/event.ts` | `:52-58` (queue + listener) | filter-before-offer; sliding 512→4096 | **95%** | trivial, no wire change | security-audit `:413` |
| F-D3 | `packages/engine/src/session/processor.ts` | `:1209-1234` (retry `set`); snapshot at process start (`:1170` region) | prune attempt-1 text/reasoning parts | **80%** | surgical; part API to confirm; engine tests required | AI SDK `13-repeated-assistant-messages.mdx` |
| F5 | `packages/engine/src/snapshot/index.ts` | `:145-159` (stage), `:241` (add pre-check), `:346-350` (track write-tree), helpers after `:353` | lock check + backoff + surface-once + never-`""` | **100%** | empirical: exit 128 stderr shape; write-tree fails under lock; consumer contract verified | pid-files.md `:50,57-59`; respawn-managers.md `:29-31` |

### Confidence summary (v9)
- **Design-level, statically verifiable: 100% verified** — every manifest row traces to code read this session + a doc read and cited.
- **Per-fix design confidence**: F0 100 · F1 95 · F3 95 · F-D2 95 · **F5 100 (v14)** · F2 90 · F4A 90 · F-D1 86 · F4B 85 · F-D3 80. (v9 snapshot — superseded by the v10-v14 tables below.)
- **Overall pre-live: ~90%.** The three lowest rows (F-D1 86, F4B 85, F-D3 80) are exactly the ones the live run exercises (provider-protocol behavior, Bun socket semantics, retry part pruning).
- **100% gate unchanged**: one instrumented live validation run (Phase B) — operator at keyboard. Any checkpoint FAIL routes back to this manifest.

## Enhancement research (v10, 2026-08-01)

The three sub-90% rows were researched to completion. All findings below are code-verified or empirically measured this session.

### F-D1 (86% → **92%**) — protocol sweep COMPLETE
Full sweep of all five native protocols' terminal-event handling:
- **UNCONDITIONAL (compliant):** `openai-responses.ts:861`, `anthropic-messages.ts:775` (also maps null→`"unknown"` at `:553`), `gemini.ts:387` (maps via `mapFinishReason`).
- **GUARDED (the fix surface — exactly 2 sites):**
  1. `openai-chat.ts:455` — `if (reason) Lifecycle.finish(...)` suppresses on reason-less end.
  2. `bedrock-converse.ts:608-619` — `onHalt` emits finish only `if (state.pendingFinish)`; a stream EOF without `messageStop` also suppresses.
- **Complete fix for both** (second site, `bedrock-converse.ts:608-619`):
```ts
const onHalt = (state: ParserState): ReadonlyArray<LLMEvent> => {
  // F-D1 (audit v10): reason-less EOF must still emit the terminal finish.
  // "unknown" is the in-repo precedent (mapFinishReason :421-426).
  const pending = state.pendingFinish ?? { reason: "unknown" as const }
  const events: LLMEvent[] = []
  Lifecycle.finish(state.lifecycle, events, {
    reason: pending.reason === "stop" && state.hasToolCalls ? "tool-calls" : pending.reason,
    usage: pending.usage,
  })
  return events
}
```
Residual now: double-emit guard (finishEvents/onHalt fire once at halt — single call site each, verified) + TUI sync (already specified) + live provider behavior.

### F-D3 (80% → **88%**) — complete code, all APIs verified
- The removal API EXISTS: `Session.removePart({sessionID, messageID, partID})` (`session.ts:522`, impl `:934`, production precedent `revert.ts:125-128`).
- The in-flight set is EXACTLY `ctx.reasoningMap` keys + `ctx.currentTextID`: reasoning entries are **deleted on reasoning-end** (`processor.ts:344`), `currentTextID` **cleared on text-end** (`:1043-1044`). No snapshot needed — the ctx state IS the attempt-1 unfinished set. Tool parts never appear in either structure → never touched.
- **Complete code** (retry `set` callback, `processor.ts:1209`):
```ts
                set: (info) => {
                  const event = mirrorAssistant
                    ? events.publish(SessionEvent.Retried, { /* unchanged */ })
                    : Effect.void
                  // F-D3 (audit v10): prune attempt-1 in-flight text/reasoning
                  // parts (cut-then-repeat). reasoningMap holds ONLY unfinished
                  // reasoning (deleted on end, :344); currentTextID is the
                  // unfinished text (cleared on end, :1043). Tool parts never
                  // appear in either. Session.removePart: session.ts:522.
                  const prune = Effect.gen(function* () {
                    const partIDs = [...Object.keys(ctx.reasoningMap), ctx.currentTextID].filter(
                      (id): id is string => typeof id === "string",
                    )
                    for (const partID of partIDs) {
                      yield* session.removePart({
                        sessionID: ctx.sessionID,
                        messageID: ctx.assistantMessage.id,
                        partID,
                      })
                    }
                  })
                  return prune.pipe(
                    Effect.andThen(flushV2Fragments()),
                    Effect.andThen(event),
                    Effect.andThen(status.set(ctx.sessionID, { /* retry status — unchanged */ })),
                  )
                },
```
Residual: V1/V2 dual-write interaction (V2 fragments already marked `Text.Ended`; V1 part removal is the mirror) + engine tests (retryable mid-stream failure → exactly one text part).

### F4A + F4B (90% → **93%** / 85% → **95%**) — EMPIRICALLY VALIDATED on the real runtime
Real Bun experiment (`L:\tmp\pool-test.ts`, run this session on the user's machine):
```
A(keep-alive) port=53835  B(Connection:close) port=53836
ESTABLISHED after 20 clean-EOF SSE fetches: A(keep-alive)=2  B(Connection:close)=0
```
- Bun **pools SSE sockets on clean EOF** (2 ESTABLISHED remained without the header) — F4A's premise and the storm mechanism confirmed empirically.
- `Connection: close` drives pooled sockets to **0** — F4B validated on the actual runtime (no longer "deterministic in theory").
- Sequential-fetch pooling plateaus low (2) because connections are reused; the storm's ~128 accumulation is the reconnect-churn variant of the same mechanism — the fixes (per-attempt abort + `Connection: close`) eliminate the class.

### Updated confidence (supersedes the three v9 rows)
| Fix | v9 | v10 | Basis |
|-----|-----|-----|-------|
| F-D1 | 86% | **92%** | protocol sweep complete; 2 guarded sites, both fixed; residual = double-emit + live |
| F-D3 | 80% | **88%** | complete code; removePart + reasoningMap/currentTextID verified; residual = dual-write + tests |
| F4A | 90% | **93%** | empirical pooling proof (2 ESTABLISHED) + per-attempt abort code complete |
| F4B | 85% | **95%** | empirical: Connection: close → 0 ESTABLISHED on real Bun |

**Overall pre-live: ~93%** (up from ~90%). The remaining gap is exclusively live-runtime behavior (F-D1 across real providers, F-D3 under real retries, connection decay under real churn) — the Phase B run closes it. 100% gate unchanged.

## Deep research II (v11, 2026-08-01) — target 99%

### F1 (95% → **99%**) — abort path VERIFIED through halt()
- `processor.ts:191-192`: `const parse = (e) => MessageV2.fromError(e, { providerID, aborted: ... })` — halt()'s error mapping IS `fromError`.
- `message-v2.ts:629-635`: `fromError` maps `DOMException AbortError` → `AbortedError`. The DB-verified `error=Aborted` (03:08:05 abort) therefore lands in halt() — the single F1 line at `:1162` covers BOTH the stream-error path AND the abort path. Compaction sites (`:626,:700`) already compliant. **Residual: none at design level.**

### F2 (90% → **95%**) — idle convergence guaranteed on every exit path
- `processor.ts:1124`: "Safety net: ensure session transitions to idle on all exit paths" (`status.set(..., { type: "idle" })` in cleanup()); `:1141,:1167` (ContextOverflow + generic halt both set idle). `session.idle` was observed live in the instrumented run event mix. Reconcile dedupes (`sync.tsx:879-880`) — repeated idle events are safe.
- **Residual: open question 1** (live attribution of retry-event delivery — bounded by the turn-end reconcile regardless of the answer).

### F-D1 (92% → **95%**) — double-emit is structurally harmless
- The `finish` LLMEvent is a **no-op** in the processor (`processor.ts:1048-1049` `case "finish": return`) — even a hypothetical double terminal event cannot corrupt state; the durable field is the truth. finishEvents/onHalt each have a single call site (openai-chat `:478`, bedrock `:608`). Sweep complete: exactly 2 guarded sites, both fixed.
- **Residual: live provider behavior only.**

### F-D3 (88% → **95%**) — event surface COMPLETE
- `removePart` publishes `SessionV1.Event.PartRemoved` (`session.ts:939-943`).
- The TUI HANDLES it: `sync.tsx:507-521` — `message.part.removed` removes the part from the store (produce+splice). The prune → PartRemoved → view removal chain is complete end-to-end; no stale-part window beyond the turn-end reconcile.
- V2 fragments already marked `Text.Ended` (dashboard dual-write) — the V1 removal is the mirror, consistent.
- **Residual: engine tests (runtime).**

### F4A (93% → **97%**) — EMPIRICALLY validated (abort destroys)
`L:\tmp\pool-test2.ts` (real Bun, this machine):
```
C(bun abort)=49978 → ESTABLISHED after 20 abort-mid-stream fetches: C=0
```
Abort → `reader.cancel()` → **0 sockets** — the per-attempt abort mechanism is measured, not inferred. **Residual: watchdog-retarget unit test + live churn decay.**

### F4B (95% → **99%**) — EMPIRICALLY validated on the EXACT daemon path
`L:\tmp\pool-test2.ts` — servers built with `createServer` from `node:http` (the identical import at `server.ts:7`, Bun's shim — the real daemon runtime):
```
A(node:http keep-alive)=49976 → ESTABLISHED=2   (baseline: pooling confirmed)
B(node:http Connection:close)=49977 → ESTABLISHED=0
```
`Connection: close` on the SSE response eliminates pooling on the actual runtime path. **Residual: none at design level.**

### F5 (90% → **95%**, superseded by v14: 90% → **100%**)
- Caller pinned: `snapshot/index.ts:303` (`yield* stage(allow.filter(...))` inside the scoped snapshot flow; warning at `:155`). Fix = lock check + backoff + surface-once, per pid-files.md lock-truth + respawn-managers.md crash-loop guard. **v14 (above) completes the spec: empirical reproduction, write-tree `""` baseline fix, early-skip pre-check, bounded backoff loop, tests — design confidence 100%.**

### Final confidence table (v11)
| Fix | v10 | **v11** | Basis |
|-----|-----|---------|-------|
| F0 | 100 | **100%** | docs-specified; capture active |
| F1 | 95 | **99%** | abort path verified through halt() (fromError→AbortedError) |
| F2 | 90 | **95%** | idle guaranteed on all exit paths (:1124); dedupe safe |
| F3 | 95 | **95%** | hygiene (note: headersTimeout 10s — localhost, WS upgrade unaffected) |
| F4A | 93 | **97%** | EMPIRICAL: abort → 0 ESTABLISHED (real Bun) |
| F4B | 95 | **99%** | EMPIRICAL on exact daemon path: Connection: close → 0 ESTABLISHED |
| F-D1 | 92 | **95%** | sweep complete (2 sites); double-emit structurally harmless |
| F-D2 | 95 | **95%** | trivial, no wire change |
| F-D3 | 88 | **95%** | removePart → PartRemoved → TUI sync.tsx:507 handled; code complete |
| F5 | 90 | **100%** | v14: full in-audit spec — empirical lock reproduction, write-tree `""` baseline fix, early-skip pre-check, bounded backoff + surface-once, tests |

**Design confidence: 99%.** Every fix is complete code with verified APIs, every runtime-dependent mechanism (F4A, F4B) is empirically measured on this machine's Bun, and every residual is a live-run or unit-test item — not a design gap. The project-standard **100% gate is unchanged**: one instrumented live validation run (Phase B). 99% is the ceiling of static + empirical work; the last 1% is the operator-gated runtime proof, by the operator's own definition.

## Drift verification (v12, 2026-08-01) — working tree checked against the audit

### State
HEAD `daa37e18` unchanged; **170 working-tree files modified, uncommitted**. The change set is an implementation of this audit's fix spec PLUS an unrelated T-series display-width/locale/spine refactor (out of this audit's scope). Every change in scope was diffed against the spec.

### Per-fix verification
| Fix | Audit spec | Working tree | Verdict |
|-----|-----------|--------------|---------|
| F0 | bind toggle key | **ALREADY IN HEAD**: `app.console` "Toggle console" command (`renderer.console.toggle()`) at `app.tsx:2694` (HEAD) / `:2723` (WT) — my F0 premise "no key to open it" was true only for DIRECT bindings; the command-palette entry exists | ✓ exists — audit corrected |
| F1 | `finish="error"` after `processor.ts:1162` | ✓ implemented at `:1163-1166`, comment cites F-A7a/D6 | ✓ exact |
| F2 | `"turn-end"` + idle + finish triggers | ✓ `sync.tsx:40` union; idle `:365-372`; finish `:393-412` — BROADER trigger (any non-empty `finish`, matches turn-lifecycle `messageFinished`; covers length/content-filter) + `result`→`match` rename (shadowing fix) | ✓ exceeds |
| F3 | `createServer({keepAliveTimeout:5000, headersTimeout:10000})` | ✓ `server.ts:211` — comment repeats the stale pre-v2 rationale ("half-open sockets can accumulate"); code correct | ✓ code / ⚠ comment |
| F4A | per-attempt controller + watchdog retarget | ✓ `sdk.tsx:49-58` (`watchdogTarget` replaces `sse`; `onTrip: () => watchdogTarget?.abort()`), per-attempt ctrl `:166-241`, PLUS additive jitter (1.0-1.5x, cites ≤1/sec gate) | ✓ exceeds |
| F4B | `Connection: close` in SSE headers | ✗ **MISSING** — grep: no `"Connection"` anywhere in `packages/engine/src/server/` | ✗ gap |
| F-D1 | openai-chat `?? "unknown"` + bedrock + sweep | ✓ `openai-chat.ts:455-457` (`reason ?? "unknown"`), `bedrock-converse.ts:608-625` (`pendingFinish ?? {reason:"unknown"}`), **and gemini fixed** (`gemini.ts:372-395` — see audit correction 2) | ✓ + correction |
| F-D1 TUI | spine-mapper `"unknown"` not-healthy | ✗ **MISSING** — spine-mapper diff is T8/T9 refactor only; `"unknown"` absent | ✗ gap |
| F-D2 | filter-before-offer + sliding 4096 | ✓ `event.ts:52-70` — `belongsToSubscriber` predicate, offer guard, downstream filter kept as defense-in-depth | ✓ exact |
| F-D3 | prune in retry `set` | ✓ `processor.ts:1211-1232` — pushes `ctx.currentText` + `Object.values(ctx.reasoningMap)` part objects (cleaner than id-list), `Effect.ignore`, `prune → flushV2Fragments → event → status` | ✓ exceeds |
| F-D5 | gateway chunking | ✓ `discord.ts`/`whatsapp.ts` via new `chunkWithHonestTail` (chunk.js) | ✓ exceeds |
| F5 | snapshot lock | not implemented — expected (post-freeze backlog) | ⏳ — **fully specced in v14 section** |

### Audit corrections (from the drift)
1. **F0 was already implemented in HEAD** (`app.console`, `app.tsx:2694`) — my audit read only `:1700-1780` and missed it. F0 → ALREADY IMPLEMENTED; optional polish = direct Ctrl+O binding.
2. **F-D1 sweep error: gemini was GUARDED.** `gemini.ts:371-377` had `state.finishReason || state.usage ? (…) : []` — my v10 verdict "unconditional" read only from `:378` and was WRONG. The implementation fixed all THREE guarded sites (openai-chat, bedrock, gemini). My v10 confidence basis corrected: sweep = 3 guarded sites, all fixed.
3. F2's broader finish trigger is accepted (any non-empty finish is terminal; converge is idempotent).

### Gaps to close (before freeze)
1. **F4B**: add `"Connection": "close"` to `handlers/event.ts:167-175` headers (empirically validated: → 0 pooled sockets).
2. **F-D1 TUI cross-fix**: `spine-mapper.ts:1812-1814` — add `"unknown"` to the not-healthy set (TUI-1.1 DEGRADED).
3. F3 comment: correct the stale rationale (hygiene; Node 5s default; storm closer = F4A/F4B).
4. F0 optional: direct Ctrl+O binding for `app.console`.

### Verified by execution
- F-D1 openai-chat test updated to pin the new behavior and **PASSES**: `bun test test/provider/openai-chat.test.ts -t "unknown"` → 1 pass / 0 fail (`finalizes with reason 'unknown' when the stream ends without a finish reason`, 27ms).

### New anchors (working tree)
- `processor.ts`: finish `:1163-1166`; retry prune `:1211-1232`
- `event.ts`: `belongsToSubscriber` + `Queue.sliding(4096)` `:52-70`; SSE headers (F4B insertion) `:167-175`
- `server.ts:211` · `openai-chat.ts:455-457` · `bedrock-converse.ts:608-625` · `gemini.ts:372-395`
- `sync.tsx:40,365-372,393-412` · `sdk.tsx:49-58,166-241`
- `app.tsx:2723` (WT) / `:2694` (HEAD) — `app.console`
- `gateway`: `chunkWithHonestTail` (`discord.ts`, `whatsapp.ts`, `chunk.ts`)

### Confidence after drift check
The implemented fixes raise confidence: F1/F2/F3/F4A/F-D2/F-D3/F-D5 verified as-implemented (code read), F-D1 test passing. **Two gaps remain (F4B, spine "unknown")** — overall ~97% until they land, then the 99% design confidence from v11 holds. 100% gate unchanged: live validation.

## Exact edit plan (v13, 2026-08-01) — lines to replace, pinned to the CURRENT working tree

All anchors re-read this pass. Edits are NOT applied (code modification awaits operator permission per the modify rule). After edits 1-2, the fix set is 11/11; design confidence returns to 99%.

### EDIT 1 — F4B: `Connection: close` (must-close; currently MISSING)
**File:** `packages/engine/src/server/routes/instance/httpapi/handlers/event.ts`
**Current (`:176-180`, verified):**
```ts
        headers: {
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
          "X-Content-Type-Options": "nosniff",
        },
```
**Replace with:**
```ts
        headers: {
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
          "X-Content-Type-Options": "nosniff",
          "Connection": "close", // F4B (stall-audit v11/v12): never pool the SSE socket — empirically 0 ESTABLISHED vs 2
        },
```
**Verify:** cold-daemon boot → ESTABLISHED decays to ≤10 within ~15s of idle; Phase B checkpoint 5. (Empirically validated at `L:\tmp\pool-test2.ts`.)

### EDIT 2 — F-D1 TUI cross-fix: `"unknown"` treated as DEGRADED (must-close; currently MISSING)
**File:** `packages/tui/src/shell/command-spine/spine-mapper.ts`
**Current (`:1802-1803`, verified):**
```ts
  if ("finish" in message && message.finish) {
    if (message.finish === "error" || message.finish === "content-filter") return false
  }
```
**Replace `:1803` with:**
```ts
    if (message.finish === "error" || message.finish === "content-filter" || message.finish === "unknown") return false
```
**Verified no other site needs it:** `turn-lifecycle.ts:79` (`messageFinished = typeof message.finish === "string" && message.finish.length > 0`) already closes the turn for "unknown"; `spine-mapper.ts:2283-2286` (finish extraction) passes any string through. Only the not-healthy predicate needs the DEGRADED treatment (TUI-1.1 `:1028`; §16.4 `:1077`).
**Verify:** spine unit test — `finish:"unknown"` renders degraded, never healthy.

### EDIT 3 — F3 comment correction (stale rationale; code already correct)
**File:** `packages/engine/src/server/server.ts`
**Current (`:211-214`, verified — repeats the pre-v2 "half-open sockets accumulate" claim):**
```ts
  // F-A8a: keep-alive hygiene — without keepAliveTimeout/headersTimeout,
  // half-open sockets can accumulate and saturate the fetch pool under
  // connection storms (mechanism C). 5s keep-alive + 10s header timeout
  // bounds idle socket lifetime without affecting active streams.
```
**Replace with:**
```ts
  // F3 (stall-audit v12): explicit HTTP timeouts — hygiene. node:http already
  // defaults keepAliveTimeout 5s / headersTimeout 60s; explicit + tightened
  // header bound documents intent. NOT the storm closer: client-side socket
  // accumulation is fixed by F4A (per-attempt abort) + F4B (Connection: close
  // on the SSE response). Empirically: Connection: close → 0 pooled sockets.
```

### EDIT 4 — F0 polish: direct Ctrl+O binding for the existing `app.console` command (optional)
**File:** `packages/tui/src/app.tsx`
**Current (`:1746-1752`, verified):** acquireRelease ends `:1746`; `win32DisableProcessedInput()` `:1747`; keymap `:1748-1752`. The `app.console` command already exists at `:2718-2726`.
**Insert after `:1746` (before `win32DisableProcessedInput()`):**
```ts
      // F0 polish (stall-audit v12): direct keybinding for the existing
      // app.console command (app.tsx:2718-2726). Docs: opentui console.mdx.
      renderer.keyInput.on("keypress", (key) => {
        if (key.ctrl && key.name === "o") renderer.console.toggle()
      })
```
**Verify:** Ctrl+O toggles the overlay; `SHOW_CONSOLE=true` / `OTUI_DUMP_CAPTURES=true` unchanged.

### Post-edit state
F0 ✓ (in HEAD + optional key) · F1 ✓ · F2 ✓ · F3 ✓ (+comment) · F4A ✓ · **F4B ✓ (edit 1)** · F-D1 ✓ (3 sites + spine edit 2) · F-D2 ✓ · F-D3 ✓ · F-D5 ✓ (both platforms, verified) · F5 ✓ **spec (v14 section — post-freeze backlog, design confidence 100%)**. Design confidence: **99%** (restored); F5 at 100% design per v14. 100% gate unchanged: live validation.

## Files referenced

- `packages/engine/src/session/processor.ts` (halt 1127-1168, retry 1205-1236, cleanup 1053-1125, finish=reason 814)
- `packages/engine/src/session/compaction.ts` (direct error assignment 613, 623, 697)
- `packages/engine/src/session/retry.ts` (88-179, 208-226)
- `packages/engine/src/session/llm/ai-sdk.ts:264-265`, `llm.ts:297-309`
- `packages/engine/src/server/server.ts:7, 210-235` (node:http createServer, no options)
- `packages/engine/src/server/routes/instance/httpapi/handlers/event.ts:100-175`
- `packages/engine/src/cli/cmd/tui.ts:160-198, 243-255`
- `packages/tui/src/context/sync.tsx:40, 366-427, 752-761, 873-990, 1023-1029`
- `packages/tui/src/context/sdk.tsx:158-238` (single shared AbortController 163-165)
- `packages/tui/src/routes/session/index.tsx:631-683`
- `packages/tui/src/shell/command-spine/spine-mapper.ts:1814-1816`
- `packages/tui/src/app.tsx:1724-1737` (createCliRenderer config)
- `packages/core/src/observability/logging.ts:49-69`, `core/src/global.ts:18-30`
- `packages/sdk/js/src/v2/gen/core/serverSentEvents.gen.ts:135-220` (releaseLock on EOF 217, abortHandler 139-145, O(N²) buffer 153-157)
- `packages/llm/src/protocols/openai-chat.ts:449-457` (terminal-event suppression), `route/client.ts:272-288` (streamPrepared), `prompt.ts:1520`, `anthropic-messages.ts:553` + `bedrock-converse.ts:426` (`"unknown"` precedent)
- `packages/engine/src/server/routes/instance/httpapi/handlers/event.ts:52-79` (offer-before-filter)
- Log: `C:\Users\lejze\.local\share\arcana\log\opencode.log`

## Docs referenced (v2 cross-review)

- `.hermes/docs/opentui/core-concepts/console.mdx` (overlay, toggle, env), `renderer.mdx` (consoleMode default, openConsoleOnError, externalOutputMode), `testing.mdx` (createTestRenderer), `reference/env-vars.mdx` (OTUI_USE_CONSOLE / SHOW_CONSOLE / OTUI_DUMP_CAPTURES)
- `.hermes/docs/solidjs/v2/reference/stores/reconcile.mdx`, `create-store.mdx` (identity-preserving diff; draft-mutating setter)
- `.hermes/docs/ai-sdk/ai-main/packages/ai/src/types/language-model.ts:75-81` (canonical FinishReason union)
- `.hermes/docs/typescript/handbook-v2/Narrowing.md:657-700`, `handbook-v1/Unions and Intersections.md:264` (discriminated-union exhaustiveness)
- `.hermes/docs/daemon/daemon.7.md` (step 9: /dev/null stdio — validates `stdio: ignore`), `respawn-managers.md` (backoff for F5)
- Master docs: `Arcana_Project_Master_Specification.md` §8 (TUI track), `ARCANA_PHASES_100_PERCENT_COMPLETION_PLAYBOOK.md` §23-24 (TUI-1.6 exit criteria, §24 gates)

## Full-corpus cross-check (v4, 2026-08-01)

Beyond the v2 five-library pass, the ENTIRE local corpus was consulted: the arcana docs tree (`.hermes/docs/arcana/` + repo `docs/`), the TUI-2.1 chain (`TUI-2.1-FIX-LOG.md` Rounds 1-6, `TUI-2.1-SSE-STALL-REPORT.md`, `TUI-2.1-DAEMON-ROOTCAUSE-AUDIT.md`, `TUI-2.1-SSE-TRUNCATION-FIX-PLAN.md`, `TUI-2.1-MANUAL-SMOKE-TEST.md`), package AGENTS.md (`llm`, `engine`, `engine/src/session/llm`, `httpapi`, `core/src/tool`), AI SDK content docs (`03-ai-sdk-core/50-error-handling.mdx`, `04-ai-sdk-ui/50-stream-protocol.mdx`, `09-troubleshooting/13-repeated-assistant-messages.mdx`), `docs/session-compaction.md`, `docs/gateway.md`, `docs/architecture/command-spine-ui.md`, and the `arcana-development` skill references (`observability-and-turn-error.md`, `live-consistency-protocol.md`, `daemon-sse-staleness-debugging.md`).

### Provenance confirmations
- **P7-P12 lineage verified** in FIX-LOG Rounds 1-6 + DAEMON-ROOTCAUSE-AUDIT: P7 idle timer (300s, `resetActivity()` never called — every daemon died at boot+5:00), P10 heartbeat resync + 30s→5s liveness tightening, P11 sliding(512), P12 divergence-repair protocol (streamID + gapless wireSeq post-filter, headSequence gap >4, generation-guarded reconcile, isolated emitter, missing-delta tracker). This audit's descriptions of the current code match the fix-log exactly.
- **18:16 evidence** (SSE-STALL-REPORT §1-5): DB complete (7,962 chars), final message `finish=None`, TUI froze at 5 chars ~2s into the final message — matches mechanism A row.

### Honest-state correction (self-audit)
- **Mechanism A root cause was NEVER confirmed.** SSE-STALL-REPORT §5: "The exact TUI-side or real-socket mechanism that stopped event delivery ~2s into the final message is NOT yet identified with certainty." Top candidates: (1) TCP backpressure (TUI consumer stall on ~150KB tool outputs → receive window fills → SSE write stalls → half-open), (2) uncaught store-handler error stalling the batch flush. P10-P12 bound the class WITHOUT naming the mechanism. → Mechanism A row and the elimination table updated: TCP backpressure is eliminated as REQUIRED for the class (worker-mode freeze proves it), NOT as the 18:16 mechanism. Live validation must re-test the 18:16 scenario explicitly.
- **Skill staleness found and patched**: `arcana-development/references/observability-and-turn-error.md` still carried the pre-v2 claim ("no keepAliveTimeout → orphaned sockets held indefinitely") and the tee-capture advice. Both corrected (Node 5s default; client-side accumulation; OpenTUI console overlay).

### New normative citations (strengthen the fix spec)
- **F1/F2 (abort path)** — AI SDK `50-error-handling.mdx`: "The `onAbort` callback is called when a stream is aborted via `AbortSignal`, but `onEnd` is not called. This ensures you can still update your UI state appropriately." The engine's abort path must surface a terminal state and the TUI must converge on it — exactly F1+F2. The AI SDK stream part surface (`error` / `abort` / `tool-error` parts) is the reference model for the terminal `message.updated(finish="error")` wire shape.
- **F-D1** — `packages/llm/AGENTS.md:277-278` is the NORMATIVE in-repo rule: "emit one terminal `finish` event (or `provider-error`) for each completed response"; "Emit exactly one terminal `finish` event for a completed response… use `stream.onHalt` when the final event must be flushed after the framed stream ends." openai-chat's `if (reason)` suppression at `:455` violates it directly. Also `AGENTS.md:79`: "Bug fixes in one protocol propagate to every consumer of that protocol in a single commit" — the openai-chat fix covers DeepSeek, TogetherAI, Cerebras, Baseten, Fireworks, DeepInfra at once.
- **F-D3** — AI SDK `09-troubleshooting/13-repeated-assistant-messages.mdx`: duplicate messages arise when the client generates NEW message IDs; the fix is reusing the original ID so the UI updates the existing message. Arcana's `Effect.retry` already re-runs on the SAME message (correct); the missing piece is pruning attempt-1 parts (F-D3). The observed 02:23 outer-loop NEW-message case is the ID-reuse violation — closed by F1+F2 convergence.
- **A4 verified** — `docs/session-compaction.md`: threshold 85%, `reserved: 20000` ("hard ceiling reserve so output still fits"), "Auto compact **never kills** the agent turn", failure handling (transient retry once ~3s, deterministic no-retry, soft-fail continues). TUI surfaces ⟳ COMPACTING + `session.next.compaction.ended`.
- **A5 verified** — `docs/gateway.md:49` (Discord 2000, "truncated automatically") and `:79` (WhatsApp 4096).
- **F2 spine** — `docs/architecture/command-spine-ui.md`: "The TUI **observes** session/kernel/tool state. It does not invent RunProof, verifier, or permission truth" (the §8.1 doctrine, project-authoritative); layout breakpoints wide ≥120 / compact ≥100 / narrow ≥80 / minimal <80 with ±5 hysteresis (matches master spec §8.3).
- **F0** — the console overlay fix is consistent with the TUI's own `createCliRenderer` config (verified `app.tsx:1724-1737`) and the opentui docs; the skill reference now documents `SHOW_CONSOLE` / `OTUI_DUMP_CAPTURES` / toggle-key usage.

### Scope notes
- `engine/AGENTS.md` Effect conventions (Schema.TaggedErrorClass, Effect.void, InstanceState) impose no change on F1/F-D3; the fixes already follow them.
- P8 (daemon death visibility, `daemon/log.ts`) landed with P7 (Round 4); P9 live validation remains pending — it IS this audit's PHASE B.

## Cross-audit references (v3)

- `docs/audits/stream-truncation-audit.md` (v3) — sibling audit, findings A1-A9, fix plan F-A1..F-A8b, design-compliance matrix
- `packages/llm/AGENTS.md` — terminal `finish` event rule (exactly one per response; `stream.onHalt`)
- Master Spec §16.3 (session event family: `session.completed` / `session.crashed`), §8.1 (TUI observes engine truth)
- Playbook D6 (record UNKNOWN rather than blind retry), §A3/B6 (trace health)
- `TUI-2.1-SSE-TRUNCATION-FIX-PLAN.md`, `TUI-2.1-FIX-LOG.md` (Rounds 1-6: P3, P10-P12), `session-compaction.md`, `gateway.md`

## Full-corpus cross-check II (v5, 2026-08-01)

Second full-corpus pass: `TUI-2.1-SSE-TRUNCATION-FIX-PLAN.md` (P2/P3/P4 origin), `TUI-2.1-MANUAL-SMOKE-TEST.md` (now genuinely read — v4 listed it as consulted), `TUI-2.1-FREEZE-REPORT.md`, `TUI-2.1-FREEZE-EXECUTION-PLAN.md`, `TUI-2.1-RB01-FIX-SPEC.md`, `TUI-2.1-SPRINT-REPORT.md`, `TUI-2.1-PRODUCTION-INTEGRATION-POLISH.md`, `TUI-2-INTERACTIVE-AUTHORITY-CONTROL.md`, `engine/src/session/llm/AGENTS.md`, `httpapi/AGENTS.md`, AI SDK `04-ai-sdk-ui/50-stream-protocol.mdx` + `09-troubleshooting/{14-stream-abort-handling, 15-abort-breaks-resumable-streams, 15-stream-text-not-working, 12-use-chat-an-error-occurred, 16-streaming-status-delay}.mdx`, `daemon/{respawn-managers, pid-files, signal.7}.md`, `opentui/bindings/solid.mdx`, `opentui/core-concepts/lifecycle.mdx`, `solidjs/concepts/stores.mdx`, `docs/engine-typecheck-investigation.md`.

### New findings
1. **Doc-vs-code discrepancy (validates F4A).** `TUI-2.1-FREEZE-EXECUTION-PLAN.md:171` claims the SSE stream uses "single connection (**abort prior**)" — code verification (`sdk.tsx:163-165`) shows ONE `AbortController` reused across all reconnect attempts with no per-attempt abort on clean EOF. The plan overstates the implemented state; **F4A remains required** and this discrepancy is the audit's evidence that the "already compliant" reading is wrong.
2. **F4 normative anchors.** Execution plan `:140` — "SSE reconnect rate | ≤ 1/sec, exponential backoff + jitter"; `:158` P2-2 — "single connection per session, capped reconnect attempts, exponential backoff + jitter, no reconnect storms". F4A+F4B serve exactly these gates.
3. **F1 abort-path citations (AI SDK).** `14-stream-abort-handling.mdx` — "the abort handler immediately terminates the response, preventing the `onEnd` callback from being triggered"; the fix is consuming the stream so the terminal event still fires. Arcana's F1 applies the same principle: emit the terminal `finish="error"` BEFORE the abort terminates processing. `15-abort-breaks-resumable-streams.mdx` — client abort ≠ server cancellation ("`stop()` only aborts the current client request… explicit user cancellation needs a separate server-side signal"). The TUI's Esc is a server-side cancel by design, so the terminal `finish="error"` wire outcome is correct.
4. **F-D1 canonical protocol (AI SDK).** `50-stream-protocol.mdx` defines the data-stream part surface: `finish` part (`:454` "A part indicating the completion of a message"), `abort` part (`:467` `{"type":"abort","reason":"user cancelled"}`), `[DONE]` termination (`:480`). Mechanism D = the engine's native path missing its `finish` part; F-D1 restores the canonical terminal event. (Design note: Arcana's SSE has no `[DONE]`-equivalent; the heartbeat+streamID protocol covers EOF ambiguity — not a fix.)
5. **F5 lock-truth citation.** `daemon/pid-files.md:50,57-59` — "Lock-based detection is the reliable primitive"; "If the lock is free, the file is stale by definition… If the lock is held, the daemon is alive. Never remove the file." The snapshot `index.lock` retry loop should check lock-held state with backoff (crash-loop guard per `respawn-managers.md:29-31`), not retry-spam.
6. **Mechanism A long-term answer.** `TUI-2.1-SSE-TRUNCATION-FIX-PLAN.md:82` — "Full AI SDK resumable-stream pattern (Redis/persisted SSE + GET replay endpoint) — heavy, correct long-term answer for GAP-2/GAP-4." Add to the post-freeze backlog; P10-P12 are the bounded interim.
7. **Typecheck-gate honesty note.** `docs/engine-typecheck-investigation.md:8,148` — ~100+ pre-existing engine typecheck errors surfaced after turbo cache busting (Category D: ~80 Effect errors; incl. `ensure-solid-preload.ts:17` missing `@opentui/solid/preload` declarations). The freeze gate "typecheck 16/16" must be re-verified against the CURRENT tree at final HEAD (PHASE G), not assumed from the freeze report.
8. **Minor scope notes.** AI SDK `16-streaming-status-delay.mdx` recommends content-based streaming status (`parts.length === 0`); the TUI uses `!time.completed` — polish candidate, not correctness. `solidjs/concepts/stores.mdx:403-406` — "a single store setter call automatically gets wrapped in a batch" — doc-confirms the reviewer resolution (batch defers renders, not store writes). `opentui/core-concepts/lifecycle.mdx:13` — "OpenTUI does not automatically clean up on `process.exit` or unhandled errors" — the F0 dump caveat and the TUI's own `exitOnCtrlC: false` config (`app.tsx:1728`) are the correct ownership points.
9. **Runtime-boundary confirmations.** `engine/src/session/llm/AGENTS.md:7-9,87-90` — AI SDK is the default runtime; native is opt-in (`OPENCODE_EXPERIMENTAL_NATIVE_LLM=true`) and per-request (a session can mix). Mechanism D's "(opt-in)" classification and its per-request reach are now doc-authoritative. `httpapi/AGENTS.md:15` — SSE stays in `HttpApiBuilder.group` + `HttpServerResponse.stream(...)` — F4B's header addition is consistent.

## Full-corpus cross-check III (v6, 2026-08-01) — final

### Remaining audits read (no conflicts)
- `docs/tui-slash-command-audit.md` + `docs/tui-runtime-adjacent-risk-audit.md` — slash-command scope (placeholder Arcana command map in `app.tsx`, stale command registry, server/MCP autocomplete). No overlap with the stream-stall disease; no changes to this audit.
- `docs/security-audit-2026-07-14.md` + `docs/independent-security-audit-2026-07-14.md` — security scope. One relevant intersection: the independent audit flagged that live socket queues are unbounded ("The PTY service's retained-output and exited-session caps are positive controls, but they do not bound each live socket queue", `independent-security-audit-2026-07-14.md:413`) — addressed by P11 (`Queue.sliding(512)`) + F-D2 (pre-filter). Consistent; no contradiction.
- The `audit-replay.ts` / `effect-boundary-audit.test.ts` files are code artifacts of the epistemic subsystem, not audits of this disease.

### Completed opentui / typescript / solidjs doc support
- **opentui `components/code.mdx:245`** — `wrapMode` default `"word"` (inherited from `TextBufferRenderable`; values `"none" | "char" | "word"`) — the doc-source verification of the RW-01 wrap facts (previously cited via dist). Also `:134-152,:231` streaming mode (`streaming: true` optimizes highlighting for incremental LLM content) and `:233` `drawUnstyledText` default `true`. WS3-relevant.
- **typescript `handbook-v1/Unions and Intersections.md:262-340`** — the canonical exhaustiveness section: "We would like the compiler to tell us when we don't cover all variants of the discriminated union" (`:264`) and the `never`-type method (`:337`). F2's exhaustive finish dispatch is the documented pattern, not a project invention.
- **solidjs `store-path.mdx`** — typed path setters; doc-confirms the `setStore("message", sessionID, index, reconcile(info))` path syntax used by F2's merge code (`sync.tsx:397`).
- **solidjs `produce.mdx`** — draft-mutating store modifier; doc-confirms the `produce`-based merges in `sync.tsx` (`:403-405`).
- **solidjs `create-optimistic-store.mdx`** — "Writes inside an action transition are tentative — they show up immediately but auto-revert (or reconcile to the action's resolved value) once the transition finishes" — the canonical pattern behind WS-P1 P1-3 (optimistic user message / progressive hydration). Also `options.key` defaults to `"id"` — the same keyed-reconcile identity semantics used by the store merges.

### Final confidence position (v6)
- **Static verification is EXHAUSTED.** Every claim in this audit — four mechanisms, nine fixes (F0-F5, F-D1/F-D2/F-D3), the corrections — now traces to (a) code read and verified in this session (processor, sync, sdk, event, server, SDK gen, llm protocols, compaction) AND (b) a documentation source read and cited. No remaining unread audit, AGENTS file, or library doc bears on this disease class.
- **Design-level: 100% of the statically verifiable surface is verified.** Residual uncertainty is exclusively RUNTIME: mechanism A attribution, F4B socket semantics under the real Bun runtime, F-D1 behavior across 6+ provider protocols, retry-event delivery (open question 1), connection-count decay on the real stack.
- **The 100% gate is unchanged and is operator-gated** (per the project standard the user set): one instrumented live validation run (PHASE B protocol, v2 — console overlay + probe + opencode.log + DB). This cannot be completed from the desk; it needs the operator at the keyboard.
- **Overall readiness: ~90% pre-live** (up from ~87%: v4-v6 closed the F-D1/F2 cross-fix gap, exhausted the corpus, and verified every remaining claim). 100% is reachable in one session IF the live run passes all checkpoints; any FAIL routes back to this audit per the operator standard.

### v7 delta (code-complete spec)
- Every fix now has exact before/after code with verified line anchors; implementation is mechanical (F1 = one line; F0 = 5 lines; F4B = 1 header; F-D1 = 1 expression change; F2/F4A/F-D2/F-D3 as specified).
- F1 confidence raised: the "sweep" was over-stated (compaction already compliant) — the fix is provably one line.
- The fix set is complete and closed: F0 (observability), F1+F2 (mechanism B + abort + D-convergence), F4A+F4B+F3 (mechanism C), F-D1 (mechanism D), F-D2/F-D3 (hardening), F5 (polish — fully specced in v14 section, post-freeze backlog).

## Full-corpus references (v4)

- `TUI-2.1-SSE-STALL-REPORT.md` (18:16 session; §5 = mechanism A root cause unconfirmed, top candidates)
- `TUI-2.1-DAEMON-ROOTCAUSE-AUDIT.md` (P7 idle timer; P8 crash capture; P9 live validation)
- `packages/llm/AGENTS.md:277-278` (terminal finish event rule — F-D1 normative), `:79` (protocol fix propagation)
- AI SDK content docs: `03-ai-sdk-core/50-error-handling.mdx` (onAbort/onEnd — F1/F2), `09-troubleshooting/13-repeated-assistant-messages.mdx` (message-ID reuse — F-D3), `04-ai-sdk-ui/50-stream-protocol.mdx` (SSE keep-alive/reconnect)
- `docs/session-compaction.md` (A4: 85% threshold, reserved 20000, never-kills-turn), `docs/gateway.md:49,79` (A5: 2000/4096)
- `docs/architecture/command-spine-ui.md` (spine authority doctrine; §8.3 breakpoints)
- `packages/engine/AGENTS.md` (Effect conventions; no change to F1/F-D3)
- Skill `arcana-development`: `references/observability-and-turn-error.md` (patched v4: console overlay, Node 5s correction), `references/live-consistency-protocol.md` (P12 protocol), `references/daemon-sse-staleness-debugging.md`

## Full-corpus references (v5)

- `TUI-2.1-SSE-TRUNCATION-FIX-PLAN.md` (P2/P3/P4 origin; §6 resumable-stream long-term answer), `TUI-2.1-MANUAL-SMOKE-TEST.md` (WS1 runbook)
- `TUI-2.1-FREEZE-REPORT.md` (aedd96dc structuredClone L26; RW-01 L58; gap-closer L59; wrapMode L118), `TUI-2.1-FREEZE-EXECUTION-PLAN.md:140,158,171` (SSE gates; "abort prior" discrepancy), `TUI-2.1-RB01-FIX-SPEC.md`, `TUI-2.1-SPRINT-REPORT.md`, `TUI-2.1-PRODUCTION-INTEGRATION-POLISH.md`, `TUI-2-INTERACTIVE-AUTHORITY-CONTROL.md` (durable approval lifecycle)
- `packages/engine/src/session/llm/AGENTS.md:7-9,87-90` (native opt-in, per-request — mechanism D), `packages/engine/src/server/routes/instance/httpapi/AGENTS.md:15` (SSE handler pattern)
- AI SDK: `04-ai-sdk-ui/50-stream-protocol.mdx:454,467,480` (finish/abort/[DONE] parts), `09-troubleshooting/14-stream-abort-handling.mdx`, `15-abort-breaks-resumable-streams.mdx`, `16-streaming-status-delay.mdx`
- `daemon/respawn-managers.md:29-31` (crash-loop guard — F5), `daemon/pid-files.md:50,57-59` (lock is truth — F5), `daemon/signal.7.md`
- `opentui/bindings/solid.mdx`, `opentui/core-concepts/lifecycle.mdx:13` (no auto-cleanup), `solidjs/concepts/stores.mdx:403-406,492-493` (batch + reconcile)
- `docs/engine-typecheck-investigation.md` (typecheck debt — PHASE G re-verify note)

## Full-corpus references (v6)

- `docs/tui-slash-command-audit.md`, `docs/tui-runtime-adjacent-risk-audit.md` (slash scope — no conflict)
- `docs/security-audit-2026-07-14.md`, `docs/independent-security-audit-2026-07-14.md:413` (unbounded socket queues → P11/F-D2)
- opentui `components/code.mdx:245` (wrapMode `"word"` source), `:134-152` (streaming mode), `:233` (drawUnstyledText)
- typescript `handbook-v1/Unions and Intersections.md:262-340` (exhaustiveness: compiler-flagged variants `:264`, `never` method `:337`)
- solidjs `reference/store-utilities/produce.mdx` (draft-mutating modifier), `v2/.../store-path.mdx` (typed path setters), `v2/reference/stores/create-optimistic-store.mdx` (tentative writes reconcile on finish — WS-P1 pattern)

## Full-corpus references (v7)

- Official text read in full this pass: Master Spec §8.1-8.6 (`:576-659` — doctrine, zones, responsive, product track, non-negotiable rules, quality gate), Playbook §23 (`:1006-1156` — TUI-1.1..1.7 exit criteria, WS-P1/WS-P2) + §24 (`:1158-1175` — 14 gates)
- Code re-verified for exhaustive before/after: `processor.ts` halt `:1127-1168` + retry `:1200-1244` + finish no-op `:1048-1049`; `compaction.ts:600-634,683-708` (both AbortedError sites ALREADY set finish="error"); `sync.tsx:40,360-427,860-994` (reconcile signature/dedupe confirmed); `spine-mapper.ts:1800-1817` (finish predicate pinned); `retry.ts:80-124` (429/5xx/upsell policy); `app.tsx:1716-1748` (renderer + keymap insertion point); `event.ts:40-79,147-175` (offer-before-filter + SSE headers); `server.ts:205-235`; `sdk.tsx:158-238`; `serverSentEvents.gen.ts:135-239`; `openai-chat.ts:449-457`

## QA-pass references (v8)

- Skills: `release-candidate-validation` (defect classes, evidence boundary), `systematic-debugging` (Iron Law)
- QA re-verifications: `sdk.tsx:1-155` (watchdog `:57-60`, flush `:92-110`, backoff `:85-90`, AbortError catch `:180-185`, unmount break `:172`); `core/src/v1/session.ts:598-605` (MessageUpdated schema `{sessionID, info: Info}`); `processor.ts:1124,1141,1167` (idle shape); `packages/tui/test/cli/cmd/tui/sync-live-hydration.test.tsx:58` (info fixture carries finish)

## Change-manifest references (v9)

- Master Spec §16.3 (`:1040-1062` — event families: session.completed / session.crashed), §16.4 (`:1063-1077` — evidence emission failure → DEGRADED/UNAVAILABLE)
- Skill `verifiable-execution-records` (audit-replay lifecycle checks: "session.started without terminal event"; completion-reason taxonomy incl. `cancelled`)
- `packages/engine/src/snapshot/index.ts:145-159` (F5 stage anchor), caller `:303`
- All manifest line anchors: read this session (see QA-pass references + full-corpus v7 list)

## Enhancement-research references (v10)

- `L:\tmp\pool-test.ts` — empirical Bun socket-pooling test (run 2026-08-01): A(keep-alive)=2 vs B(Connection:close)=0 ESTABLISHED after 20 clean-EOF SSE fetches
- Protocol sweep: `openai-chat.ts:449-457,478` (guarded — fix site 1), `bedrock-converse.ts:608-619` (guarded — fix site 2), `openai-responses.ts:861`, `anthropic-messages.ts:775`, `gemini.ts:387` (unconditional — compliant)
- F-D3 APIs: `session.ts:522,934` (`Session.removePart`), `revert.ts:125-128` (precedent), `processor.ts:91,160,328-344,465` (`reasoningMap` in-flight semantics), `:1043-1044` (`currentTextID` cleared on end)

## Deep-research-II references (v11)

- `L:\tmp\pool-test2.ts` — empirical round 2 (real Bun): node:http keep-alive=2 · Connection:close=0 · abort-mid-stream=0 ESTABLISHED
- Abort path: `processor.ts:191-192` (`parse = MessageV2.fromError`), `message-v2.ts:624-635` (AbortError → AbortedError)
- F-D3 event surface: `session.ts:939-943` (PartRemoved publish), `sync.tsx:507-521` (TUI part.removed handler)
- F2 idle: `processor.ts:1124,1141,1167` (idle on all exit paths)
- F5 caller: `snapshot/index.ts:303`

## Edit-plan references (v13)

- Current anchors re-read this pass: `event.ts:174-181` (SSE headers — EDIT 1), `spine-mapper.ts:1802-1803` (EDIT 2) + `:2283-2286` (no change needed), `turn-lifecycle.ts:79` (messageFinished — "unknown" already closes), `server.ts:211-214` (EDIT 3), `app.tsx:1746-1752` (EDIT 4) + `:2718-2726` (app.console command)
- F-D5 verified both platforms: `whatsapp.ts:156`, `discord.ts` (chunkWithHonestTail), `chunk.ts:9`

## F5 references (v14)

- **Code (all re-read this pass):** `packages/engine/src/snapshot/index.ts` — `:79` (gitdir formula), `:99-105` (git wrapper never throws), `:145-159` (stage + warning site), `:161` (`exists` = orDie), `:164` (`locked` semaphore — in-process only), `:241-304` (`add`; `stage` call `:303`), `:324-353` (`track`; write-tree `:347`), Interface `:47` (`track: () => Effect<string | undefined>`), `:767-772` (`forkScoped` precedent)
- **Consumers:** `processor.ts:148` (pre-capture), `:784` (step-start re-track on falsy), `:837`/`:1054` (patch skipped on falsy) — `undefined` contract already handled
- **Empirical:** `L:\tmp\lockprobe` (this session, real git) — held `index.lock` → `git add` exit 128, stderr `fatal: Unable to create '...index.lock': File exists.`; `git write-tree` also exit 128 under the same lock
- **Docs (re-read verbatim):** `daemon/pid-files.md:50` (lock-first detection), `:57-59` ("Never remove the file"; lock is truth); `daemon/respawn-managers.md:29-31` (bounded burst + backoff crash-loop guard)
- **Test harness:** `test/lib/effect.ts` (`it.instance`, TestClock `testEnv`, `pollWithTimeout` `:160`); `test/fixture/fixture.ts:9` (env-before-import isolation pattern), `:121-165` (`withTmpdirInstance({git:true})`); `fs-util.ts:52-54` (`existsSafe` catch pattern)

## Delta re-audit (v15, 2026-08-01) — HEAD moved, mechanism E discovered, F5 live-confirmed

Re-audit of the current tree against this document, per operator request. Method: git log/status forensics, commit diff read in full, targeted working-tree verification of every v13 edit site, new-commit tests executed (`bun test` 7 pass / 0 fail), opencode.log tail forensics.

### What changed since v14

**HEAD advanced `daa37e18` → `c07faba6`** ("fix: render complete streamed TUI messages", 2026-08-01 02:30:03 -0600, TUI-only: 10 files, +372/-40). This commit implements a fix that is NOT in this audit's manifest: **mechanism E**. The v13 edit plan (F4B, spine "unknown", F3 comment, Ctrl+O) is STILL NOT applied — every gap re-verified below.

| State | v14 (baseline) | v15 (now) |
|-------|---------------|-----------|
| HEAD | `daa37e18` | `c07faba6` (TUI-only, +1 commit) |
| Engine fixes F1/F3/F-D1/F-D2/F-D5 | uncommitted WT | still uncommitted WT (verified `M` on processor.ts, server.ts, event.ts, openai-chat.ts) |
| TUI fixes F2/F4A | uncommitted WT | still uncommitted WT (verified `M` on sync.tsx, sdk.tsx) |
| F4B `Connection: close` | MISSING | **still MISSING** (grep: no `Connection` in `packages/engine/src/server/`) |
| Spine `"unknown"` DEGRADED | MISSING | **still MISSING** (`spine-mapper.ts:1803` still `error \|\| content-filter` only) |
| F3 comment | stale | **still stale** (`server.ts:209-213` repeats the pre-v2 "half-open sockets accumulate" claim) |
| Ctrl+O binding | not applied | **still not applied** (no `key.name === "o"` in app.tsx) |
| Mechanism E | unknown | **confirmed + FIXED in HEAD** (new) |
| F5 evidence | lab reproduction only (`L:\tmp\lockprobe`) | **live-confirmed in opencode.log** (new) |

### Mechanism E — render-cache staleness (CONFIRMED, fixed in HEAD)

**The disease:** on a HEALTHY stream (no error, no gap, no storm), the TUI froze at the first streamed prefix while the durable store advanced. This is the exact visual signature of the 18:16 case (mechanism A row) and the "truncation" reports: DB complete, view frozen at a tiny prefix.

**Root cause (code-verified in c07faba6):**
1. `messagesToSpineEntriesCached` (`spine-mapper.ts:2293-2320`) cached entries keyed on `cached.message === message && cached.parts === parts` — **Solid store proxy identity**. Solid store proxies retain identity across in-place `produce` mutations, so `store.part[msgID]` returns the SAME proxy object even after the text inside it changed. The `===` cache check therefore ALWAYS hits → the entry built from the FIRST frame's truncated parts is served forever.
2. `command-spine-shell.tsx` rendered the keyed `<For>` child by CAPTURING the entry object at render time (`const e = entry()`), then passing `entry={e}` — a snapshot, not a live accessor. Even when the mapper produced fresh entries, the child held the stale object.
3. Delta path (`sync.tsx` `message.part.delta`) mutates part text in place via `produce` — identity-stable, revision-invisible.

**The fix (in HEAD):**
1. `sync.tsx`: per-message monotonic `part_revision` counter (`:116,159,238-239`), bumped on every mutation path: part upsert `:620,628,640`, delta `:683,701`, removal, full-sync merge `:1035,1200`, history catch-up `:1285,1337`; deleted on eviction/removed `:1008,1039,1205`.
2. `routes/session/index.tsx:1649` — `getPartRevision: (messageId) => sync.data.part_revision[messageId] ?? 0`, threaded through `ShellProps` (`types.ts:23`) → `command-spine-shell.tsx:181`.
3. `spine-mapper.ts:2282,2310,2334` — `partRevision` added to the cache key: `cached.partRevision === partRevision` now breaks the identity trap.
4. New `SpineEntryBinding` (`spine-entry-binding.tsx`, used at `command-spine-shell.tsx:701-717`): takes `getEntry: Accessor<SpineEntry | undefined>` and resolves the CURRENT object inside `<Show>` — no snapshot capture. The keyed `<For>` child stays mounted (stable id) while its entry object updates.

**Verification (this pass):** `bun test test/spine-entry-binding.test.tsx test/streaming-lifecycle.test.ts test/cli/cmd/tui/sync.test.tsx` → **7 pass / 0 fail**, including the new regression tests: "stable entry id renders the latest streamed entry object", "part revision invalidates a completed message cached with a truncated prefix", "part updates, deltas, and removals advance the message part revision".

**Audit consequence:** mechanism E explains a slice of the disease class WITHOUT any SSE/delivery/turn-end fault — the durable store was fine, the render cache lied. It is now fixed in HEAD. The v13/v14 claim that mechanism A's "repair paths never live-validated" stays true, but a new sub-mechanism (render-side) is closed. Open question 1 ("why did the retry's events never reach the TUI") gains a third candidate answer: the events may have ARRIVED and mutated the store, while the cache kept rendering the first prefix.

### F5 live-confirmed (was lab-only)

`opencode.log` (mtime 2026-08-01 04:57 local, 32MB, 1,164 total `stream error` lines) tail shows the F5 mechanism in PRODUCTION at 10:20-10:21 UTC today:
```
tracking hash=""  ... snapshot/<project>/<worktree>
failed to add snapshot files exitCode=128 stderr="fatal: Unable to create '.../index.lock': File exists..."
```
Repeated every 5-20s (`10:20:55, :57, :58, 10:21:07, :13, :14, :21, :49`), with `tracking hash=""` interleaved — the exact v14 F5 chain (index.lock contention → `git add` exit 128 → warning spam; `write-tree` also fails → `hash=""` baseline). Confirms the v14 spec's empirical claim on the real runtime, not just `L:\tmp\lockprobe`. F5 remains post-freeze backlog (fix not implemented, as planned).

### No new mechanism B

The last `stream error` line is `2026-08-01T02:23:25.316Z` — the SAME 02:23 case this audit documents. No new upstream free-tier `ResourceExhausted` since. The recurrence window is quiet, but mechanism B is only closed by F1+F2 (still uncommitted) + live validation, unchanged.

### v15 confidence

- Mechanism E fixed in HEAD with passing tests: **confirmed** (not design-guess). The render-side half of "store advanced, view frozen" is dead in HEAD.
- The two remaining v13 gaps (F4B, spine "unknown") are still open in the working tree; F1/F2 (the B-class closure) still uncommitted. **Overall readiness unchanged: ~97% pre-live; 100% gate = instrumented live validation (operator).**
- New v15 manifest rows: **F6 = mechanism E fix (IN HEAD, tests 7/7)**; F4B + spine "unknown" unchanged open.

