---
tags: [arcana, debugging, architecture]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# trace client and server for hang

For TUI/daemon hangs, inspect both client timeout and server-side process spawn/kill

When a UI request hangs, do not assume the client timeout solves it. Trace the full path: client abort mechanism (e.g., DIFF_REQUEST_TIMEOUT_MS) AND server-side spawn (e.g., Git.run) to see if the server process is killed on client abort.

**Why:** Arcana TUI's 15s client timeout did not kill the server-side git process over L:\, so the daemon stayed blocked.

**How to apply:** In client/server architectures, verify that client-side cancellation propagates to server process termination; otherwise the server resource stays occupied.

Related: [[verify-environmental-assumptions]] [[network-drive-theory-wrong]] [[vcs-diff-hang-root-cause]] [[arcana-runtime-architecture]] [[arcana-ai-npm-package]] [[arcana-governance-engine]] [[arcana-tech-stack]] [[arcana-phase-c-status]] [[arcana-project-scope]] [[arcana-project-status]] [[arcana-entry-points]] [[mid-word-wrap-artifact]] [[truncation-type-distinction]] [[output-truncation-pipeline]] [[token-budget-limits]] [[text-delta-assembly]] [[layered-output-constraints]] [[initial-wrong-paths]] [[normalize-chat-prose-limited-kinds]] [[text-delta-no-word-boundary-awareness]] [[incident-gantt-timeline-dashboard]] [[gantt-bar-rendering-pattern]] [[route-extension-pattern]] [[arcana-chrome-component-composition]] [[signal-driven-tui-state]] [[design-before-code-user-preference]] [[truncated-code-output]] [[prose-width-collapses-to-1-on-first-paint]] [[width-contract-chain]] [[bash-tool-needs-goal]] [[freeconomics-core-architecture]] [[freeconomics-three-profitability-blockers]] [[denied-remote-content-injection-policy]] [[retry-instead-of-explain-permission-blocks]] [[explained-block-instead-of-retrying-request]] [[arcana-category-identification]] [[arcana-is-security-kernel-not-coding-assistant]] [[arcana-intent-binding-feature]] [[arcana-authorization-vs-completion-verification]] [[arcana-three-tier-publishing-strategy]] [[wrong-test-suite-in-goal-check]] [[multi-gate-entry-filter-architecture]] [[mt5-terminal-locking-on-restart]] [[ts-harness-domain-verification-catch-22]] [[ts-harness-bootstrapping-deadlock]] [[verify-changes-thoroughly]] [[goal-check-workspace-default]] [[trusting-tool-output-without-verifying-workspace]]
