---
tags: [refactoring, typescript, module-design]
date: 2026-09-18
source: ses_f49e2c5ceffeaw3SlqVpnlv4Vs
---
# barrel re export refactor

Use a barrel file with re-exports so splitting a module is invisible to all callers

When extracting code from a large file into multiple smaller files, keep the original file as a barrel that re-exports everything from the new files.

**Why:** Callers that import from the original path continue working without any changes. The split becomes a purely internal structural improvement with zero API surface change.

**How to apply:** Create `renderers/diagnosis.ts`, `renderers/chat.ts`, etc. Then reduce `report.ts` to just `export * from './renderers/diagnosis'` etc. No downstream import path changes required.

Related: [[barrel-pattern-for-code-splitting]] [[wait-for-quiet-before-splitting]] [[barrel-re-export-split-pattern]] [[wait-for-quiet-before-split]] [[domain-surface-file-split]]
