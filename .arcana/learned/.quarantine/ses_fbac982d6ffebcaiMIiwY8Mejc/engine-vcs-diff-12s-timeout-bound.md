---
tags: [arcana, engine, effect]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# engine vcs diff 12s timeout bound

Engine Vcs.diff/diffRaw bounded at 12s via Effect.timeoutOrElse (DIFF_TIMEOUT < 15s TUI race)

**Why:** Prevents git filesystem stalls from hanging daemon; must be shorter than TUI withDiffRequestTimeout 15s AbortController race so server error surfaces as "Failed to load diff" instead of indefinite hang. Verified loaded, typechecks clean except tmp-probe-server.ts, bun test packages/engine/test/project/vcs.test.ts 11 pass 1 skip.

**How to apply:** In packages/engine/src/project/vcs.ts define DIFF_TIMEOUT = Duration.seconds(12) and wrap Vcs.diff/diffRaw with Effect.timeoutOrElse(..., () => Effect.die(new Error("VCS diff timed out"))).
