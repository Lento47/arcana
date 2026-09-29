---
tags: [testing, verification, best-practices]
date: 2026-09-18
source: ses_f49e2c5ceffeaw3SlqVpnlv4Vs
---
# verify refactoring with checks

After code splitting, run typecheck, build, and test suites to ensure the refactor is clean.

**Why:** Structural changes can introduce type errors, build failures, or test regressions. Comprehensive verification catches these issues early and ensures the codebase remains stable.

**How to apply:** Integrate commands like `npm run typecheck`, `npm run build`, and `npm test` into your refactoring workflow. Always run them after making changes to confirm nothing is broken.

Related: [[trusting-tool-output-without-verifying-workspace]]
