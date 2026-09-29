---
tags: [refactoring, file-organization, typescript]
date: 2026-09-18
source: ses_f49e2c5ceffeaw3SlqVpnlv4Vs
---
# split large file by domain surface

Split large files by independent domain surfaces rather than by technical layer (types, utils, etc.)

When refactoring a monolithic file, identify **independent domain surfaces** — each with its own data types, layout logic, and zero shared state with others.

**Why:** Splitting by technical layer (types.ts, utils.ts, renderers.ts) just moves the complexity around without reducing coupling. Splitting by domain surface makes each module cohesive and independently testable.

**How to apply:**
1. Identify surfaces that share no runtime state with each other.
2. Extract shared primitives (clip, rule, panel, wrap, keyValueTable) into their own `primitives.ts`.
3. Create one file per surface (e.g., `diagnosis.ts`, `chat.ts`, `pipeline.ts`).
4. Shared adapters (like a progress observer) get their own thin module.
5. The original file becomes a barrel re-exporting from the new structure.

Used when analyzing a 2067-line `report.ts` that rendered six completely independent UI surfaces.

Related: [[refactor-by-domain-surface]] [[safe-file-split-without-vcs]] [[wait-for-quiet-refactor]] [[barrel-re-export-refactor]] [[split-by-domain-surface]] [[barrel-pattern-for-code-splitting]] [[wait-for-quiet-before-splitting]] [[barrel-re-export-split-pattern]] [[wait-for-quiet-before-split]] [[domain-surface-file-split]]
