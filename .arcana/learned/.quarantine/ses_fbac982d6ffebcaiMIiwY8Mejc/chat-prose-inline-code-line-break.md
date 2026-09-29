---
tags: [tui, markdown, prose]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# chat prose inline code line break

normalizeChatProse splits inline code across lines injecting stray space

**Why:** `chat-prose.ts:94,105` joins `last + " " + line.trim()` outside fenced blocks without inline-code awareness, turning `Hidden — `\nread`` into `Hidden — ` read`` and breaking markdown rendering (`✦ \nHidden — `\nread``). **How to apply:** Detect inside inline code via backtick parity (and GFM double-backtick/escaped handling) in `normalizeProseRegion`/`normalizeChatProse` before inserting space.
