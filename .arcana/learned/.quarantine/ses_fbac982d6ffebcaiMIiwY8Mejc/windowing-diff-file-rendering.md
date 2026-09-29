---
tags: [arcana, tui, opentui, performance]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# windowing diff file rendering

Cap unbounded <For each={visiblePatchFiles()}> with renderedPatchFiles.slice(0,50)

**Why:** visiblePatchFiles flatMaps all patchFileIndexes with no MAX_RENDERED_FILES check, mounting 100s of <diff> components blocks main thread indefinitely. **How to apply:** Create memo renderedPatchFiles = !singlePatch && visible.length>50 ? visible.slice(0,50) : visible, compute remainingFiles, render overflow notice, keep file-tree scrolling intact.
