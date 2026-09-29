---
tags: [refactoring, safety, workflow]
date: 2026-09-21
source: ses_f49e2c5ceffeaw3SlqVpnlv4Vs
---
# wait for quiet before split

When splitting a live-edited file with no VCS, wait for the file to stop changing before editing

If a file is being actively written to by another process and there is no version control to recover from a collision, wait for the file to go quiet before performing a structural refactor.

**Why:** A concurrent write landing mid-edit with no VCS means unrecoverable work loss. The cost of waiting is lower than the cost of clobbering.

**How to apply:** Monitor the file's modification time or content hash. Once stable, snapshot it, perform the split, and verify. If the file resumes changing, re-check before proceeding.
