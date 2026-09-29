---
tags: [freeconomics, risk-management, atr, stop-loss]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# atr based sl with rr tp

Use 2x ATR for stop loss and 2:1 risk-reward for take profit

When setting protective levels on positions:
1. Measure ATR (14-period on H1 in this case: 14.2 pips)
2. SL = 2x ATR below entry (28 pips)
3. TP = 2x SL distance above entry (2:1 risk-reward)

**Why:** ATR-based stops adapt to volatility. 2x ATR provides enough room for normal price movement. 2:1 RR ensures positive expected value over time.

**How to apply:** For any position, calculate `SL_dist = 2 * ATR`, then set `SL = entry - SL_dist` (BUY) or `entry + SL_dist` (SELL), and `TP = entry + 2 * SL_dist` (BUY) or `entry - 2 * SL_dist` (SELL).

Related: [[cci-revert-trend-filter-blocking]] [[forgot-tp-on-demo-positions]] [[risk-max-open-positions-flip-bug]] [[atr-based-sl-with-fixed-rr-tp]] [[cci-reversion-trade-management]] [[sl-then-tp-sequence-mistake]] [[forgot-tp-when-setting-sl]] [[risk-py-max-open-positions-flip]] [[atr-based-stop-loss-and-rr-take-profit]] [[set-sl-and-tp-in-same-pass]] [[atr-based-sl-tp-setting]] [[risk-management-position-flip-bug]] [[bypassing-trend-guards-causes-trend-fighting-losses]] [[always-set-both-sl-and-tp]] [[mt5-comment-length-limit-29-chars]] [[risk-max-open-positions-off-by-one]] [[adx-trend-filter-for-mean-reversion]] [[cci-recovery-filter-catching-knife]] [[trend-consistency-multi-bar-confirmation]] [[multi-gate-entry-filter-architecture]] [[mt5-terminal-locking-on-restart]] [[max-open-positions-flip-bug]] [[adx-trend-strength-filter]] [[trend-consistency-filter]] [[cci-recovery-filter]] [[multi-factor-entry-gate]] [[bypassing-entry-filters]] [[mt5-comment-length-limit]] [[cci-trend-following-mode]] [[session-guard-market-hours]] [[deployment-symbol-restriction]]
