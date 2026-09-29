---
tags: [tui, testing, flaky-tests]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# caret blink timing flake

Flaky spine-prose caret test: the old 500ms blink could blank the caret mid-pump during ~622ms test runs; a never-blank caret eliminates this flake class

The spine-prose caret timing test is flaky by construction: the old caret blinked on a 500ms interval, so a blank could land mid-pump during a ~622ms test run, failing the glyph assertion. Second suite run: 0 failures / 1351 pass, confirming flake rather than regression.

**Why:** Interval-based on/off animations create timing windows where tests observe the 'off' state.

**How to apply:** When triaging a single unexpected post-change failure, re-run the suite once before investigating. To eliminate the flake class, prefer animations that never blank (constant-width cycling glyphs — no layout shift, no blank frame).
