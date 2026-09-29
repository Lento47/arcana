---
tags: [workflow, audit, verification]
date: 2026-09-17
source: ses_f4ee8c3d1ffe4oUlTqcjBC3w5U
---
# audit source before claims

Read the actual source code before making quality or architecture claims about a project

Initial assessment of ts-harness was made from the README and was directionally correct but surface-level. When parallel source audits were run, the code showed more discipline than initially credited, and specific claims required revision or added nuance.

**Why:** READMEs describe intent, not implementation. Code quality claims without source verification risk being either too generous (if the code is sloppy) or too dismissive (if the code is more disciplined than the docs suggest).

**How to apply:** When asked to assess a codebase, start by reading the source — not the README. Use the README to understand the intended architecture, then verify every claim against the actual implementation. Parallelize the audit across independent modules to save time.

Related: [[audit-from-source-not-readme]] [[ts-harness-audit-validation]] [[parallel-subagent-code-audit]] [[verify-refactoring-with-checks]] [[wait-for-quiet-before-split]] [[trusting-tool-output-without-verifying-workspace]]
