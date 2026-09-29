---
tags: [debugging, tui, arcana]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# assuming server timeout fixes indefinite freeze

Assuming 12s server Vcs.diff bound would fix >15s indefinite /diff freeze without checking client rendering

**Why:** Server fix correctly bounds git stalls but indefinite freeze (>15s TUI race) proves data already arrived; root cause was client unbounded <diff> rendering, not daemon restart or worker.js.

**How to apply:** Always verify fix by comparing freeze duration to timeout hierarchy and inspecting diff-viewer visiblePatchFiles/<For>/diff count before concluding server bound is definitive.
