---
tags: [risk-engine, trading, bug-pattern]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# position counter needs symbol awareness

When enforcing max open positions, check per-symbol open status, not just the integer counter

The `max_open_positions` guard in `risk.py:75` checked `account.open_positions` (an integer) against the limit. After the first fill for a symbol, all subsequent signals for that *same* symbol were rejected because the counter incremented but the check didn't consider whether the order was for an already-open symbol.

**Why:** An integer position counter conflates "new position" with "adjusting an existing position." A position flip (close-then-open) on the same symbol shouldn't count as exceeding the max.

**How to apply:** When building position-limit guards, track which symbols are open (a set/dict), not just a count. An order for an already-open symbol is a modification or flip, not a new position against the limit.

Related: [[no-initial-stop-loss]] [[mt5-comment-length-limit]] [[cci-revert-trend-filter-blocking]] [[forgot-tp-on-demo-positions]] [[mt5-python-binding-comment-limit]] [[risk-max-open-positions-flip-bug]] [[atr-based-sl-with-fixed-rr-tp]] [[forgot-to-set-take-profit]] [[guard-bypasses-create-trend-fighting-positions]] [[mt5-python-comment-length-limit]] [[cci-reversion-trade-management]] [[sl-then-tp-sequence-mistake]] [[forgot-tp-when-setting-sl]] [[missing-take-profit-initially]] [[set-sl-and-tp-in-same-pass]] [[guard-bypass-for-testing]] [[atr-based-sl-tp-setting]] [[bypassing-trend-guards-causes-trend-fighting-losses]] [[omitted-take-profit-on-demo-positions]] [[demo-test-guard-bypass-for-execution-verification]] [[always-set-both-sl-and-tp]] [[only-set-sl-forgot-tp]] [[adx-trend-strength-filter]] [[trend-consistency-filter]] [[cci-recovery-filter]]
