---
tags: [risk-management, trading-system, bug-fix]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# risk max open positions flip

max_open_positions in risk management should account for position flips to avoid 1-fill bugs.

In risk.py:75, the max_open_positions logic had a bug that didn't allow position flips, leading to incorrect risk assessment. The fix was to adjust the calculation to consider flips. **Why:** Position flips (e.g., closing a long and opening a short) should not count against the max open positions limit as they are essentially a single position change. **How to apply:** Review risk management code to ensure that max_open_positions handles position flips correctly, preventing unnecessary trade blocks.

Related: [[atr-based-stop-loss-take-profit]] [[max-open-positions-flip-correction]] [[position-flip-in-max-positions]] [[mt5-python-binding-comment-limit]] [[atr-based-sl-with-rr-tp]] [[risk-max-open-positions-flip-bug]] [[cci-revert-trend-filter-blocking]] [[forgot-tp-on-demo-positions]] [[atr-based-sl-with-fixed-rr-tp]] [[mt5-python-comment-length-limit]] [[cci-reversion-trade-management]] [[sl-then-tp-sequence-mistake]] [[mt5-comment-length-limit]] [[risk-py-max-open-positions-flip]] [[atr-based-stop-loss-and-rr-take-profit]] [[set-sl-and-tp-in-same-pass]] [[atr-based-sl-tp-setting]] [[risk-management-position-flip-bug]] [[mt5-python-binding-comment-length-limit]] [[bypassing-trend-guards-causes-trend-fighting-losses]] [[always-set-both-sl-and-tp]] [[risk-max-open-positions-off-by-one]] [[mt5-comment-length-bug]] [[max-open-positions-flip-bug]] [[multi-factor-entry-gate]] [[bypassing-entry-filters]]
