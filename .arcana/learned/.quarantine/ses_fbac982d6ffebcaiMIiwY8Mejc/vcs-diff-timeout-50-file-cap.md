---
tags: [effect, vcs, reliability]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# vcs diff timeout 50 file cap

VCS diff hang fixed with 12s Effect timeout and 50-file cap

**Why:** Prevents server/client hang on large diffs. **How to apply:** In `vcs.ts` set `DIFF_TIMEOUT=Duration.seconds(12)` using `Effect.timeoutOrElse` + `Effect.die`; cap diff to 50 files; verify `engine` typecheck clean and `vcs.test.ts` 11 pass 1 skip.
