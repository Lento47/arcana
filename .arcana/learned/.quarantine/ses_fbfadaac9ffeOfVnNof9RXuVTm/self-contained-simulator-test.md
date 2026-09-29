---
tags: [arcana, testing, pattern]
date: 2026-08-26
source: ses_fbfadaac9ffeOfVnNof9RXuVTm
---
# self contained simulator test

Build self-contained JS simulator to test governance concepts without repo deps

**Why:** Created single-file model of capabilities/approvals/PEP/PDP/ghost preview in L:\tmp, ran with node, avoiding module resolution and repo constraints.

**How to apply:** When asked to test a system's logic without modifying repo, create one file modeling primitives + test runner in a temp folder and execute directly.
