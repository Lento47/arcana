---
tags: [trading, risk-management, process]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# always set both sl and tp

When setting stop loss, always set take profit in the same operation

After opening a position, set both SL and TP together rather than just SL. The user had to prompt for TP after SL was set.

**Why:** Forgetting TP means the position relies entirely on strategy exit logic (e.g., CCI mean cross). In this case the CCI strategy exits on mean reversion, but having a fixed TP provides a guaranteed risk-reward target (e.g., 2:1 RR) as a safety net.

**How to apply:** After any position open, immediately apply both SL and TP via `mt5.order_send()` with `sl` and `tp` parameters. Default pattern: SL = 2× ATR, TP = 2× SL distance (2:1 RR).

Related: [[risk-max-open-positions-off-by-one]] [[max-open-positions-flip-bug]] [[adx-trend-strength-filter]] [[trend-consistency-filter]] [[cci-recovery-filter]] [[multi-factor-entry-gate]] [[bypassing-entry-filters]]
