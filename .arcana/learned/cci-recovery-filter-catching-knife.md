---
tags: [freeconomics, cci, strategy-filters, mean-reversion]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# cci recovery filter catching knife

CCI recovery filter prevents entering while CCI is still moving deeper into extreme territory

The `cci_is_recovering()` filter requires CCI to be moving *away* from the extreme (toward zero) rather than deeper into it. This prevents "catching a falling knife" on momentum-driven moves.

**Why:** When CCI crosses -308 and keeps going to -400, entering at -308 means buying into accelerating selling pressure. Waiting for CCI to start recovering (turning back toward zero) confirms the extreme has peaked.

**How to apply:** After CCI crosses your threshold, check if the current bar's CCI is closer to zero than the previous bar's before entering. Combine with trend consistency to avoid false recoveries in strong trends.

Related: [[adx-trend-strength-filter]] [[trend-consistency-filter]] [[cci-recovery-filter]] [[mt5-comment-length-limit]] [[max-open-positions-flip-bug]] [[cci-trend-following-mode]] [[session-guard-market-hours]] [[deployment-symbol-restriction]]
