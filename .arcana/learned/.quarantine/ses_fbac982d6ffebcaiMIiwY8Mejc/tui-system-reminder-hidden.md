---
tags: [tui, chat, rendering]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# tui system reminder hidden

<system-reminder> stripped entirely from TUI/chat read output

**Why:** `<system-reminder>` from AGENTS.md/read tool was rendering in TUI/chat, leaking internal context and cluttering UI.
**How to apply:** Strip all `<system-reminder>...</system-reminder>` blocks in `src/cli/tui/read-output.ts` before mapper/render; verify with `mapper-read-output.test.ts` and `tui` typecheck (1318 pass).
