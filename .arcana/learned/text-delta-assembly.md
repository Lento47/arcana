---
tags: [arcana, text-delta, session-processor, text-normalizer]
date: 2026-09-01
source: ses_fa58b92d0ffeoylkEbVXzX5s8s
---
# text delta assembly

Text delta assembly in session processor may split mid-word

The session processor handles `text-delta` events and assembles response text through a text normalizer.

**Why:**
- Text delta chunks from the AI SDK are reassembled in the session processor
- The text normalizer processes these chunks, potentially introducing newline splits
- Evidence shows "here's" becoming "here\n's" — a classic sign of chunk boundary splitting at inappropriate points
- The normalizer likely splits on whitespace or newlines without checking word boundaries

**How to apply:**
Examine the text normalizer and session processor text-delta handling code to find where splits occur. Look for regex patterns or string operations that break on `\n` or whitespace without buffering incomplete words. A fix would involve buffering partial words across chunk boundaries before emitting complete tokens.

Related: [[normalize-chat-prose-limited-kinds]] [[text-delta-no-word-boundary-awareness]] [[incident-gantt-timeline-dashboard]] [[gantt-bar-rendering-pattern]] [[route-extension-pattern]] [[arcana-chrome-component-composition]] [[signal-driven-tui-state]] [[design-before-code-user-preference]] [[truncated-code-output]] [[prose-width-collapses-to-1-on-first-paint]] [[width-contract-chain]] [[bash-tool-needs-goal]] [[denied-remote-content-injection-policy]] [[retry-instead-of-explain-permission-blocks]] [[explained-block-instead-of-retrying-request]] [[arcana-category-identification]] [[arcana-is-security-kernel-not-coding-assistant]] [[arcana-intent-binding-feature]] [[arcana-authorization-vs-completion-verification]] [[arcana-three-tier-publishing-strategy]]
