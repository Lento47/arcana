---
tags: [arcana, output-truncation, token-budget, text-normalizer]
date: 2026-09-01
source: ses_fa58b92d0ffeoylkEbVXzX5s8s
---
# output truncation pipeline

Multi-layer output truncation pipeline causes mid-word cuts in AI responses

The arcana codebase has a multi-layered output truncation pipeline that can cause responses to be cut off mid-word (e.g., "here's" rendered as "here\n's").

**Why:**
Response text passes through several stages each with independent limits:
1. Token budget (`packages/ml/src/token.ts`) sets `DEFAULT_OUTPUT = 4_096` and `DEFAULT_CONTEXT = 128_000`
2. `ResponsePipelinePreflightInput` in `packages/ml/src/response-pipeline.ts` enforces `maxContextTokens` and `reservedOutputTokens`
3. `ProviderTransform` in `packages/engine/src/provider-transform.ts` computes `maxOutputTokens` and applies a hard output cap
4. The text normalizer and session processor (`text-delta` handling) assemble chunks, potentially splitting mid-word
5. HTTP transport and AI SDK adapter layers further chunk and assemble text

**How to apply:**
When debugging truncation issues, trace through all layers: token budget → preflight → provider transform → text normalizer → session processor → HTTP transport. The mid-word split likely originates in the text normalizer or chunk assembly logic in the session processor, where text-delta events are reassembled without regard for word boundaries. Check if `reservedOutputTokens` is too aggressively reducing available output, or if the text normalizer splits on newlines without preserving word integrity.

Related: [[normalize-chat-prose-limited-kinds]] [[text-delta-no-word-boundary-awareness]] [[incident-gantt-timeline-dashboard]] [[gantt-bar-rendering-pattern]] [[route-extension-pattern]] [[arcana-chrome-component-composition]] [[signal-driven-tui-state]] [[design-before-code-user-preference]] [[truncated-code-output]] [[prose-width-collapses-to-1-on-first-paint]] [[width-contract-chain]] [[bash-tool-needs-goal]] [[denied-remote-content-injection-policy]] [[retry-instead-of-explain-permission-blocks]] [[explained-block-instead-of-retrying-request]] [[arcana-category-identification]] [[arcana-is-security-kernel-not-coding-assistant]] [[arcana-intent-binding-feature]] [[arcana-authorization-vs-completion-verification]] [[arcana-three-tier-publishing-strategy]]
