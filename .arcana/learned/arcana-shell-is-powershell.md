---
tags: [arcana, powershell, environment]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# arcana shell is powershell

Arcana dev shell is PowerShell, not bash; for loops and > redirects fail with ParserError

The shell environment for Arcana sessions is PowerShell. Using bash-style `for` loops or `>` redirection causes ParserError. Use PowerShell loop syntax and `rg` (ripgrep) for searches.

**Why:** The assistant initially attempted bash constructs that failed; PowerShell is the configured shell.

**How to apply:** When writing shell commands in Arcana sessions, use PowerShell syntax (e.g., `foreach`, `| Out-File`) and prefer `rg` over `grep`/`find`.

Related: [[powershell-environment]] [[network-drive-theory-wrong]] [[l-drive-is-local-volume]] [[arcana-runtime-architecture]] [[arcana-ai-npm-package]] [[arcana-governance-engine]] [[arcana-tech-stack]] [[arcana-phase-c-status]] [[arcana-project-scope]] [[arcana-project-status]] [[arcana-entry-points]] [[mid-word-wrap-artifact]] [[output-truncation-pipeline]] [[token-budget-limits]] [[text-delta-assembly]] [[layered-output-constraints]] [[normalize-chat-prose-limited-kinds]] [[text-delta-no-word-boundary-awareness]] [[incident-gantt-timeline-dashboard]] [[gantt-bar-rendering-pattern]] [[route-extension-pattern]] [[arcana-chrome-component-composition]] [[signal-driven-tui-state]] [[design-before-code-user-preference]] [[truncated-code-output]] [[prose-width-collapses-to-1-on-first-paint]] [[width-contract-chain]] [[bash-tool-needs-goal]] [[denied-remote-content-injection-policy]] [[retry-instead-of-explain-permission-blocks]] [[explained-block-instead-of-retrying-request]] [[arcana-category-identification]] [[arcana-is-security-kernel-not-coding-assistant]] [[arcana-intent-binding-feature]] [[arcana-authorization-vs-completion-verification]] [[arcana-three-tier-publishing-strategy]]
