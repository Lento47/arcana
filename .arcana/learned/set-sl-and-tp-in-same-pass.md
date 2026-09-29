---
tags: [risk-management, workflow, trading]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# set sl and tp in same pass

When adding protective orders to positions, set both SL and TP together in the same workflow

**Why:** In this session, SL was set on both positions but TP was forgotten, requiring a second pass. User had to explicitly ask about TP.

**How to apply:** When modifying positions for risk management, always compute and apply SL and TP together. Create a checklist: (1) compute ATR-based SL, (2) compute RR-based TP, (3) apply both to all positions.

Related: [[atr-based-sl-tp-setting]] [[risk-management-position-flip-bug]] [[bypassing-trend-guards-causes-trend-fighting-losses]] [[omitted-take-profit-on-demo-positions]] [[demo-test-guard-bypass-for-execution-verification]] [[always-set-both-sl-and-tp]] [[only-set-sl-forgot-tp]] [[risk-max-open-positions-off-by-one]] [[max-open-positions-flip-bug]] [[adx-trend-strength-filter]] [[trend-consistency-filter]] [[cci-recovery-filter]] [[multi-factor-entry-gate]] [[bypassing-entry-filters]] [[audit-source-before-claims]] [[wait-for-quiet-before-split]]
