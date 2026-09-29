---
tags: [arcana, tui, opentui, debugging]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# assuming treesitter blocks main thread

Blamed Tree-sitter highlighting for freeze, but it is worker-offloaded async

**Why:** `<diff>` uses `treeSitterClient` with `_waitingForHighlight` async path, so highlighting alone does not block main thread; misdiagnosis delays finding real sync `parseDiff`/`buildView` loop.

**How to apply:** Verify `treeSitterClient` implementation and `_waitingForHighlight` flag before concluding; focus on synchronous per-file mount work and lack of windowing in `visiblePatchFiles`.
