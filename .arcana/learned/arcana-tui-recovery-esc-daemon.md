---
tags: [arcana, tui, debugging]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# arcana tui recovery esc daemon

Arcana TUI diff hang recovers via Esc; killing dev daemon is safe (TUI wrapper auto-respawns per AGENTS.md).

Pressing `Esc` backs out of the diff viewer/palette and restores TUI input even if server git call still runs. If fully frozen, kill the dev daemon (Ctrl-C in terminal or close/relaunch `arcana`) — state is preserved and the wrapper auto-respawns.

**Why:** The hang is a server-side git block, not a client crash; client input is only blocked while awaiting the resource.

**How to apply:** First suggest Esc to users stuck in TUI. If unresponsive, instruct daemon restart — it is safe and non-destructive per AGENTS.md.

Related: [[arcana-tui-diff-hang-network-drive]] [[arcana-pdp-deny-unlabeled-gap]] [[powershell-constraints-arcana]] [[bash-tool-gated-goal-set]] [[arcana-agents-md-conventions]] [[arcana-git-no-timeout]] [[arcana-validate-ancestors-fail-open]] [[arcana-stray-db-files]] [[verify-enforcement-gap-with-rg]] [[verify-untracked-before-deletion]] [[arcana-tui-diff-hang-root-cause]] [[arcana-bash-tool-gated]] [[arcana-powershell-not-bash]] [[arcana-agents-md-export-namespace]] [[arcana-agents-md-branding]] [[arcana-governance-deny-unlabeled-gap]] [[effect-timeoutfail-kills-child-process]] [[arcana-verify-trash-untracked]] [[arcana-shell-is-powershell]] [[verify-claims-repo-wide-before-asserting]] [[trace-client-and-server-for-hang]] [[asserted-effect-timeout-kills-child-unverified]] [[inferred-root-cause-without-reproduction]] [[agts-md-tui-strings]] [[verify-environmental-assumptions]] [[createresource-memo-equals]] [[network-drive-theory-wrong]] [[vcs-diff-hang-root-cause]] [[arcana-runtime-architecture]] [[arcana-ai-npm-package]] [[arcana-governance-engine]] [[arcana-tech-stack]] [[arcana-phase-c-status]] [[arcana-project-scope]] [[arcana-project-status]] [[arcana-entry-points]] [[mid-word-wrap-artifact]] [[truncation-type-distinction]] [[output-truncation-pipeline]] [[token-budget-limits]] [[text-delta-assembly]] [[layered-output-constraints]] [[initial-wrong-paths]] [[normalize-chat-prose-limited-kinds]] [[text-delta-no-word-boundary-awareness]] [[incident-gantt-timeline-dashboard]] [[gantt-bar-rendering-pattern]] [[route-extension-pattern]] [[arcana-chrome-component-composition]] [[signal-driven-tui-state]] [[design-before-code-user-preference]] [[truncated-code-output]] [[prose-width-collapses-to-1-on-first-paint]] [[width-contract-chain]] [[bash-tool-needs-goal]] [[freeconomics-three-profitability-blockers]] [[denied-remote-content-injection-policy]] [[retry-instead-of-explain-permission-blocks]] [[explained-block-instead-of-retrying-request]] [[arcana-category-identification]] [[arcana-is-security-kernel-not-coding-assistant]] [[arcana-intent-binding-feature]] [[arcana-authorization-vs-completion-verification]] [[arcana-three-tier-publishing-strategy]] [[wrong-test-suite-in-goal-check]] [[mt5-terminal-locking-on-restart]] [[verify-changes-thoroughly]] [[goal-check-workspace-default]] [[trusting-tool-output-without-verifying-workspace]]
