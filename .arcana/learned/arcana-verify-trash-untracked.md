---
tags: [arcana, git, pattern]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# arcana verify trash untracked

Verify trash/old code is untracked via git check-ignore before recommending deletion

**Why:** In Arcana reviews, before suggesting deletion of suspected "trash" files, confirm they are truly untracked/ignored so you don't recommend removing tracked, meaningful code.

**How to apply:** Run `git check-ignore <path>` to verify a file is untracked/ignored before listing it as deletable in review output.

Related: [[arcana-tui-diff-hang-network-drive]] [[arcana-shell-is-powershell]] [[arcana-bash-tool-gated]] [[arcana-agents-md-conventions]] [[verify-claims-repo-wide-before-asserting]] [[trace-client-and-server-for-hang]] [[asserted-effect-timeout-kills-child-unverified]] [[inferred-root-cause-without-reproduction]] [[git-run-no-timeout]] [[createresource-memo-equals]] [[network-drive-theory-wrong]] [[vcs-diff-hang-root-cause]] [[effect-timeout-propagates-to-child-kill]] [[arcana-runtime-architecture]] [[arcana-ai-npm-package]] [[arcana-governance-engine]] [[arcana-tech-stack]] [[arcana-phase-c-status]] [[arcana-project-scope]] [[arcana-project-status]] [[arcana-entry-points]] [[mid-word-wrap-artifact]] [[output-truncation-pipeline]] [[token-budget-limits]] [[text-delta-assembly]] [[layered-output-constraints]] [[normalize-chat-prose-limited-kinds]] [[text-delta-no-word-boundary-awareness]] [[incident-gantt-timeline-dashboard]] [[gantt-bar-rendering-pattern]] [[route-extension-pattern]] [[arcana-chrome-component-composition]] [[signal-driven-tui-state]] [[design-before-code-user-preference]] [[truncated-code-output]] [[prose-width-collapses-to-1-on-first-paint]] [[width-contract-chain]] [[bash-tool-needs-goal]] [[denied-remote-content-injection-policy]] [[retry-instead-of-explain-permission-blocks]] [[explained-block-instead-of-retrying-request]] [[arcana-category-identification]] [[arcana-is-security-kernel-not-coding-assistant]] [[arcana-intent-binding-feature]] [[arcana-authorization-vs-completion-verification]] [[arcana-three-tier-publishing-strategy]]
