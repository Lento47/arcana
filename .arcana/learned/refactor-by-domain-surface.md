---
tags: [refactoring, code-organization, typescript]
date: 2026-09-18
source: ses_f49e2c5ceffeaw3SlqVpnlv4Vs
---
# refactor by domain surface

Split large files into separate modules based on independent domain surfaces to improve maintainability.

**Why:** Reduces coupling, makes code easier to test and understand, and aligns with single responsibility principles for each rendering or logic unit.
**How to apply:** Identify independent functional areas in a large file (e.g., renderers for different outputs), extract them into dedicated files, and move shared primitives to a common module.

Related: [[safe-file-split-without-vcs]] [[wait-for-quiet-refactor]] [[barrel-re-export-refactor]] [[split-by-domain-surface]] [[barrel-pattern-for-code-splitting]] [[wait-for-quiet-before-splitting]] [[barrel-re-export-split-pattern]] [[wait-for-quiet-before-split]] [[domain-surface-file-split]]
