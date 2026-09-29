---
tags: [effect, timeout, pattern]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# effect timeout die pattern

Use Effect.timeoutOrElse + Effect.die for hard VCS timeout

**Why:** Prevents hanging promises from leaving unresolved effects. **How to apply:** Wrap VCS Effect with `Effect.timeoutOrElse({ duration: Duration.seconds(12), onTimeout: () => Effect.die(...) })` as done in `vcs.ts` for DIFF.
