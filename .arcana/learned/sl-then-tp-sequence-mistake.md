---
tags: [trading, risk-management, workflow]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# sl then tp sequence mistake

Always set SL and TP together in the same operation, not sequentially

**Why:** When the user asked to protect positions, only SL was set. TP was added later only after the user explicitly pointed it out. This leaves positions partially managed and relies on a second action that may be forgotten or delayed.

**How to apply:** When modifying a position (SL/TP), always set both values in a single call. Never defer one to a later step. If the strategy says TP=0 (exits on signal), still explicitly set it and note why. Treat SL+TP as an atomic pair.

Related: [[risk-py-max-open-positions-flip]] [[atr-based-stop-loss-and-rr-take-profit]] [[missing-take-profit-initially]] [[set-sl-and-tp-in-same-pass]] [[guard-bypass-for-testing]] [[forgot-tp-on-demo-positions]] [[atr-based-sl-tp-setting]] [[risk-management-position-flip-bug]] [[bypassing-trend-guards-causes-trend-fighting-losses]] [[omitted-take-profit-on-demo-positions]] [[demo-test-guard-bypass-for-execution-verification]] [[always-set-both-sl-and-tp]] [[only-set-sl-forgot-tp]] [[risk-max-open-positions-off-by-one]] [[max-open-positions-flip-bug]] [[adx-trend-strength-filter]] [[trend-consistency-filter]] [[cci-recovery-filter]] [[multi-factor-entry-gate]] [[bypassing-entry-filters]] [[audit-source-before-claims]] [[wait-for-quiet-before-split]]
