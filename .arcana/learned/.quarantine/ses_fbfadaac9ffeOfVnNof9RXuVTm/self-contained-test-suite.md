---
tags: [arcana, testing, node]
date: 2026-08-26
source: ses_fbfadaac9ffeOfVnNof9RXuVTm
---
# self contained test suite

Build single-file self-contained simulators for verification without repo dependencies

For verifying system logic without repo test-harness overhead, write a self-contained single-file model + test runner (e.g. `governance-core.js` + `governance-tests.js`) that runs directly via `node` or `bun` with no module resolution issues.

**Why:** Avoids repo harness timeouts (120s) and dependency resolution; gives direct 30/30 assertion pass evidence.

**How to apply:** When asked to 'test' a subsystem, prefer a self-contained file in a temp location (e.g. `L:\tmp`) modeling the real primitives, then run directly. Don't rely on repo-level `goal_check` test harness for custom verification.
