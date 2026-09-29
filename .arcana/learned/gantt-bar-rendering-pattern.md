---
tags: [arcana, tui, solidjs, gantt]
date: 2026-09-01
source: ses_fa534a0b8ffecbIDAava33UHvM
---
# gantt bar rendering pattern

Gantt bars rendered as horizontal SolidJS components with phase label, duration, and status color

**Why:** Visualizing incident phases as a timeline requires horizontal bars proportional to duration, color-coded by status (pending/active/resolved). SolidJS signals drive bar width and color reactively.

**How to apply:** For each phase row, use a horizontal layout with: label (~20 chars) on the left, a colored bar fill proportional to `phase.duration / maxDuration`, and a status indicator at the right edge. Use `useTerminalDimensions` to compute bar width in characters. Map status to arcana theme colors. Wrap in `For` for iteration and `Show` for conditional rendering.

Related: [[prose-width-collapses-to-1-on-first-paint]] [[width-contract-chain]] [[bash-tool-needs-goal]] [[denied-remote-content-injection-policy]] [[retry-instead-of-explain-permission-blocks]] [[explained-block-instead-of-retrying-request]] [[arcana-category-identification]] [[arcana-is-security-kernel-not-coding-assistant]] [[arcana-intent-binding-feature]] [[arcana-authorization-vs-completion-verification]] [[arcana-three-tier-publishing-strategy]]
