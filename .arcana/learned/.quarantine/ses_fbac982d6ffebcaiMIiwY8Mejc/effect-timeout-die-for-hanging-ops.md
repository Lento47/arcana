---
tags: [effect, pattern, timeout]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# effect timeout die for hanging ops

Use Effect.timeoutOrElse + Effect.die to bound hanging external ops

**Why:** Guarantees hard failure instead of indefinite hang for VCS/git operations. **How to apply:** Wrap slow effect with `Effect.timeoutOrElse({ duration: Duration.seconds(12), orElse: () => Effect.die(...) })`; combine with result capping (e.g., 50 files) for diff.
