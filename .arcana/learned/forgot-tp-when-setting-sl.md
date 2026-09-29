---
tags: [mistake, trading, freeconomics]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# forgot tp when setting sl

Set SL on demo positions but completely forgot to set TP until user corrected

**Why:** User asked for both stop loss and take profit. I set SL at 1.14368 (2× ATR below entry) but omitted TP entirely. When presenting the position table, I showed TP=0 and rationalized it as "exits on CCI mean cross" — but the user never agreed to that.

**How to apply:** When a user asks for both SL and TP, set both. If the strategy has no fixed TP, explain that and ask if they want one anyway. Never silently omit a requested parameter and rationalize it away.

Related: [[missing-take-profit-initially]] [[set-sl-and-tp-in-same-pass]] [[guard-bypass-for-testing]] [[forgot-tp-on-demo-positions]] [[atr-based-sl-tp-setting]] [[bypassing-trend-guards-causes-trend-fighting-losses]] [[omitted-take-profit-on-demo-positions]] [[demo-test-guard-bypass-for-execution-verification]] [[always-set-both-sl-and-tp]] [[only-set-sl-forgot-tp]] [[mt5-comment-length-limit-29-chars]] [[risk-max-open-positions-off-by-one]] [[adx-trend-filter-for-mean-reversion]] [[cci-recovery-filter-catching-knife]] [[trend-consistency-multi-bar-confirmation]] [[multi-gate-entry-filter-architecture]] [[mt5-terminal-locking-on-restart]] [[adx-trend-strength-filter]] [[trend-consistency-filter]] [[cci-recovery-filter]] [[mt5-comment-length-limit]] [[max-open-positions-flip-bug]] [[cci-trend-following-mode]] [[session-guard-market-hours]] [[deployment-symbol-restriction]] [[surface-level-assessment-error]] [[goal-check-workspace-default]]
