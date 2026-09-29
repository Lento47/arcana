---
tags: [trading, oversight, demo]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# forgot to set take profit

Only set stop loss on demo positions, forgot to set take profit until user reminded

When managing demo positions after the test trade, only SL was applied. TP was not set until the user explicitly asked about it.

**Why:** Focused on downside protection first and didn't complete the full trade management step.

**How to apply:** When setting protective orders, always set both SL and TP in the same operation. Don't defer TP — treat it as part of the same action as SL.

Related: [[mt5-python-comment-length-limit]] [[cci-reversion-trade-management]] [[sl-then-tp-sequence-mistake]] [[forgot-tp-when-setting-sl]] [[missing-take-profit-initially]] [[guard-bypass-for-testing]] [[set-sl-and-tp-in-same-pass]] [[forgot-tp-on-demo-positions]] [[atr-based-sl-tp-setting]] [[full-authority-chain-demo-trading]] [[bypassing-trend-guards-causes-trend-fighting-losses]] [[omitted-take-profit-on-demo-positions]] [[demo-test-guard-bypass-for-execution-verification]] [[always-set-both-sl-and-tp]] [[only-set-sl-forgot-tp]] [[adx-trend-strength-filter]] [[trend-consistency-filter]] [[cci-recovery-filter]]
