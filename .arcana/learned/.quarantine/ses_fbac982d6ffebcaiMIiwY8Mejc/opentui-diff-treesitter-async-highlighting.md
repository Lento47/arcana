---
tags: [opentui, tui, treesitter]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# opentui diff treesitter async highlighting

OpenTUI <diff> uses async treeSitterClient with _waitingForHighlight, not main-thread blocking

**Why:** Initial suspicion that Tree-sitter highlighting blocks main thread is wrong; it is worker-offloaded, so freeze must come from diff-viewer per-file parseDiff/buildView. **How to apply:** When profiling OpenTUI hangs, skip Tree-sitter path and inspect diff-viewer visiblePatchFiles -> <For each> -> <diff> mount for missing virtualization/windowing.
