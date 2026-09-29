---
tags: [tui, system-reminder, bug]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# leaking system reminder to tui

read-output.ts pushed <system-reminder> AGENTS.md content to reminders[] instead of discarding

**Why:** Caused `Instructions from: ...AGENTS.md` injection to show as yellow callout in TUI/chat despite stripping wrapper. **How to apply:** Change `tui/src/shell/command-spine/mapper/read-output.ts:84-89` to return `""` without `reminders.push()` to hide completely, not collapsed.
