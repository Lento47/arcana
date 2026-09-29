---
tags: [arcana, tui, opentui, vcs]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# tui diff hang root cause unbounded rendering

TUI /diff indefinite hang is client-side unbounded rendering, not server VCS timeout

**Why:** Server Vcs.diff bounded at 12s and TUI withDiffRequestTimeout at 15s still showed >15s freeze, proving block occurs after data arrives when diff-viewer synchronously mounts parseDiff+buildView for every file via <For each={visiblePatchFiles()}>. **How to apply:** Always cap visiblePatchFiles rendering (MAX_VISIBLE_FILES=50, slice) and show overflow message; do not rely solely on server timeout for UI freezes.
