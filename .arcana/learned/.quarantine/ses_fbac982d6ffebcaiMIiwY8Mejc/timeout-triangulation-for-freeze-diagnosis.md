---
tags: [arcana, debugging, timeout, tui]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# timeout triangulation for freeze diagnosis

Triangulate server 12s vs client 15s vs indefinite freeze to isolate rendering bugs

**Why:** Comparing bounded timeouts lets you prove whether a hang is transport vs post-fetch rendering without guessing; indefinite > both bounds rules out server/client fetch.

**How to apply:** Log server bound, client race, and observed freeze duration; if freeze > max(timeouts) and no error UI ("Failed to load diff"/"timed out") appears, inspect client render path (visiblePatchFiles, <For>, parseDiff, afterLayout).
