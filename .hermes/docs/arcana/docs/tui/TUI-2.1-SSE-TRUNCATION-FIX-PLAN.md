# TUI-2.1 — SSE Truncation & Stuck-Verbs Fix Plan

**Date:** 2026-07-31
**Branch:** phase-d-implementation
**Status:** P2/P3/P4 IMPLEMENTED (committed) — P1 live validation + P5 pending

---

## 1. Symptom (two incidents)

| | 4:41 PM | 5:16 PM |
|---|---|---|
| UI final text | `The \`` (3 chars) | `The push was` (12 chars) |
| DB final text | 303 chars, `finish: "stop"` | 110 chars, `finish: "stop"` (all 3 msgs complete) |
| Verbs | Thinking/Working stuck | Thinking/Working stuck |
| Daemon | died silently (half-open socket, TIME_WAIT) | **restarted mid-turn** (lock 17:18:02.672; msg 3-4 finished 17:18:08-11 by the new daemon) |

Both: the DB is the ground truth and is COMPLETE. The TUI never received the tail.

## 2. Mechanism chain (code-verified)

1. **Engine streams text as deltas.** `text-delta` accumulates into `ctx.currentText.text` and publishes `message.part.delta` with only the delta — `packages/engine/src/session/processor.ts:858-884` → `session.emitPartDelta` → `packages/engine/src/session/session.ts:947-956` (`MessageV2.Event.PartDelta`).
2. **Deltas are NOT persisted.** The projector projects only `PartUpdated` (full part) — `packages/core/src/session/projector.ts:314-332`. The DB gets text at `text-end` only (processor.ts:886+ → `session.updatePart` → `message.part.updated`).
3. **TUI appends deltas.** `message.part.delta` handler: `packages/tui/src/context/sync.tsx:409-426` (`(existing ?? "") + delta`). Full-part replacement on `message.part.updated`: sync.tsx:388-406.
4. **Connection drop mid-stream → prefix only.** The TUI has the last COMPLETE delta event; the tail is lost. The SSE parser discards a partial event at EOF (comment at `packages/tui/src/context/sdk.tsx:200-204`; parse loop `packages/sdk/js/src/v2/gen/core/serverSentEvents.gen.ts`).
5. **Verbs are downstream.** `Thinking`/`Working` render from part/message state (spine-node.tsx:165 `streaming() ? "Thinking" : "Thought"`; spine-receipt.tsx pending states). The completion events (`reasoning-end`, `text-end`, `message.updated` with `time.completed`) never arrived → verbs never flip. The spine contract (docs/architecture/command-spine-ui.md): the TUI observes, never invents.

## 3. Heal path (exists, incomplete)

- Reconnect → synthetic `sse.reconnected` (sdk.tsx:205-214) → session route resync (routes/session/index.tsx:639-642) → `sync.session.resync` → REST re-hydration replaces parts (sync.tsx:711-762, `return [part]` at :749 for untracked parts).
- Round 2 fixes (ff1200b3): heartbeat watchdog (30s) for half-open deaths + on-view resume resync. **Not yet validated live; TUI dev server may still run pre-fix code.**

## 4. Remaining gaps

**GAP-1 — Resync race (sync.tsx:737-750).** Parts touched by live deltas during an in-flight hydration are kept local (`tracker.parts.has(part.id) → return current`). If the connection dies inside that window, the prefix sticks until the NEXT resync. The guard exists to avoid clobbering live streams, but it has no liveness check.

**GAP-2 — Delta durability (projector.ts:314).** A daemon death BEFORE `text-end` leaves the DB itself with only the prefix. No resync can heal it — permanent truncation. (Both observed incidents had complete DBs because the daemon survived to text-end; this is the next incident waiting.)

**GAP-3 — Daemon instability.** 5+ deaths/restarts today, including a mid-turn restart at 17:18:02. No crash output captured anywhere. OpenTUI lifecycle doc: nothing auto-cleansup on unhandled errors — the daemon needs its own capture.

**GAP-4 — Heal latency.** Half-open death → 30s watchdog window before reconnect. Users see truncation for 30+s. Clean drops (FIN/RST) heal in ~1-2s via the existing reconnect; half-open is the slow path.

