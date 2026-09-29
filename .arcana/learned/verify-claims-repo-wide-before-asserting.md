---
tags: [arcana, code-review, verification]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# verify claims repo wide before asserting

Use ripgrep to confirm a code gap exists repo-wide before asserting it in reviews

Before reporting that a feature/flag is unenforced or missing, grep the entire source for all reference sites (type union, tests, push sites) to avoid false claims.

**Why:** The assistant noted `DENY_UNLABELED_CONSEQUENTIAL` might be unenforced, then verified repo-wide and confirmed no push site existed — turning a hypothesis into a confirmed P1 finding.

**How to apply:** When making negative claims about a codebase (unused, unenforced, missing), run a comprehensive grep and check type defs + tests before writing the conclusion.

Related: [[verify-environmental-assumptions]] [[arcana-runtime-architecture]] [[arcana-ai-npm-package]] [[arcana-governance-engine]] [[arcana-tech-stack]] [[arcana-phase-c-status]] [[arcana-project-scope]] [[arcana-project-status]] [[arcana-entry-points]] [[mid-word-wrap-artifact]] [[output-truncation-pipeline]] [[token-budget-limits]] [[text-delta-assembly]] [[layered-output-constraints]] [[normalize-chat-prose-limited-kinds]] [[text-delta-no-word-boundary-awareness]] [[incident-gantt-timeline-dashboard]] [[gantt-bar-rendering-pattern]] [[route-extension-pattern]] [[arcana-chrome-component-composition]] [[signal-driven-tui-state]] [[design-before-code-user-preference]] [[truncated-code-output]] [[prose-width-collapses-to-1-on-first-paint]] [[width-contract-chain]] [[bash-tool-needs-goal]] [[denied-remote-content-injection-policy]] [[retry-instead-of-explain-permission-blocks]] [[explained-block-instead-of-retrying-request]] [[arcana-category-identification]] [[arcana-is-security-kernel-not-coding-assistant]] [[arcana-intent-binding-feature]] [[arcana-authorization-vs-completion-verification]] [[arcana-three-tier-publishing-strategy]] [[grounding-ai-claims-in-verbatim-quotes]] [[source-code-verification-over-docs]] [[parallel-audit-technique]] [[parallel-code-audits]] [[avoid-surface-level-code-assessment]] [[audit-source-before-claims]] [[audit-from-source-not-readme]] [[premature-fix-recommendation]] [[verify-refactoring-with-checks]] [[trusting-tool-output-without-verifying-workspace]]
