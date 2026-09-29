---
tags: [trading, risk-management, strategy]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# atr based sl tp setting

Use ATR for stop loss and a fixed risk-reward ratio for take profit in mean reversion strategies.

**Why:** Setting stop loss based on Average True Range (ATR) adapts to market volatility, providing dynamic risk management. A fixed risk-reward ratio like 2:1 helps maintain consistent profit targets.

**How to apply:** Calculate the ATR for the relevant timeframe (e.g., 14-period ATR on H1). For a long position, set SL at entry price minus 2x ATR, and TP at entry price plus 2 times the SL distance (i.e., 4x ATR from entry for 2:1 RR). Adjust for short positions accordingly.

Related: [[bypassing-trend-guards-causes-trend-fighting-losses]] [[omitted-take-profit-on-demo-positions]] [[demo-test-guard-bypass-for-execution-verification]] [[always-set-both-sl-and-tp]] [[only-set-sl-forgot-tp]] [[risk-max-open-positions-off-by-one]] [[max-open-positions-flip-bug]] [[adx-trend-strength-filter]] [[trend-consistency-filter]] [[cci-recovery-filter]] [[multi-factor-entry-gate]] [[bypassing-entry-filters]]
