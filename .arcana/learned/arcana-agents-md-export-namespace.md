---
tags: [arcana, conventions, typescript]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# arcana agents md export namespace

AGENTS.md forbids export namespace Foo {}; requires flat self-reexport export * as Foo from "./foo"

**Why:** Arcana's AGENTS.md establishes a code convention banning `export namespace Foo {}` blocks to keep module structure flat and avoid nested namespace confusion.

**How to apply:** When writing/generating Arcana TypeScript, use `export * as Foo from "./foo"` for re-export groupings, never `export namespace Foo {}`.

Related: [[arcana-tui-diff-hang-network-drive]] [[arcana-shell-is-powershell]] [[arcana-bash-tool-gated]] [[arcana-agents-md-conventions]] [[verify-claims-repo-wide-before-asserting]] [[trace-client-and-server-for-hang]] [[asserted-effect-timeout-kills-child-unverified]] [[inferred-root-cause-without-reproduction]] [[arcana-runtime-architecture]] [[arcana-ai-npm-package]] [[arcana-governance-engine]] [[arcana-tech-stack]] [[arcana-phase-c-status]] [[arcana-project-scope]] [[arcana-project-status]] [[arcana-entry-points]] [[mid-word-wrap-artifact]] [[output-truncation-pipeline]] [[token-budget-limits]] [[text-delta-assembly]] [[layered-output-constraints]] [[normalize-chat-prose-limited-kinds]] [[text-delta-no-word-boundary-awareness]] [[incident-gantt-timeline-dashboard]] [[gantt-bar-rendering-pattern]] [[route-extension-pattern]] [[arcana-chrome-component-composition]] [[signal-driven-tui-state]] [[design-before-code-user-preference]] [[truncated-code-output]] [[prose-width-collapses-to-1-on-first-paint]] [[width-contract-chain]] [[bash-tool-needs-goal]] [[denied-remote-content-injection-policy]] [[retry-instead-of-explain-permission-blocks]] [[explained-block-instead-of-retrying-request]] [[arcana-category-identification]] [[arcana-is-security-kernel-not-coding-assistant]] [[arcana-intent-binding-feature]] [[arcana-authorization-vs-completion-verification]] [[arcana-three-tier-publishing-strategy]] [[require-confirm-per-step-enforcement]] [[split-large-file-by-domain-surface]] [[refactor-by-domain-surface]] [[barrel-re-export-refactor]] [[split-by-domain-surface]] [[barrel-pattern-for-code-splitting]] [[barrel-re-export-split-pattern]] [[domain-surface-file-split]]
