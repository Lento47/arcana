---
tags: [testing, flaky-tests, workflow]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# rerun unexpected failures before regression hunt

When a test you didn't touch fails, re-run the suite once before investigating it as a regression

During verification, one unrelated caret-timing test failed in a suite of 1351. Re-running produced 0 failures — it was flakiness, not a regression caused by the change.

**Why:** Timing-sensitive tests fail intermittently; a single failure in code you never modified is more likely flakiness than breakage, and investigating it wastes time.

**How to apply:** On an unexpected failure, re-run the same suite first. If it passes, note the test as flaky and move on. Only investigate as a regression if it fails consistently.
