---
tags: [testing, workflow, trading]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# guard bypass for testing

Bypass signal guards temporarily to force test trades, then revert immediately after verification

**Why:** To verify the full authority chain (signal → guards → worker → risk → broker → MT5 fill) on a demo account, some guards (session, tail, economics, H4 trend, H1 trend) were bypassed to force a BUY signal. This is the correct approach for end-to-end testing.

**How to apply:** Document which guards are bypassed, test the full chain, then immediately revert all bypasses. The comment-length fix is permanent; guard bypasses are temporary. Always verify bypasses are reverted before leaving the system running.

Related: [[atr-based-sl-tp-setting]] [[full-authority-chain-demo-trading]] [[bypassing-trend-guards-causes-trend-fighting-losses]] [[omitted-take-profit-on-demo-positions]] [[demo-test-guard-bypass-for-execution-verification]] [[always-set-both-sl-and-tp]] [[only-set-sl-forgot-tp]] [[adx-trend-strength-filter]] [[trend-consistency-filter]] [[cci-recovery-filter]] [[bypassing-entry-filters]] [[audit-source-before-claims]] [[ts-harness-audit-validation]] [[missing-filterresults-unit-tests]] [[no-end-to-end-pipeline-test]] [[verify-refactoring-with-checks]] [[wait-for-quiet-before-split]]
