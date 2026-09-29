---
tags: [trading, risk-management, bug, python]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# risk max open positions flip bug

max_open_positions check can block position flips if it counts both sides as separate positions

In `risk.py:75`, the `max_open_positions` guard was counting open positions in a way that blocked position flips (e.g., closing a SELL and opening a BUY). A position flip should be allowed even when at max positions since net exposure decreases.

**Why:** The check was counting the new direction as a separate position before accounting for the close of the old one.

**How to apply:** When checking max_open_positions, account for positions that will be closed by the incoming order. A flip (close + open in opposite direction) should not be blocked.

Related: [[mt5-python-comment-length-limit]] [[cci-reversion-trade-management]] [[sl-then-tp-sequence-mistake]] [[forgot-tp-when-setting-sl]] [[mt5-comment-length-limit]] [[risk-py-max-open-positions-flip]] [[atr-based-stop-loss-and-rr-take-profit]] [[missing-take-profit-initially]] [[mt5-comment-max-29-chars]] [[set-sl-and-tp-in-same-pass]] [[guard-bypass-for-testing]] [[forgot-tp-on-demo-positions]] [[atr-based-sl-tp-setting]] [[mt5-comment-length-bug]] [[risk-management-position-flip-bug]] [[mt5-python-binding-comment-length-limit]] [[bypassing-trend-guards-causes-trend-fighting-losses]] [[omitted-take-profit-on-demo-positions]] [[mt5-python-binding-comment-limit]] [[demo-test-guard-bypass-for-execution-verification]] [[always-set-both-sl-and-tp]] [[only-set-sl-forgot-tp]] [[mt5-comment-length-limit-29-chars]] [[risk-max-open-positions-off-by-one]] [[max-open-positions-flip-bug]] [[adx-trend-strength-filter]] [[trend-consistency-filter]] [[cci-recovery-filter]] [[multi-factor-entry-gate]] [[bypassing-entry-filters]] [[domain-verification-catch-22]]
