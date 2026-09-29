---
tags: [arcana, turbo, tooling, typecheck]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# turbo cannot find binary path is infra

Root turbo typecheck failing with 'cannot find binary path' is a turbo infrastructure issue, not a code failure — run package-level tsc directly

The root typecheck gate exited with `cannot find binary path` (turbo could not resolve the tsc binary) while the underlying code was fine; the same error appeared on HEAD.

**Why:** Chasing phantom code failures when gate infrastructure is broken wastes a full cycle.

**How to apply:** On turbo `cannot find binary path`, bypass turbo and run the package's own typecheck directly; treat only direct tsc output as authoritative, and verify suspected failures against HEAD before fixing.
