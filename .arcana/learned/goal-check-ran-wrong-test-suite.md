---
tags: [testing, mistake, freeconomics]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# goal check ran wrong test suite

Goal check ran arcana's tests instead of freeconomics — always verify the working directory or explicit path when running tests

The automated `goal_check` executed arcana's own pytest suite instead of freeconomics', producing misleading pass/fail results for the target project.

**Why:** The test runner defaulted to the wrong project root. Without an explicit path to the freeconomics `.venv/Scripts/pytest.exe` and test directory, it picked up the wrong conftest and suite.

**How to apply:** Always use an explicit, absolute path to the correct pytest executable and test directory when running tests for a specific project, especially when multiple Python projects coexist on the same machine. Don't rely on the current working directory.

Related: [[temporary-guard-bypass-for-testing]] [[testing-live-trades-with-guard-bypasses]] [[cci-reversion-strategy-exit-mechanism]] [[atr-based-sl-with-rr-tp]] [[forgot-to-set-tp-with-sl]] [[risk-max-open-positions-flip-bug]] [[guard-bypasses-create-trend-fighting-positions]] [[cci-reversion-trade-management]] [[forgot-tp-when-setting-sl]] [[guard-bypass-for-testing]] [[forgot-tp-on-demo-positions]] [[full-authority-chain-demo-trading]] [[omitted-take-profit-on-demo-positions]] [[demo-test-guard-bypass-for-execution-verification]] [[only-set-sl-forgot-tp]] [[mt5-comment-length-limit-29-chars]] [[risk-max-open-positions-off-by-one]] [[adx-trend-filter-for-mean-reversion]] [[cci-recovery-filter-catching-knife]] [[trend-consistency-multi-bar-confirmation]] [[multi-gate-entry-filter-architecture]] [[mt5-terminal-locking-on-restart]] [[adx-trend-strength-filter]] [[trend-consistency-filter]] [[cci-recovery-filter]] [[bypassing-entry-filters]] [[mt5-comment-length-limit]] [[max-open-positions-flip-bug]] [[cci-trend-following-mode]] [[session-guard-market-hours]] [[deployment-symbol-restriction]] [[surface-level-assessment-error]] [[ts-harness-audit-validation]] [[missing-filterresults-unit-tests]] [[no-end-to-end-pipeline-test]] [[verify-refactoring-with-checks]] [[goal-check-workspace-default]]
