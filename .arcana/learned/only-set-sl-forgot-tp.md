---
tags: [trading, mistake, process]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# only set sl forgot tp

Set stop loss on demo positions but forgot take profit until user prompted

After executing demo trades, SL was set at 2× ATR below entry but TP was left at 0. User had to explicitly ask "and the stop loss and top profit?" and then again "you didn't add the tp or top profit" to get TP set.

**Why:** In the rush to complete the demo test, only partial position protection was applied. The CCI strategy normally exits on mean cross, but that's not a substitute for a fixed TP.

**How to apply:** Create a checklist for post-trade setup: 1) Confirm fill, 2) Set SL, 3) Set TP, 4) Verify both on terminal. Never consider a trade "done" until both are confirmed.

Related: [[adx-trend-strength-filter]] [[trend-consistency-filter]] [[cci-recovery-filter]] [[surface-level-assessment-error]] [[goal-check-workspace-default]]
