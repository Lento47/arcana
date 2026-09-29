---
tags: [trading, moving-averages, freeconomics]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# trend consistency filter

Require EMA20/50 crossover to hold for 5 bars to avoid whipsaws.

**Why:** Single-bar crossovers can be false signals; confirming consistency reduces false entries.
**How to apply:** Check if EMA20 > EMA50 (or <) for the last 5 bars before entering a trade.

Related: [[mt5-comment-length-limit]] [[max-open-positions-flip-bug]] [[cci-trend-following-mode]] [[session-guard-market-hours]] [[deployment-symbol-restriction]]
