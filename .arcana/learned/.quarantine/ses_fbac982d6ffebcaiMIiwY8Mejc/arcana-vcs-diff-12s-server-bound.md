---
tags: [arcana, engine, effect, vcs]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# arcana vcs diff 12s server bound

Engine Vcs.diff bounded at 12s to stay under TUI 15s race

**Why:** Server `Vcs.diff`/`diffRaw` could stall indefinitely on git filesystem; 12s `DIFF_TIMEOUT` (`packages/engine/src/project/vcs.ts:16`) guarantees server resolves before TUI's 15s `withDiffRequestTimeout` race, preventing daemon hang from appearing as indefinite freeze.

**How to apply:** Wrap Effect with `Effect.timeoutOrElse(Duration.seconds(12), () => Effect.die(new Error("VCS diff timed out")))`; verify typechecks and `bun test packages/engine/test/project/vcs.test.ts` stays green.
