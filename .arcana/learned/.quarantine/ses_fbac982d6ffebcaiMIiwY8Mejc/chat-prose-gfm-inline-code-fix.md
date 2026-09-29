---
tags: [tui, chat, markdown]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# chat prose gfm inline code fix

GFM-aware normalizeChatProse fix prevents space injection inside inline code spans

**Why:** Naive normalization injected space inside inline code (`Hidden — `\nread`` → `Hidden — ` read``) breaking syntax/semantic line-break rendering.

**How to apply:** In `chat-prose.ts` implement hardened GFM-aware `normalizeChatProse` (getInline-aware) that skips normalization inside backtick spans and respects prose syntax/semantic breaks without arbitrary newlines.
