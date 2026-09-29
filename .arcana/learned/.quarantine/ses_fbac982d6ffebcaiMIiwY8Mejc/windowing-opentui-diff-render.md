---
tags: [opentui, performance, tui]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# windowing opentui diff render

Window large diff sets with memoized slice and overflow message to avoid main-thread block

**Why:** OpenTUI <diff> Tree-sitter highlighting is async/worker-offloaded (_waitingForHighlight) but per-file parseDiff+buildView is synchronous on mount; rendering 100s of diffs at once blocks UI.

**How to apply:** Create memoized renderedPatchFiles capped at MAX_VISIBLE_FILES=50, compute remainingFiles = visible.length - rendered.length, render only slice in <For> and show "+N files hidden" message.
