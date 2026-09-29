---
tags: [debugging, verification, process]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# verify environmental assumptions

Verify environmental assumptions (e.g., network vs local drive) with commands before concluding

When hypothesizing root causes based on environment traits (like 'L:\ is a network drive causing slow git'), verify with actual commands (`Get-PSDrive L`, timing `git status`) before committing to the theory.

**Why:** The session showed the network-drive theory was false—`L:\` was a local volume with empty `DisplayRoot` and git was fast (37.7ms). Unverified assumptions waste investigation effort.

**How to apply:** Before finalizing a root-cause hypothesis tied to environment, run a quick confirming command; let user-pushed verification correct course early.

Related: [[vcs-diff-hang-root-cause]] [[effect-timeout-propagates-to-child-kill]] [[truncation-type-distinction]] [[initial-wrong-paths]] [[freeconomics-three-profitability-blockers]] [[arcana-authorization-vs-completion-verification]] [[wrong-test-suite-in-goal-check]] [[always-set-both-sl-and-tp]] [[only-set-sl-forgot-tp]] [[mt5-terminal-locking-on-restart]] [[grounding-ai-claims-in-verbatim-quotes]] [[source-code-verification-over-docs]] [[parallel-code-audits]] [[avoid-surface-level-code-assessment]] [[audit-source-before-claims]] [[verify-changes-thoroughly]] [[verify-refactoring-with-checks]] [[goal-check-workspace-default]] [[trusting-tool-output-without-verifying-workspace]]
