---
tags: [trading-mistake, risk-management, testing]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# bypassing entry filters

Disabling trend filters resulted in trades against the market trend, causing losses.

**Why:** In testing, filters were bypassed for convenience, but this led to opening positions in unfavorable conditions.
**How to apply:** Always ensure filters are active during live trading; if bypassing for testing, close positions promptly after.

Related: [[max-open-positions-flip-bug]] [[ts-harness-audit-validation]] [[missing-filterresults-unit-tests]] [[no-end-to-end-pipeline-test]] [[verify-refactoring-with-checks]]
