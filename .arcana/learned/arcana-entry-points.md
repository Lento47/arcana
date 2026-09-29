---
tags: [arcana, architecture, project-structure]
date: 2026-09-01
source: ses_fa5a19358ffeefMYEXA1ra590Z
---
# arcana entry points

Three main package directories to start building on Arcana: core, engine, and tui

**Why:** For serious development on Arcana, the relevant codebases are organized into clear packages: `packages/core/src/` contains the effect runtime, persistence, and capabilities; `packages/engine/src/` contains the session engine, agents, and tools; `packages/tui/src/app.tsx` is the main TUI entry point.

**How to apply:** When onboarding to Arcana, start by exploring `packages/core/src/` for the runtime primitives, then `packages/engine/src/` for agent and session logic, then `packages/tui/src/app.tsx` for the interface layer.

Related: [[mid-word-wrap-artifact]] [[output-truncation-pipeline]] [[token-budget-limits]] [[text-delta-assembly]] [[layered-output-constraints]] [[normalize-chat-prose-limited-kinds]] [[text-delta-no-word-boundary-awareness]] [[incident-gantt-timeline-dashboard]] [[gantt-bar-rendering-pattern]] [[route-extension-pattern]] [[arcana-chrome-component-composition]] [[signal-driven-tui-state]] [[design-before-code-user-preference]] [[truncated-code-output]] [[prose-width-collapses-to-1-on-first-paint]] [[width-contract-chain]] [[bash-tool-needs-goal]] [[freeconomics-core-architecture]] [[denied-remote-content-injection-policy]] [[retry-instead-of-explain-permission-blocks]] [[explained-block-instead-of-retrying-request]] [[arcana-category-identification]] [[arcana-is-security-kernel-not-coding-assistant]] [[arcana-intent-binding-feature]] [[arcana-authorization-vs-completion-verification]] [[arcana-three-tier-publishing-strategy]] [[multi-gate-entry-filter-architecture]] [[ts-harness-domain-verification-catch-22]] [[ts-harness-bootstrapping-deadlock]]
