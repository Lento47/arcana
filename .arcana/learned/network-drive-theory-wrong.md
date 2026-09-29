---
tags: [mistake, debugging, powershell, git]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# network drive theory wrong

Incorrectly hypothesized `L:\` network drive caused slow git; actually local volume, git fast

Earlier hypothesis claimed git was slow over `L:\` because it was a mapped network share. Verification showed `Get-PSDrive L` has empty `DisplayRoot` and `Provider: FileSystem` (local volume), and `git status`=37.7ms, `git diff`=32.8ms — both instant.

**Why:** Assuming mapped-drive without checking led to wrong root cause; user pushed to verify and it was corrected.

**How to apply:** Don't assume drive letters are network shares; check `Get-PSDrive` and time git directly. Correct course when evidence contradicts theory.

Related: [[vcs-diff-hang-root-cause]] [[l-drive-is-local-volume]] [[truncation-type-distinction]] [[initial-wrong-paths]] [[freeconomics-three-profitability-blockers]] [[explained-block-instead-of-retrying-request]] [[licensing-contradiction-error]] [[wrong-test-suite-in-goal-check]] [[goal-check-ran-wrong-test-suite]] [[forgot-tp-when-setting-sl]] [[forgot-tp-on-demo-positions]] [[omitted-take-profit-on-demo-positions]] [[only-set-sl-forgot-tp]] [[mt5-terminal-locking-on-restart]] [[surface-level-assessment-error]] [[verify-changes-thoroughly]] [[goal-check-workspace-default]] [[trusting-tool-output-without-verifying-workspace]]
