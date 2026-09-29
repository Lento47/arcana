---
tags: [chat, markdown, bug]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# prose normalization space in inline code

normalizeChatProse injected space inside inline code span breaking `read` token

**Why:** Previous implementation did blind space insertion on line breaks without checking if break was inside `...` inline code, corrupting `Hidden — `\nread``.

**How to apply:** Always gate whitespace normalization on GFM context; add regression test for inline code containing line break and verify no `\` + space` artifact.
