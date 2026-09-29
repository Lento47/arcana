---
tags: [arcana, debugging-pattern, output-pipeline]
date: 2026-09-01
source: ses_fa58b92d0ffeoylkEbVXzX5s8s
---
# layered output constraints

Output limits are applied at multiple independent layers, each potentially reducing available output

When tracing output issues in arcana, check each layer independently:
1. Token budget defaults (`DEFAULT_OUTPUT`, `DEFAULT_CONTEXT`)
2. Preflight validation (`maxContextTokens`, `reservedOutputTokens`)
3. Provider transform (`maxOutputTokens` computation)
4. Text assembly (normalizer, chunk handling)

Each layer can independently truncate output, and the effective limit is the minimum across all layers. Debugging requires tracing through all layers to find the binding constraint.

Related: [[normalize-chat-prose-limited-kinds]] [[text-delta-no-word-boundary-awareness]] [[incident-gantt-timeline-dashboard]] [[gantt-bar-rendering-pattern]] [[route-extension-pattern]] [[arcana-chrome-component-composition]] [[signal-driven-tui-state]] [[design-before-code-user-preference]] [[truncated-code-output]] [[prose-width-collapses-to-1-on-first-paint]] [[width-contract-chain]] [[bash-tool-needs-goal]] [[denied-remote-content-injection-policy]] [[retry-instead-of-explain-permission-blocks]] [[explained-block-instead-of-retrying-request]] [[arcana-category-identification]] [[arcana-is-security-kernel-not-coding-assistant]] [[arcana-intent-binding-feature]] [[arcana-authorization-vs-completion-verification]] [[arcana-three-tier-publishing-strategy]]
