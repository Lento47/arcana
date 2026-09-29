---
tags: [tui, mapper, pattern]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# strip system reminder regex in mapper

Suppress display-only wrappers in TUI mapper layer via global regex

**Why:** Keeps engine/model context intact while preventing UI leakage; mapper is correct boundary vs engine change.

**How to apply:** In `read-output.ts` mapper, globally strip `<system-reminder>...</system-reminder>` before mapping, return empty metadata array so downstream `spine-mapper.ts` has nothing to render as callout. Delete now-dead boilerplate detection helpers and update `mapper-read-output.test.ts` to assert `reminders.length===0` (6 pass).
