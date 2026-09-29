---
tags: [prose, rendering, bug]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# prose arbitrary newline splits inline code

Arbitrary newlines split inline code `read` across lines

Prose wrapper inserted arbitrary newlines, splitting `` `read` `` across lines (`✦ \nHidden — `\nread``) in spine-prose/chat-prose.

**Why:** Breaks readability and violates syntax/semantic line-break requirement.

**How to apply:** Audit wrapping logic to respect inline-code boundaries and semantic breaks; add regression test for backtick spans.
