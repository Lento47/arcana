---
tags: [tui, react, performance]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# tui diff viewer windowed render

TUI diff-viewer caps visible files at 50 with overflow banner to prevent client freeze

**Why:** Large diffs flooded TUI rendering and froze client.

**How to apply:** In `packages/tui/src/feature-plugins/system/diff-viewer.tsx:50` set `MAX_VISIBLE_FILES=50`, render windowed subset and show overflow banner. Validated by full `tui` suite 1318 pass (1 pre-existing cleanup-pass T7).
