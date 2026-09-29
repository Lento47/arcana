---
tags: [tui, chat, filtering]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# hide system reminder tui chat

Hidden <system-reminder> entirely from TUI/chat via read-output.ts strip-all

**Why:** Prevents AGENTS.md/system-reminder leakage into user-visible chat/TUI. **How to apply:** Strip all `<system-reminder>` blocks in `read-output.ts` (not collapsed) and cover with `mapper-read-output.test.ts`; verify with `tui` typecheck and tests (1318 pass).
