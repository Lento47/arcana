---
tags: [pattern, workflow, environment]
date: 2026-08-27
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# pattern set goal before shell

Set active goal before invoking bash/shell tool

Shell commands are gated on an active goal in this agent environment.

**Why:** Tooling enforces goal-scoped execution; bare commands get blocked/cancelled.

**How to apply:** Establish a goal (e.g., 'review arcana') before running any shell command.

Related: [[powershell-shell-constraints]] [[powershell-constraints-arcana]] [[effect-timeoutfail-kills-child-process]] [[arcana-verify-trash-untracked]] [[arcana-shell-is-powershell]] [[arcana-bash-tool-gated]] [[powershell-environment]] [[createresource-memo-equals]] [[effect-timeout-propagates-to-child-kill]] [[verify-skill-status-first]] [[sl-then-tp-sequence-mistake]] [[set-sl-and-tp-in-same-pass]] [[guard-bypass-for-testing]] [[audit-source-before-claims]] [[wait-for-quiet-before-split]]
