---
tags: [trading, error, correction]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# missing take profit initially

Forgot to set take profit on demo trade, requiring correction later.

When setting stop loss on the demo trade, take profit was initially not added. The user pointed this out, and TP was subsequently set at 2:1 risk-reward.

**Why:** Without TP, the trade lacks an exit target, potentially leading to missed profits or extended losses.

**How to apply:** Always define both SL and TP when opening a trade to manage risk and lock in profits.

Related: [[set-sl-and-tp-in-same-pass]] [[guard-bypass-for-testing]] [[forgot-tp-on-demo-positions]] [[atr-based-sl-tp-setting]] [[bypassing-trend-guards-causes-trend-fighting-losses]] [[omitted-take-profit-on-demo-positions]] [[demo-test-guard-bypass-for-execution-verification]] [[always-set-both-sl-and-tp]] [[only-set-sl-forgot-tp]] [[adx-trend-strength-filter]] [[trend-consistency-filter]] [[cci-recovery-filter]] [[goal-check-workspace-mismatch]]
