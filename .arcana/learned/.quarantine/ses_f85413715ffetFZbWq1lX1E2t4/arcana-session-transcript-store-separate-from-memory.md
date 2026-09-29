---
tags: [arcana, storage, sessions]
date: 2026-09-08
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# arcana session transcript store separate from memory

Live session transcripts (served via SSE) are stored separately from the memory package's DB — different stores, check storage/session for the real transcript

When hunting the live session transcript (e.g. to investigate rendering of past turns), the memory DB is a DIFFERENT store (the memory package) — the live transcript served by the SSE endpoint for sessions like `ses_f854...` lives elsewhere, under the workspace storage tree (`storage/session` directories were being enumerated).

**Why:** Querying the memory DB for session transcripts returns nothing/wrong data and wastes investigation time.

**How to apply:** For session transcript data, look in the workspace `storage/` tree (session directories), not the memory package DB; the SSE endpoint's session ID is the key to the right store.