## 5. Fix plan

### P1 — Validate the Round 2 heal live (prereq)
- Restart `dev:tui` (loads ff1200b3 + 044ebdcb; dev server caches transpiled modules).
- Controlled repro: start a long turn → kill daemon → expect heal ≤ ~35s (half-open) or ~2s (clean).
- Deliverable: PASS/FAIL checkpoint in TUI-2.1-MANUAL-SMOKE-TEST.md Phase 10.3.

### P2 — Liveness-aware resync merge (closes GAP-1)
- **File:** `packages/tui/src/context/sync.tsx:737-750`.
- Extract the merge decision into a predicate; keep-local only when the part is actively streaming:
  - Track `lastDeltaAt: Map<partID, number>` (update in the `message.part.delta` handler, sync.tsx:409).
  - Keep local iff `tracker.parts.has(part.id) && (now - lastDeltaAt.get(part.id)) < SSE_SILENT_DEATH_MS`.
  - SSE silent (or never delta'd recently) → take the REST version (`return [part]`).
- Reuses `SSE_SILENT_DEATH_MS` from sdk.tsx (already exported).
- Tests: unit-test the predicate (tracked+live → local; tracked+silent → REST; untracked → REST).

### P3 — Throttled delta persistence (closes GAP-2)
- **File:** `packages/engine/src/session/processor.ts:858-884` (text-delta case; mirror for reasoning-delta at :450-473).
- Persist the growing part via `session.updatePart(ctx.currentText)` throttled: every 500ms and/or every 64 deltas, plus always at `text-end`. `updatePart` already upserts full parts (projector.ts:320-326) and publishes `message.part.updated` (session.ts:705-713) — the TUI's full-part replacement (sync.tsx:388-406) then heals missed deltas even mid-stream.
- Cost: one DB upsert + one small SSE event per flush — negligible at 2 flushes/sec.
- Tests: engine test — stream N deltas, assert DB part text catches up before `text-end` (no text-end → flushed prefix present).

### P4 — Daemon crash capture (closes GAP-3)
- **File:** engine entry (`packages/engine/src/index.ts` or the dev script).
- Run daemon with stderr appended to `L:/tmp/arcana-daemon.log` (precedent: `packages/engine/src/session/prompt.ts:682` writes `L:/tmp/arcana-ollama.log`).
- Add process-level handlers: `uncaughtException` / `unhandledRejection` → append stack + timestamp → rethrow/exit with code. Also log `server.instance.disposed` and the daemon's own start/stop lines (pid, boot time) so the lock file (`.session-lock`) timeline can be correlated.
- Deliverable: next death produces a trace. Investigation of the death itself is then a separate task.

### P5 — Visible heal feedback (polish, GAP-4 partial)
- **File:** `packages/tui/src/context/sdk.tsx` (watchdog trip) + a status surface (status bar / spine hint).
- When the watchdog trips (or a reconnect is scheduled), surface "Reconnecting…" / "Healing…" so a 30s silent heal is not read as a hang. Per AI SDK resume-streams doc, reconnection is expected behavior; the UI should reflect it.
- Optional; not a correctness fix.

### P6 — Full regression
- TUI suite (453/1/0 baseline), core suite, engine capability suite (571/14 baseline), engine typecheck (now clean).
- Manual smoke: TUI-2.1-MANUAL-SMOKE-TEST.md Phase 10.3/10.4 + the controlled kill-repro.

## 6. Out of scope (post-freeze candidates)

- Full AI SDK resumable-stream pattern (Redis/persisted SSE + GET replay endpoint) — heavy, correct long-term answer for GAP-2/GAP-4.
- Investigating the daemon death root cause (needs P4 data first).

## 7. Suggested order

1. P1 validation (needs TUI + daemon running)
2. P2 + tests (TUI-side, ~40 lines)
3. P3 + tests (engine-side, ~20 lines)
4. P4 (crash capture)
5. P5 (polish, optional)
6. P6 full regression → commit → docs (fix log Round 3)
