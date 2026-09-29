---
tags: [effect, pattern, reliability]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# effect timeout or else die defect

Use Effect.timeoutOrElse + Effect.die to convert timeouts into defects

**Why:** Allows long-running Effects like VCS diff to fail fast after deadline while preserving observability as defect rather than swallowed error.

**How to apply:** Wrap Effect with `Effect.timeoutOrElse({ duration: DIFF_TIMEOUT, onTimeout: () => Effect.die(new TimeoutError()) })` instead of returning fallback value.
