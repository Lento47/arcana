---
tags: [engine, vcs, diff]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# diff hang timeout fix

/diff hang fixed with 12s server timeout and 50-file client window

**Why:** `/diff` hung indefinitely on large repos; needed bounded server execution and bounded client rendering.

**How to apply:** Server `engine/src/vcs.ts` uses `DIFF_TIMEOUT=Duration.seconds(12)` with `Effect.timeoutOrElse` + `Effect.die`; client limits to `MAX_VISIBLE_FILES=50`. Verified `engine vcs.test.ts` 11 pass 1 skip, `tui` 1318 pass, `engine` typecheck clean.
