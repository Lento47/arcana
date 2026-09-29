---
tags: [tui, diff, performance]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# diff client windowing

Client-side /diff windowing with MAX_VISIBLE_FILES=50

**Why:** Complements server timeout to prevent TUI hang on large diffs. **How to apply:** Cap rendered files to `MAX_VISIBLE_FILES=50` window in TUI client; verified with `tui` 1318 pass.
