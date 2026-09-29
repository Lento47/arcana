---
tags: [risk-management, python, bugfix]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# risk management position flip bug

Fixed a bug in risk management that allowed position flips beyond max_open_positions.

**Why:** The risk management logic did not correctly handle cases where a new trade signal could flip an existing position (e.g., from long to short), potentially violating the maximum open positions constraint and increasing risk.

**How to apply:** Review and update risk management code to ensure that position flips are accounted for when enforcing limits. For instance, check if a flip is allowed based on current positions before submitting a new order.

Related: [[mt5-python-binding-comment-length-limit]] [[bypassing-trend-guards-causes-trend-fighting-losses]] [[always-set-both-sl-and-tp]] [[mt5-comment-length-limit-29-chars]] [[risk-max-open-positions-off-by-one]] [[mt5-comment-length-bug]] [[max-open-positions-flip-bug]] [[multi-factor-entry-gate]] [[bypassing-entry-filters]]
