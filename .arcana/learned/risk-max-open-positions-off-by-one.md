---
tags: [freeconomics, risk-management, bugfix]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# risk max open positions off by one

Off-by-one in risk.py max_open_positions check blocked legitimate position flips

The `max_open_positions` check at `risk.py:75` had a 1-fill error that prevented position flips (closing one and opening the opposite direction). The condition was `>=` when it should have been `>` or the counting logic missed that a flip closes before opening.

**Why:** When the strategy flips from BUY→SELL, the existing position is closed first, so net open positions shouldn't block the new entry. The off-by-one caused the flip to appear as if max positions were already reached.

**How to apply:** When implementing position-count limits, account for the fact that a flip closes an existing position before opening a new one. Test with scenarios that include flips, not just additive entries.

Related: [[max-open-positions-flip-bug]] [[adx-trend-strength-filter]] [[trend-consistency-filter]] [[cci-recovery-filter]] [[multi-factor-entry-gate]] [[bypassing-entry-filters]] [[mt5-comment-length-limit]] [[cci-trend-following-mode]] [[session-guard-market-hours]] [[deployment-symbol-restriction]]
