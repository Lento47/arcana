---
tags: [risk-management, trading, oversight]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# no initial stop loss

Trades were executed without setting a stop loss, requiring post-execution adjustment.

Upon checking the positions, SL and TP were both 0. A stop loss was then set based on ATR. **Why:** Not having a stop loss exposes the position to unlimited risk, which is poor risk management. **How to apply:** Always set a stop loss when opening a trade, using a method like ATR or fixed points, as part of the entry logic or immediately after fill.

Related: [[atr-based-stop-loss-take-profit]] [[max-open-positions-flip-correction]] [[position-flip-in-max-positions]] [[atr-based-sl-with-rr-tp]] [[forgot-to-set-tp-with-sl]] [[risk-max-open-positions-flip-bug]] [[mt5-comment-length-limit]] [[cci-revert-trend-filter-blocking]] [[forgot-tp-on-demo-positions]] [[mt5-python-binding-comment-limit]] [[atr-based-sl-with-fixed-rr-tp]] [[forgot-to-set-take-profit]] [[guard-bypasses-create-trend-fighting-positions]] [[mt5-python-comment-length-limit]] [[cci-reversion-trade-management]] [[sl-then-tp-sequence-mistake]] [[forgot-tp-when-setting-sl]] [[risk-py-max-open-positions-flip]] [[atr-based-stop-loss-and-rr-take-profit]] [[missing-take-profit-initially]] [[set-sl-and-tp-in-same-pass]] [[guard-bypass-for-testing]] [[atr-based-sl-tp-setting]] [[risk-management-position-flip-bug]] [[bypassing-trend-guards-causes-trend-fighting-losses]] [[omitted-take-profit-on-demo-positions]] [[demo-test-guard-bypass-for-execution-verification]] [[always-set-both-sl-and-tp]] [[only-set-sl-forgot-tp]] [[risk-max-open-positions-off-by-one]] [[max-open-positions-flip-bug]] [[adx-trend-strength-filter]] [[trend-consistency-filter]] [[cci-recovery-filter]] [[multi-factor-entry-gate]] [[bypassing-entry-filters]]
