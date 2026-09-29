---
tags: [arcana, testing, mistake]
date: 2026-08-26
source: ses_fbfadaac9ffeOfVnNof9RXuVTm
---
# repo harness timeout on custom test

goal_check ran repo's full test harness (timed out 120s) instead of L:\tmp suite

After custom suite passed 30/30 via direct `node` run, a `goal_check` 'test' verification attempted the repo's full test harness which timed out at 120s — not the intended `L:\tmp` suite.

**Why:** Confused repo-level check with the custom verification already completed.

**How to apply:** When verifying custom temp-location suites, re-run the direct node/bun command as evidence; don't invoke repo-level test harness for non-repo code.
