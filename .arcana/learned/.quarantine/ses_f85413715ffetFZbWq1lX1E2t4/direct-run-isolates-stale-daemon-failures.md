---
tags: [daemon, debugging, memory-tool, verification]
date: 2026-09-08
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# direct run isolates stale daemon failures

Run fixed code directly (bypassing the daemon) to prove disk code is fixed, then blame staleness for live failures

When a daemon-mediated tool call fails after a commit, invoke the fixed function directly (script/CLI) with the exact failing input. If the direct run succeeds while the daemon-mediated call fails, the code is fixed and the daemon is stale — no guessing.

**Why:** Separates 'code broken' from 'process stale' in one step, and gives live proof for status claims.

**How to apply:** Reproduce the failing call via direct execution of the fixed code path. Note: a follow-up `EBUSY` on temp-dir cleanup is Bun's SQLite WAL handle on Windows — harmless, already documented by the test suite's `freshStore()`. Then compare daemon boot time vs commit time and restart the daemon.
