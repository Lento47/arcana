---
tags: [pattern, tui, react, diff-viewer]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# createresource memo equals

`createResource` uses memo `equals` (e.g., sameDiffRequest) to prevent refetch — sound design

In the TUI diff code, `createResource` uses the memo's `equals: sameDiffRequest` to prevent redundant refetches, and a `withDiffRequestTimeout` race to reject hung requests. This pattern alone cannot cause permanent hangs.

**Why:** Proper memo equality and client timeout race are correct defensive patterns; ruling them out narrows the bug to server/render sides.

**How to apply:** When auditing resource-fetch hangs, check if memo equality + timeout race exist; if sound, look elsewhere (server handler, render loop).

Related: [[effect-timeout-propagates-to-child-kill]] [[normalize-chat-prose-limited-kinds]] [[text-delta-no-word-boundary-awareness]] [[incident-gantt-timeline-dashboard]] [[gantt-bar-rendering-pattern]] [[route-extension-pattern]] [[arcana-chrome-component-composition]] [[signal-driven-tui-state]] [[design-before-code-user-preference]] [[truncated-code-output]] [[prose-width-collapses-to-1-on-first-paint]] [[width-contract-chain]]
