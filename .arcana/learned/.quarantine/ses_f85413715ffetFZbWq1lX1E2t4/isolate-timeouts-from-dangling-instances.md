---
tags: [arcana, testing, debugging]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# isolate timeouts from dangling instances

Unexplained test timeouts may be cascade fallout from other failing tests leaving dangling instances — rerun isolated before debugging the timeout

An unnamed 36s hook timeout in `spine-visual-grammar.test.tsx` vanished once the broken caret tests were fixed; the target tests passed when run alone. The failing tests had left dangling instances polluting shared state. Similarly, a first-run 'unnamed 6th fail' flaked under compile load and was clean on isolated rerun.

**Why:** Debugging the timeout directly would have wasted effort — it was fallout from a different failure.

**How to apply:** On an unexplained timeout in a suite where other tests fail, fix or isolate the failing tests first; only investigate the timeout itself if it reproduces in isolation.
