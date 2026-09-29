---
tags: [code-review, methodology, audit]
date: 2026-09-17
source: ses_f4ee8c3d1ffe4oUlTqcjBC3w5U
---
# audit from source not readme

README-level assessments can be directionally correct but miss important nuances only visible in source code

The initial product assessment was based on README surface-level reading and was "directionally correct" but missed specifics like the exact guard mechanisms, test gaps, and architectural deadlocks. A parallel source audit across 5 areas (grounding, anti-slop, eval, security, simulation) revealed significantly more discipline in the code than the README conveyed — but also found specific gaps like untested `filterResults()` and the bootstrapping deadlock.

**Why:** READMEs describe intent; code reveals reality. Surface impressions can be accurate in direction but wrong in degree and missing critical failure modes.

**How to apply:** When evaluating any codebase, always verify claims against source. Use parallel audits on independent subsystems to cover ground quickly. Start with README for orientation, then audit code for ground truth.

Related: [[audit-surface-level-initial-take]] [[ts-harness-audit-validation]] [[parallel-subagent-code-audit]]
