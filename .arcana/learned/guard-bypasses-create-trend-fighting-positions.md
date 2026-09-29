---
tags: [trading, testing, risk, cci-strategy]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# guard bypasses create trend fighting positions

Bypassing trend guards for testing creates positions that fight the prevailing trend

During demo testing, H4 trend, H1 trend, session, tail, and economics guards were bypassed to force a signal. This created BUY positions while both H4 and H1 trends were DOWN, resulting in positions fighting the trend and losing money.

**Why:** Bypassing guards defeats the algorithm's trend-filtering logic, creating positions the system would normally reject.

**How to apply:** When testing execution chains, be aware that bypassed guards create "worst case" entries. Either close test positions immediately after fill verification, or accept they may lose money. Consider adding a `test_mode` flag that auto-closes positions after fill.

Related: [[mt5-python-comment-length-limit]] [[cci-reversion-trade-management]] [[sl-then-tp-sequence-mistake]] [[forgot-tp-when-setting-sl]] [[missing-take-profit-initially]] [[guard-bypass-for-testing]] [[set-sl-and-tp-in-same-pass]] [[forgot-tp-on-demo-positions]] [[atr-based-sl-tp-setting]] [[full-authority-chain-demo-trading]] [[bypassing-trend-guards-causes-trend-fighting-losses]] [[omitted-take-profit-on-demo-positions]] [[demo-test-guard-bypass-for-execution-verification]] [[always-set-both-sl-and-tp]] [[only-set-sl-forgot-tp]] [[adx-trend-strength-filter]] [[trend-consistency-filter]] [[cci-recovery-filter]] [[bypassing-entry-filters]] [[ts-harness-audit-validation]] [[missing-filterresults-unit-tests]] [[no-end-to-end-pipeline-test]] [[verify-refactoring-with-checks]]
