---
tags: [engine, vcs, effect]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# vcs diff timeout 12s

engine/src/vcs.ts DIFF_TIMEOUT is 12s via Effect.timeoutOrElse + Effect.die

**Why:** /diff hang was server-side with no timeout. **How to apply:** Use `DIFF_TIMEOUT=Duration.seconds(12)` with `Effect.timeoutOrElse` + `Effect.die` in `engine/src/vcs.ts`; verified clean `engine` typecheck and `vcs.test.ts` 11 pass 1 skip with `effect 4.0.0-beta.74`.
