---
tags: [freeconomics, ema, strategy-filters, trend]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# trend consistency multi bar confirmation

Trend consistency filter requires EMA20/50 relationship to hold for 5 consecutive bars, not just current bar

The `trend_consistency_agrees()` function checks that EMA20 > EMA50 (or <) has been true for the last 5 bars, not just the current bar. This filters out false crosses and whipsaws.

**Why:** A single-bar EMA20/50 cross is unreliable—it can flip back within a bar or two in ranging markets. Requiring 5 bars of consistency significantly reduces false signals from whipsaws.

**How to apply:** When using EMA crossovers for directional bias, require the relationship to persist for N bars (5 worked well for H1 timeframe) before trusting it. This adds latency but dramatically improves signal quality.

Related: [[adx-trend-strength-filter]] [[trend-consistency-filter]] [[cci-recovery-filter]] [[mt5-comment-length-limit]] [[max-open-positions-flip-bug]] [[cci-trend-following-mode]] [[session-guard-market-hours]] [[deployment-symbol-restriction]]
