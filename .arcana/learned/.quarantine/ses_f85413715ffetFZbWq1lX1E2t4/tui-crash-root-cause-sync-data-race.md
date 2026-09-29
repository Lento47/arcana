---
tags: [tui, sync-context, race-condition, crash]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# tui crash root cause sync data race

TUI crashed because UI mounts render eagerly before the async sync context bootstrap finishes, leaving sync.data undefined

The sync context bootstraps its data asynchronously (daemon fetch, SSE hydration). UI components mount and render eagerly on first paint — before that bootstrap completes. During that window `sync.data` and its collections (`session`, `provider`) are `undefined`, so accesses like `sync.data.provider.find(...)` threw `TypeError: Cannot read properties of undefined (reading 'find')` inside Solid memos/effects, killing the render tree and crashing the TUI. Same race applied to `sdk.event.on` called before SDK init in `project.tsx`. Fixed with optional chaining guards at 5 locations across `use-spine-projection.ts` and `project.tsx`; all 1351 TUI tests pass.

**Why:** Documents the root cause of the TUI crash — a render/bootstrap race, not a logic bug.

**How to apply:** Any crash showing `Cannot read properties of undefined` on sync context data during startup is this race until proven otherwise; check for unguarded `sync.data.*` accesses.
