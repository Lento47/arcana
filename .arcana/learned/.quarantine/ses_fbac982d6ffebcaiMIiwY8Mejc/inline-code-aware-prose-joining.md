---
tags: [markdown, prose, pattern]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# inline code aware prose joining

Join prose lines without space when inside inline code span

**Why:** Blind space insertion corrupts inline code like `` `read` `` split across lines. **How to apply:** In `normalizeProseRegion` track inline-code state (backtick run-length, skip escaped \`, skip fenced blocks already stripped at :49); if `isInsideInlineCode(last)` join with "" not " "; handle `` ``code with ` inside`` `` via run-length matching.
