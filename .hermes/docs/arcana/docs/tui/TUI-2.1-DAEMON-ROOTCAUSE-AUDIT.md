# TUI-2.1 Root-Cause Audit: Daemon Self-Destruct + Zombie Session

**Date:** 2026-07-31 (late)
**Branch:** phase-d-implementation
**Status:** AUDIT COMPLETE — fix plan P7-P9 proposed, awaiting approval
**Auditor:** Hermes (direct investigation, no delegation)

## Why this audit happened

User reported the QoS session (`ses_0456cba74ffe5Rjzx1aQoSHyHK`) still rendering
truncated ("Now I have a", "My response") with stuck `Working` verbs **after killing
and reopening the TUI**. Earlier "DB is always complete" claims did not survive this
case, so the full chain was re-verified end to end.

## Verified findings (code + live data)

### 1. The DB is complete for the QoS session
SQLite query on `~/.local/share/arcana/opencode-local.db`:
- `msg_fba9454e7001`: text part **7,774 chars**, complete; reasoning complete.
- `msg_fba950d5d001`: text **478 chars**, `finish=stop`, complete.
- Every tool part `state.status=completed`.
- Session finished normally at 17:49:28. The DB was never truncated.

### 2. REST serves complete data
Booted a fresh daemon, curled `GET /session/ses_0456cba74ffe5Rjzx1aQoSHyHK/message`
(`groups/session.ts:88`, plural path does not exist). Response: HTTP 200, all 8
messages, full text, completed tools. **A fresh TUI hydrating from REST gets everything.**

### 3. SSE replays nothing
`handlers/event.ts:59-75`: on connect the engine sends `server.connected` then only
**live** bus events + a 10s `server.heartbeat`. No persisted replay, no resume cursor.
A fresh TUI cannot receive stale partial state over SSE.

### 4. The TUI has no local persistence
No localStorage, IndexedDB, sessionStorage, or state file anywhere in
`packages/tui/src` (verified by search). The zombie state cannot survive a real
process kill inside the TUI.

### 5. ROOT CAUSE: the daemon self-destructs exactly 5 minutes after boot, always
`packages/engine/src/daemon/lifecycle.ts`:
- `:6` `IDLE_TIMEOUT_MS = 5 * 60 * 1000`
- `:52-59` `resetIdleTimer()` sets the timer at `startDaemon()` and calls `touchActivity`
- `:81-83` `resetActivity()` is **exported but NEVER CALLED anywhere in the codebase**
  (verified by repo-wide search: lifecycle.ts is the only file that defines or uses it)

Consequences, all confirmed:
- No HTTP request, no SSE connection, no heartbeat, no prompt resets the timer.
- **Every daemon dies at boot + 5:00, guaranteed**, even with the TUI connected.
- Observed today: boots 23:38:32 and 23:47:10 in `L:/tmp/arcana-daemon.log`; both
  died ~5 minutes later with zero trace lines. All day's deaths (16:03, 16:05, 16:46,
  17:18, 23:38, 23:47) fit the pattern.
- `daemon/entry.ts:32` arms this timer in the real daemon process. This is not a
  build staleness issue; the current code has it.

### 6. The failure cascade this produces
1. Daemon boots, user works.
2. At boot + 5:00 the daemon silently stops (`stopDaemon`, `removeLock`, exit).
3. The TUI's SSE socket dies. Old builds (pre-`ff1200b3`) hang half-open forever:
   first-delta text + stuck verbs persist in memory = the zombie.
4. Next prompt POST is refused: "Failed to send prompt / Unable to connect."
5. User restarts TUI/daemon. The fresh hydrate is complete (finding 2), but the
   cycle repeats in 5 minutes.

### 7. The zombie survives restart? Not through any current code path
Given findings 2-4, a fresh TUI + fresh daemon **cannot** render the truncated state.
The pasted zombie was rendered by the pre-watchdog build during a mid-stream death
and lived in that TUI's memory until the kill. Two open possibilities:
- The paste predates the kill (most likely), or
- The relaunched TUI loaded a stale dev bundle (engine restart required for
  `packages/tui` changes to take effect).

P1 live validation (kill daemon mid-turn on the CURRENT build) settles which one.
It was never run because every validation window was itself killed by the 5-minute
timer.

### 8. P4 crash capture does not cover the daemon process
`daemon/entry.ts:9-29` removes `index.ts`'s fatal handlers and installs its own
(console.error only). Idle stops log nothing. `uncaughtException` exits without
`removeLock` (this explains the stale lock with dead pid observed at 5:18 PM).
Deaths are invisible in `L:/tmp/arcana-daemon.log` (only `[boot]` lines appear).

## Fix plan

### P7 — Kill the idle self-destruct (root fix, engine)
`lifecycle.ts` + `server.ts`:
1. Reset the idle timer on **every HTTP request** (request middleware in
   `Server.listen`).
2. Reset on **SSE connect** and treat open SSE connections as presence: while at
   least one SSE client is connected, the idle timer is suspended entirely.
3. Reset on SSE disconnect (restart the 5-minute countdown when the last client
   leaves).
4. `stopDaemon` logs `[daemon] idle-stop` with uptime to the daemon log.
Result: TUI open = daemon alive. TUI closed + no traffic 5 min = clean stop
(battery-saver preserved). This is the definitive fix for the whole day's churn.

### P8 — Daemon death visibility (engine)
Move/duplicate `daemonLog` into `daemon/entry.ts`: log `[daemon] boot`, `[daemon]
idle-stop`, `[daemon] crash` (uncaughtException), `[daemon] signal` (SIGTERM/SIGINT)
with pid and stack to `L:/tmp/arcana-daemon.log`. Every future death is attributable.

### P9 — Live validation (was P1, now meaningful)
1. Fresh open of the QoS session on the current build: must render complete (kills
   the zombie class definitively or proves a remaining render bug).
2. Kill the daemon mid-turn: watchdog trips, reconnect, REST resync, heal within
   ~35s (half-open) or ~2s (clean drop).
3. Leave the TUI idle for 6+ minutes: daemon must stay alive (P7 proof).

### P5 (optional, polish)
"Reconnecting..." status-bar surface when the watchdog trips.

## Confidence assessment (asked by user)

| Fix | Confidence | Basis |
| --- | --- | --- |
| P7 idle self-destruct | **~95% definitive** | Deterministic root cause, code-verified, tiny surface, directly testable (6-min idle test) |
| Zombie cannot return on fresh open (current build) | **~90%** | REST complete + no persistence + no replay verified; residual 10% = stale bundle or unseen render path, settled by P9.1 |
| Full disease class dead after P7+P9 | **~85-90%** | Watchdog + resync + liveness merge + delta persistence already committed; P7 removes the event source; P8 makes any residual crash visible |
| Residual risk | low | Unknown hard-crash modes are now capturable (P8); PEP/approval lifecycle gaps are separate work, unrelated to this disease |

Honest correction: the earlier fixes (watchdog, resync, P2/P3) made the TUI
*respond correctly* to daemon death, but the daemon death itself was never fixed and
was never reproduced live. P7 is that fix.
