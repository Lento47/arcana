---
tags: [testing, project-management, debugging]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# wrong test suite in goal check

Ensure goal_check runs the correct test suite for the target project.

During testing, the goal_check function initially executed arcana's test suite instead of freeconomics, leading to incorrect test results and wasted time.

**Why:** To maintain accuracy and efficiency in multi-project environments, where running the wrong tests can mask issues or create false positives.

**How to apply:** When setting up automated checks or tests, explicitly define and verify the test runner path and project directory. Use absolute paths or configuration files to ensure the correct suite is invoked.

Related: [[goal-check-ran-wrong-test-suite]] [[temporary-guard-bypass-for-testing]] [[testing-live-trades-with-guard-bypasses]] [[guard-bypasses-create-trend-fighting-positions]] [[guard-bypass-for-testing]] [[full-authority-chain-demo-trading]] [[demo-test-guard-bypass-for-execution-verification]] [[mt5-terminal-locking-on-restart]] [[bypassing-entry-filters]] [[ts-harness-audit-validation]] [[missing-filterresults-unit-tests]] [[no-end-to-end-pipeline-test]] [[verify-changes-thoroughly]] [[verify-refactoring-with-checks]] [[goal-check-workspace-default]] [[trusting-tool-output-without-verifying-workspace]]
