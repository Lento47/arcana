---
tags: [risk-management, bug-fix]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# position flip in max positions

Risk management code allowed position flips at max open positions, violating limits.

The max_open_positions check did not account for position flips, allowing trades that should have been blocked. **Why:** Flipping a position increases risk exposure and should be treated as opening a new position. **How to apply:** In risk checks, consider all order types that change net exposure, including flips, when enforcing position limits.

Related: [[mt5-python-binding-comment-limit]] [[atr-based-sl-with-rr-tp]] [[risk-max-open-positions-flip-bug]] [[cci-revert-trend-filter-blocking]] [[forgot-tp-on-demo-positions]] [[atr-based-sl-with-fixed-rr-tp]] [[mt5-python-comment-length-limit]] [[cci-reversion-trade-management]] [[sl-then-tp-sequence-mistake]] [[mt5-comment-length-limit]] [[risk-py-max-open-positions-flip]] [[atr-based-stop-loss-and-rr-take-profit]] [[set-sl-and-tp-in-same-pass]] [[atr-based-sl-tp-setting]] [[risk-management-position-flip-bug]] [[mt5-python-binding-comment-length-limit]] [[bypassing-trend-guards-causes-trend-fighting-losses]] [[always-set-both-sl-and-tp]] [[risk-max-open-positions-off-by-one]] [[mt5-comment-length-bug]] [[max-open-positions-flip-bug]] [[multi-factor-entry-gate]] [[bypassing-entry-filters]]
