---
tags: [arcana, engine, tui, streaming]
date: 2026-09-01
source: ses_fa5a19358ffeefMYEXA1ra590Z
---
# text delta no word boundary awareness

text-delta events are individual chunks with no word-boundary awareness, causing mid-word breaks

**Why:** The AI SDK `streamText` produces `text-delta` events as individual chunks that do not respect word boundaries. When these chunks are accumulated in `data.tsx:272` (`match.text += event.properties.delta`), a word like "here's" can be split across two deltas (e.g., "here" then "'s"), and the accumulation preserves that split. The TUI then renders the accumulated text, and the word break becomes visible.

**How to apply:** The accumulation layer (`data.tsx`) or the normalization layer (`processor.ts:1197-1205` `normalizeTextDelta()`) could buffer partial words and reassemble them before appending to `match.text`. Alternatively, the rendering layer could re-join split words, though that is more fragile.

Related: [[incident-gantt-timeline-dashboard]] [[gantt-bar-rendering-pattern]] [[route-extension-pattern]] [[arcana-chrome-component-composition]] [[signal-driven-tui-state]] [[design-before-code-user-preference]] [[truncated-code-output]] [[prose-width-collapses-to-1-on-first-paint]] [[width-contract-chain]] [[bash-tool-needs-goal]] [[denied-remote-content-injection-policy]] [[retry-instead-of-explain-permission-blocks]] [[explained-block-instead-of-retrying-request]] [[arcana-category-identification]] [[arcana-is-security-kernel-not-coding-assistant]] [[arcana-intent-binding-feature]] [[arcana-authorization-vs-completion-verification]] [[arcana-three-tier-publishing-strategy]]
