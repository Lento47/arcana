---
tags: [tui, chat, system-reminder]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# tui hide system reminder strip all

Hide <system-reminder> completely via read-output.ts strip-all

Implemented strip-all of `<system-reminder>` tags in `read-output.ts` with `mapper-read-output.test.ts` coverage; verified tui 1318 pass / typecheck clean.

**Why:** Requirement is to hide system-reminder completely, not collapsed — any leak to TUI/chat violates spec.

**How to apply:** Strip tags at the read-output mapping layer before rendering; do not use CSS collapse or conditional display.
