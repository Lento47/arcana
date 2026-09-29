---
tags: [arcana, powershell, tooling]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# arcana powershell not bash

Shell is PowerShell, not bash; for loops and > redirects fail with ParserError

**Why:** The agent shell in Arcana is PowerShell. Bash syntax like `for` loops and `>` output redirects cause `ParserError` and fail.

**How to apply:** Use PowerShell loops and `rg` (ripgrep) for searches. Avoid bash-specific redirection; pipe or use PowerShell native cmdlets.

Related: [[arcana-tui-diff-hang-network-drive]] [[arcana-shell-is-powershell]] [[arcana-bash-tool-gated]] [[arcana-agents-md-conventions]] [[verify-claims-repo-wide-before-asserting]] [[trace-client-and-server-for-hang]] [[asserted-effect-timeout-kills-child-unverified]] [[inferred-root-cause-without-reproduction]] [[powershell-environment]] [[network-drive-theory-wrong]] [[l-drive-is-local-volume]] [[arcana-runtime-architecture]] [[arcana-ai-npm-package]] [[arcana-governance-engine]] [[arcana-tech-stack]] [[arcana-phase-c-status]] [[arcana-project-scope]] [[arcana-project-status]] [[arcana-entry-points]] [[mid-word-wrap-artifact]] [[output-truncation-pipeline]] [[token-budget-limits]] [[text-delta-assembly]] [[layered-output-constraints]] [[normalize-chat-prose-limited-kinds]] [[text-delta-no-word-boundary-awareness]] [[incident-gantt-timeline-dashboard]] [[gantt-bar-rendering-pattern]] [[route-extension-pattern]] [[arcana-chrome-component-composition]] [[signal-driven-tui-state]] [[design-before-code-user-preference]] [[truncated-code-output]] [[prose-width-collapses-to-1-on-first-paint]] [[width-contract-chain]] [[bash-tool-needs-goal]] [[denied-remote-content-injection-policy]] [[retry-instead-of-explain-permission-blocks]] [[explained-block-instead-of-retrying-request]] [[arcana-category-identification]] [[arcana-is-security-kernel-not-coding-assistant]] [[arcana-intent-binding-feature]] [[arcana-authorization-vs-completion-verification]] [[arcana-three-tier-publishing-strategy]] [[fallback-on-tool-failure]] [[firecrawl-mcp-assumption]] [[goal-check-workspace-mismatch]] [[goal-check-workspace-default]] [[trusting-tool-output-without-verifying-workspace]]
