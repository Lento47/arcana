---
tags: [arcana, bun, testing, debugging]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# isolate cascading test timeouts

Failing tests that leave dangling instances cause unrelated timeouts — rerun the timed-out test alone before debugging it

An unnamed 36s hook timeout in `spine-visual-grammar.test.tsx` vanished when the file ran alone; both its tests passed in isolation. It was fallout from the broken caret tests leaving dangling instances in shared test infrastructure.

**Why:** Bun test preload and mount helpers can leak state between files, turning one real failure into several phantom ones.

**How to apply:** When a suite shows timeouts that don't reproduce in isolation, fix the known real failures first, then rerun the full targeted set before investigating the timeout.
