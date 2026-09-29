---
tags: [refactoring, typescript, patterns]
date: 2026-09-21
source: ses_f49e2c5ceffeaw3SlqVpnlv4Vs
---
# barrel re export split pattern

Split large files by making the original a barrel of re-exports so no caller imports break

When splitting a large file (e.g., `report.ts` at 2067 lines), turn the original file into pure re-exports from the new split files. Callers keep importing from the same path; the split is invisible to the rest of the codebase.

**Why:** Avoids cascading import changes across the codebase. Reduces risk of breaking things during a large refactor. Especially critical when no VCS is available to recover from mistakes.

**How to apply:** Create `renderers/*.ts` (one per domain concern), extract primitives into a `layout.ts`, then replace the original file with `export * from './renderers/diagnosis'` etc. Verify with typecheck + build + full test suite.
