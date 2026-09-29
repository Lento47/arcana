---
tags: [arcana, testing, pattern]
date: 2026-08-26
source: ses_fbfadaac9ffeOfVnNof9RXuVTm
---
# self contained governance sim

Model Arcana governance in single JS file to test primitives without repo harness.

Created L:\tmp\governance-core.js and governance-tests.js simulating capabilities, approvals, PDP, PEP, ghost preview, 15 failure modes. Ran via node, 30/30 assertions pass.

**Why:** Repo test harness may be slow/timeout; self-contained model validates logic quickly and safely.

**How to apply:** When verifying Arcana governance changes, build a minimal simulator in a temp folder and run with node/bun; avoid invoking full repo tests for quick feedback.
