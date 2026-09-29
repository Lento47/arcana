---
tags: [arcana, testing, debugging]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# isolate failing test to detect fallout

Run a mysteriously-timing-out test alone to distinguish real failure from fallout of broken sibling tests

After fixing the caret tests, an unnamed ~36s hook timeout remained in `spine-visual-grammar.test.tsx`. Both its tests passed in isolation — the timeout was fallout from the broken caret tests leaving dangling provider instances in the shared run.

**Why:** Failed tests that mount providers without cleanup leak instances and time out unrelated tests, masking the true state of the suite.

**How to apply:** Before debugging an unexplained timeout in a batch run, run the file/test alone; if it passes solo, repair the leaking sibling tests and re-run the batch rather than changing the innocent test.
