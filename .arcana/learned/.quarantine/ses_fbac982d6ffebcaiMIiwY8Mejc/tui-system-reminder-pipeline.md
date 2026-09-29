---
tags: [tui, system-reminder, mapper]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# tui system reminder pipeline

TUI renders <system-reminder> via read-output.ts reminders -> spine-mapper.ts yellow callout

**Why:** Hiding `Instructions from: ...AGENTS.md` + `file-content tags` wrapper from `engine/src/tool/read.ts:385-411` requires cutting display pipeline, not model context. **How to apply:** `tui/src/shell/command-spine/mapper/read-output.ts:84-89` strips boilerplate but pushes AGENTS.md to `reminders[]`; `spine-mapper.ts:912,923,941,953` renders it — patch to return `""` without pushing to discard all `<system-reminder>` blocks.
