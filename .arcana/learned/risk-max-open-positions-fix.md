---
tags: [freeconomics, risk-management, python, trading]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# risk max open positions fix

Fixed max_open_positions rejection in risk.py by considering already-open symbols.

The risk engine at `risk.py:75` incorrectly blocked new orders for symbols that were already open, as it checked a simple integer counter `account.open_positions` against `max_open_positions` without accounting for position flips or duplicates.

**Why:** This limited strategy flexibility, causing strategies like ma_cross to be constrained after the first fill, preventing profitable position changes.

**How to apply:** In risk management logic for trading systems, ensure that position limits are checked per symbol or adjust counts to allow orders for already-open symbols without incrementing the open position counter unnecessarily.

Related: [[position-counter-needs-symbol-awareness]] [[goal-check-ran-wrong-test-suite]] [[mt5-comment-length-limit]] [[risk-max-open-positions-flip]] [[atr-based-stop-loss-2x]] [[no-initial-stop-loss]] [[metatrader5-comment-length-limit]] [[atr-based-stop-loss-take-profit]] [[max-open-positions-flip-correction]] [[comment-slice-off-by-one-error]] [[position-flip-in-max-positions]] [[cci-reversion-strategy-exit-mechanism]] [[atr-based-sl-with-rr-tp]] [[forgot-to-set-tp-with-sl]] [[risk-max-open-positions-flip-bug]] [[cci-revert-trend-filter-blocking]] [[forgot-tp-on-demo-positions]] [[mt5-python-binding-comment-limit]] [[atr-based-sl-with-fixed-rr-tp]] [[forgot-to-set-take-profit]] [[guard-bypasses-create-trend-fighting-positions]] [[mt5-python-comment-length-limit]] [[cci-reversion-trade-management]] [[sl-then-tp-sequence-mistake]] [[forgot-tp-when-setting-sl]] [[risk-py-max-open-positions-flip]] [[atr-based-stop-loss-and-rr-take-profit]] [[missing-take-profit-initially]] [[set-sl-and-tp-in-same-pass]] [[guard-bypass-for-testing]] [[atr-based-sl-tp-setting]] [[mt5-comment-length-bug]] [[risk-management-position-flip-bug]] [[mt5-python-binding-comment-length-limit]] [[bypassing-trend-guards-causes-trend-fighting-losses]] [[omitted-take-profit-on-demo-positions]] [[demo-test-guard-bypass-for-execution-verification]] [[always-set-both-sl-and-tp]] [[only-set-sl-forgot-tp]] [[mt5-comment-length-limit-29-chars]] [[risk-max-open-positions-off-by-one]] [[adx-trend-filter-for-mean-reversion]] [[cci-recovery-filter-catching-knife]] [[trend-consistency-multi-bar-confirmation]] [[multi-gate-entry-filter-architecture]] [[mt5-terminal-locking-on-restart]] [[max-open-positions-flip-bug]] [[adx-trend-strength-filter]] [[trend-consistency-filter]] [[cci-recovery-filter]] [[multi-factor-entry-gate]] [[bypassing-entry-filters]] [[cci-trend-following-mode]] [[session-guard-market-hours]] [[deployment-symbol-restriction]]
