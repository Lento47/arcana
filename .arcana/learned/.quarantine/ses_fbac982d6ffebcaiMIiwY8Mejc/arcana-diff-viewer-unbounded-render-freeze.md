---
tags: [arcana, opentui, tui, performance]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# arcana diff viewer unbounded render freeze

Arcana /diff indefinite freeze caused by unbounded visiblePatchFiles rendering every changed file as <diff>

**Why:** diff-viewer.tsx visiblePatchFiles() returns patchFileIndexes().flatMap(...) for all files when singlePatch()===false (default) and <For each={visiblePatchFiles()}> mounts a <diff> per file with synchronous parseDiff+buildView; no MAX_RENDERED_FILES/windowing exists, blocking TUI main thread indefinitely for large diffs.

**How to apply:** Cap rendering via MAX_VISIBLE_FILES=50 memo: renderedPatchFiles = !singlePatch && visible.length>50 ? visible.slice(0,50) : visible; render that in <For> and show overflow count (remainingFiles) instead of rendering all.
