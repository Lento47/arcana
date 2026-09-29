---
tags: [arcana, sdk, fetch, timeout]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# sdk customfetch get no timeout

SDK customFetch 30s timeout applies only to mutating verbs, GET has no transport timeout

**Why:** Explains why TUI `/diff` indefinite freeze cannot be transport hang — `client.vcs.diff` is GET so only the 15s `withDiffRequestTimeout` AbortController race protects it; if freeze >15s, block is post-fetch rendering.

**How to apply:** When diagnosing hangs, check `SDK AGENTS.md` customFetch verb filter; do not rely on SDK timeout for GET, add explicit race with AbortController + setTimeout at call site.
