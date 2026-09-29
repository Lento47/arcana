---
tags: [tui, prose, rendering]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# prose semantic line break wrapping

Prose must follow syntax/semantic breaks not arbitrary wrapping

Bug in `spine-prose.tsx`/`chat-prose.ts` caused `✦ Hidden — `read`` to render as `✦ \nHidden — `\nread`` by splitting inside inline code.

**Why:** Arbitrary newlines break inline code and punctuation semantics.

**How to apply:** Wrap prose only at syntax/semantic boundaries; never break inside backtick spans and keep punctuation groups intact.
