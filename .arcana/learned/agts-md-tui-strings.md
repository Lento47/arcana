---
tags: [project, tui, governance]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# agts md tui strings

AGENTS.md: TUI strings from `branding.ts`; killing dev daemon auto-respawns

Per AGENTS.md, TUI string constants are sourced from `branding.ts`. Additionally, killing the dev daemon causes it to auto-respawn.

**Why:** Knowing string sources aids grepping; knowing daemon respawns prevents confusion during process inspection.

**How to apply:** Look in `branding.ts` for TUI labels; expect dev daemon to restart if terminated during debugging.

Related: [[arcana-governance-engine]] [[normalize-chat-prose-limited-kinds]] [[text-delta-no-word-boundary-awareness]] [[incident-gantt-timeline-dashboard]] [[gantt-bar-rendering-pattern]] [[route-extension-pattern]] [[arcana-chrome-component-composition]] [[signal-driven-tui-state]] [[design-before-code-user-preference]] [[truncated-code-output]] [[prose-width-collapses-to-1-on-first-paint]] [[width-contract-chain]]
