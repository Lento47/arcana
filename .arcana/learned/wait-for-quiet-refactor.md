---
tags: [refactoring, concurrency, safety]
date: 2026-09-18
source: ses_f49e2c5ceffeaw3SlqVpnlv4Vs
---
# wait for quiet refactor

When splitting a live-edited file without VCS, watch for quiet then apply the barrel split to avoid unrecoverable collisions

When a file is being actively edited by another process/author and there is no version control, blindly splitting risks clobbering concurrent writes with no recovery path.

**Why:** Mid-edit collisions are unrecoverable without VCS. A barrel split (original file becomes pure re-exports, actual code moves to new files) means every caller's existing imports continue working unchanged, making the refactor invisible to the rest of the codebase.

**How to apply:**
1. Poll/observe the target file until writes stop
2. Snapshot current content
3. Move concerns into new files (one per domain surface)
4. Reduce original file to `export * from './new-file'` re-exports
5. Bundle any related small tasks (ratchet keys, stale doc refs) into the same pass since the window is open

Related: [[barrel-pattern-for-code-splitting]] [[wait-for-quiet-before-splitting]] [[barrel-re-export-split-pattern]] [[wait-for-quiet-before-split]] [[domain-surface-file-split]]
