---
tags: [session, concurrency, safety, filesystem]
date: 2026-06-21
source: session-hardening-15-failure-modes
---

# Session Lock — Concurrent Session Protection

**Rule:** Only one Arcana session can be active in a project directory at a time. A PID-based lock file prevents silent file corruption from concurrent sessions.

**Scope:** `packages/engine/src/session/session-lock.ts` — new module (283 lines). Integration in `session/session.ts` `create()` method.

**Reason:** Two Arcana sessions running simultaneously in the same directory can race on file writes, corrupt the knowledge base, and produce conflicting edits. This is a real risk for power users who open multiple terminals.

## Lock File

`.arcana/.session-lock` — JSON file:
```json
{
  "pid": 12345,
  "timestamp": 1719000000000,
  "sessionId": "abc123"
}
```

## Lock States

| State | Condition | Action |
|---|---|---|
| `free` | No lock file exists | Proceed, create lock |
| `stale_dead` | PID not alive | Clean stale lock, proceed |
| `stale_old` | Lock > 24h old | Clean stale lock, proceed |
| `active` | PID alive, lock fresh | Warn user: "Another arcana session is active (PID X). Concurrent sessions may conflict." |

## Lifecycle

- **Acquire:** `acquireLock(directory)` — called on session start. Checks existing lock, cleans stale ones, warns on active, writes new lock.
- **Release:** `releaseLock()` — called on session end. Only deletes if lock belongs to current PID.
- **Shutdown:** `process.on("exit")` handler auto-cleans acquired lock on crash or SIGTERM.

## History

- 2026-06-21: Implemented as failure mode #13. New module `session/session-lock.ts`.

## Related

- [[run-budgets]] — Budget-level protection against runaway sessions
- [[ghost-preview-system]] — Plan state machine handles mid-run interruption
