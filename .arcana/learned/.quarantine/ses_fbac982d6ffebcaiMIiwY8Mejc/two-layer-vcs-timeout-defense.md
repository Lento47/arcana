---
tags: [arcana, vcs, timeout, effect]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# two layer vcs timeout defense

Bound git stalls with server 12s Effect.timeout < client 15s AbortController race

**Why:** Git filesystem can hang indefinitely; single timeout fails if daemon not reloaded or GET has no transport timeout. **How to apply:** Add DIFF_TIMEOUT=12s in packages/engine/src/project/vcs.ts via Effect.timeoutOrElse, keep TUI withDiffRequestTimeout 15s race, verify with bun test vcs.test.ts (11 pass) and typecheck.
