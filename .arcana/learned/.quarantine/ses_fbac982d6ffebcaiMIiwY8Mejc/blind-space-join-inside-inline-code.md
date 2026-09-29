---
tags: [markdown, bug, prose]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# blind space join inside inline code

normalizeProseRegion injected space inside inline code span

**Why:** Caused `` `read` `` to render as `` ` `` on one line and `read`` on next, visible as `Hidden — `\nread`` in `spine-prose.tsx`/`chat-prose.ts`. **How to apply:** Check `isInsideInlineCode` before adding space; suppress space inside code but preserve single space for word separation; add tests for `Hidden — `\nread`` and double-backtick edge cases.
