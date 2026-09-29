---
tags: [mistake, risk-management, trading]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# forgot tp on demo positions

Set SL on demo positions but forgot to set TP, requiring user correction

**Why:** When protecting the two demo positions with stop losses, only SL was applied. TP was omitted, meaning positions had no defined exit on the profit side. The CCI strategy normally exits on mean cross, but a fixed TP for risk-reward management should still be set.

**How to apply:** Always set both SL and TP when protecting positions. Use a consistent 2:1 or better risk-reward ratio. The assistant acknowledged the omission only after the user pointed it out.

Related: [[atr-based-sl-tp-setting]] [[risk-management-position-flip-bug]] [[bypassing-trend-guards-causes-trend-fighting-losses]] [[omitted-take-profit-on-demo-positions]] [[demo-test-guard-bypass-for-execution-verification]] [[always-set-both-sl-and-tp]] [[only-set-sl-forgot-tp]] [[risk-max-open-positions-off-by-one]] [[max-open-positions-flip-bug]] [[adx-trend-strength-filter]] [[trend-consistency-filter]] [[cci-recovery-filter]] [[multi-factor-entry-gate]] [[bypassing-entry-filters]] [[surface-level-assessment-error]] [[goal-check-workspace-default]]
