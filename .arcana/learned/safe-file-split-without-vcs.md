---
tags: [refactoring, file-splitting, barrel-exports, ts-harness]
date: 2026-09-18
source: ses_f49e2c5ceffeaw3SlqVpnlv4Vs
---
# safe file split without vcs

When splitting a large file with no VCS, wait for the live writer to go quiet before applying the split; use barrel re-exports so no caller imports break.

When refactoring a monolith file (e.g., `report.ts` with 2000+ lines and six independent renderers), a live writer (another agent or process) may be editing the same file concurrently.

**Why:** Without VCS, a concurrent write landing mid-edit is unrecoverable — work gets clobbered with no rollback. Snapshot-then-replay is fragile. Waiting for the file to stop changing ensures a clean, conflict-free split.

**How to apply:**
1. Watch the target file until it stops changing (debounce).
2. Split by domain surface into separate files (e.g., `renderers/diagnosis.ts`, `renderers/chat.ts`).
3. Keep shared primitives in the original file (e.g., `report.ts` keeps `clip`, `rule`, `panel`, `wrap`, `keyValueTable`).
4. The original file re-exports everything from the new files, so all caller imports (`import { renderReport } from './report'`) remain unchanged — the split is invisible to the rest of the codebase.
5. Bundle any small collateral changes (ratchet keys, stale doc refs) into the same pass.

Related: [[wait-for-quiet-refactor]] [[barrel-re-export-refactor]] [[split-by-domain-surface]] [[barrel-pattern-for-code-splitting]] [[wait-for-quiet-before-splitting]] [[barrel-re-export-split-pattern]] [[wait-for-quiet-before-split]] [[domain-surface-file-split]]
