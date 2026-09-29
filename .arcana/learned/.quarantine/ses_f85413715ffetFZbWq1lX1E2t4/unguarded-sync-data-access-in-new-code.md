---
tags: [tui, sync-context, optional-chaining, consistency]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# unguarded sync data access in new code

use-spine-projection.ts and project.tsx accessed sync.data/sdk.event unguarded despite directory.ts already establishing the ?. guard pattern

The crash existed because newer code in `use-spine-projection.ts` accessed `sync.data.session` and `sync.data.provider` without optional chaining, and `project.tsx` called `sdk.event.on` before SDK init — even though `directory.ts` in the same codebase already used the safe pattern (`sync.data.vcs?.branch`).

**Why:** Established guard patterns exist precisely because async bootstrap leaves data undefined early; skipping them in new code reintroduces a known crash class that tests can't catch (they run after bootstrap completes).

**How to apply:** Treat `?.` on `sync.data.*` and `sdk.*` accesses as mandatory in this codebase. Before adding reads from async-bootstrapped contexts, check how sibling files guard the same accesses and match that convention.
