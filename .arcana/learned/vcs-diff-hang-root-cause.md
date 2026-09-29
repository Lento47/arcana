---
tags: [engine, git, debugging]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# vcs diff hang root cause

TUI /diff hang caused by missing process timeout in Git.run

**Why:** `Git.run` (engine/src/git/index.ts:128) has no process timeout/kill; a blocked git hangs the HTTP `vcsDiff` handler until the TUI's 15s client race rejects.

**How to apply:** When debugging TUI hangs on git operations, check for missing timeouts in server-side git wrappers; consider adding bounded timeouts that propagate to child process cleanup.

Related: [[truncation-type-distinction]] [[initial-wrong-paths]] [[text-delta-no-word-boundary-awareness]] [[freeconomics-three-profitability-blockers]] [[wrong-test-suite-in-goal-check]] [[mt5-terminal-locking-on-restart]] [[verify-changes-thoroughly]] [[goal-check-workspace-default]] [[trusting-tool-output-without-verifying-workspace]]
