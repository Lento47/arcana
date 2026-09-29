---
tags: [tui, daemon, fallback]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# tui worker fallback path

TUI daemon fallback when worker.js missing at tui.ts:71

**Why:** Stale-daemon check affects /diff and TUI startup. **How to apply:** If `src/cli/tui/worker.js`/`dist/cli/tui/worker.js` missing, `tui.ts:71` falls back to `../tui/worker` path.
