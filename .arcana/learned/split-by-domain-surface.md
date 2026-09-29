---
tags: [refactoring, code-organization, typescript]
date: 2026-09-18
source: ses_f49e2c5ceffeaw3SlqVpnlv4Vs
---
# split by domain surface

Split a large UI file by independent renderable domain surfaces, not by arbitrary line count

When a file contains multiple independent renderers (e.g., diagnosis report, chat transcript, simulation output), split each into its own file based on the domain surface, not by slicing at line boundaries.

**Why:** Domain surfaces have their own data types, layout logic, and zero shared state. Splitting by concern means each file is self-contained and testable in isolation. Slicing by lines creates artificial coupling.

**How to apply:** Identify independent render surfaces. Extract each into `renderers/<concern>.ts`. Move shared primitives (clip, rule, panel, wrap) into `layout.ts`. Leave the original file as a barrel.

Related: [[barrel-pattern-for-code-splitting]] [[wait-for-quiet-before-splitting]] [[barrel-re-export-split-pattern]] [[wait-for-quiet-before-split]] [[domain-surface-file-split]]
