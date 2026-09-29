---
tags: [risk-management, python, bug-fix]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# risk py max open positions flip

Fixed bug where max_open_positions allowed position flips in risk management.

In `risk.py:75`, the logic for counting open positions allowed for position flips, which could lead to unintended trades. The fix ensures that position flips are properly accounted for in the max_open_positions check.

**Why:** Position flips increase risk exposure and should be limited by the risk management rules.

**How to apply:** Review and test the risk management logic to ensure it correctly handles different trade scenarios, including flips.

Related: [[set-sl-and-tp-in-same-pass]] [[forgot-tp-on-demo-positions]] [[atr-based-sl-tp-setting]] [[mt5-comment-length-bug]] [[risk-management-position-flip-bug]] [[mt5-python-binding-comment-length-limit]] [[bypassing-trend-guards-causes-trend-fighting-losses]] [[always-set-both-sl-and-tp]] [[mt5-comment-length-limit-29-chars]] [[risk-max-open-positions-off-by-one]] [[max-open-positions-flip-bug]] [[multi-factor-entry-gate]] [[bypassing-entry-filters]] [[mt5-comment-length-limit]]
