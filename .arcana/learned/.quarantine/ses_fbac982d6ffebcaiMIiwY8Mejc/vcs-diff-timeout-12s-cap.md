---
tags: [vcs, effect, timeout]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# vcs diff timeout 12s cap

VCS diff hang fixed with 12s Effect timeout and 50-file cap

`vcs.ts` uses `DIFF_TIMEOUT=Duration.seconds(12)` via `Effect.timeoutOrElse` + `Effect.die` and 50-file cap; engine typecheck clean, `vcs.test.ts` 11 pass 1 skip.

**Why:** Unbounded diff on large repos hangs server/client indefinitely.

**How to apply:** Wrap diff Effect with 12s timeoutOrElse -> die and enforce max 50 files per diff operation.
