---
tags: [engine, effect, vcs]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# engine vcs diff timeout defect

Engine VCS diff uses 12s Effect.timeoutOrElse + Effect.die to surface timeout as defect

**Why:** Prevents server diff freeze from hanging indefinitely while keeping timed-out diffs visible as defects instead of silent failures.

**How to apply:** In `packages/engine/src/project/vcs.ts:16` define `DIFF_TIMEOUT=Duration.seconds(12)` and wrap diff Effects at call sites 401/421 with `Effect.timeoutOrElse` + `Effect.die`. Verify with `vcs.test.ts` (11 pass 1 skip) and `engine` typecheck.
