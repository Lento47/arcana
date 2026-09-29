---
tags: [vcs, effect, server]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# vcs diff timeout and file cap

VCS diff hang fixed with 12s timeout and 50-file cap

**Why:** Server/client `vcs diff` could hang indefinitely and block UI.
**How to apply:** In `vcs.ts` set `DIFF_TIMEOUT=Duration.seconds(12)` via `Effect.timeoutOrElse` + `Effect.die`, cap diff to 50 files; verify `engine` typecheck clean and `vcs.test.ts` 11 pass 1 skip.
