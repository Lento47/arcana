---
tags: [arcana, tui, store, debugging]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# arcana sync data initialized synchronously

Arcana sync store initializes message/part/session collections synchronously, so unguarded sync.data reads cannot crash at boot

The store's initial state sets `message: {}`, `part: {}`, and `session: []` synchronously at initialization (~line 237), so a plain boot cannot observe `undefined` collections.

**Why:** Optional-chaining guards on `sync.data.message[...]` / `sync.data.session` reads (e.g., in `use-spine-projection.ts` and `spine-entry.tsx`) are defensive hardening, not the fix for the observed boot crash — the collections exist before any subscriber reads them.

**How to apply:** Before adding guards for a suspected undefined collection, read the store's init code to confirm the collection can actually be missing at read time; never infer crash causes from unguarded reads alone.
