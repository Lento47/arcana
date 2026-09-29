---
tags: [trading-strategy, risk-management, technique]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# atr based stop loss and rr take profit

Set stop loss at 2x ATR and take profit at 2:1 risk-reward ratio for trades.

For the demo trade, SL was set at 2x ATR below entry (28 pips), and TP at 2:1 RR (56 pips above entry). This provides a balanced risk-reward ratio and adapts to market volatility.

**Why:** ATR measures volatility, so SL based on ATR adapts to market conditions. A 2:1 RR ensures profitable trades can cover losses.

**How to apply:** Calculate ATR from recent data, set SL at entry minus 2*ATR for buys, and TP at entry plus 2*SL_distance for a 2:1 RR.

Related: [[set-sl-and-tp-in-same-pass]] [[forgot-tp-on-demo-positions]] [[atr-based-sl-tp-setting]] [[risk-management-position-flip-bug]] [[bypassing-trend-guards-causes-trend-fighting-losses]] [[always-set-both-sl-and-tp]] [[risk-max-open-positions-off-by-one]] [[max-open-positions-flip-bug]] [[multi-factor-entry-gate]] [[bypassing-entry-filters]] [[cci-trend-following-mode]]
