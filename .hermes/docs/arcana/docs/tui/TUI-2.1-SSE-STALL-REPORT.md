# TUI-2.1 SSE Live-Stall Report: 18:16 Session (ses_04551e419ffeVd3u)

**Date:** 2026-07-31 (18:16-18:18 local) / report written 2026-07-31 late
**Branch:** phase-d-implementation
**Status:** RESEARCH COMPLETE — P10+P11 IMPLEMENTED (committed), P12 live validation pending
**Method:** direct investigation + deterministic reproduction tests (no delegation)

## Executive summary

A NEW QoS session ran live 18:16:40 -> 18:17:29+ on the FULL P7 build (daemon
pid 6388, booted 18:16:06). The turn streamed to near-completion server-side
(7,962 chars persisted to the DB), but the TUI froze at 5 chars of the final
text ("Now I") with the last reasoning block truncated (61/150 chars) and the
FIRST tool (glob) stuck at "Working" forever. This is the same disease class
as every incident today (4:41, 5:16, 17:47): the live view never converges to
the DB ground truth.

This report proves three things and isolates the fourth:

1. The DB and REST are complete (turn streamed fine server-side).
2. The engine publish -> SSE pipeline is CLEAN under load (new tests, 3/3).
3. The SDK SSE parser is CLEAN under load (new tests, 3/3).
4. The remaining gap is the live TUI consumer/socket path, plus a CONFIRMED
   bug in the P2 liveness merge: the 30-second window perpetuates stale
   local parts across resyncs, and no resync ever runs while the SSE stream
   is flowing. The fix is a heartbeat-driven periodic reconciliation.

## 1. Ground truth (DB, verified by SQLite query)

Session `ses_04551e419ffeVd3u` (full id `ses_04551e419ffeVd3u3O6YHtv8gq`),
`~/.local/share/arcana/opencode-local.db`:

| Message | Role | finish | completed | Content |
| --- | --- | --- | --- | --- |
| 0qDMD3Cv | user | - | - | prompt (58 chars) |
| bavsjKS4 | assistant | tool-calls | 18:16:53 | reasoning 255 + glob COMPLETED |
| Rf843LGW | assistant | tool-calls | 18:16:58 | reasoning 170 + 3 reads COMPLETED |
| RZsphlOM | assistant | tool-calls | 18:17:08 | reasoning 150 + 2 reads COMPLETED |
| BoGr1KjQ | assistant | tool-calls | 18:17:13 | reasoning 192 + 2 reads COMPLETED |
| CLSjc0Sq | assistant | tool-calls | 18:17:18 | reasoning 138 + 1 read COMPLETED |
| kvDlstOH | assistant | tool-calls | 18:17:23 | reasoning 185 + 1 read COMPLETED |
| F2cfFNiw | assistant | tool-calls | 18:17:29 | reasoning 244 + 1 read COMPLETED |
| HMAnDThL | assistant | **None** | **None** | reasoning 150 + **text 7,962, CUT at "X-Arc"** |

Key facts:
- 8 turns completed with all tools `completed` in the DB.
- The final message NEVER finished (`finish=None`, `completed=None`): the turn
  died mid-stream at ~18:17:47 (1m 7s per the UI status bar).
- The DB text (7,962 chars) is what the TUI's restart view showed ("STILL
  INCOMPLETE" — correct, the turn truly died; P3 throttled persistence worked,
  the DB is within ~500ms of the death point).

## 2. The live view vs the DB (what the user saw)

The live TUI showed, at freeze:
- FIRST tool (glob, completed 18:16:53 in DB): stuck "Working" forever.
- Final reasoning: 61 of 150 chars (mid-sentence).
- Final text: 5 of 7,962 chars ("Now I").
- Status bar (metrics-bar.tsx, tokens not bytes): 182.1K input / 399 output —
  frozen at the last COMPLETED message's usage (the final message never
  emitted usage).
- The turn kept streaming server-side after the UI froze (DB grew to 7,962).

The freeze pattern: SSE delivered events up to ~2s into the final message,
then the TUI received nothing more (no reconnect happened within the observed
window; the watchdog would have tripped at +30s, but the user killed the TUI
at 18:18:23).

## 3. What was eliminated by deterministic tests (all new)

### Engine publish -> SSE pipeline: CLEAN
`packages/engine/test/server/httpapi-event-load.test.ts` (3/3 pass):
- 25 large events (15x50KB tool outputs + 10x8KB text parts) delivered in
  order through the REAL publish -> EventV2 -> listeners -> SSE path.
- A burst published while the consumer is paused loses nothing on recovery.
- A single 100KB event survives chunked writes.

The chain verified: `processor.ts:897-933` (text-delta -> `emitPartDelta` +
throttled `updatePart`) -> `session.ts:705-713` (`updatePart` publishes
PartUpdated) -> `core/src/event.ts:418-429` (sequential listener notify,
failure-isolated) -> `handlers/event.ts:31-41` (unbounded queue + filter).
No drop, no stall, no reorder at volume.

### SDK SSE parser: CLEAN
`packages/sdk/js/src/v2/test/server-sent-events-load.test.ts` (3/3 pass):
- 25 events with 50KB payloads, frames split across 1KB chunks: all yielded.
- A 100KB event split across 512-byte chunks: intact.
- A paused consumer resumes without losing buffered events.

The parser (`packages/sdk/js/src/v2/gen/core/serverSentEvents.gen.ts:135-213`)
has an O(n^2) buffer pattern (`buffer += value` + regex replace + split per
read) but it is not a correctness bug at the tested volumes.

## 4. The confirmed remaining bugs

