---
tags: [arcana, testing, javascript]
date: 2026-08-26
source: ses_fbfadaac9ffeOfVnNof9RXuVTm
---
# self contained test simulator

Build single self-contained JS file modeling system primitives + separate runner; runs on node/bun without module issues

For testing Arcana governance without repo harness, write a single self-contained JS file (governance-core.js) modeling real primitives (capability store, approval store, PDP, PEP, ghost preview, sensitivity lattice) plus a separate test runner (governance-tests.js). Avoids module resolution issues on node/bun.

**Why:** Assistant built 30/30 passing suite this way in L:\tmp after hitting tool constraints with complex multi-step approach.

**How to apply:** When repo test harness is unavailable/heavy, use self-contained files with inline models. Run via `node L:\tmp\governance-tests.js`.
