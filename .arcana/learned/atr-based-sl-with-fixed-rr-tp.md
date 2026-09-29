---
tags: [trading, risk-management, cci-strategy, atr]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# atr based sl with fixed rr tp

Set SL at 2x ATR and TP at 2:1 risk-reward ratio for structured trade management

For the CCI reversion strategy on EURUSD, set stop loss at 2x ATR below/above entry, then set take profit at 2x the SL distance (2:1 risk-reward).

**Why:** ATR-based SL adapts to current volatility. Fixed RR ratio ensures consistent risk management across trades.

**How to apply:** 1) Compute ATR(14) on the entry timeframe. 2) SL = entry ± 2×ATR. 3) TP = entry ± 2×(SL distance). Example: entry 1.14651, ATR=14.2 pips, SL=1.14368 (28 pips), TP=1.15217 (56 pips).

Related: [[mt5-python-comment-length-limit]] [[cci-reversion-trade-management]] [[sl-then-tp-sequence-mistake]] [[forgot-tp-when-setting-sl]] [[risk-py-max-open-positions-flip]] [[atr-based-stop-loss-and-rr-take-profit]] [[missing-take-profit-initially]] [[set-sl-and-tp-in-same-pass]] [[guard-bypass-for-testing]] [[forgot-tp-on-demo-positions]] [[atr-based-sl-tp-setting]] [[risk-management-position-flip-bug]] [[bypassing-trend-guards-causes-trend-fighting-losses]] [[omitted-take-profit-on-demo-positions]] [[demo-test-guard-bypass-for-execution-verification]] [[always-set-both-sl-and-tp]] [[only-set-sl-forgot-tp]] [[risk-max-open-positions-off-by-one]] [[max-open-positions-flip-bug]] [[adx-trend-strength-filter]] [[trend-consistency-filter]] [[cci-recovery-filter]] [[multi-factor-entry-gate]] [[bypassing-entry-filters]]
