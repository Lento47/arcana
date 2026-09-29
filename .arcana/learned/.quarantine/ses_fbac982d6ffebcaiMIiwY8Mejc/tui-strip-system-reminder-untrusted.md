---
tags: [tui, shell, security]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# tui strip system reminder untrusted

TUI strips all <system-reminder> untrusted blocks via regex in read-output mapper

**Why:** <system-reminder> must be completely hidden in TUI/chat, never shown or collapsed.

**How to apply:** In `packages/tui/src/shell/command-spine/mapper/read-output.ts:93` strip all `untrusted` blocks via regex and set `reminders=[]`. Verify with 6 tests and typecheck.
