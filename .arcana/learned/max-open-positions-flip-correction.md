---
tags: [risk-management, python, bug-fix]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# max open positions flip correction

Fixed risk check that incorrectly allowed position flips when at max open positions.

In risk.py, the max_open_positions check allowed position flips (e.g., from long to short) even when the maximum number of positions was reached. This was fixed to prevent such flips. **Why:** Position flips should count towards position limits to avoid unintended exposure. **How to apply:** Review risk management logic to ensure that all position changes, including flips, are considered when checking open position counts.

Related: [[mt5-python-binding-comment-limit]] [[atr-based-sl-with-rr-tp]] [[risk-max-open-positions-flip-bug]] [[mt5-comment-length-limit]] [[cci-revert-trend-filter-blocking]] [[forgot-tp-on-demo-positions]] [[atr-based-sl-with-fixed-rr-tp]] [[mt5-python-comment-length-limit]] [[cci-reversion-trade-management]] [[sl-then-tp-sequence-mistake]] [[risk-py-max-open-positions-flip]] [[atr-based-stop-loss-and-rr-take-profit]] [[set-sl-and-tp-in-same-pass]] [[atr-based-sl-tp-setting]] [[mt5-comment-length-bug]] [[risk-management-position-flip-bug]] [[mt5-python-binding-comment-length-limit]] [[bypassing-trend-guards-causes-trend-fighting-losses]] [[always-set-both-sl-and-tp]] [[mt5-comment-length-limit-29-chars]] [[risk-max-open-positions-off-by-one]] [[max-open-positions-flip-bug]] [[multi-factor-entry-gate]] [[bypassing-entry-filters]]
