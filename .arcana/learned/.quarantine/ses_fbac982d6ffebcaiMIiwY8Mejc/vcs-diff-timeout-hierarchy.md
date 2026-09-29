---
tags: [arcana, sdk, vcs, timeout]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# vcs diff timeout hierarchy

SDK customFetch 30s only for mutating verbs; GET vcs.diff has no transport timeout

**Why:** Explains why TUI relied on withDiffRequestTimeout 15s race and server Effect.timeout 12s; without this hierarchy indefinite freeze is misdiagnosed as transport hang. **How to apply:** When debugging hangs, check SDK AGENTS.md customFetch rules and ensure server DIFF_TIMEOUT (12s) < client race (15s) < transport mutating timeout (30s).
