---
tags: [arcana, tui, opentui, rendering]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# tui diff viewer unbounded rendering

diff-viewer renders every changed file with <diff> and no windowing, blocking main thread

**Why:** `visiblePatchFiles()` returns `patchFileIndexes().flatMap(...)` for all files when `singlePatch===false`, then `<For each={visiblePatchFiles()}>` mounts a `<diff>` per file doing synchronous `parseDiff`+`buildView`; 100s of files blocks main thread indefinitely.

**How to apply:** Cap rendering with `MAX_VISIBLE_FILES=50`, add `renderedPatchFiles` memo: `visible.length>50 ? visible.slice(0,50) : visible`, render overflow count message; verify `MAX_RENDERED_FILES` does not exist before assuming windowing.
