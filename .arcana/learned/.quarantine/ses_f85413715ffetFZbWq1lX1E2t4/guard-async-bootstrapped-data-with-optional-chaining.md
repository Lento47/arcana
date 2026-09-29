---
tags: [tui, solidjs, optional-chaining, async-bootstrap]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# guard async bootstrapped data with optional chaining

Use optional chaining on every access to async-bootstrapped context data (sync.data.*, sdk.event), matching the existing directory.ts pattern

When a context bootstrates asynchronously (daemon fetch, SSE hydration), eagerly-mounted components render at least once before the data exists. Guard every access: `sync.data.session?.filter(...)`, `sync.data.provider?.find(...)`, `sdk?.event?.on(...)`.

**Why:** In reactive frameworks like Solid, a TypeError inside a memo/effect kills the entire render tree — the whole TUI crashes, not just one component. One unguarded access is enough to take down the app during the bootstrap window.

**How to apply:** Default to `?.` on every `sync.data.*` collection access and handle the undefined case gracefully (empty results, fallbacks). Before writing new reads from the sync context, grep sibling files (e.g. `directory.ts` uses `sync.data.vcs?.branch`) for the established guard convention and match it.