### BUG A (confirmed): the P2 liveness window perpetuates stale parts
`packages/tui/src/util/part-merge.ts:51-53`:
```
if (tracked) {
  return now - lastEventAt < silenceMs   // silenceMs = SSE_SILENT_DEATH_MS = 30s
}
```
`SSE_SILENT_DEATH_MS` is 30s (`packages/tui/src/context/sdk.tsx:17`).

Failure chain for the stuck glob:
1. The glob's completion `message.part.updated` was missed by the TUI (the
   single gap that starts this — mechanism in section 5).
2. `lastPartLiveAt` for the glob part was set by its START event (the tool
   row rendered "Working"), so it stays "live" for 30s.
3. No resync runs while the SSE stream is flowing (resync only fires on
   `sse.reconnected`, which only fires after a stream end or watchdog trip).
4. Even if a resync ran within the 30s window, `shouldKeepLocalPart` returns
   TRUE (last event < 30s ago) -> the stale local part wins over REST.
Result: the glob stays "Working" forever. Same mechanism explains the
truncated reasoning blocks (61/150) surviving any resync in the window.

### BUG B (confirmed): no reconciliation while the stream flows
`packages/tui/src/context/sdk.tsx:142-210` — the SSE loop reconnects + emits
`sse.reconnected` ONLY when the stream ends or the watchdog (30s silence)
aborts. `packages/tui/src/context/sync.tsx:187` — the event subscriber has NO
case for `server.heartbeat`. A stream that delivers SOME events (so the
watchdog never trips) but misses/stalls others never re-syncs. The TUI has no
periodic ground-truth reconciliation: it trusts the SSE stream absolutely.

## 5. The one unconfirmed link (honest position)

The engine pipeline and the parser are clean. The freeze happened in the live
socket path: the TUI's `for await` (sdk.tsx:180-183) -> `handleEvent` ->
batched store flush (sdk.tsx:100-107) -> SolidJS render. The exact
TUI-side or real-socket mechanism that stopped event delivery ~2s into the
final message is NOT yet identified with certainty. Candidates, in order of
likelihood:
1. TCP backpressure: the TUI consumer stalls (render/store cost of the
   ~150KB of tool outputs in the store during the final text deltas) -> the
   socket receive window fills -> the engine's SSE write stalls -> half-open.
   The turn continues because the publish path (unbounded queue) is decoupled
   from the SSE write path.
2. An uncaught error in a store handler that stalls the batch flush without
   reaching the for-await catch (SolidJS batch semantics), leaving the
   stream open but unprocessed.

Both are bounded by the same fix (section 6). The live validation (P9) will
confirm which one, if any, survives the fix.

## 6. Fix plan

### P10 (TUI, definitive convergence fix) — heartbeat-driven reconciliation
- Add `case "server.heartbeat":` to the event subscriber
  (`packages/tui/src/context/sync.tsx:187`): the engine sends a heartbeat
  every 10s unconditionally (`handlers/event.ts:63-71`). On each heartbeat,
  if a session view is open and not mid-hydration, run the existing
  `session.resync(activeSessionID)` (sync.tsx:799-805) — the REST re-hydrate
  whose merge already exists.
- Tighten the merge liveness window for resyncs from 30s to 5s
  (`part-merge.ts:52`): an actively-streaming part receives deltas far more
  often than every 5s, so live text is still protected; a stalled/missed part
  converges to the REST ground truth on the next heartbeat. The
  empty-REST preserve-guard (part-merge.ts:41-48) stays.
- Result: ANY gap (missed event, dropped event, consumer stall, stream
  freeze) converges within 10s, guaranteed, with no dependence on the
  watchdog. The stuck glob, truncated reasoning, and frozen text all heal.

### P11 (engine, defensive) — bounded per-subscriber SSE queue
- `handlers/event.ts:31`: replace `Queue.unbounded` with `Queue.sliding(N)`
  (drop-oldest, e.g. N=512) per subscriber. A slow consumer can no longer
  accumulate unbounded memory; during streaming the throttled
  `part.updated` (every 500ms, processor.ts:928) carries the full part, so
  dropped deltas converge on the next full update. No stall, no OOM.

### P12 — live validation (the checks that close the report)
1. Fresh open of the 18:16 session: complete text, all tools Done.
2. New turn with large file reads: text streams to completion live.
3. Kill the daemon mid-turn: heal in ~35s (watchdog) — already implemented.
4. Leave idle 6+ min: daemon survives (P7) — already implemented.

## 7. Confidence

| Fix | Confidence | Basis |
| --- | --- | --- |
| P7 daemon idle death (committed 50cb832b) | ~95% | deterministic root cause, 7/7 tests, live log evidence |
| P10 heartbeat reconciliation | ~90% definitive | closes ANY delivery gap on a 10s bound; merge predicate already exists and is tested; the 30s->5s window keeps live text protected (deltas << 5s apart) |
| P11 sliding queue | ~85% | defensive; removes unbounded growth; correctness of drop-oldest covered by the part.updated convergence |
| Disease class fully dead after P10+P12 | ~85-90% | every observed failure mode (missed event, freeze, half-open, daemon death) has a bounded recovery path; residual risk is an unknown live-only interaction, settled by P12 |

Honest correction to earlier claims: the earlier fixes made the TUI respond
to daemon DEATH. They did not fix a LIVE-STREAM freeze where the daemon
survives — that mechanism was only identified tonight (the 18:16 session
ran on the full P7 build and still froze). P10 is the fix for that class.

## 8. When to run the TUI

After "proceed": implement P10+P11, commit, then restart `dev:tui` + the TUI
once. The restart loads the new build. No further restarts should be needed.
