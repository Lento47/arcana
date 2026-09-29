---
tags: [arcana, effect, verification]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# asserted effect timeout kills child unverified

Claimed Effect.timeoutFail kills child git process without verifying effect@4.0.0-beta.74 source

The assistant proposed wrapping Git.run in `Effect.timeoutFail` and asserted it would force-kill the blocking git child process. When challenged ('are you sure?'), it admitted it had not verified that `effect/unstable/process` kills on fiber interrupt in the installed version (4.0.0-beta.74) — it may only detach, leaving orphaned processes.

**Why:** Asserting library behavior from memory without checking the installed source leads to misleading fix proposals.

**How to apply:** Before presenting a fix that relies on a specific library mechanism (timeouts, process killing, signals), verify the behavior in the actually-installed version's source or docs. State caveats explicitly if unverified.

Related: [[effect-beta-version]] [[verify-environmental-assumptions]] [[effect-timeout-propagates-to-child-kill]] [[arcana-runtime-architecture]] [[arcana-ai-npm-package]] [[arcana-governance-engine]] [[arcana-tech-stack]] [[arcana-phase-c-status]] [[arcana-project-scope]] [[arcana-project-status]] [[arcana-entry-points]] [[mid-word-wrap-artifact]] [[output-truncation-pipeline]] [[token-budget-limits]] [[text-delta-assembly]] [[layered-output-constraints]] [[normalize-chat-prose-limited-kinds]] [[text-delta-no-word-boundary-awareness]] [[incident-gantt-timeline-dashboard]] [[gantt-bar-rendering-pattern]] [[route-extension-pattern]] [[arcana-chrome-component-composition]] [[signal-driven-tui-state]] [[design-before-code-user-preference]] [[truncated-code-output]] [[prose-width-collapses-to-1-on-first-paint]] [[width-contract-chain]] [[bash-tool-needs-goal]] [[denied-remote-content-injection-policy]] [[retry-instead-of-explain-permission-blocks]] [[explained-block-instead-of-retrying-request]] [[arcana-category-identification]] [[arcana-is-security-kernel-not-coding-assistant]] [[arcana-intent-binding-feature]] [[arcana-authorization-vs-completion-verification]] [[arcana-three-tier-publishing-strategy]] [[grounding-ai-claims-in-verbatim-quotes]] [[source-code-verification-over-docs]] [[parallel-code-audits]] [[avoid-surface-level-code-assessment]] [[audit-source-before-claims]] [[verify-refactoring-with-checks]] [[trusting-tool-output-without-verifying-workspace]]
