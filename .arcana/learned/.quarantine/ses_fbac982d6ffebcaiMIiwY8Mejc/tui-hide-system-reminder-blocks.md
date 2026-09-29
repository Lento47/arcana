---
tags: [tui, system-reminder, read-tool]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# tui hide system reminder blocks

TUI strips all <system-reminder> blocks from display while keeping model context

**Why:** `<system-reminder>` from `engine/src/tool/read.ts:385-411` (AGENTS.md injection + file-content tags) leaked into TUI/chat via `read-output.ts` reminders[] → yellow callout in `spine-mapper.ts:912/923/941/953`; user wants complete hide not collapsed.

**How to apply:** In `packages/tui/src/shell/command-spine/mapper/read-output.ts:93` replace with `content.replace(/<system-reminder>[\s\S]*?<\/system-reminder>\s*/gi, "")` and return empty `reminders[]` (remove `isBoilerplateReminder()`), so mapping layer suppresses rendering without touching engine context. Updated `packages/tui/test/mapper-read-output.test.ts:30-37` to assert `reminders.length===0`.
