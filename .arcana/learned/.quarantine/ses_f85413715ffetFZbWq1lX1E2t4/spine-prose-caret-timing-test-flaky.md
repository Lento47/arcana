---
tags: [tui, testing, flaky-test, spine-prose]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# spine prose caret timing test flaky

The caret blink-interval test in spine-prose (622ms timing) is flaky and fails intermittently

The caret timing test in spine-prose is timing-sensitive and failed once during a run where the change (optional chaining guards) never touched spine-prose. A second run passed: 0 failures, 1351 passing.

**Why:** Prevents wasted time chasing phantom regressions from a known-flaky test.

**How to apply:** If this test fails, re-run the suite before investigating. Don't treat a single failure as a regression unless your change plausibly affects caret/blink timing.
