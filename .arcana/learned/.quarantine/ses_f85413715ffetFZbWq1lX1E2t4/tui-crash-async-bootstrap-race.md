---
tags: [tui, solid, race-condition, sync]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# tui crash async bootstrap race

TUI crash root cause: Solid components render before async sync bootstrap fills sync.data, so unguarded collection calls throw inside the render tree

The sync context bootstraps data asynchronously (daemon fetch + SSE hydration). UI components mount and render eagerly on first paint — before bootstrap completes. During that window `sync.data` and its collections (`provider`, `session`) are `undefined`; unguarded calls like `sync.data.provider.find(...)` throw `TypeError: Cannot read properties of undefined (reading 'find')` inside a Solid memo/effect, killing the render tree and crashing the TUI.

**Why:** Optional chaining returns `undefined` instead of throwing, letting the memo re-run reactively once bootstrap fills the store.

**How to apply:** Guard every `sync.data.*` and `sdk.*` access that can render before bootstrap with `?.` (e.g., `sync.data.session?.some(...)`), following the existing pattern in `directory.ts` (`sync.data.vcs?.branch`). Fixed locations: `use-spine-projection.ts` and `project.tsx` (`sdk?.event?.on`).
