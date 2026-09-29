---
tags: [typescript, ui, refactoring, patterns]
date: 2026-09-21
source: ses_f49e2c5ceffeaw3SlqVpnlv4Vs
---
# domain surface file split

Split large UI files by independent domain surfaces, each with its own types and layout logic

When a file contains multiple independent renderers or UI surfaces (diagnosis, chat, plan, simulation, evaluation, etc.), split each into its own file. Shared primitives go into a `layout.ts` or `primitives.ts`.

**Why:** Each surface has its own data types, layout logic, and zero shared state with the others. Keeping them in one file creates cognitive overhead and merge conflicts. After split: report.ts went from 2067 lines to 60-line barrel + 9 focused renderer files.

**How to apply:** Identify surfaces by asking: "do these share mutable state or just static helpers?" If just static helpers, extract helpers first, then split surfaces. Use barrel re-exports to keep imports stable.
