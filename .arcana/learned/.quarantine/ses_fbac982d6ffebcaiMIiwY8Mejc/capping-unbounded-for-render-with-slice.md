---
tags: [arcana, tui, opentui, performance]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# capping unbounded for render with slice

Fix unbounded <For> mounts with memo slice + remaining count overflow

**Why:** OpenTUI `<diff>` has no virtualization; rendering all files is O(n) synchronous work that freezes TUI; capping preserves responsiveness with minimal change.

**How to apply:** Create `renderedPatchFiles = createMemo(() => !singlePatch() && visible().length > MAX_VISIBLE_FILES ? visible().slice(0,MAX_VISIBLE_FILES) : visible())`, update `<For each={renderedPatchFiles()}>`, show `remainingFiles = visible().length - rendered().length` overflow banner.
