---
tags: [arcana, turbo, typescript, tooling]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# turbo root typecheck binary path failure

Root turbo typecheck fails with `cannot find binary path`; run tsc directly at the package instead

The monorepo root typecheck gate invoked via turbo fails with `cannot find binary path` — an infra/environment error, not a code failure. It recurred repeatedly this session while direct `tsc` runs at the package level gave the real (clean) results.

**Why:** Treating an infra gate failure as a code failure sends debugging in the wrong direction.

**How to apply:** When turbo reports `cannot find binary path`, run `tsc` directly in the target package (e.g., `packages/tui`) to get real results, and treat the turbo error as environmental.
