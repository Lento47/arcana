---
tags: [arcana, token-budget, ml, configuration]
date: 2026-09-01
source: ses_fa58b92d0ffeoylkEbVXzX5s8s
---
# token budget limits

Token budget layers create compounding output constraints

Multiple token budget layers interact to constrain model output:

**Why:**
- `DEFAULT_OUTPUT = 4_096` (packages/ml/src/token.ts:36) and `DEFAULT_CONTEXT = 128_000` (line 35) are defaults
- `TokenBudgetInput` accepts `maxContextTokens` and `reservedOutputTokens` which reduce available output
- `ResponsePipelinePreflightInput` validates against `maxContextTokens` and `reservedOutputTokens`
- `ProviderTransform` further computes `maxOutputTokens` from these inputs, potentially applying additional hard caps

**How to apply:**
When tuning response length, account for all layers: the base `DEFAULT_OUTPUT`, the `reservedOutputTokens` deduction, and any provider-specific `maxOutputTokens` cap. The effective output is the minimum across all these layers. If `reservedOutputTokens` is set too high relative to the content needed, responses truncate early.

Related: [[normalize-chat-prose-limited-kinds]] [[text-delta-no-word-boundary-awareness]] [[incident-gantt-timeline-dashboard]] [[gantt-bar-rendering-pattern]] [[route-extension-pattern]] [[arcana-chrome-component-composition]] [[signal-driven-tui-state]] [[design-before-code-user-preference]] [[truncated-code-output]] [[prose-width-collapses-to-1-on-first-paint]] [[width-contract-chain]] [[bash-tool-needs-goal]] [[denied-remote-content-injection-policy]] [[retry-instead-of-explain-permission-blocks]] [[explained-block-instead-of-retrying-request]] [[arcana-category-identification]] [[arcana-is-security-kernel-not-coding-assistant]] [[arcana-intent-binding-feature]] [[arcana-authorization-vs-completion-verification]] [[arcana-three-tier-publishing-strategy]] [[deployment-symbol-restriction]] [[per-domain-fetch-headers-implementation]] [[goal-check-workspace-mismatch]]
