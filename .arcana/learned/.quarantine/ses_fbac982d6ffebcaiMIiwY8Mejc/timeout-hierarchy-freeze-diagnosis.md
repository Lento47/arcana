---
tags: [debugging, tui, performance]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# timeout hierarchy freeze diagnosis

Diagnose indefinite freeze by comparing observed freeze duration against server/client timeout hierarchy

**Why:** If freeze exceeds both server (12s) and client race (15s) timeouts, block must be post-fetch (render), not transport/daemon; avoids stale-daemon misdiagnosis.

**How to apply:** Map all timeouts (sdk 30s mutating only, server 12s, TUI 15s), check error/loading states, then inspect render path (visiblePatchFiles, <For>, parseDiff/buildView, afterLayout) if freeze > max timeout.
