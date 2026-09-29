---
tags: [effect, timeout, pattern]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# effect timeout or else die pattern

Use Effect.timeoutOrElse + Effect.die for hanging operations

Pattern: `Effect.timeoutOrElse` with `Duration.seconds(12)` falling back to `Effect.die` to kill hanging fiber, combined with input cap (50 files).

**Why:** Converts hang into defect for upstream handling while bounding work.

**How to apply:** Apply to any long-running Effect (VCS, network) where indefinite hang is unacceptable; pair timeout with input size limit.
