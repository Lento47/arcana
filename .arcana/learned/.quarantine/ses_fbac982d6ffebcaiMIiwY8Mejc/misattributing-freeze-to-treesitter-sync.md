---
tags: [opentui, tui, debugging]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# misattributing freeze to treesitter sync

Assuming OpenTUI <diff> Tree-sitter highlighting blocks main thread

**Why:** Tree-sitter is worker-offloaded via treeSitterClient (_waitingForHighlight), so that path is async and not the blocker. **How to apply:** Check <diff> implementation for async client first; focus on diff-viewer synchronous parseDiff/buildView and missing virtualization as blocking source.
