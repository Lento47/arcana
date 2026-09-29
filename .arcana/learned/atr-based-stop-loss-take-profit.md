---
tags: [cci-strategy, risk-management, atr]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# atr based stop loss take profit

Set stop loss at 2x ATR below entry and take profit at 2:1 risk-reward for CCI strategy.

For the CCI mean reversion strategy, stop loss is set at 2 times the Average True Range (ATR) below the entry price, and take profit is set at a 2:1 risk-reward ratio relative to the stop loss distance. **Why:** ATR provides a volatility-adjusted stop level, and fixed RR ratio ensures consistent risk management. **How to apply:** Calculate ATR (e.g., 14-period), set SL = entry - 2*ATR, and TP = entry + 4*ATR for a 2:1 RR.

Related: [[atr-based-sl-with-rr-tp]] [[risk-max-open-positions-flip-bug]] [[cci-revert-trend-filter-blocking]] [[forgot-tp-on-demo-positions]] [[atr-based-sl-with-fixed-rr-tp]] [[guard-bypasses-create-trend-fighting-positions]] [[cci-reversion-trade-management]] [[sl-then-tp-sequence-mistake]] [[risk-py-max-open-positions-flip]] [[atr-based-stop-loss-and-rr-take-profit]] [[set-sl-and-tp-in-same-pass]] [[atr-based-sl-tp-setting]] [[risk-management-position-flip-bug]] [[bypassing-trend-guards-causes-trend-fighting-losses]] [[always-set-both-sl-and-tp]] [[risk-max-open-positions-off-by-one]] [[max-open-positions-flip-bug]] [[multi-factor-entry-gate]] [[bypassing-entry-filters]]
