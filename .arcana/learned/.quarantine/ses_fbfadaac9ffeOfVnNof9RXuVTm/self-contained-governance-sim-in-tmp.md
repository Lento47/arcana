---
tags: [arcana, testing, pattern]
date: 2026-08-26
source: ses_fbfadaac9ffeOfVnNof9RXuVTm
---
# self contained governance sim in tmp

Build single-file JS governance simulator in L:\tmp to test Arcana concepts without repo changes

**Why:** Needed to test governance (capabilities, PEP/PDP, ghost preview) but avoid repo modifications and module resolution issues.

**How to apply:** For Arcana concept testing, create a self-contained JS file (e.g., `L:\tmp\governance-core.js`) modeling primitives and a runner (`governance-tests.js`), execute with node/bun. Achieved 30/30 assertions pass.
